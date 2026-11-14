package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5"
)

type Event struct {
	ID        string    `json:"eventID"`
	Time      time.Time `json:"eventTime"`
	Name      string    `json:"eventName"`
	Source    string    `json:"eventSource"`
	Region    string    `json:"awsRegion"`
	IP        string    `json:"sourceIPAddress"`
	UserAgent string    `json:"userAgent"`
	ErrorCode string    `json:"errorCode"`
	Identity  struct {
		ARN  string `json:"arn"`
		Type string `json:"type"`
	} `json:"userIdentity"`
	Raw json.RawMessage `json:"-"`
}

// parse reads a gzipped CloudTrail log file.
func parse(r io.Reader) ([]Event, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, err
	}
	defer gz.Close()
	var file struct{ Records []json.RawMessage }
	if err := json.NewDecoder(gz).Decode(&file); err != nil {
		return nil, err
	}
	evs := make([]Event, len(file.Records))
	for i, raw := range file.Records {
		if err := json.Unmarshal(raw, &evs[i]); err != nil {
			return nil, err
		}
		evs[i].Raw = raw
	}
	return evs, nil
}

// store writes all events in one transaction; re-running on the same events inserts nothing.
func store(ctx context.Context, conn *pgx.Conn, evs []Event) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	b := &pgx.Batch{}
	for _, e := range evs {
		b.Queue(`INSERT INTO events (event_id, event_time, identity_arn, event_name, event_source, region, source_ip, user_agent, error_code, raw)
			VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, NULLIF($9, ''), $10) ON CONFLICT (event_id) DO NOTHING`,
			e.ID, e.Time, e.Identity.ARN, e.Name, e.Source, e.Region, e.IP, e.UserAgent, e.ErrorCode, string(e.Raw))
		if e.Identity.ARN != "" {
			b.Queue(`INSERT INTO identities (arn, type, first_seen, last_seen) VALUES ($1, $2, $3, $3)
				ON CONFLICT (arn) DO UPDATE SET first_seen = LEAST(identities.first_seen, $3), last_seen = GREATEST(identities.last_seen, $3)`,
				e.Identity.ARN, e.Identity.Type, e.Time)
		}
	}
	res := tx.SendBatch(ctx, b)
	for i := 0; i < b.Len(); i++ {
		if _, err := res.Exec(); err != nil {
			res.Close()
			return err
		}
	}
	if err := res.Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func handler(ctx context.Context, ev events.S3Event) error {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return err
	}
	client := s3.NewFromConfig(cfg)
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	for _, rec := range ev.Records {
		key, err := url.QueryUnescape(rec.S3.Object.Key)
		if err != nil {
			return err
		}
		obj, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: &rec.S3.Bucket.Name, Key: &key})
		if err != nil {
			return fmt.Errorf("get %s: %w", key, err)
		}
		evs, err := parse(obj.Body)
		obj.Body.Close()
		if err != nil {
			return fmt.Errorf("parse %s: %w", key, err)
		}
		if err := store(ctx, conn, evs); err != nil {
			return fmt.Errorf("store %s: %w", key, err)
		}
	}
	return nil
}

func main() { lambda.Start(handler) }

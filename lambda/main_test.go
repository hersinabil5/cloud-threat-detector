package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

func sampleGz(t *testing.T) *bytes.Reader {
	raw, err := os.ReadFile("testdata/sample.json")
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	w.Write(raw)
	w.Close()
	return bytes.NewReader(buf.Bytes())
}

func TestParse(t *testing.T) {
	evs, err := parse(sampleGz(t))
	if err != nil || len(evs) != 2 {
		t.Fatalf("got %d events, err %v", len(evs), err)
	}
	e := evs[1]
	if e.Name != "ListBuckets" || e.Source != "s3.amazonaws.com" || e.Region != "ca-central-1" ||
		e.IP != "198.51.100.7" || e.UserAgent != "Boto3" || e.ErrorCode != "AccessDenied" ||
		e.Identity.ARN != "arn:aws:sts::123456789012:assumed-role/ci/run1" || e.Time.IsZero() {
		t.Fatalf("bad fields: %+v", e)
	}
}

// Needs a database with db/schema.sql applied: TEST_DATABASE_URL=postgres:///ctd_scratch go test
func TestStoreIsIdempotent(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	conn.Exec(ctx, "DELETE FROM events WHERE event_id LIKE '%-1111-%' OR event_id LIKE '%-2222-%'")
	evs, _ := parse(sampleGz(t))
	for run := 0; run < 2; run++ {
		if err := store(ctx, conn, evs); err != nil {
			t.Fatal(err)
		}
		var n int
		conn.QueryRow(ctx, "SELECT count(*) FROM events WHERE event_id LIKE '%-1111-%' OR event_id LIKE '%-2222-%'").Scan(&n)
		if n != 2 {
			t.Fatalf("run %d: %d rows, want 2", run, n)
		}
	}
}

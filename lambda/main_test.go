package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

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

func ev(typ, src, name, policy string) Event {
	var e Event
	e.Identity.Type, e.Source, e.Name, e.Params.PolicyArn = typ, src, name, policy
	return e
}

func TestRule(t *testing.T) {
	cases := []struct {
		e   Event
		sev string
	}{
		{ev("IAMUser", "cloudtrail.amazonaws.com", "StopLogging", ""), "high"},
		{ev("IAMUser", "cloudtrail.amazonaws.com", "DeleteTrail", ""), "high"},
		{ev("IAMUser", "iam.amazonaws.com", "AttachUserPolicy", "arn:aws:iam::aws:policy/AdministratorAccess"), "high"},
		{ev("IAMUser", "iam.amazonaws.com", "AttachRolePolicy", "arn:aws:iam::aws:policy/AdministratorAccess"), "high"},
		{ev("IAMUser", "iam.amazonaws.com", "CreateAccessKey", ""), "medium"},
		// must not fire
		{ev("IAMUser", "iam.amazonaws.com", "AttachUserPolicy", "arn:aws:iam::aws:policy/ReadOnlyAccess"), ""},
		{ev("IAMUser", "cloudtrail.amazonaws.com", "DescribeTrails", ""), ""},
		{ev("IAMUser", "s3.amazonaws.com", "ListBuckets", ""), ""},
	}
	for _, c := range cases {
		if sev, reason := rule(c.e); sev != c.sev {
			t.Errorf("%s/%s: got %q (%s), want %q", c.e.Identity.Type, c.e.Name, sev, reason, c.sev)
		}
	}
}

// Needs TEST_DATABASE_URL like TestStoreIsIdempotent.
func TestHistoryRules(t *testing.T) {
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
	const arn = "arn:aws:iam::123456789012:user/histtest"
	const rootARN = "arn:aws:iam::123456789012:root"
	for _, a := range []string{arn, "arn:aws:sts::123456789012:assumed-role/svc/x", rootARN} {
		conn.Exec(ctx, "DELETE FROM alerts WHERE identity_arn = $1", a)
		conn.Exec(ctx, "DELETE FROM events WHERE identity_arn = $1", a)
	}

	base := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	mk := func(i int, ip, errCode string) Event {
		var e Event
		e.ID, e.Time, e.Name, e.Source, e.IP, e.ErrorCode = fmt.Sprintf("hist-%03d", i), base.Add(time.Duration(i)*time.Second), "ListBuckets", "s3.amazonaws.com", ip, errCode
		e.Identity.ARN, e.Identity.Type, e.Raw = arn, "IAMUser", json.RawMessage(`{}`)
		return e
	}
	var evs []Event
	evs = append(evs, mk(0, "198.51.100.1", "")) // first ever event: baseline, no alert
	evs = append(evs, mk(1, "198.51.100.1", "")) // same IP: no alert
	evs = append(evs, mk(2, "203.0.113.50", "")) // new IP: alert
	evs = append(evs, mk(3, "203.0.113.50", "")) // seen now: no alert
	for i := 4; i < 16; i++ {                    // 12 denials: one burst alert
		evs = append(evs, mk(i, "198.51.100.1", "AccessDenied"))
	}
	role := mk(99, "203.0.113.77", "") // service roles hop IPs: never a new-IP alert
	role.Identity.ARN, role.Identity.Type = "arn:aws:sts::123456789012:assumed-role/svc/x", "AssumedRole"
	evs = append(evs, mk(98, "198.51.100.1", ""), role)
	role0 := role
	role0.ID, role0.IP, role0.Time = "hist-097", "198.51.100.9", base
	evs = append([]Event{role0}, evs...)
	for i, mins := range []int{0, 20, 50, 130} { // one sign-in's calls: one alert; 130 min later: a second
		r := mk(200+i, "198.51.100.1", "")
		r.Time, r.Name = base.Add(time.Duration(mins)*time.Minute), "ConsoleLogin"
		r.Identity.ARN, r.Identity.Type = rootARN, "Root"
		evs = append(evs, r)
	}
	count := func(reasonLike string) (n int) {
		conn.QueryRow(ctx, "SELECT count(*) FROM alerts WHERE identity_arn = $1 AND reason LIKE $2", arn, reasonLike).Scan(&n)
		return
	}
	// CloudTrail files aren't in time order: ingest newest-first to prove the rules don't depend on order.
	for i, j := 0, len(evs)-1; i < j; i, j = i+1, j-1 {
		evs[i], evs[j] = evs[j], evs[i]
	}
	for run := 0; run < 2; run++ { // second run checks re-ingest adds no alerts
		if err := store(ctx, conn, evs); err != nil {
			t.Fatal(err)
		}
		if n := count("%never-seen IP (203.0.113.50)%"); n != 1 {
			t.Errorf("run %d: new-IP alerts = %d, want 1", run, n)
		}
		if n := count("%never-seen IP (198.51.100.1)%"); n != 0 {
			t.Errorf("run %d: baseline IP alerted %d times", run, n)
		}
		if n := count("%203.0.113.77%"); n != 0 {
			t.Errorf("run %d: service role got %d new-IP alerts", run, n)
		}
		if n := count("%AccessDenied%"); n != 1 {
			t.Errorf("run %d: burst alerts = %d, want 1", run, n)
		}
		var roots int
		conn.QueryRow(ctx, "SELECT count(*) FROM alerts WHERE identity_arn = $1 AND reason LIKE 'Root account used: %'", rootARN).Scan(&roots)
		if roots != 2 {
			t.Errorf("run %d: root alerts = %d, want 2", run, roots)
		}
	}
}

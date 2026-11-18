-- Safe to re-run.
CREATE TABLE IF NOT EXISTS identities (
  arn        text PRIMARY KEY,
  type       text,                      -- IAMUser, AssumedRole, Root, ...
  first_seen timestamptz NOT NULL,
  last_seen  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id     text PRIMARY KEY,        -- CloudTrail eventID: makes re-ingest a no-op
  event_time   timestamptz NOT NULL,
  identity_arn text,
  event_name   text NOT NULL,
  event_source text NOT NULL,           -- the AWS service
  region       text,
  source_ip    text,
  user_agent   text,
  error_code   text,
  raw          jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time_idx ON events (event_time DESC);
CREATE INDEX IF NOT EXISTS events_identity_idx ON events (identity_arn, event_time DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  severity     text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  identity_arn text,
  reason       text NOT NULL,
  event_id     text REFERENCES events (event_id) ON DELETE SET NULL
);
-- Re-ingesting a log file must not duplicate alerts.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_event_reason_idx ON alerts (event_id, reason);

-- Sample rows so the dashboard has something to show. Skipped if alerts already has data.
INSERT INTO alerts (created_at, severity, identity_arn, reason)
SELECT now() - make_interval(mins => m), s, a, r
FROM (VALUES
  (5,   'critical', 'arn:aws:iam::123456789012:root',              'Root account console login'),
  (42,  'high',     'arn:aws:iam::123456789012:user/alice',        'CloudTrail logging stopped (StopLogging)'),
  (130, 'high',     'arn:aws:iam::123456789012:user/bob',          'AdministratorAccess attached to own user'),
  (300, 'medium',   'arn:aws:iam::123456789012:user/carol',        'API call from a never-seen IP (203.0.113.9)'),
  (720, 'low',      'arn:aws:iam::123456789012:role/ci-deployer',  '14 AccessDenied errors in 10 minutes')
) AS v(m, s, a, r)
WHERE NOT EXISTS (SELECT 1 FROM alerts);

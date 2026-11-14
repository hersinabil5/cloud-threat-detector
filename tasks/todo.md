# Day 1 Tasks — Skeleton

Standing bar for every task: acceptance criteria met, verified by running it (not just reading it), no secrets in files, no unrequested features.

## Task 1: Repo folders, .gitignore, .env.example
**Acceptance criteria:**
- [ ] `terraform/ lambda/ ml/ dashboard/ db/` exist
- [ ] `.gitignore` covers tfstate, `*.tfvars` (except the example), Go binaries, `.venv`, `node_modules`, `.next`, `.env*` (except the example), `graphify-out`
- [ ] `.env.example` lists `DATABASE_URL` with a placeholder only

**Verification:** `git status` shows no ignored files; `git check-ignore` on a sample tfvars, .env, binary and node_modules path
**Dependencies:** None
**Files:** `.gitignore`, `.env.example`
**Scope:** XS

## Task 2: Provider, S3 log bucket, budget alert
**Acceptance criteria:**
- [ ] The bucket uses SSE-S3 encryption, has all four public-access blocks on, and expires objects after 30 days
- [ ] A $5/month budget emails `var.alert_email` at 100% of actual spend
- [ ] Region and email are variables; `terraform.tfvars.example` holds placeholders only

**Verification:** `terraform fmt -check && terraform init -backend=false && terraform validate`
**Dependencies:** 1
**Files:** `terraform/main.tf`, `terraform/variables.tf`, `terraform/terraform.tfvars.example`
**Scope:** S

## Task 3: CloudTrail trail and bucket policy
**Acceptance criteria:**
- [ ] One trail in one region, management events only, no data events, Insights or CloudWatch Logs delivery
- [ ] The bucket policy allows `cloudtrail.amazonaws.com` GetBucketAcl and PutObject, limited by `aws:SourceArn` to this trail, with `bucket-owner-full-control`
- [ ] The trail `depends_on` the policy

**Verification:** `terraform validate`
**Dependencies:** 2
**Files:** `terraform/cloudtrail.tf`
**Scope:** XS

## Task 4: Lambda infrastructure
**Acceptance criteria:**
- [ ] IAM role: `s3:GetObject` on this bucket's objects only, plus create-stream and put-events on its own log group only
- [ ] Log group retention 7 days; arm64 `provided.al2023`; 256 MB; 30 s timeout; no VPC
- [ ] S3 notification on `ObjectCreated` with prefix `AWSLogs/<account>/CloudTrail/`, plus a `aws_lambda_permission` limited to the bucket
- [ ] `DATABASE_URL` comes from a sensitive variable

**Verification:** `terraform validate`
**Dependencies:** 2, 3
**Files:** `terraform/lambda.tf`, `terraform/variables.tf`
**Scope:** S

### Checkpoint A: Terraform validates; review the IAM policy by eye for wildcards

## Task 5: Postgres schema
**Acceptance criteria:**
- [ ] `events` (PK `event_id`), `identities`, `alerts` tables
- [ ] 3–5 sample alerts with different severities
- [ ] Re-running the file doesn't fail (`IF NOT EXISTS`, `ON CONFLICT`)

**Verification:** `psql -f db/schema.sql` run twice on a local scratch DB
**Dependencies:** 1
**Files:** `db/schema.sql`
**Scope:** XS

## Task 6: Go Lambda
**Acceptance criteria:**
- [ ] S3 event → GetObject → gunzip → parse `Records[]` → insert time, identity ARN/type, eventName, eventSource, region, sourceIP, userAgent, errorCode, plus the raw JSON
- [ ] Inserts use `ON CONFLICT (event_id) DO NOTHING`; one transaction per file
- [ ] Errors are returned, not swallowed (so Lambda retries)

**Verification:** `go vet ./... && go test ./... && GOOS=linux GOARCH=arm64 go build`; a parser test on a fixture; a local run of the insert path twice against scratch Postgres (N rows, then 0)
**Dependencies:** 4, 5
**Files:** `lambda/main.go`, `lambda/main_test.go`, `lambda/testdata/sample.json`, `lambda/go.mod`, `lambda/go.sum`
**Scope:** M

### Checkpoint B: Lambda builds for linux/arm64; duplicate-insert check passes

## Task 7: ML stub
**Acceptance criteria:**
- [ ] Isolation forest scores a batch of sample events; an obvious outlier ranks highest
- [ ] Not wired to the DB or Lambda

**Verification:** `python ml/score.py` prints scores and its assert passes
**Dependencies:** None
**Files:** `ml/score.py`, `ml/requirements.txt`
**Scope:** XS

## Task 8: Dashboard alerts page
**Acceptance criteria:**
- [ ] The page lists recent alerts: time, severity, identity, reason
- [ ] The DB access module imports `server-only`; there is no `NEXT_PUBLIC_` DB variable
- [ ] Renders the sample alerts from local Postgres

**Verification:** `npm run build`; `npm run dev` + curl shows the sample alerts; grep the `.next/static` output for the connection string (expect no hit)
**Dependencies:** 5
**Files:** `dashboard/package.json`, `dashboard/app/layout.tsx`, `dashboard/app/page.tsx`, `dashboard/lib/db.ts`, `dashboard/tsconfig.json`
**Scope:** M

### Checkpoint C: all three runtimes verified locally

## Task 9: README and PROGRESS.md
**Acceptance criteria:**
- [ ] README: what it does, ASCII architecture diagram, cost table, deploy steps starting from fresh AWS, Neon and Vercel accounts
- [ ] PROGRESS.md: the week plan, done / stub / manual-steps lists

**Verification:** follow the deploy steps by eye against the actual file names and variables
**Dependencies:** 1–8
**Files:** `README.md`, `PROGRESS.md`
**Scope:** S

## Task 10: Review and fixes
**Acceptance criteria:** the code-review-and-quality pass has run; Critical/Important findings fixed and re-verified
**Dependencies:** 9

## Task 11: `/graphify .`
**Dependencies:** 10

### Checkpoint: Day 1 — summary to the user (working vs stub, manual steps), update PROGRESS.md, stop

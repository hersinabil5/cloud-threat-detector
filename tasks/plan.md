# Implementation Plan: Cloud Threat Detector

Source spec: the day-one brief (pasted in chat, 2026-11-14). Status lives in `PROGRESS.md`; detailed tasks for the current day live in `tasks/todo.md`.

## Overview
A security tool that watches one AWS account. CloudTrail drops log files into S3, a Go Lambda parses them into Neon Postgres, rules plus an isolation forest raise alerts, and a Next.js dashboard on Vercel lists them. One week, 2–3 h/day, ending in a live demo. Essentially free to run.

## Architecture Decisions
- **One CloudTrail trail with management events only.** The first copy of management events is free. No data events, Insights, Lake, or CloudWatch Logs delivery.
- **The S3 event notification filters on prefix `AWSLogs/<account>/CloudTrail/`**, so the Lambda never fires on digest files or other objects.
- **Lambda on `provided.al2023` arm64, no VPC.** It reaches Neon over TLS on the public internet; no NAT Gateway. Its own log group keeps logs for 7 days.
- **Duplicate rows are prevented in the database.** `events.event_id` (CloudTrail's `eventID`) is the primary key and inserts use `ON CONFLICT DO NOTHING`, so re-running on the same file is a no-op.
- **Secrets:** the Neon URL and alert email come only from `terraform.tfvars` and `.env*`, which git ignores. The Lambda gets the Neon URL as an encrypted environment variable (Secrets Manager would cost $0.40/month).
- **Dependencies are kept to what the standard library can't do:**
  - Go: AWS SDK (S3), aws-lambda-go, pgx.
  - Python: scikit-learn.
  - Dashboard: next, react, pg.
- **Dashboard:** hand-written minimal Next.js App Router app (no create-next-app boilerplate). The DB query runs in a server component and `pg` is server-only, so `DATABASE_URL` never reaches the browser. The page is dynamic, so `next build` doesn't need a database.
- **Background "normal" activity starts on day 2,** so the ML layer has several days of baseline by day 5.

## Week Plan

| Day | Goal | Done when | Your hands-on work |
|---|---|---|---|
| 1 | Skeleton: 8 steps, README, PROGRESS.md, review, graph | See Checkpoint: Day 1 | Create AWS, Neon and Vercel accounts; fill in `terraform.tfvars` and `.env` |
| 2 | `terraform apply`, load the schema into Neon, events flowing; start a background activity cron | New rows in `events` within about 15 min of a console action | Run apply (after I ask), confirm the budget email |
| 3 | Detection rules (about 6: root login, CloudTrail stopped/deleted, granting yourself admin, new access key, new source IP, access-denied burst) | Each rule fires on a hand-crafted event in a test | Review |
| 4 | Attack simulation scripts with cleanup | Each simulation produces its expected alert in Neon | Run the scripts with your credentials |
| 5 | ML: features for each user, train on days 2–4, write scores to `alerts` | The simulated attacks rank as top outliers | Review |
| 6 | Dashboard detail view, replay, Vercel deploy, decide on dashboard access control | Live URL shows real alerts | Connect Vercel, set `DATABASE_URL` |
| 7 | README results table, final review, go live (partly a buffer) | Demo works from a fresh browser | Record a demo |

Later days get their own task breakdown in `tasks/todo.md` at the start of that day.

## Day 1 Task List (details in tasks/todo.md)

### Phase 1: Repo and infrastructure (Terraform)
- [ ] Task 1: Repo folders, .gitignore, .env.example
- [ ] Task 2: Provider, encrypted private S3 bucket with 30-day expiry, $5 budget alert
- [ ] Task 3: CloudTrail trail and bucket policy
- [ ] Task 4: Lambda function, least-privilege IAM role, S3 trigger, log group

### Checkpoint A: `terraform fmt -check` and `terraform validate` pass (only possible if Terraform is installed)

### Phase 2: Data path
- [ ] Task 5: Postgres schema with sample alerts (moved before the Lambda so the Lambda can be tested against a real table)
- [ ] Task 6: Go Lambda: download, gunzip, parse, insert without duplicates

### Checkpoint B: `go build`/`go vet`/`go test` pass; running the same file twice against local Postgres inserts N rows, then 0

### Phase 3: ML and dashboard
- [ ] Task 7: Python isolation forest stub on sample data
- [ ] Task 8: Next.js alerts page (server-side DB)

### Checkpoint C: the ML stub prints scores; `next build` passes; the page lists the sample alerts from local Postgres

### Phase 4: Wrap-up
- [ ] Task 9: README (diagram, costs, deploy steps) and PROGRESS.md
- [ ] Task 10: Review (code-review-and-quality), fix what it flags
- [ ] Task 11: `/graphify .`

### Checkpoint: Day 1 complete, report to the user, stop

Note: tasks follow your eight steps (layer by layer) rather than the skill's preferred end-to-end slices, because you fixed that order. The one change is that the schema now comes before the Lambda, so the Lambda can be tested against it. Say if you'd rather keep your original order.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Terraform isn't installed, so it can't be validated today | Med | `brew install terraform awscli` before Task 2; otherwise flag it as unvalidated and validate on day 2 before apply |
| CloudTrail bucket policy or S3→Lambda permission is wrong, so no logs flow | High | Use AWS's documented policy with `aws:SourceArn`; day 2 has an explicit "rows appear" check |
| Neon free tier suspends the database when idle, causing cold-start latency or Lambda timeouts | Low | Lambda timeout 30 s; pgx connects per invocation |
| Large log files exceed Lambda memory | Low | Management events in one account are small; 256 MB and streaming gunzip |
| Too little baseline data for the ML layer | Med | Background activity cron from day 2 |
| Public dashboard exposes alert data | Med | Decide on day 6 (Vercel password protection costs money; simple basic-auth middleware is free) |

## Open Questions
1. Can you install Terraform (and the AWS CLI) now so Checkpoint A can run today?
2. AWS region? Default: `us-east-1`.
3. Is it OK to move the schema (step 6) before the Lambda (step 5)?

# Progress

Update at the end of every working session. Tell me which day it is and I'll pick up from here.

## Plan

| Day | Goal | Status |
|---|---|---|
| 1 | Skeleton (8 steps), README, review, graph | **done** (see below) |
| 2 | `terraform apply`, load schema into Neon, confirm events flow; start a scheduled background-activity job | next |
| 3 | Detection rules (~6: root login, CloudTrail stopped, self-granted admin, new access key, new source IP, AccessDenied burst) | |
| 4 | Attack simulation scripts + cleanup; confirm each produces its alert | |
| 5 | ML: per-identity features, train on days 2-4 data, write scores to `alerts` | |
| 6 | Dashboard detail + replay, deploy to Vercel, decide on access control | |
| 7 | README results table, final review, go live (buffer day) | |

Day-by-day task detail: `tasks/plan.md`, `tasks/todo.md`.

## Day 1: what works vs what is a stub

| Step | State |
|---|---|
| 1. Repo, .gitignore, .env.example | Working |
| 2. Terraform: provider, S3 bucket, $5 budget | Written, `terraform validate` passes, **never applied** |
| 3. Terraform: CloudTrail + bucket policy | Written, validates, never applied |
| 4. Terraform: Lambda, IAM, S3 trigger | Written, validates, never applied |
| 5. Go Lambda | Working locally: parser test and duplicate-insert test pass against local Postgres; builds for linux/arm64. **Not run against real CloudTrail or Neon yet** |
| 6. Schema + sample alerts | Working (re-runnable; tested on local Postgres) |
| 7. ML isolation forest | **Stub**: toy features, sample data, not wired in |
| 8. Dashboard | Working locally against sample alerts; connection string verified absent from browser output. No auth yet |

Nothing is deployed, committed, or pushed.

## You need to do by hand
- [ ] AWS account (MFA on root, admin IAM user), `brew install awscli` (I stopped it mid-compile), `aws configure` for `ca-central-1`
- [ ] Neon project; copy the connection string; `psql "<url>" -f db/schema.sql`
- [ ] `terraform/terraform.tfvars` from the example: `alert_email`, `database_url`
- [ ] Vercel account (day 6)
- [ ] Review and commit when you're happy (I haven't committed anything)

## Known gaps / decisions for later
- Dashboard is public once on Vercel. Decide on a login check on day 6.
- Lambda has no retry/dead-letter handling beyond Lambda's default async retries.
- AWS region is `ca-central-1`. Pick the Neon region closest to it when you create the project; the Lambda talks to Neon over the internet.

# Progress

Update at the end of every working session. Tell me which day it is and I'll pick up from here.

## Plan

| Day | Goal                                                                                                                        | Status   |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Skeleton (8 steps), README, review, graph                                                                                   | **done** |
| 2   | `terraform apply`, load schema into Neon, confirm events flow; start a scheduled background-activity job                    | **done** |
| 3   | Detection rules (~6: root login, CloudTrail stopped, self-granted admin, new access key, new source IP, AccessDenied burst) | **done, deployed** |
| 4   | Attack simulation scripts + cleanup; confirm each produces its alert                                                        | next     |
| 5   | ML: per-identity features, train on days 2-4 data, write scores to `alerts`                                                 |          |
| 6   | Dashboard detail + replay, deploy to Vercel, decide on access control                                                       |          |
| 7   | README results table, final review, go live (buffer day)                                                                    |          |

Day-by-day task detail: `tasks/plan.md`, `tasks/todo.md`.

## State as of 2026-11-18 (end of day 3)

- **Deployed in AWS `ca-central-1`** (IAM user `admin`; run `aws sts get-caller-identity` for the account): 13 Terraform resources (trail, log bucket, Lambda, budget). State is local in `terraform/terraform.tfstate` (git-ignored, don't delete it).
- **Neon** (`us-east-1`): schema loaded, sample alerts deleted. Pipeline verified end to end: CloudTrail → S3 → Lambda → Neon runs automatically (81 events on day 2).
- **Detection rules** live in the Lambda (`lambda/main.go`): `rule()` for single-event rules (root used, CloudTrail changed, AdministratorAccess attached, CreateAccessKey); SQL in `store` for history rules (never-seen IP per identity, 10th AccessDenied in 10 min). Unique index `alerts (event_id, reason)` makes re-ingest safe. Unit + local-Postgres tests pass. **Not yet seen firing on real AWS events** — that is day 4.
- Events ingested before day 3 were never run through the rules.
- **Background activity**: `scripts/background-activity.sh` (random read-only AWS calls) runs from cron every 30 min since 2026-11-18. Turn off with `crontab -r`.

## You need to do by hand

- [ ] Reset the Neon password before go-live (it was pasted into a chat); update `terraform/terraform.tfvars` and re-apply
- [ ] Vercel account (day 6)

## Known gaps / decisions for later

- Dashboard is public once on Vercel. Decide on a login check on day 6.
- Lambda has no retry/dead-letter handling beyond Lambda's default async retries.
- Background activity only runs while the Mac is awake; move to a scheduled Lambda if the ML baseline is too thin on day 5.
- New-IP rule: an older log file ingested after a newer one can raise a second alert for the same IP.

# Cloud Threat Detector

A security tool I built that watches a real AWS account for signs of an attack. It reads every action recorded in CloudTrail, checks it against detection rules and a machine-learning model, and shows the alerts on a web dashboard with a plain-language explanation and a replay of what the user did.

**Live demo: [What it detects and how each attack looks](https://cloud-threat-detector-l1cn.vercel.app/attacks)**

## What it does

- **Collects** every management action in the account (CloudTrail → S3 → a Go Lambda → Postgres), about 5–15 minutes after it happens.
- **Detects** six attack patterns with rules: root account use, audit logging switched off, admin rights granted, new access keys, logins from never-seen IPs, and bursts of denied calls.
- **Learns normal behaviour** with an isolation forest that scores each user's activity hour by hour and flags the strangest ones, catching attacks no single rule describes.
- **Explains** each alert on a dashboard: what it means, what to do, the raw event, and a replay of everything that user did 30 minutes either side.
- **Tested against real attacks**: a script plays out an account takeover (backdoor user, access key, permission probing, admin grant, logging turned off) and cleans up after itself.

## Results

Tested on a real AWS account with `scripts/simulate-attacks.sh` (a throwaway user that is deleted again afterwards) and a real root sign-in. Every attack produced its alert. Alerts appear 5–15 minutes after the action, which is how long CloudTrail takes to deliver its log files.

| Attack | How it was simulated | Rule alert | Severity | ML flagged the hour? |
|---|---|---|---|---|
| Root account used | Sign in to the console as root | Root account used | critical | yes |
| Logging turned off | `aws cloudtrail stop-logging` | CloudTrail logging changed: StopLogging | high | yes (admin's hour) |
| Self-granted admin | Attach `AdministratorAccess` to the test user | AdministratorAccess granted | high | yes (admin's hour) |
| Persistence via access key | `aws iam create-access-key` | New access key created | medium | yes (admin's hour) |
| Permission probing | Test user calls services it has no rights to | 10 AccessDenied errors in 10 minutes | low | yes |
| Login from a new place | Admin uses the account from home and phone | API call from a never-seen IP | medium | no: normal activity otherwise |

The isolation forest scored 180 user-hours of real activity. The 6 it flagged were the 5 attack hours above plus day-one setup (a genuinely unusual burst of infrastructure changes), so it found every attack hour with one false alarm.

## How it works

```
AWS account                                                     Neon (Postgres)
┌───────────┐  management   ┌───────────────┐  new object  ┌──────────────┐  insert   ┌──────────────────┐
│ CloudTrail│──── events ──▶│  S3 bucket    │───── event ─▶│ Lambda (Go)  │──────────▶│ events           │
│ (1 trail) │               │ (30-day expiry)│              │ gunzip+parse │           │ identities       │
└───────────┘               └───────────────┘              └──────────────┘           │ alerts           │
                                                                                      └────────┬─────────┘
                           detection rules + isolation forest (Python) ── write alerts ───────▶│
                                                                                               │ read
                                                                              ┌────────────────▼───────┐
                                                                              │ Next.js dashboard      │
                                                                              │ (server-side DB)       │
                                                                              └────────────────────────┘
```

| Folder       | What                               |
| ------------ | ---------------------------------- |
| `terraform/` | All AWS infrastructure             |
| `lambda/`    | Go function that ingests log files |
| `db/`        | Postgres schema + sample alerts    |
| `ml/`        | Python isolation forest, per identity-hour |
| `dashboard/` | Next.js dashboard                  |

## Tech stack

- **Infrastructure:** Terraform, AWS CloudTrail, S3, Lambda (arm64), IAM with least-privilege roles
- **Ingestion and rules:** Go (aws-lambda-go, AWS SDK v2, pgx)
- **Machine learning:** Python, scikit-learn (isolation forest)
- **Database:** Postgres on Neon
- **Dashboard:** Next.js (App Router, server components), password-protected

## Cost

Designed to run for about free: one trail with management events only, no VPC, NAT gateway or EC2. CloudTrail, Lambda, Neon and the dashboard hosting all fit in free tiers; S3 log storage costs fractions of a cent because logs expire after 30 days. A budget alert emails if the account ever passes $5/month.

## Run it yourself

You need: Go, Terraform, and the AWS CLI installed (`brew install hashicorp/tap/terraform awscli`), plus `psql` and Node 20+.

### 1. AWS

1. Create an AWS account. Turn on MFA for the root user, then create an admin IAM user (or IAM Identity Center user) for yourself and don't use root day to day.
2. `aws configure` with that user's credentials and region `ca-central-1`.

### 2. Neon

1. Create a Neon project at neon.tech (free tier) and copy the **connection string**.
2. Load the schema: `psql "<connection string>" -f db/schema.sql`

### 3. Deploy the infrastructure

```sh
cd lambda && GOOS=linux GOARCH=arm64 go build -o bootstrap . && cd ..
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in alert_email and database_url (git-ignored)
terraform init
terraform plan
terraform apply
```

Check: do something in the AWS console (e.g. create and delete an S3 bucket), wait 5–15 minutes, then `psql "<connection string>" -c "select count(*) from events"` should show rows.

### Run the dashboard locally

```sh
cd dashboard && cp ../.env.example .env.local   # put your database URL and a dashboard password in it
npm install && npm run dev
```

## Secrets

No secrets live in the code. `terraform.tfvars` and `.env*` are git-ignored. The Lambda receives the database URL as an encrypted environment variable. The dashboard reads it only in server code, so it is never sent to the browser.

## Tests

```sh
cd lambda && go vet ./... && go test ./...                              # parser test
TEST_DATABASE_URL=postgres:///yourdb go test ./...                      # also checks re-ingest adds no duplicates
cd ml && python -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python test_score.py && DATABASE_URL=... .venv/bin/python score.py
```

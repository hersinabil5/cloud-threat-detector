# Cloud Threat Detector

Watches an AWS account for signs of an attack. It reads CloudTrail logs (the record of every action in the account), learns what normal looks like for each user, and raises an alert when something breaks the pattern: stolen credentials, someone granting themselves admin rights, logging being turned off. A web dashboard lists the alerts.

> **Status:** in progress. Ingestion and six detection rules are deployed; ML scoring is a stub and the dashboard runs locally only.

## Architecture

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
                                                                              │ (Vercel, server-side DB)│
                                                                              └────────────────────────┘
```

| Folder       | What                               |
| ------------ | ---------------------------------- |
| `terraform/` | All AWS infrastructure             |
| `lambda/`    | Go function that ingests log files |
| `db/`        | Postgres schema + sample alerts    |
| `ml/`        | Python isolation forest (stub)     |
| `dashboard/` | Next.js alerts page                |

## Cost

Designed to be about free. One trail, management events only, no VPC, no NAT, no EC2.

| Item                                       | Cost                    |
| ------------------------------------------ | ----------------------- |
| CloudTrail, first trail, management events | $0                      |
| S3 (logs expire after 30 days)             | cents                   |
| Lambda (arm64) and its 7-day logs          | $0 inside the free tier |
| AWS Budgets (one budget)                   | $0                      |
| Neon free tier                             | $0                      |
| Vercel Hobby                               | $0                      |

A budget alert emails you if the account passes **$5/month**. Never added: data events, a second trail, CloudTrail Insights or Lake, CloudWatch Logs delivery.

## Deploy from scratch

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

### 4. Dashboard on Vercel

1. Create a Vercel account (Hobby) and import this GitHub repo.
2. Set **Root Directory** to `dashboard`.
3. Add the environment variable `DATABASE_URL` (your Neon string). Deploy.

### Run the dashboard locally

```sh
cd dashboard && cp ../.env.example .env.local   # put your real URL in it
npm install && npm run dev
```

## Secrets

No secrets live in the code. `terraform.tfvars` and `.env*` are git-ignored. The Lambda receives the database URL as an encrypted environment variable. The dashboard reads it only in server code, so it is never sent to the browser.

## Tests

```sh
cd lambda && go vet ./... && go test ./...                              # parser test
TEST_DATABASE_URL=postgres:///yourdb go test ./...                      # also checks re-ingest adds no duplicates
cd ml && python -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python score.py
```

#!/bin/bash
# Normal read-only AWS activity so the ML layer has a baseline (run by cron every 30 min).
# shortcut: runs from your Mac, so no activity while it is asleep; move to a scheduled Lambda if the baseline is too thin.
AWS=/usr/local/bin/aws
calls=(
  "s3 ls"
  "iam list-users"
  "sts get-caller-identity"
  "ec2 describe-instances --region ca-central-1"
  "cloudtrail describe-trails --region ca-central-1"
  "lambda list-functions --region ca-central-1"
  "logs describe-log-groups --region ca-central-1"
)
for _ in $(seq $((RANDOM % 3 + 2))); do
  $AWS ${calls[$((RANDOM % ${#calls[@]}))]} >/dev/null 2>&1
done

#!/bin/bash
# Fake attacks: each step should raise one alert. Everything it creates is deleted again, even if a step fails.
# Expected alerts (5-15 min later): New access key created, 10 AccessDenied errors in 10 minutes,
# AdministratorAccess granted, CloudTrail logging changed: StopLogging.
set -euo pipefail
U=ctd-sim-attacker
TRAIL=threat-detector
R=ca-central-1
ADMIN=arn:aws:iam::aws:policy/AdministratorAccess

cleanup() {
  aws cloudtrail start-logging --name $TRAIL --region $R || true
  for k in $(aws iam list-access-keys --user-name $U --query 'AccessKeyMetadata[].AccessKeyId' --output text 2>/dev/null || true); do
    aws iam delete-access-key --user-name $U --access-key-id "$k" || true
  done
  aws iam detach-user-policy --user-name $U --policy-arn $ADMIN 2>/dev/null || true
  aws iam delete-user --user-name $U 2>/dev/null || true
  echo "cleanup done: test user deleted, logging on"
}
trap cleanup EXIT

echo "1/4 new access key for a throwaway user"
aws iam create-user --user-name $U >/dev/null
read -r KID SECRET < <(aws iam create-access-key --user-name $U --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

echo "2/4 12 calls the throwaway user isn't allowed to make"
sleep 15 # a new key takes a few seconds to start working
for _ in $(seq 12); do
  AWS_ACCESS_KEY_ID=$KID AWS_SECRET_ACCESS_KEY=$SECRET aws ec2 describe-instances --region $R >/dev/null 2>&1 || true
done
aws iam delete-access-key --user-name $U --access-key-id "$KID"

echo "3/4 grant AdministratorAccess (user has no keys or password, so it can't be used)"
aws iam attach-user-policy --user-name $U --policy-arn $ADMIN
aws iam detach-user-policy --user-name $U --policy-arn $ADMIN

echo "4/4 stop CloudTrail logging for a moment"
aws cloudtrail stop-logging --name $TRAIL --region $R

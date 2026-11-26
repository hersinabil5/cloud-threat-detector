export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export const Badge = ({ s }: { s: string }) => <span className={`badge ${s}`}>{s}</span>;

// "arn:aws:iam::123:user/admin" -> "admin"; the full (masked) ARN stays on the detail page.
export const shortName = (arn: string | null) => (arn ? arn.split(/[:/]/).pop() || arn : "unknown");

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function ago(d: Date) {
  const s = (d.getTime() - Date.now()) / 1000;
  for (const [unit, n] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  }
  return "just now";
}

// Every detection, in one place: the alert page shows meaning/action, the Attacks page shows all of it.
// `prefix` matches the start of the alert reason written by the Lambda or ml/score.py.
export const RULES = [
  {
    prefix: "Root account used", name: "Root account used", severity: "critical", tactic: "Initial access",
    meaning: "The root user, the master login for the whole AWS account, was used.",
    action: "Check it was you. If not, change the root password, turn on MFA and review what was done in the replay.",
    looks: "Any CloudTrail event whose identity type is Root, most often a ConsoleLogin followed by a burst of console page loads.",
    example: `userIdentity.type = "Root"\neventName = "ConsoleLogin"\neventSource = "signin.amazonaws.com"`,
  },
  {
    prefix: "CloudTrail logging changed", name: "Audit logging tampered with", severity: "high", tactic: "Defense evasion",
    meaning: "Someone changed or switched off the audit log. Attackers do this to hide what they do next.",
    action: "Make sure the trail is logging again and check who made the change.",
    looks: "StopLogging, DeleteTrail, UpdateTrail or PutEventSelectors on CloudTrail. The event itself is still recorded before logging stops.",
    example: `eventSource = "cloudtrail.amazonaws.com"\neventName = "StopLogging"\nrequestParameters.name = "threat-detector"`,
  },
  {
    prefix: "AdministratorAccess granted", name: "Admin rights granted", severity: "high", tactic: "Privilege escalation",
    meaning: "A user or role was given full admin rights over the account.",
    action: "Confirm this was planned. If not, remove the policy and the user's access keys.",
    looks: "AttachUserPolicy or AttachRolePolicy where the policy is AWS's AdministratorAccess.",
    example: `eventName = "AttachUserPolicy"\nrequestParameters.policyArn =\n  "arn:aws:iam::aws:policy/AdministratorAccess"`,
  },
  {
    prefix: "New access key created", name: "New access key", severity: "medium", tactic: "Persistence",
    meaning: "A new long-term access key was created. Stolen keys are the most common way into AWS accounts.",
    action: "Check who made it and why. Delete it if nobody expected it.",
    looks: "CreateAccessKey on IAM. Attackers make a key so they can come back even after a password change.",
    example: `eventSource = "iam.amazonaws.com"\neventName = "CreateAccessKey"\nrequestParameters.userName = "ctd-sim-attacker"`,
  },
  {
    prefix: "API call from a never-seen IP", name: "Login from a new place", severity: "medium", tactic: "Initial access",
    meaning: "This user acted from an internet address they have never used before.",
    action: "New Wi-Fi or a VPN explains most of these. If the place looks wrong, rotate the user's credentials.",
    looks: "A human user (IAM user or root) calls AWS from a source IP absent from all of their earlier events. Service roles are skipped: AWS moves them between IPs constantly.",
    example: `userIdentity.type = "IAMUser"\nsourceIPAddress = "203.0.113.9"   // first time for this user`,
  },
  {
    prefix: "10 AccessDenied", name: "Permission probing", severity: "low", tactic: "Discovery",
    meaning: "Many denied calls in a few minutes: someone may be probing for what they are allowed to do.",
    action: "Look at the calls in the replay. A broken script looks repetitive; an attacker tries many different services.",
    looks: "At least 10 AccessDenied errors from one identity within 10 minutes. A real attacker usually tries many services; the test attacker here repeated one call.",
    example: `eventName = "DescribeInstances"\nerrorCode = "Client.UnauthorizedOperation"   × 12 in 9 seconds`,
  },
  {
    prefix: "Unusual activity", name: "Unusual hour (machine learning)", severity: "low", tactic: "Any",
    meaning: "The machine-learning model found this hour of activity unlike this user's normal pattern.",
    action: "Scan the replay for anything you don't recognise. The higher the score, the stranger the hour.",
    looks: "An isolation forest compares each user's hour of activity (number of calls, variety, errors, IAM/CloudTrail changes, new IPs, how new the user is) with every other hour, and flags the oddest 3%. It catches attacks no single rule describes.",
    example: `admin, 23:00: 19 calls, 16 different actions, 9 IAM/CloudTrail changes\n→ score 0.72 (a typical hour scores about 0.43)`,
  },
] as const;

export const explain = (reason: string) => RULES.find((r) => reason.startsWith(r.prefix));

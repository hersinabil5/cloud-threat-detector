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

// Plain-language meaning and next step for each rule, matched on the start of the alert reason.
const EXPLAIN: [string, string, string][] = [
  ["Root account used", "The root user, the master login for the whole AWS account, was used.",
    "Check it was you. If not, change the root password, turn on MFA and review what was done below."],
  ["CloudTrail logging changed", "Someone changed or switched off the audit log. Attackers do this to hide what they do next.",
    "Make sure the trail is logging again and check who made the change."],
  ["AdministratorAccess granted", "A user or role was given full admin rights over the account.",
    "Confirm this was planned. If not, remove the policy and the user's access keys."],
  ["New access key created", "A new long-term access key was created. Stolen keys are the most common way into AWS accounts.",
    "Check who made it and why. Delete it if nobody expected it."],
  ["API call from a never-seen IP", "This user acted from an internet address they have never used before.",
    "New Wi-Fi or a VPN explains most of these. If the place looks wrong, rotate the user's credentials."],
  ["10 AccessDenied", "Many denied calls in a few minutes: someone may be probing for what they are allowed to do.",
    "Look at the calls below. A broken script looks repetitive; an attacker tries many different services."],
  ["Unusual activity", "The machine-learning model found this hour of activity unlike this user's normal pattern.",
    "Scan the replay below for anything you don't recognise. The higher the score, the stranger the hour."],
];
export const explain = (reason: string) => EXPLAIN.find(([p]) => reason.startsWith(p))?.slice(1) as [string, string] | undefined;

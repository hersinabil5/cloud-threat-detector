import Link from "next/link";
import { pool } from "@/lib/db";
import { Badge, RULES } from "@/lib/ui";

export const dynamic = "force-dynamic";

// A typical account takeover and which detection catches each step. Steps 2-5 are what scripts/simulate-attacks.sh does.
const CHAIN = [
  ["Get in", "The attacker uses a stolen admin password or key.", "Login from a new place"],
  ["Make a backdoor user", "CreateUser, then CreateAccessKey so they can return later.", "New access key"],
  ["Look around", "The new user tests what it can reach, e.g. listing servers. Without permissions, every call is denied.", "Permission probing"],
  ["Take over", "AttachUserPolicy gives the backdoor user AdministratorAccess.", "Admin rights granted"],
  ["Cover tracks", "StopLogging switches off the audit trail.", "Audit logging tampered with"],
  ["Whole hour", "Together, these hours look nothing like normal use.", "Unusual hour (machine learning)"],
] as const;

export default async function AttacksPage() {
  // Latest real alert for each detection, so every card can link to an example from this account.
  const { rows } = await pool.query(
    `SELECT p, (SELECT max(id) FROM alerts WHERE starts_with(reason, p)) AS id FROM unnest($1::text[]) AS p`,
    [RULES.map((r) => r.prefix)]
  );
  const example = Object.fromEntries(rows.map((r) => [r.p, r.id]));
  return (
    <main>
      <p><Link href="/">← All alerts</Link></p>
      <h1>What we detect</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Every action in your AWS account is written to CloudTrail. Seven detections read that log and raise an alert
        5–15 minutes after something suspicious happens. Six are fixed rules; the seventh is a machine-learning model
        that learns what normal looks like for each user.
      </p>

      <h2>How an attack unfolds</h2>
      <div className="panel">
        <table>
          <thead><tr><th>#</th><th>Attacker step</th><th className="hide-sm">What they do</th><th>Caught by</th></tr></thead>
          <tbody>
            {CHAIN.map(([step, what, by], i) => (
              <tr key={step}>
                <td className="muted">{i + 1}</td>
                <td><b>{step}</b><div className="muted show-sm">{what}</div></td>
                <td className="hide-sm">{what}</td>
                <td><a href={`#${RULES.find((r) => r.name === by)!.prefix}`}>{by}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The detections</h2>
      <div className="rules">
        {RULES.map((r) => (
          <section key={r.prefix} id={r.prefix} className="card rule">
            <div className="rule-head">
              <Badge s={r.severity} />
              <span className="muted">{r.tactic}</span>
            </div>
            <h3>{r.name}</h3>
            <p>{r.meaning}</p>
            <p><b>How it looks in the log:</b> {r.looks}</p>
            <pre>{r.example}</pre>
            <p><b>What to do:</b> {r.action}</p>
            {example[r.prefix]
              ? <Link href={`/alert/${example[r.prefix]}`}>See a real example from this account →</Link>
              : <span className="muted">No alert of this kind yet.</span>}
          </section>
        ))}
      </div>

      <h2>What it does not cover</h2>
      <ul className="muted" style={{ maxWidth: 720 }}>
        <li>Reading or downloading files in S3, and other data events: logging them costs extra, so the trail records management events only.</li>
        <li>Network attacks on servers (port scans, malware on an instance): those need VPC flow logs or a tool like GuardDuty.</li>
        <li>Attacks faster than the delay: CloudTrail delivers logs 5–15 minutes late, so this detects and explains rather than blocks.</li>
        <li>Other AWS accounts: it watches one account.</li>
      </ul>
    </main>
  );
}

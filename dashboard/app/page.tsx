import Link from "next/link";
import { mask, pool } from "@/lib/db";
import { Badge, SEVERITIES, ago, shortName } from "@/lib/ui";

export const dynamic = "force-dynamic"; // query on every request, not at build time

export default async function Page({ searchParams }: { searchParams: Promise<{ severity?: string }> }) {
  const { severity } = await searchParams;
  const filter = SEVERITIES.find((s) => s === severity) ?? null; // only known values reach the query
  const [{ rows }, { rows: counts }] = await Promise.all([
    pool.query(
      `SELECT id, created_at, severity, identity_arn, reason, score FROM alerts
       WHERE $1::text IS NULL OR severity = $1 ORDER BY created_at DESC LIMIT 100`, [filter]),
    pool.query(`SELECT severity, count(*)::int AS n FROM alerts WHERE created_at > now() - interval '7 days' GROUP BY 1`),
  ]);
  const n = Object.fromEntries(counts.map((c) => [c.severity, c.n]));
  return (
    <main>
      <div className="header">
        <div>
          <h1>Cloud Threat Detector</h1>
          <div className="muted">Suspicious activity in your AWS account</div>
        </div>
        <div><Link href="/attacks">What we detect</Link> <span className="muted">· Last 7 days</span></div>
      </div>

      <div className="cards">
        <Link href="/" className={`card ${filter ? "" : "on"}`}>
          <div className="n">{SEVERITIES.reduce((t, s) => t + (n[s] ?? 0), 0)}</div>
          <div className="muted">All alerts</div>
        </Link>
        {SEVERITIES.map((s) => (
          <Link key={s} href={`/?severity=${s}`} className={`card ${filter === s ? "on" : ""}`}>
            <div className={`n ${s}`}>{n[s] ?? 0}</div>
            <div className="muted" style={{ textTransform: "capitalize" }}>{s}</div>
          </Link>
        ))}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr><th>Severity</th><th>What happened</th><th>Who</th><th className="hide-sm">When</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><Badge s={a.severity} /></td>
                <td>
                  <Link href={`/alert/${a.id}`}>{a.reason}</Link>
                  {a.score != null && <span className="muted"> · score {a.score.toFixed(2)}</span>}
                </td>
                <td title={mask(a.identity_arn ?? "")}>{shortName(a.identity_arn)}</td>
                <td className="hide-sm muted" title={new Date(a.created_at).toISOString()}>{ago(new Date(a.created_at))}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">No alerts. All quiet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}

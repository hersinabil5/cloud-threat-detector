import Link from "next/link";
import { notFound } from "next/navigation";
import { mask, pool } from "@/lib/db";
import { Badge, ago, explain, shortName } from "@/lib/ui";

export const dynamic = "force-dynamic";

// One alert, the event that raised it, and a replay of everything that identity did 30 minutes either side.
export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { rows: [a] } = await pool.query(
    `SELECT a.*, e.raw, e.source_ip, e.region FROM alerts a LEFT JOIN events e USING (event_id) WHERE a.id = $1`, [id]
  );
  if (!a) notFound();
  const { rows: timeline } = await pool.query(
    `SELECT event_id, event_time, event_name, event_source, source_ip, error_code FROM events
     WHERE identity_arn = $1 AND event_time BETWEEN $2::timestamptz - interval '30 minutes' AND $2::timestamptz + interval '30 minutes'
     ORDER BY event_time LIMIT 500`,
    [a.identity_arn, a.created_at]
  );
  const when = new Date(a.created_at);
  const ex = explain(a.reason);
  return (
    <main>
      <p><Link href="/">← All alerts</Link></p>
      <div style={{ marginBottom: 16 }}>
        <Badge s={a.severity} />
        <h1 style={{ marginTop: 8 }}>{a.reason}</h1>
        <div className="muted">{shortName(a.identity_arn)} · {ago(when)}</div>
      </div>

      {ex && (
        <div className={`explain ${a.severity}`}>
          <p><b>What this means:</b> {ex[0]}</p>
          <p><b>What to do:</b> {ex[1]}</p>
        </div>
      )}

      <div className="facts">
        <div><b>Who</b><span className="mono">{mask(a.identity_arn ?? "unknown")}</span></div>
        <div><b>When (UTC)</b>{when.toISOString().replace("T", " ").slice(0, 19)}</div>
        <div><b>From IP</b>{a.source_ip ?? "—"}</div>
        <div><b>Region</b>{a.region ?? "—"}</div>
        {a.score != null && <div><b>ML score</b>{a.score.toFixed(2)} <span className="muted">(higher = stranger)</span></div>}
      </div>

      <h2>Replay <span className="muted">· everything {shortName(a.identity_arn)} did 30 minutes either side ({timeline.length} calls)</span></h2>
      <div className="panel">
        <table>
          <thead>
            <tr><th>Time (UTC)</th><th>Action</th><th className="hide-sm">Service</th><th className="hide-sm">IP</th><th>Result</th></tr>
          </thead>
          <tbody>
            {timeline.map((e) => (
              <tr key={e.event_id} className={e.event_id === a.event_id ? "hl" : undefined}>
                <td className="mono">{new Date(e.event_time).toISOString().slice(11, 19)}</td>
                <td>{e.event_name}</td>
                <td className="hide-sm muted">{e.event_source.replace(".amazonaws.com", "")}</td>
                <td className="hide-sm muted">{e.source_ip}</td>
                <td>{e.error_code ? <span className="critical">{e.error_code}</span> : <span className="muted">ok</span>}</td>
              </tr>
            ))}
            {timeline.length === 0 && <tr><td colSpan={5} className="muted">No events recorded for this identity around this time.</td></tr>}
          </tbody>
        </table>
      </div>

      {a.raw && (
        <details>
          <summary>Show the raw CloudTrail event</summary>
          <pre>{mask(JSON.stringify(a.raw, null, 2))}</pre>
        </details>
      )}
    </main>
  );
}

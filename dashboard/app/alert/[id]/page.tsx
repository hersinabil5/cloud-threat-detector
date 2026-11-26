import Link from "next/link";
import { notFound } from "next/navigation";
import { mask, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// One alert, the event that raised it, and a replay of everything that identity did 30 minutes either side.
export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { rows: [a] } = await pool.query(
    `SELECT a.*, e.raw FROM alerts a LEFT JOIN events e USING (event_id) WHERE a.id = $1`, [id]
  );
  if (!a) notFound();
  const { rows: timeline } = await pool.query(
    `SELECT event_id, event_time, event_name, event_source, source_ip, error_code FROM events
     WHERE identity_arn = $1 AND event_time BETWEEN $2::timestamptz - interval '30 minutes' AND $2::timestamptz + interval '30 minutes'
     ORDER BY event_time LIMIT 500`,
    [a.identity_arn, a.created_at]
  );
  return (
    <main>
      <p><Link href="/">← all alerts</Link></p>
      <h1>{a.reason}</h1>
      <p>
        <b>{a.severity}</b> · {new Date(a.created_at).toISOString()} · {mask(a.identity_arn ?? "unknown")}
        {a.score != null && <> · ML score {a.score.toFixed(2)}</>}
      </p>
      <h2>Replay: this identity, 30 minutes either side ({timeline.length} events)</h2>
      <table cellPadding={4}>
        <thead>
          <tr><th>Time</th><th>Call</th><th>Service</th><th>IP</th><th>Error</th></tr>
        </thead>
        <tbody>
          {timeline.map((e) => (
            <tr key={e.event_id} style={e.event_id === a.event_id ? { background: "#fde68a" } : undefined}>
              <td>{new Date(e.event_time).toISOString()}</td>
              <td>{e.event_name}</td>
              <td>{e.event_source}</td>
              <td>{e.source_ip}</td>
              <td>{e.error_code}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a.raw && (
        <>
          <h2>Event that raised it</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{mask(JSON.stringify(a.raw, null, 2))}</pre>
        </>
      )}
    </main>
  );
}

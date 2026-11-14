import { pool } from "@/lib/db";

export const dynamic = "force-dynamic"; // query on every request, not at build time

export default async function Page() {
  const { rows } = await pool.query(
    "SELECT created_at, severity, identity_arn, reason FROM alerts ORDER BY created_at DESC LIMIT 50"
  );
  return (
    <main>
      <h1>Alerts</h1>
      <table cellPadding={6}>
        <thead>
          <tr><th>Time</th><th>Severity</th><th>Who</th><th>Why</th></tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i}>
              <td>{new Date(a.created_at).toISOString()}</td>
              <td>{a.severity}</td>
              <td>{a.identity_arn ?? "unknown"}</td>
              <td>{a.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

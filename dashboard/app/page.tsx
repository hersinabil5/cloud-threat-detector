import Link from "next/link";
import { mask, pool } from "@/lib/db";

export const dynamic = "force-dynamic"; // query on every request, not at build time

export default async function Page() {
  const { rows } = await pool.query(
    "SELECT id, created_at, severity, identity_arn, reason, score FROM alerts ORDER BY created_at DESC LIMIT 50"
  );
  return (
    <main>
      <h1>Alerts</h1>
      <table cellPadding={6}>
        <thead>
          <tr><th>Time</th><th>Severity</th><th>Who</th><th>Why</th><th>ML score</th></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/alert/${a.id}`}>{new Date(a.created_at).toISOString()}</Link></td>
              <td>{a.severity}</td>
              <td>{mask(a.identity_arn ?? "unknown")}</td>
              <td>{a.reason}</td>
              <td>{a.score?.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

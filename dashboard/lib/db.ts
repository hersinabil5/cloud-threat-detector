import "server-only"; // build fails if a client component imports this
import { Pool } from "pg";

// DATABASE_URL is read only on the server and never sent to the browser.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// The dashboard is public-facing: hide the 12-digit AWS account number wherever it appears (ARNs, raw events).
export const mask = (s: string) => s.replace(/\b\d{12}\b/g, "<account>");

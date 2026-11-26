import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Basic-auth gate for the dashboard. Without DASHBOARD_PASSWORD set it refuses everything (fail closed).
// Public: the "What we detect" page (no account data) and the static CSS/JS it needs.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/attacks" || path.startsWith("/_next/static/") || path === "/favicon.ico") return NextResponse.next();
  const want = process.env.DASHBOARD_PASSWORD;
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  const got = Buffer.from(scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "");
  if (want && got.length === Buffer.byteLength(want) && timingSafeEqual(got, Buffer.from(want))) {
    return NextResponse.next();
  }
  return new NextResponse("Login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="dashboard"' } });
}

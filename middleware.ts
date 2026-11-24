import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/auth") return NextResponse.next();
  if (path === "/api/telemetry" && request.method === "POST") return NextResponse.next();

  const password = process.env.PRS_DASHBOARD_PASSWORD;
  if (!password) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Dashboard access password is not configured" }, { status: 503 });
    return NextResponse.redirect(new URL("/login?setup=1", request.url));
  }

  const cookie = request.cookies.get("prs_dashboard_session")?.value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("PRS-DASHBOARD-SESSION:" + password));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (cookie !== expected) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Dashboard login required" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

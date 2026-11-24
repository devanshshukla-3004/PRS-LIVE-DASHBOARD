import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function sessionValue(password: string) {
  return createHash("sha256").update("PRS-DASHBOARD-SESSION:" + password).digest("hex");
}

export async function POST(request: NextRequest) {
  const expected = process.env.PRS_DASHBOARD_PASSWORD;
  if (!expected) return NextResponse.json({ ok: false, setupRequired: true, error: "PRS_DASHBOARD_PASSWORD is not configured in the deployment environment." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }
  const supplied = body && typeof body === "object" && "password" in body && typeof body.password === "string" ? body.password : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("prs_dashboard_session", sessionValue(expected), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("prs_dashboard_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}

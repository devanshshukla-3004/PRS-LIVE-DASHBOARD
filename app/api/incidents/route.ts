import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDEX = "prs:incidents:index";
const redis = () => {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return null;
  const url = rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  const token = rawToken.trim().replace(/^["']|["']$/g, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("upstash.io")) return null;
  } catch { return null; }
  return { url, token };
};

async function command(config: { url: string; token: string }, args: string[]) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(args), cache: "no-store",
  });
  if (!response.ok) throw new Error("Redis request failed");
  const result = await response.json();
  if (result.error) throw new Error("Redis command failed");
  return result.result;
}

async function pipeline(config: { url: string; token: string }, commands: string[][]) {
  const response = await fetch(config.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands), cache: "no-store",
  });
  if (!response.ok) throw new Error("Redis pipeline failed");
  const results = await response.json();
  if (!Array.isArray(results) || results.some((item: { error?: string }) => item?.error)) throw new Error("Redis pipeline command failed");
  return results.map((item: { result: unknown }) => item.result);
}

type Incident = {
  id: string; deviceId: string; type: "VIBRATION_EVENT";
  status: "ACTIVE" | "RESOLVED" | "INTERRUPTED";
  startedAt: string; endedAt: string | null; durationSeconds: number | null;
  startLocation: { latitude: number; longitude: number; satellites: number } | null;
  endLocation: { latitude: number; longitude: number; satellites: number } | null;
  startVibration: { score: number; ax: number; ay: number; az: number };
  endVibration: { score: number; ax: number; ay: number; az: number } | null;
  lastTelemetryAt: string; interruptedAt?: string; resumedAt?: string;
};

export async function GET() {
  const config = redis();
  if (!config) return NextResponse.json({ configured: false, incidents: [], counts: { total: 0, active: 0, resolved: 0, interrupted: 0 } });
  try {
    const ids = await command(config, ["ZREVRANGE", INDEX, "0", "99"]) as string[];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ configured: true, incidents: [], counts: { total: 0, active: 0, resolved: 0, interrupted: 0 } }, { headers: { "Cache-Control": "no-store" } });
    }
    const rawRecords = await pipeline(config, ids.map((id) => ["GET", "prs:incident:" + id]));
    const now = Date.now();
    const incidents: Incident[] = [];
    const updates: string[][] = [];
    rawRecords.forEach((raw, index) => {
      if (typeof raw !== "string") return;
      try {
        const incident = JSON.parse(raw) as Incident;
        if (incident.status === "ACTIVE" && now - Date.parse(incident.lastTelemetryAt) > 20000) {
          incident.status = "INTERRUPTED";
          incident.interruptedAt = new Date(now).toISOString();
          updates.push(["SET", "prs:incident:" + incident.id, JSON.stringify(incident)]);
        }
        incidents.push(incident);
      } catch { /* Ignore malformed stored record; do not fabricate a replacement. */ }
    });
    if (updates.length) await pipeline(config, updates);
    return NextResponse.json({
      configured: true, incidents,
      counts: {
        total: incidents.length,
        active: incidents.filter((item) => item.status === "ACTIVE").length,
        resolved: incidents.filter((item) => item.status === "RESOLVED").length,
        interrupted: incidents.filter((item) => item.status === "INTERRUPTED").length,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[PRS incidents] Read failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ configured: true, incidents: [], error: "Incident history unavailable" }, { status: 503 });
  }
}

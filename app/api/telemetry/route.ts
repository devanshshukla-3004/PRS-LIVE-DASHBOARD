import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "prs:telemetry:latest";
const TTL_SECONDS = 120;

type Telemetry = {
  deviceId: string;
  uptimeSeconds: number;
  mpu: { connected: boolean; ax: number; ay: number; az: number; vibrationScore: number; eventActive: boolean };
  gps: { fix: boolean; satellites: number; latitude: number | null; longitude: number | null };
  pressure: { connected: boolean; psi: number | null; simulated: boolean };
  temperature: { connected: boolean; celsius: number | null };
};

function redisConfig() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return null;
  // Vercel env values are sometimes pasted with surrounding whitespace/quotes.
  const url = rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  const token = rawToken.trim().replace(/^["']|["']$/g, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("upstash.io")) return null;
  } catch {
    return null;
  }
  return { url, token };
}

async function redisCommand(config: { url: string; token: string }, command: string[]) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis request failed: ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error("Redis command failed");
  return result.result;
}

function validTelemetry(value: unknown): value is Telemetry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const mpu = v.mpu as Record<string, unknown> | undefined;
  const gps = v.gps as Record<string, unknown> | undefined;
  const pressure = v.pressure as Record<string, unknown> | undefined;
  const temperature = v.temperature as Record<string, unknown> | undefined;

  return typeof v.deviceId === "string" && v.deviceId.length > 0 && v.deviceId.length <= 64
    && finite(v.uptimeSeconds) && v.uptimeSeconds >= 0
    && !!mpu && typeof mpu.connected === "boolean"
    && finite(mpu.ax) && finite(mpu.ay) && finite(mpu.az)
    && finite(mpu.vibrationScore) && typeof mpu.eventActive === "boolean"
    && !!gps && typeof gps.fix === "boolean" && Number.isInteger(gps.satellites)
    && (gps.satellites as number) >= 0 && (gps.satellites as number) <= 40
    && (gps.latitude === null || (finite(gps.latitude) && gps.latitude >= -90 && gps.latitude <= 90))
    && (gps.longitude === null || (finite(gps.longitude) && gps.longitude >= -180 && gps.longitude <= 180))
    && !!pressure && typeof pressure.connected === "boolean"
    && (pressure.psi === null || (finite(pressure.psi) && pressure.psi >= 0 && pressure.psi <= 300))
    && typeof pressure.simulated === "boolean"
    && !!temperature && typeof temperature.connected === "boolean"
    && (temperature.celsius === null || (finite(temperature.celsius) && temperature.celsius >= -50 && temperature.celsius <= 200));
}

export async function POST(request: NextRequest) {
  const expected = process.env.PRS_DEVICE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied.length !== expected.length ||
      !Buffer.from(supplied).equals(Buffer.from(expected))) {
    return NextResponse.json({ ok: false, error: "Unauthorized device" }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  if (!validTelemetry(body)) {
    return NextResponse.json({ ok: false, error: "Telemetry payload does not match the PRS schema" }, { status: 400 });
  }

  const config = redisConfig();
  if (!config) return NextResponse.json({ ok: false, error: "Telemetry storage is not configured" }, { status: 503 });

  const record = { ...body, receivedAt: new Date().toISOString() };
  try {
    await redisCommand(config, ["SET", KEY, JSON.stringify(record), "EX", String(TTL_SECONDS)]);
    return NextResponse.json({ ok: true, receivedAt: record.receivedAt, expiresInSeconds: TTL_SECONDS });
  } catch (error) {
    console.error("[PRS telemetry] Redis write failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, error: "Telemetry storage unavailable" }, { status: 503 });
  }
}

export async function GET() {
  const config = redisConfig();
  if (!config) return NextResponse.json({ connected: false, configured: false, telemetry: null });

  try {
    const raw = await redisCommand(config, ["GET", KEY]);
    if (!raw) return NextResponse.json({ connected: false, configured: true, telemetry: null });
    const record = JSON.parse(raw as string) as Telemetry & { receivedAt: string };
    // Exact GPS coordinates remain server-side; the public dashboard receives fix/satellite state only.
    return NextResponse.json({
      connected: true,
      configured: true,
      telemetry: {
        deviceId: record.deviceId,
        uptimeSeconds: record.uptimeSeconds,
        receivedAt: record.receivedAt,
        mpu: record.mpu,
        gps: { fix: record.gps.fix, satellites: record.gps.satellites },
        pressure: record.pressure,
        temperature: record.temperature,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[PRS telemetry] Redis read failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ connected: false, configured: true, telemetry: null, error: "Telemetry storage unavailable" }, { status: 503 });
  }
}

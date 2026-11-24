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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
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
  const v = value as Record<string, any>;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  return typeof v.deviceId === "string" && v.deviceId.length > 0 && v.deviceId.length <= 64
    && finite(v.uptimeSeconds) && v.uptimeSeconds >= 0
    && v.mpu && typeof v.mpu.connected === "boolean"
    && finite(v.mpu.ax) && finite(v.mpu.ay) && finite(v.mpu.az)
    && finite(v.mpu.vibrationScore) && typeof v.mpu.eventActive === "boolean"
    && v.gps && typeof v.gps.fix === "boolean" && Number.isInteger(v.gps.satellites)
    && v.gps.satellites >= 0 && v.gps.satellites <= 40
    && (v.gps.latitude === null || (finite(v.gps.latitude) && v.gps.latitude >= -90 && v.gps.latitude <= 90))
    && (v.gps.longitude === null || (finite(v.gps.longitude) && v.gps.longitude >= -180 && v.gps.longitude <= 180))
    && v.pressure && typeof v.pressure.connected === "boolean"
    && (v.pressure.psi === null || (finite(v.pressure.psi) && v.pressure.psi >= 0 && v.pressure.psi <= 300))
    && typeof v.pressure.simulated === "boolean"
    && v.temperature && typeof v.temperature.connected === "boolean"
    && (v.temperature.celsius === null || (finite(v.temperature.celsius) && v.temperature.celsius >= -50 && v.temperature.celsius <= 200));
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
  } catch {
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
  } catch {
    return NextResponse.json({ connected: false, configured: true, telemetry: null, error: "Telemetry storage unavailable" }, { status: 503 });
  }
}

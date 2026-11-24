import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LATEST_KEY = "prs:telemetry:latest";
const HISTORY_KEY = "prs:telemetry:history";
const INCIDENT_INDEX = "prs:incidents:index";
const LATEST_TTL_SECONDS = 120;
const HISTORY_TTL_SECONDS = 900;
const MAX_HISTORY = 180;

type Telemetry = {
  deviceId: string;
  uptimeSeconds: number;
  mpu: { connected: boolean; ax: number; ay: number; az: number; vibrationScore: number; eventActive: boolean };
  gps: { fix: boolean; satellites: number; latitude: number | null; longitude: number | null };
  pressure: { connected: boolean; psi: number | null; simulated: boolean };
  temperature: { connected: boolean; celsius: number | null };
};

type Incident = {
  id: string;
  deviceId: string;
  type: "VIBRATION_EVENT";
  status: "ACTIVE" | "RESOLVED" | "INTERRUPTED";
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  startLocation: { latitude: number; longitude: number; satellites: number } | null;
  endLocation: { latitude: number; longitude: number; satellites: number } | null;
  startVibration: { score: number; ax: number; ay: number; az: number };
  endVibration: { score: number; ax: number; ay: number; az: number } | null;
  lastTelemetryAt: string;
  interruptedAt?: string;
  resumedAt?: string;
};

function redisConfig() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return null;
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
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Redis request failed: " + response.status);
  const result = await response.json();
  if (result.error) throw new Error("Redis command failed");
  return result.result;
}

async function redisPipeline(config: { url: string; token: string }, commands: string[][]) {
  const response = await fetch(config.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Redis pipeline failed: " + response.status);
  const results = await response.json();
  if (!Array.isArray(results) || results.some((item: { error?: string }) => item?.error)) {
    throw new Error("Redis pipeline command failed");
  }
  return results;
}

function locationSnapshot(gps: Telemetry["gps"]) {
  return gps.fix && gps.latitude !== null && gps.longitude !== null
    ? { latitude: gps.latitude, longitude: gps.longitude, satellites: gps.satellites }
    : null;
}

function vibrationSnapshot(mpu: Telemetry["mpu"]) {
  return { score: mpu.vibrationScore, ax: mpu.ax, ay: mpu.ay, az: mpu.az };
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
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
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
  const historyPoint = {
    receivedAt: record.receivedAt,
    uptimeSeconds: record.uptimeSeconds,
    vibrationScore: record.mpu.vibrationScore,
    ax: record.mpu.ax,
    ay: record.mpu.ay,
    az: record.mpu.az,
    eventActive: record.mpu.eventActive,
  };

  try {
    const activeKey = "prs:incident:active:" + record.deviceId;
    const activeId = await redisCommand(config, ["GET", activeKey]) as string | null;
    const commands: string[][] = [
      ["SET", LATEST_KEY, JSON.stringify(record), "EX", String(LATEST_TTL_SECONDS)],
      ["RPUSH", HISTORY_KEY, JSON.stringify(historyPoint)],
      ["LTRIM", HISTORY_KEY, String(-MAX_HISTORY), "-1"],
      ["EXPIRE", HISTORY_KEY, String(HISTORY_TTL_SECONDS)],
    ];
    let incidentTransition: "STARTED" | "ENDED" | "UPDATED" | null = null;

    if (record.mpu.eventActive) {
      let incident: Incident | null = null;
      if (activeId) {
        const rawIncident = await redisCommand(config, ["GET", "prs:incident:" + activeId]) as string | null;
        if (rawIncident) incident = JSON.parse(rawIncident) as Incident;
      }
      if (!incident) {
        const id = "PRS-" + new Date(record.receivedAt).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8).toUpperCase();
        incident = {
          id, deviceId: record.deviceId, type: "VIBRATION_EVENT", status: "ACTIVE",
          startedAt: record.receivedAt, endedAt: null, durationSeconds: null,
          startLocation: locationSnapshot(record.gps), endLocation: null,
          startVibration: vibrationSnapshot(record.mpu), endVibration: null,
          lastTelemetryAt: record.receivedAt,
        };
        commands.push(["SET", activeKey, id]);
        commands.push(["ZADD", INCIDENT_INDEX, String(Date.now()), id]);
        incidentTransition = "STARTED";
      } else {
        if (incident.status === "INTERRUPTED") {
          incident.status = "ACTIVE";
          incident.resumedAt = record.receivedAt;
        }
        incident.lastTelemetryAt = record.receivedAt;
        incidentTransition = "UPDATED";
      }
      commands.push(["SET", "prs:incident:" + incident.id, JSON.stringify(incident)]);
    } else if (activeId) {
      const rawIncident = await redisCommand(config, ["GET", "prs:incident:" + activeId]) as string | null;
      if (rawIncident) {
        const incident = JSON.parse(rawIncident) as Incident;
        incident.status = "RESOLVED";
        incident.endedAt = record.receivedAt;
        incident.durationSeconds = Math.max(0, Math.round((Date.parse(record.receivedAt) - Date.parse(incident.startedAt)) / 1000));
        incident.endLocation = locationSnapshot(record.gps);
        incident.endVibration = vibrationSnapshot(record.mpu);
        incident.lastTelemetryAt = record.receivedAt;
        commands.push(["SET", "prs:incident:" + incident.id, JSON.stringify(incident)]);
        incidentTransition = "ENDED";
      }
      commands.push(["DEL", activeKey]);
    }

    await redisPipeline(config, commands);
    return NextResponse.json({
      ok: true, receivedAt: record.receivedAt, expiresInSeconds: LATEST_TTL_SECONDS,
      historyPoints: MAX_HISTORY, incidentTransition,
    });
  } catch (error) {
    console.error("[PRS telemetry] Redis write failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, error: "Telemetry storage unavailable" }, { status: 503 });
  }
}

export async function GET() {
  const config = redisConfig();
  if (!config) return NextResponse.json({ connected: false, configured: false, telemetry: null, history: [] });

  try {
    const [raw, rawHistory] = await Promise.all([
      redisCommand(config, ["GET", LATEST_KEY]),
      redisCommand(config, ["LRANGE", HISTORY_KEY, "0", "-1"]),
    ]);
    if (!raw) return NextResponse.json({ connected: false, configured: true, telemetry: null, history: [] });

    const record = JSON.parse(raw as string) as Telemetry & { receivedAt: string };
    const history = Array.isArray(rawHistory)
      ? rawHistory.map((item: string) => JSON.parse(item)).filter((item: unknown) => {
          if (!item || typeof item !== "object") return false;
          const point = item as Record<string, unknown>;
          return typeof point.receivedAt === "string" && typeof point.vibrationScore === "number"
            && Number.isFinite(point.vibrationScore) && typeof point.ax === "number"
            && typeof point.ay === "number" && typeof point.az === "number";
        })
      : [];

    return NextResponse.json({
      connected: true, configured: true,
      telemetry: {
        deviceId: record.deviceId, uptimeSeconds: record.uptimeSeconds, receivedAt: record.receivedAt,
        mpu: record.mpu,
        gps: { fix: record.gps.fix, satellites: record.gps.satellites, latitude: record.gps.fix ? record.gps.latitude : null, longitude: record.gps.fix ? record.gps.longitude : null },
        pressure: record.pressure, temperature: record.temperature,
      },
      history,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[PRS telemetry] Redis read failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ connected: false, configured: true, telemetry: null, history: [], error: "Telemetry storage unavailable" }, { status: 503 });
  }
}

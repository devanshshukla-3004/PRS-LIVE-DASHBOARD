"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, Clock3, Gauge, MapPin, Radio, ShieldCheck, Thermometer, Wifi, WifiOff, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type HistoryPoint = {
  receivedAt: string;
  uptimeSeconds: number;
  vibrationScore: number;
  ax: number;
  ay: number;
  az: number;
  eventActive: boolean;
};
type LiveSnapshot = {
  connected: boolean;
  configured: boolean;
  telemetry: null | {
    deviceId: string;
    uptimeSeconds: number;
    receivedAt: string;
    mpu: { connected: boolean; ax: number; ay: number; az: number; vibrationScore: number; eventActive: boolean };
    gps: { fix: boolean; satellites: number; latitude: number | null; longitude: number | null };
    pressure: { connected: boolean; psi: number | null; simulated: boolean };
    temperature: { connected: boolean; celsius: number | null };
  };
  history: HistoryPoint[];
  error?: string;
};


type IncidentSnapshot = {
  id: string; deviceId: string; type: "VIBRATION_EVENT";
  status: "ACTIVE" | "RESOLVED" | "INTERRUPTED";
  startedAt: string; endedAt: string | null; durationSeconds: number | null;
  startLocation: { latitude: number; longitude: number; satellites: number } | null;
  endLocation: { latitude: number; longitude: number; satellites: number } | null;
  startVibration: { score: number; ax: number; ay: number; az: number };
  endVibration: { score: number; ax: number; ay: number; az: number } | null;
};
type NearbyPlace = {
  id: string; name: string; category: string; distanceKm: number;
  latitude: number; longitude: number; address: string; phone: string | null;
  mapsUrl: string; sourceUrl: string;
};
type NearbyResponse = { available: boolean; reason?: string; error?: string; source?: string; radiusKm?: number; places: NearbyPlace[] };

function Metric({ label, value, unit, icon: Icon, foot, alert = false }: {
  label: string; value: string; unit?: string; icon: typeof Activity; foot: string; alert?: boolean;
}) {
  return <div className="panel p-4 sm:p-5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-[.17em] muted">{label}</span>
      <span className={"rounded-xl p-2 " + (alert ? "bg-amber-300/10 text-amber-200" : "bg-cyan-300/10 text-cyan-200")}><Icon size={17}/></span>
    </div>
    <div className="mt-4 flex items-baseline gap-2"><strong className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</strong>{unit && <span className="text-sm muted">{unit}</span>}</div>
    <p className="mt-2 text-xs muted">{foot}</p>
  </div>;
}

function StateLine({ label, value, good = false, warn = false }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
    <span className="text-sm muted">{label}</span>
    <span className={"text-xs font-medium " + (good ? "text-emerald-200" : warn ? "text-amber-200" : "text-slate-300")}>{value}</span>
  </div>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [range, setRange] = useState<"1m" | "5m" | "15m">("5m");
  const [incidents, setIncidents] = useState<IncidentSnapshot[]>([]);
  const [incidentCounts, setIncidentCounts] = useState({ total: 0, active: 0, resolved: 0, interrupted: 0 });
  const [incidentError, setIncidentError] = useState("");
  const [eventNotice, setEventNotice] = useState("");
  const lastEventState = useRef<boolean | null>(null);
  const [nearby, setNearby] = useState<NearbyResponse | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/telemetry", { cache: "no-store" });
        const data = await response.json() as LiveSnapshot;
        if (active) {
          setSnapshot(data);
          setLastChecked(new Date());
        }
      } catch {
        if (active) setSnapshot(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const pollIncidents = async () => {
      try {
        const response = await fetch("/api/incidents", { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok) {
          setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
          setIncidentCounts(data.counts ?? { total: 0, active: 0, resolved: 0, interrupted: 0 });
          setIncidentError(data.error ?? "");
        } else if (active) setIncidentError(data.error ?? "Incident history unavailable");
      } catch {
        if (active) setIncidentError("Could not load incident history.");
      }
    };
    pollIncidents();
    const timer = window.setInterval(pollIncidents, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const exportIncidents = () => {
    const columns = ["Incident ID", "Device ID", "Status", "Started At", "Ended At", "Duration Seconds", "Start Latitude", "Start Longitude", "End Latitude", "End Longitude", "Start Vibration Score", "End Vibration Score"];
    const rows = incidents.map((item) => [
      item.id, item.deviceId, item.status, item.startedAt, item.endedAt ?? "",
      item.durationSeconds ?? "", item.startLocation?.latitude ?? "", item.startLocation?.longitude ?? "",
      item.endLocation?.latitude ?? "", item.endLocation?.longitude ?? "",
      item.startVibration.score, item.endVibration?.score ?? "",
    ]);
    const csv = [columns, ...rows].map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\\r\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "prs-incident-history.csv";
    downloadLink.click();
    URL.revokeObjectURL(url);
  };

  const loadNearby = async () => {
    setNearbyLoading(true);
    try {
      const response = await fetch("/api/nearby", { cache: "no-store" });
      const data = await response.json() as NearbyResponse;
      setNearby(data);
    } catch {
      setNearby({ available: false, error: "Nearby services could not be loaded. Please retry.", places: [] });
    } finally {
      setNearbyLoading(false);
    }
  };

  const telemetry = snapshot?.telemetry ?? null;
  const fresh = Boolean(snapshot?.connected && telemetry &&
    Number.isFinite(new Date(telemetry.receivedAt).getTime()) &&
    Date.now() - new Date(telemetry.receivedAt).getTime() < 15000);
  const deviceOnline = Boolean(fresh && telemetry?.mpu.connected);
  const chartData = useMemo(() => {
    const points = snapshot?.history ?? [];
    const windowMs = range === "1m" ? 60000 : range === "5m" ? 300000 : 900000;
    const cutoff = Date.now() - windowMs;
    return points
      .filter((point) => new Date(point.receivedAt).getTime() >= cutoff)
      .map((point) => ({
        time: new Date(point.receivedAt).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        timestamp: new Date(point.receivedAt).getTime(),
        vibrationScore: point.vibrationScore,
        eventActive: point.eventActive,
      }));
  }, [snapshot?.history, range]);

  const packetAge = telemetry ? Math.max(0, Math.floor((Date.now() - new Date(telemetry.receivedAt).getTime()) / 1000)) : null;
  const deviceState = loading ? "CONNECTING" : deviceOnline ? "ONLINE" : telemetry ? "STALE" : "OFFLINE";
  const statusTone = deviceOnline ? "text-emerald-200" : "text-amber-200";
  const lastPacket = telemetry ? new Date(telemetry.receivedAt).toLocaleTimeString() : "No packet received";
  const avgScore = chartData.length
    ? Math.round(chartData.reduce((sum, point) => sum + point.vibrationScore, 0) / chartData.length)
    : null;

  useEffect(() => {
    if (!fresh || !telemetry) return;
    const current = telemetry.mpu.eventActive;
    if (lastEventState.current === false && current) setEventNotice("High vibration event started. Incident logging is active.");
    if (lastEventState.current === true && !current) setEventNotice("Vibration event ended. End location and readings have been saved.");
    if (lastEventState.current === null && current) setEventNotice("A vibration event is currently active.");
    lastEventState.current = current;
  }, [fresh, telemetry?.mpu.eventActive]);

  return <main className="min-h-screen">
    <header className="border-b border-white/10 bg-[#090e15]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Activity size={21}/></div>
          <div><div className="text-sm font-semibold tracking-[.14em]">PRS <span className="text-cyan-200">COMMAND CENTER</span></div><div className="text-[10px] tracking-[.2em] muted">PUNCTURE RESCUE SYSTEM · LIVE PROTOTYPE</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-white/10 px-3 py-2">
          <span className={"h-2 w-2 rounded-full " + (deviceOnline ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.8)]" : "bg-amber-300")}/>
          <span className={"text-[11px] font-semibold tracking-[.14em] " + statusTone}>{deviceState}</span>
          <span className="hidden text-xs muted sm:inline">{telemetry?.deviceId ?? "PRS device not detected"}</span>
          <button onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); window.location.href = "/login"; }} className="ml-2 rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-slate-300 hover:border-cyan-200/30 hover:text-white">Lock</button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7">
      <section className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-xs font-semibold tracking-[.24em] text-cyan-200">VEHICLE TELEMETRY / LIVE OPERATIONS</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Live system overview<span className="text-cyan-200">.</span></h1><p className="mt-2 text-sm muted">Actual ESP8266 telemetry only. No demo values or simulated sensor readings.</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs muted"><Clock3 size={14}/> Auto-refresh · 3 seconds <span className="mx-1 text-white/20">|</span> Checked {lastChecked ? lastChecked.toLocaleTimeString() : "—"}</div>
      </section>

      <section className={"mb-6 flex items-start gap-3 rounded-xl border p-4 " + (deviceOnline ? "border-emerald-300/20 bg-emerald-300/5" : "border-amber-300/20 bg-amber-300/5")}>
        {deviceOnline ? <Wifi size={18} className="mt-0.5 shrink-0 text-emerald-200"/> : <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-200"/>}
        <div className="min-w-0">
          <p className={"text-sm font-semibold " + statusTone}>{deviceOnline ? "Live device telemetry is being received" : loading ? "Connecting to telemetry service" : snapshot?.configured === false ? "Telemetry storage is not configured" : telemetry ? "Last packet is stale — waiting for the device" : "No live device packet received"}</p>
          <p className="mt-1 text-xs muted">{telemetry ? "Device " + telemetry.deviceId + " · Last packet " + lastPacket + " · " + packetAge + " seconds ago" : "Power the ESP8266 and ensure it is connected to Wi-Fi and sending authenticated telemetry."}</p>
          {snapshot?.error && <p className="mt-1 text-xs text-amber-200">{snapshot.error}</p>}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Device connection" value={deviceState} icon={deviceOnline ? Radio : WifiOff} foot={telemetry?.deviceId ?? "Awaiting authenticated packet"} alert={!deviceOnline}/>
        <Metric label="MPU / vibration" value={fresh && telemetry?.mpu.connected ? "CONNECTED" : "UNAVAILABLE"} icon={Activity} foot={fresh && telemetry ? "Latest measured score: " + Math.round(telemetry.mpu.vibrationScore) : "No current sensor reading"} alert={!fresh || !telemetry?.mpu.connected}/>
        <Metric label="GPS receiver" value={fresh && telemetry?.gps.fix ? "FIX AVAILABLE" : fresh ? "NO FIX" : "UNAVAILABLE"} icon={MapPin} foot={fresh && telemetry ? telemetry.gps.satellites + " satellites in latest packet" : "No current GPS status"} alert={!fresh || !telemetry?.gps.fix}/>
        <Metric label="Device uptime" value={fresh && telemetry ? String(Math.floor(telemetry.uptimeSeconds / 60)) : "—"} unit={fresh && telemetry ? "min" : undefined} icon={Gauge} foot={fresh && telemetry ? telemetry.uptimeSeconds + " seconds since boot" : "Uptime unavailable"} alert={!fresh}/>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="panel grid-bg p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[11px] tracking-[.18em] muted">MPU SENSOR · MEASURED TELEMETRY</p><h2 className="mt-1 text-lg font-semibold">Live vibration signal</h2><p className="mt-1 text-xs muted">Vibration score received directly from PRS-ESP8266.</p></div>
            <div className="flex gap-1 rounded-lg border border-white/10 p-1">{(["1m", "5m", "15m"] as const).map((item) => <button key={item} onClick={() => setRange(item)} className={"rounded-md px-3 py-1.5 text-xs " + (range === item ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:text-white")}>{item}</button>)}</div>
          </div>
          <div className="mt-5 h-[280px] w-full">
            {chartData.length >= 2 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}>
              <defs><linearGradient id="liveSignalFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#62d9ee" stopOpacity={.3}/><stop offset="100%" stopColor="#62d9ee" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false}/>
              <XAxis dataKey="time" minTickGap={28} tick={{fill:"#8190a3",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#8190a3",fontSize:10}} axisLine={false} tickLine={false} width={48}/>
              <Tooltip labelStyle={{color:"#e8eef5"}} contentStyle={{background:"#101720",border:"1px solid #263443",borderRadius:10,fontSize:12}} formatter={(value) => [String(Math.round(Number(value))), "Vibration score"]}/>
              <Area type="monotone" dataKey="vibrationScore" name="Vibration score" stroke="#62d9ee" strokeWidth={2} fill="url(#liveSignalFill)" isAnimationActive={false}/>
            </AreaChart></ResponsiveContainer> : <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 text-center">
              <Activity size={27} className="text-slate-500"/>
              <p className="mt-3 text-sm font-medium text-slate-300">{chartData.length === 1 ? "Collecting live samples…" : "Waiting for live sensor history"}</p>
              <p className="mt-1 max-w-sm text-xs muted">Only real ESP8266 packets appear here. Keep the device online; the chart builds as new readings arrive.</p>
            </div>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider muted">Latest score</p><p className="mt-1 text-lg font-semibold">{fresh && telemetry ? Math.round(telemetry.mpu.vibrationScore) : "—"}</p></div>
            <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider muted">Window average</p><p className="mt-1 text-lg font-semibold">{avgScore ?? "—"}</p></div>
            <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider muted">Samples stored</p><p className="mt-1 text-lg font-semibold">{chartData.length}</p></div>
            <div className="rounded-lg border border-white/8 bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider muted">Window</p><p className="mt-1 text-lg font-semibold">{range}</p></div>
          </div>
          <p className="mt-3 text-[10px] muted">Graph points are device packets stored by the server. A missing point means no packet was received.</p>
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-[11px] tracking-[.18em] muted">CURRENT DEVICE STATE</p><h2 className="mt-1 text-lg font-semibold">Live sensor readings</h2></div><Radio size={19} className="text-cyan-200"/></div>
          <div className="mt-4 space-y-1">
            <StateLine label="ESP8266 Wi-Fi / API" value={deviceOnline ? "Online" : deviceState} good={deviceOnline}/>
            <StateLine label="MPU sensor" value={fresh && telemetry?.mpu.connected ? "Connected" : "Unavailable"} good={fresh && Boolean(telemetry?.mpu.connected)}/>
            <StateLine label="GPS receiver" value={fresh && telemetry?.gps.fix ? "Fix · " + telemetry.gps.satellites + " satellites" : "No fix / unavailable"} good={fresh && Boolean(telemetry?.gps.fix)}/>
            <StateLine label="Pressure sensor" value={fresh && telemetry?.pressure.connected && !telemetry.pressure.simulated ? "Connected" : "Not integrated"} warn/>
            <StateLine label="Temperature probe" value={fresh && telemetry?.temperature.connected && telemetry.temperature.celsius !== null ? "Connected · " + telemetry.temperature.celsius.toFixed(1) + " °C" : "Not connected"} warn/>
            <StateLine label="OLED display" value="Not connected" warn/>
          </div>
          <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[.16em] muted">Raw accelerometer axes</p>
            <div className="mt-3 grid grid-cols-3 gap-2">{[
              ["X", telemetry?.mpu.ax], ["Y", telemetry?.mpu.ay], ["Z", telemetry?.mpu.az],
            ].map(([axis, value]) => <div key={String(axis)}><p className="text-xs muted">{String(axis)}</p><p className="mt-1 text-sm font-semibold tabular-nums">{fresh && typeof value === "number" ? Math.round(value) : "—"}</p></div>)}</div>
          </div>
        </section>
      </div>


      <section className="panel mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] tracking-[.18em] muted">NEO-6M GPS · LIVE RECEIVER DATA</p><h2 className="mt-1 text-lg font-semibold">GPS location & navigation</h2><p className="mt-1 text-xs muted">Coordinates are shown only when the latest device packet contains a valid satellite fix.</p></div>
          <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold " + (fresh && telemetry?.gps.fix && telemetry.gps.latitude !== null && telemetry.gps.longitude !== null ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200")}>{fresh && telemetry?.gps.fix ? "SATELLITE FIX" : "NO CURRENT FIX"}</span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[.9fr_1.5fr]">
          <div className="grid grid-cols-2 gap-3 content-start">
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-wider muted">Latitude</p><p className="mt-2 break-all text-lg font-semibold tabular-nums">{fresh && telemetry?.gps.fix && telemetry.gps.latitude !== null ? telemetry.gps.latitude.toFixed(6) : "—"}</p></div>
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-wider muted">Longitude</p><p className="mt-2 break-all text-lg font-semibold tabular-nums">{fresh && telemetry?.gps.fix && telemetry.gps.longitude !== null ? telemetry.gps.longitude.toFixed(6) : "—"}</p></div>
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-wider muted">Satellites</p><p className="mt-2 text-lg font-semibold">{fresh && telemetry ? telemetry.gps.satellites : "—"}</p></div>
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-wider muted">Fix status</p><p className="mt-2 text-lg font-semibold">{fresh && telemetry ? telemetry.gps.fix ? "Valid" : "No fix" : "—"}</p></div>
            <div className="col-span-2 rounded-xl border border-white/8 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-wider muted">GPS data timestamp</p><p className="mt-2 text-sm font-medium">{fresh && telemetry ? new Date(telemetry.receivedAt).toLocaleString() : "Waiting for live GPS packet"}</p></div>
            {fresh && telemetry?.gps.fix && telemetry.gps.latitude !== null && telemetry.gps.longitude !== null && <a className="col-span-2 text-sm text-cyan-200 underline underline-offset-4" href={"https://www.google.com/maps?q=" + telemetry.gps.latitude + "," + telemetry.gps.longitude} target="_blank" rel="noreferrer">Open exact live coordinates in Google Maps ↗</a>}
          </div>
          <div className="min-h-[280px] overflow-hidden rounded-xl border border-white/10 bg-black/20">
            {fresh && telemetry?.gps.fix && telemetry.gps.latitude !== null && telemetry.gps.longitude !== null
              ? <iframe title="Live GPS map" className="h-[300px] w-full border-0" loading="lazy" src={"https://www.openstreetmap.org/export/embed.html?bbox=" + (telemetry.gps.longitude - 0.01) + "%2C" + (telemetry.gps.latitude - 0.01) + "%2C" + (telemetry.gps.longitude + 0.01) + "%2C" + (telemetry.gps.latitude + 0.01) + "&layer=mapnik&marker=" + telemetry.gps.latitude + "%2C" + telemetry.gps.longitude}/>
              : <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-5 text-center"><MapPin size={28} className="text-slate-500"/><p className="mt-3 text-sm font-medium text-slate-300">Map will appear after a valid GPS fix</p><p className="mt-1 text-xs muted">Keep the NEO-6M antenna with a clear view of the sky.</p></div>}
          </div>
        </div>
        <p className="mt-3 text-[10px] muted">Location is sensitive. Exact coordinates are now visible on this dashboard; share the dashboard link carefully.</p>
      </section>


      <section className="panel mt-5 p-5 sm:p-6" id="incident-center">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] tracking-[.18em] muted">PERSISTENT EVENT RECORDS</p><h2 className="mt-1 text-lg font-semibold">Incident Center</h2><p className="mt-1 text-xs muted">Start/end records are created from the firmware event flag. Locations are snapshots from the event packets.</p></div>
          <div className="flex items-center gap-2"><button onClick={exportIncidents} disabled={!incidents.length} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Export CSV</button><span className="rounded-full bg-cyan-300/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-100">LIVE INCIDENT LOG</span></div>
        </div>
        {eventNotice && <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3"><div className="flex gap-2 text-sm text-amber-100"><AlertTriangle size={17} className="mt-0.5 shrink-0"/>{eventNotice}</div><button onClick={() => setEventNotice("")} className="text-xs text-amber-100/70 hover:text-white">Dismiss</button></div>}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total", incidentCounts.total], ["Active", incidentCounts.active],
            ["Resolved", incidentCounts.resolved], ["Interrupted", incidentCounts.interrupted],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/8 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider muted">{String(label)}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
        </div>
        {incidentError && <p className="mt-3 text-xs text-amber-200">{incidentError}</p>}
        {incidents[0]?.startLocation && <div className="mt-4 overflow-hidden rounded-xl border border-white/10"><iframe title="Latest incident location" className="h-52 w-full border-0" loading="lazy" src={"https://www.openstreetmap.org/export/embed.html?bbox=" + (incidents[0].startLocation.longitude - 0.01) + "%2C" + (incidents[0].startLocation.latitude - 0.01) + "%2C" + (incidents[0].startLocation.longitude + 0.01) + "%2C" + (incidents[0].startLocation.latitude + 0.01) + "&layer=mapnik&marker=" + incidents[0].startLocation.latitude + "%2C" + incidents[0].startLocation.longitude}/></div>}\n        <div className="mt-4 space-y-3">
          {incidents.length ? incidents.map((incident) => <article key={incident.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-semibold">{incident.id}</p><p className="mt-1 text-xs muted">{incident.deviceId} · {new Date(incident.startedAt).toLocaleString()}</p></div>
              <span className={"rounded-full px-3 py-1 text-[10px] font-semibold " + (incident.status === "ACTIVE" ? "bg-amber-300/10 text-amber-100" : incident.status === "INTERRUPTED" ? "bg-red-300/10 text-red-100" : "bg-emerald-300/10 text-emerald-100")}>{incident.status}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-[10px] muted">Start score</p><p className="mt-1 text-sm font-semibold">{Math.round(incident.startVibration.score)}</p></div>
              <div><p className="text-[10px] muted">End score</p><p className="mt-1 text-sm font-semibold">{incident.endVibration ? Math.round(incident.endVibration.score) : "—"}</p></div>
              <div><p className="text-[10px] muted">Duration</p><p className="mt-1 text-sm font-semibold">{incident.durationSeconds !== null ? incident.durationSeconds + " sec" : incident.status === "ACTIVE" ? "In progress" : "Unknown"}</p></div>
              <div><p className="text-[10px] muted">GPS snapshot</p><p className="mt-1 text-sm font-semibold">{incident.startLocation ? "Available" : "Unavailable"}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {incident.startLocation && <a className="text-cyan-200 underline underline-offset-4" href={"https://www.google.com/maps?q=" + incident.startLocation.latitude + "," + incident.startLocation.longitude} target="_blank" rel="noreferrer">Open start location ↗</a>}
              {incident.endLocation && <a className="text-cyan-200 underline underline-offset-4" href={"https://www.google.com/maps?q=" + incident.endLocation.latitude + "," + incident.endLocation.longitude} target="_blank" rel="noreferrer">Open end location ↗</a>}
              <span className="muted">{incident.endedAt ? "Ended " + new Date(incident.endedAt).toLocaleString() : incident.status === "INTERRUPTED" ? "Telemetry stopped during event" : "Waiting for event end"}</span>
            </div>
          </article>) : <div className="rounded-xl border border-dashed border-white/10 p-7 text-center"><Activity size={25} className="mx-auto text-slate-500"/><p className="mt-3 text-sm font-medium">No recorded incidents yet</p><p className="mt-1 text-xs muted">A record will appear when the ESP8266 reports eventActive = true. No sample incidents are inserted.</p></div>}
        </div>
      </section>

      <section className="panel mt-5 p-5 sm:p-6" id="roadside-assistance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] tracking-[.18em] muted">OPENSTREETMAP · LIVE PLACE SEARCH</p><h2 className="mt-1 text-lg font-semibold">Nearby roadside assistance</h2><p className="mt-1 text-xs muted">Find tyre shops, mechanics, hospitals, police, fire services and fuel stations within 15 km of the latest fresh GPS fix.</p></div>
          <button onClick={loadNearby} disabled={nearbyLoading} className="rounded-lg border border-cyan-200/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">{nearbyLoading ? "Searching…" : nearby ? "Refresh nearby places" : "Find nearby services"}</button>
        </div>
        {nearby?.available && <p className="mt-3 text-xs muted">{nearby.places.length} mapped listings · within {nearby.radiusKm} km · Source: {nearby.source}</p>}
        {nearby?.reason && <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">{nearby.reason}</p>}
        {nearby?.error && <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">{nearby.error}</p>}
        {nearby?.available && <div className="mt-4 grid gap-3 md:grid-cols-2">
          {nearby.places.length ? nearby.places.map((place) => <article key={place.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] uppercase tracking-wider text-cyan-200">{place.category}</span><h3 className="mt-1 text-sm font-semibold">{place.name}</h3></div><span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-200">{place.distanceKm.toFixed(1)} km</span></div>
            <p className="mt-2 text-xs muted">{place.address}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <a className="text-cyan-200 underline underline-offset-4" href={place.mapsUrl} target="_blank" rel="noreferrer">Directions ↗</a>
              {place.phone && <a className="text-cyan-200 underline underline-offset-4" href={"tel:" + place.phone}>Call {place.phone}</a>}
              <a className="text-slate-400 underline underline-offset-4" href={place.sourceUrl} target="_blank" rel="noreferrer">OSM listing</a>
            </div>
          </article>) : <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm muted md:col-span-2">No mapped services were returned in this area. Try again later or search directly in Google Maps.</div>}
        </div>}
        <p className="mt-3 text-[10px] muted">Listings depend on OpenStreetMap community data and may be incomplete, outdated, closed or missing phone numbers. Call to verify before travelling.</p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-2"><Zap size={18} className="text-cyan-200"/><h2 className="font-semibold">Vibration event monitor</h2></div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 p-4">
            <div><p className="text-xs muted">Firmware-reported event state</p><p className="mt-2 text-lg font-semibold">{fresh && telemetry ? telemetry.mpu.eventActive ? "EVENT ACTIVE" : "NORMAL" : "NO LIVE STATE"}</p></div>
            <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-wider " + (fresh && telemetry?.mpu.eventActive ? "bg-amber-300/10 text-amber-200" : "bg-white/5 text-slate-300")}>{fresh && telemetry ? telemetry.mpu.eventActive ? "EXPERIMENTAL ALERT" : "NO ACTIVE EVENT" : "WAITING"}</span>
          </div>
          <p className="mt-3 text-xs muted">This is the firmware&apos;s experimental vibration flag. It is not a validated puncture detector and does not confirm tyre damage.</p>
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-cyan-200"/><h2 className="font-semibold">Tyre sensor integration</h2></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><Gauge size={17} className="text-amber-200"/><p className="mt-3 text-sm font-semibold">Pressure</p><p className="mt-1 text-xs text-amber-200">Not integrated</p><p className="mt-2 text-[11px] muted">No measured PSI is available. Simulated values are hidden.</p></div>
            <div className="rounded-xl border border-white/8 bg-black/20 p-4"><Thermometer size={17} className="text-amber-200"/><p className="mt-3 text-sm font-semibold">Temperature</p><p className="mt-1 text-xs text-amber-200">Not connected</p><p className="mt-2 text-[11px] muted">No measured tyre temperature is available.</p></div>
          </div>
        </section>
      </div>

      <footer className="flex flex-col justify-between gap-2 py-7 text-[11px] muted sm:flex-row"><span>PRS · Puncture Rescue System / Engineering prototype</span><span>LIVE DEVICE DATA ONLY · NOT CERTIFIED FOR ROAD-SAFETY DECISIONS</span></footer>
    </div>
  </main>;
}

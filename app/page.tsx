"use client";

import { useEffect, useMemo, useState } from "react";
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
    gps: { fix: boolean; satellites: number };
    pressure: { connected: boolean; psi: number | null; simulated: boolean };
    temperature: { connected: boolean; celsius: number | null };
  };
  history: HistoryPoint[];
  error?: string;
};

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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-2"><Zap size={18} className="text-cyan-200"/><h2 className="font-semibold">Vibration event monitor</h2></div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 p-4">
            <div><p className="text-xs muted">Firmware-reported event state</p><p className="mt-2 text-lg font-semibold">{fresh && telemetry ? telemetry.mpu.eventActive ? "EVENT ACTIVE" : "NORMAL" : "NO LIVE STATE"}</p></div>
            <span className={"rounded-full px-3 py-1.5 text-[10px] font-semibold tracking-wider " + (fresh && telemetry?.mpu.eventActive ? "bg-amber-300/10 text-amber-200" : "bg-white/5 text-slate-300")}>{fresh && telemetry ? telemetry.mpu.eventActive ? "EXPERIMENTAL ALERT" : "NO ACTIVE EVENT" : "WAITING"}</span>
          </div>
          <p className="mt-3 text-xs muted">This is the firmware's experimental vibration flag. It is not a validated puncture detector and does not confirm tyre damage.</p>
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

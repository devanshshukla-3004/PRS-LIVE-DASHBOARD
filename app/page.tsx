"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, CircleDot, Clock3, Gauge, MapPin, Radio, RotateCcw, ShieldCheck, Signal, Thermometer, Wifi, WifiOff, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Scenario = "normal" | "vibration" | "gps" | "offline";
type LiveSnapshot = {
  connected: boolean; configured: boolean;
  telemetry: null | {
    deviceId: string; uptimeSeconds: number; receivedAt: string;
    mpu: { connected: boolean; ax: number; ay: number; az: number; vibrationScore: number; eventActive: boolean };
    gps: { fix: boolean; satellites: number };
    pressure: { connected: boolean; psi: number | null; simulated: boolean };
    temperature: { connected: boolean; celsius: number | null };
  };
};
const base = [18, 22, 20, 24, 21, 28, 23, 26, 22, 25, 20, 24, 22, 27, 23, 25];
const labels = ["-15m","-14m","-13m","-12m","-11m","-10m","-9m","-8m","-7m","-6m","-5m","-4m","-3m","-2m","-1m","Now"];

function Metric({ label, value, unit, icon: Icon, tone="cyan", foot }: {label:string;value:string;unit?:string;icon:typeof Activity;tone?:string;foot:string}) {
  return <div className="panel p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs tracking-[.16em] uppercase muted">{label}</span><span className={`rounded-xl p-2 ${tone==="red"?"bg-red-400/10 text-red-300":"bg-cyan-300/10 text-cyan-200"}`}><Icon size={17}/></span></div><div className="mt-4 flex items-baseline gap-2"><strong className="text-2xl sm:text-3xl font-semibold tracking-tight">{value}</strong>{unit&&<span className="text-sm muted">{unit}</span>}</div><p className="mt-2 text-xs muted">{foot}</p></div>;
}

export default function Home() {
  const [demo,setDemo] = useState(true);
  const [paused,setPaused] = useState(false);
  const [scenario,setScenario] = useState<Scenario>("normal");
  const [presentation,setPresentation] = useState(false);
  const [tick,setTick] = useState(0);
  const [live,setLive] = useState<LiveSnapshot | null>(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/telemetry", { cache: "no-store" });
        const data = await response.json();
        if (active) setLive(data as LiveSnapshot);
      } catch { if (active) setLive(null); }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const liveConnected = Boolean(live?.connected && live.telemetry &&
    Date.now() - new Date(live.telemetry.receivedAt).getTime() < 15000);
  const liveTelemetry = liveConnected ? live?.telemetry : null;
  const offline = scenario==="offline";
  const gpsLost = scenario==="gps" || offline;
  const event = scenario==="vibration";
  const chart = useMemo(()=>base.map((v,i)=>({time:labels[i],score:v+(event&&i>10?35:0)+(tick%4)})),[event,tick]);
  const status = offline ? "SIMULATED DEVICE OFFLINE" : "DEMO TELEMETRY";
  const scenarioLabel = {normal:"Normal",vibration:"Vibration event",gps:"GPS unavailable",offline:"Device offline"}[scenario];

  return <main className="min-h-screen">
    <header className="border-b border-white/10 bg-[#090e15]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-7">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Activity size={21}/></div><div><div className="font-semibold tracking-[.14em] text-sm">PRS <span className="text-cyan-200">COMMAND CENTER</span></div><div className="text-[10px] tracking-[.2em] muted">PUNCTURE RESCUE SYSTEM · PROTOTYPE</div></div></div>
        <div className="flex flex-wrap items-center justify-end gap-2"><span className={"rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-wider "+(!demo&&liveConnected?"border-emerald-300/20 bg-emerald-300/10 text-emerald-200":"border-amber-300/20 bg-amber-300/10 text-amber-200")}>{!demo&&liveConnected?"LIVE DEVICE":demo?"DEMO MODE":"LIVE MODE · WAITING"}</span><span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs muted"><span className={"h-1.5 w-1.5 rounded-full "+(!demo&&liveConnected?"bg-emerald-300":"bg-amber-300")}/>{!demo&&liveConnected?liveTelemetry?.deviceId:status}</span><button onClick={()=>setPresentation(!presentation)} className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5">{presentation?"Exit presentation":"Presentation mode"}</button></div>
      </div>
    </header>

    <div className={`mx-auto max-w-[1500px] px-4 py-7 sm:px-7 ${presentation?"max-w-none":""}`}>
      <section className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold tracking-[.24em] text-cyan-200">VEHICLE TELEMETRY / OVERVIEW</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">System overview<span className="text-cyan-200">.</span></h1><p className="mt-2 text-sm muted">Monitor prototype signals, sensor health and experimental events.</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={()=>setDemo(!demo)} className="rounded-lg border border-cyan-200/25 bg-cyan-200/10 px-4 py-2.5 text-xs font-semibold text-cyan-100">{demo?"Demo data: ON":"Demo data: OFF"}</button><button onClick={()=>setPaused(!paused)} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs hover:bg-white/5">{paused?"Resume":"Pause"} updates</button><button onClick={()=>{setScenario("normal");setTick(0);setPaused(false)}} className="rounded-lg border border-white/10 p-2.5 hover:bg-white/5" aria-label="Reset"><RotateCcw size={15}/></button></div></section>

      {!demo&&<div className={"mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm "+(liveConnected?"border-emerald-300/20 bg-emerald-300/5 text-emerald-100":"border-amber-300/20 bg-amber-300/5 text-amber-100")}>{liveConnected?<Wifi size={18} className="mt-0.5 shrink-0"/>:<WifiOff size={18} className="mt-0.5 shrink-0"/>}{liveConnected?<>Live telemetry received from <strong>{liveTelemetry?.deviceId}</strong>. Last packet: {new Date(liveTelemetry!.receivedAt).toLocaleTimeString()} · GPS coordinates are hidden on this public dashboard.</>:live?.configured===false?"Telemetry storage is not configured yet. Add the Upstash Redis and device-token environment variables in Vercel.":"Waiting for ESP8266 telemetry. The device must be online and send a valid packet at least every 5 seconds."}</div>}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Device connection" value={!demo?(liveConnected?"Online":"Offline"):offline?"Offline":"Demo"} icon={!demo&&!liveConnected?WifiOff:Radio} tone={!demo&&!liveConnected||offline?"red":"cyan"} foot={!demo&&liveConnected?liveTelemetry!.deviceId:"PRS-ESP8266-01 · simulated state"}/>
        <Metric label="GPS status" value={!demo&&liveConnected?(liveTelemetry!.gps.fix?"Fix available":"No fix"):gpsLost?"No fix":"Fix demo"} icon={MapPin} tone={!demo&&liveConnected&&!liveTelemetry!.gps.fix||gpsLost?"red":"cyan"} foot={!demo&&liveConnected?liveTelemetry!.gps.satellites+" satellites":gpsLost?"GPS signal unavailable in scenario":"Satellite count is illustrative only"}/>
        <Metric label="Vibration score" value={!demo&&liveConnected?String(Math.round(liveTelemetry!.mpu.vibrationScore)):event?"High":"Low"} icon={Activity} tone={!demo&&liveConnected&&liveTelemetry!.mpu.eventActive||event?"red":"cyan"} foot={!demo&&liveConnected?(liveTelemetry!.mpu.eventActive?"Experimental vibration event active":"Live MPU reading"):event?"Experimental vibration alert":"No active demo event"}/>
        <Metric label="System health" value={!demo?(liveConnected?"Connected":"Waiting"):offline?"Degraded":"Prototype"} icon={ShieldCheck} foot={!demo&&liveConnected?"Live device packet received":"Pressure/temp/OLED not integrated"}/>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel grid-bg p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs tracking-[.18em] muted">LIVE SIGNAL / DEMO TRACE</p><h2 className="mt-1 text-lg font-semibold">Vibration activity</h2></div><span className={`rounded-full px-3 py-1 text-[10px] tracking-wider ${event?"bg-red-400/10 text-red-200":"bg-emerald-400/10 text-emerald-200"}`}>{event?"EVENT SIMULATION":"NOMINAL"}</span></div><div className="mt-6 h-[245px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="signalFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#62d9ee" stopOpacity={.28}/><stop offset="100%" stopColor="#62d9ee" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false}/><XAxis dataKey="time" tick={{fill:"#718096",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#718096",fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#101720",border:"1px solid #263443",borderRadius:10,fontSize:12}}/><Area type="monotone" dataKey="score" stroke="#62d9ee" strokeWidth={2} fill="url(#signalFill)"/></AreaChart></ResponsiveContainer></div><p className="mt-2 text-[11px] muted">Illustrative sample series · not measured sensor output</p></section>

        <section className="panel p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs tracking-[.18em] muted">TYRE TELEMETRY</p><h2 className="mt-1 text-lg font-semibold">Wheel status</h2></div><Gauge className="text-cyan-200" size={20}/></div><div className="mt-5 grid grid-cols-2 gap-3">{["Front left","Front right","Rear left","Rear right"].map((wheel,i)=><div key={wheel} className="rounded-xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-xs muted"><CircleDot size={14}/>{wheel}</div><div className="mt-4 text-2xl font-semibold">{demo?"32.0":"—"} <span className="text-xs font-normal muted">PSI</span></div><div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-200"><AlertTriangle size={12}/>{demo?"Simulated":"Not connected"}</div><div className="mt-3 flex items-center gap-2 text-xs muted"><Thermometer size={13}/>Temperature: {!demo&&liveConnected&&liveTelemetry!.temperature.connected&&liveTelemetry!.temperature.celsius!==null?liveTelemetry!.temperature.celsius.toFixed(1)+" °C":"N/A"}</div></div>)}</div><p className="mt-4 text-[11px] muted">Pressure values are simulated. Temperature sensors are not connected.</p></section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="panel p-5"><div className="flex items-center gap-2"><MapPin size={17} className="text-cyan-200"/><h3 className="font-semibold">GPS location</h3></div><div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-5 text-center"><MapPin size={25} className="mx-auto text-cyan-200"/><p className="mt-3 text-sm font-medium">{!demo&&liveConnected?(liveTelemetry!.gps.fix?"GPS fix available":"No GPS fix"):gpsLost?"Signal unavailable":"Awaiting live device link"}</p><p className="mt-1 text-xs muted">{!demo&&liveConnected?liveTelemetry!.gps.satellites+" satellites · exact coordinates hidden": "No map coordinates shown in demo mode"}</p></div><div className="mt-3 flex justify-between text-xs muted"><span>Satellites</span><span>{gpsLost?"—":"Demo only"}</span></div></section>
        <section className="panel p-5"><div className="flex items-center gap-2"><Zap size={17} className="text-cyan-200"/><h3 className="font-semibold">Event monitor</h3></div><div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4"><div className="flex items-center justify-between"><span className="text-xs muted">Current state</span><span className={`text-xs ${!demo&&liveConnected&&liveTelemetry!.mpu.eventActive||event?"text-red-200":"text-emerald-200"}`}>{!demo&&liveConnected?(liveTelemetry!.mpu.eventActive?"ACTIVE · DEVICE":"No active event"):event?"ACTIVE (DEMO)":"No active event"}</span></div><p className="mt-3 text-sm">{!demo&&liveConnected?(liveTelemetry!.mpu.eventActive?"Device reports an experimental vibration event":"No active device vibration event"):event?"Simulated vibration threshold crossed":"No simulated vibration event detected"}</p><p className="mt-2 text-[11px] muted">Vibration alerts are experimental and do not confirm a puncture.</p></div><div className="mt-4 flex justify-between text-xs muted"><span>Event state</span><span>{!demo&&liveConnected?"Live device": "Demo"}</span></div></section>
        <section className="panel p-5"><div className="flex items-center gap-2"><BatteryCharging size={17} className="text-cyan-200"/><h3 className="font-semibold">Sensor health</h3></div><div className="mt-4 space-y-3">{[["ESP8266",!demo&&liveConnected?"Connected":"Demo state"],["MPU / vibration",!demo&&liveConnected?(liveTelemetry!.mpu.connected?"Connected":"Unavailable"):"Demo state"],["GPS",!demo&&liveConnected?(liveTelemetry!.gps.fix?"Fix available":"No fix"):"Demo state"],["Pressure sensor",!demo&&liveConnected&&liveTelemetry!.pressure.connected?"Connected":"Not integrated"],["Temperature",!demo&&liveConnected&&liveTelemetry!.temperature.connected?"Connected":"Not connected"],["OLED","Not connected"]].map(([n,s],i)=><div key={n} className="flex items-center justify-between border-b border-white/5 pb-2 text-xs"><span className="muted">{n}</span><span className={s==="Connected"||s==="Fix available"?"text-cyan-100":"text-amber-200"}>{s}</span></div>)}</div></section>
      </div>

      <section className="panel mt-5 p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs tracking-[.18em] muted">DEMO CONTROLS</p><h2 className="mt-1 text-lg font-semibold">Test scenarios</h2><p className="mt-1 text-xs muted">Change the sample state to preview dashboard responses.</p></div><div className="flex flex-wrap gap-2">{(["normal","vibration","gps","offline"] as Scenario[]).map(s=><button key={s} onClick={()=>setScenario(s)} className={`rounded-lg border px-3 py-2 text-xs transition ${scenario===s?"border-cyan-200/40 bg-cyan-200/10 text-cyan-100":"border-white/10 text-slate-300 hover:bg-white/5"}`}>{ {normal:"Normal",vibration:"Vibration event",gps:"GPS lost",offline:"Sensor offline"}[s] }</button>)}</div></div><div className="mt-4 flex flex-wrap items-center gap-2 text-xs muted"><Clock3 size={14}/> Scenario: <strong className="text-slate-200">{scenarioLabel}</strong><span>·</span><Signal size={14}/>{paused?"Updates paused":"Demo controls ready"}<button onClick={()=>setTick(t=>t+1)} className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5" disabled={paused}><Activity size={13} className="mr-2 inline"/>Refresh sample</button></div></section>
      <footer className="flex flex-col justify-between gap-2 py-7 text-[11px] muted sm:flex-row"><span>PRS · Puncture Rescue System / Engineering prototype</span><span>DEMO DATA ONLY · NOT FOR ROAD-SAFETY DECISIONS</span></footer>
    </div>
  </main>;
}

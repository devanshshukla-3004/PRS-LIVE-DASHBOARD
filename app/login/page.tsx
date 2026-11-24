"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#080d14] px-4 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101720] p-7 shadow-2xl">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Activity size={22}/></div><div><p className="text-sm font-semibold tracking-[.14em]">PRS COMMAND CENTER</p><p className="text-[10px] tracking-[.18em] text-slate-400">PRIVATE DASHBOARD ACCESS</p></div></div>
      <div className="mt-8 flex items-center gap-2"><LockKeyhole size={18} className="text-cyan-200"/><h1 className="text-xl font-semibold">Dashboard login</h1></div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block"><span className="mb-2 block text-xs text-slate-300">Dashboard password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-cyan-300/50" placeholder="Enter dashboard password"/></label>
        {error && <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{loading ? "Checking…" : "Unlock dashboard"}</button>
      </form>
      <p className="mt-6 text-[11px] leading-5 text-slate-500">If the deployment says the password is not configured, add <strong>PRS_DASHBOARD_PASSWORD</strong> in Vercel → Project → Settings → Environment Variables and redeploy. Incident GPS coordinates and device telemetry are private operational data.</p>
    </section>
  </main>;
}

# PRS Command Center

A prototype dashboard for the Puncture Rescue System (PRS).

## Truthful prototype states
- Demo mode is clearly labelled and uses generated sample telemetry.
- Live hardware mode is **not connected** until an ESP8266 telemetry transport is implemented.
- Pressure is simulated; tyre temperature and OLED are not connected.
- Vibration events are experimental alerts, not confirmed punctures.

## Run locally
```bash
npm install
npm run dev
```

Built with Next.js, TypeScript, Tailwind CSS and Recharts.

# PRS Command Center

A live-only engineering dashboard for the Puncture Rescue System prototype.

## Live capabilities

- Authenticated ESP8266 telemetry ingestion at `POST /api/telemetry`.
- Dashboard polls live telemetry and marks packets stale after 15 seconds.
- Actual MPU vibration score and accelerometer axes are stored as a rolling history (up to 180 points, 15-minute TTL).
- Vibration event transitions create persistent incident records: start, end, duration, vibration readings and GPS snapshots.
- Incidents become `INTERRUPTED` when telemetry stops for more than 20 seconds during an active event; the same incident can resume when telemetry returns.
- Incident history is stored without a TTL and is exposed through `GET /api/incidents`.
- Nearby assistance searches OpenStreetMap for tyre shops, mechanics, hospitals/clinics, police, fire stations and fuel stations within 15 km of a fresh GPS fix.
- Live chart and incident history use received device data only; no demo incidents or fabricated places are inserted.
- Pressure values marked simulated are never presented as measured PSI.
- Temperature and OLED are shown as unavailable until integrated.

## Access protection

- Configure `PRS_DASHBOARD_PASSWORD` in Vercel Production and Preview environments before using the dashboard.
- The dashboard login creates an HTTP-only, Secure, SameSite=Lax session cookie (12-hour lifetime).
- Dashboard GET APIs, incident history and nearby lookup require the authenticated session.
- Device telemetry POST remains separately protected by `PRS_DEVICE_TOKEN`.
- Never put secrets in source code, client-side variables, or commits.

## Hardware truthfulness

- Pressure remains unavailable until a real tyre pressure sensor is integrated.
- Temperature remains unavailable until a compatible probe is integrated.
- Vibration events are experimental alerts, not confirmed punctures.
- GPS snapshots are only saved when the packet contains a valid GPS fix.
- Nearby listings depend on OpenStreetMap community data and may be incomplete or outdated; verify by phone before travelling.
- This prototype is not certified for road-safety decisions.

## Configure live telemetry

1. Configure Upstash Redis REST URL and token.
2. In Vercel environment variables, configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PRS_DEVICE_TOKEN`, and `PRS_DASHBOARD_PASSWORD`.
3. Put the same device token into the ESP8266 firmware locally. Never commit Wi-Fi credentials or tokens.
4. Keep the ESP8266 online and send authenticated telemetry every 3–5 seconds.

## API contract

- Device: `POST /api/telemetry`, JSON body, `Authorization: Bearer <PRS_DEVICE_TOKEN>`.
- Dashboard: `GET /api/telemetry`, latest snapshot plus rolling MPU history (requires dashboard login).
- Incidents: `GET /api/incidents`, latest 100 persistent incident records (requires dashboard login).
- Nearby: `GET /api/nearby`, nearby OpenStreetMap services around the latest fresh GPS fix (requires dashboard login).
- Latest telemetry TTL: 120 seconds.
- Vibration history: maximum 180 points, 15-minute TTL.
- Incident records: persistent Redis keys and sorted index; no automatic expiry.

## Run locally

```bash
npm install
npm run dev
```

For local use, add the four environment variables above to `.env.local`.

Built with Next.js, TypeScript, Tailwind CSS, Recharts and Upstash Redis REST.

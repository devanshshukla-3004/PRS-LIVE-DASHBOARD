# PRS Command Center

A prototype dashboard for the Puncture Rescue System (PRS).

## Current capabilities

- Demo dashboard with clearly labelled sample data.
- Authenticated ESP8266 telemetry ingestion at `POST /api/telemetry`.
- Dashboard polls `GET /api/telemetry` every 3 seconds and marks a device stale when no recent packet arrives.
- Latest telemetry is stored in Upstash Redis with a 120-second expiry.
- Public dashboard API omits exact GPS coordinates; coordinates are retained server-side only until the Redis record expires.

## Hardware truthfulness

- Pressure remains simulated/unavailable until a real tyre pressure sensor is installed.
- Temperature remains unavailable until a compatible temperature probe is integrated.
- Vibration events are experimental alerts, not confirmed punctures.
- This prototype is not certified for road-safety decisions.

## Configure live telemetry

1. Create a dedicated Upstash Redis database and copy its REST URL and REST token.
2. Generate a unique device token locally. On Windows PowerShell:
   `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
3. In Vercel → Project → Settings → Environment Variables, add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `PRS_DEVICE_TOKEN`
   Select Production (and Preview if required). Keep all three values secret.
4. Redeploy after adding the variables.
5. Put the same `PRS_DEVICE_TOKEN` into the ESP8266 firmware locally. Never commit Wi-Fi credentials or tokens.
6. Follow [the ESP8266 integration guide](docs/ESP8266-TELEMETRY.md) and adapt the sender template in `examples/esp8266-telemetry-sender.ino` to the actual MPU/GPS variables.

## API contract

- Device: `POST /api/telemetry`, JSON body, `Authorization: Bearer <PRS_DEVICE_TOKEN>`.
- Dashboard: `GET /api/telemetry`, public status snapshot without exact GPS coordinates.
- Send every 3–5 seconds. The server expires the latest record after 120 seconds.

See [docs/ESP8266-TELEMETRY.md](docs/ESP8266-TELEMETRY.md) for the payload schema and security notes.

## Run locally

```bash
npm install
npm run dev
``

Built with Next.js, TypeScript, Tailwind CSS, Recharts and Upstash Redis REST.

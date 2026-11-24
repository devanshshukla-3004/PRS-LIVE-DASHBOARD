# PRS Command Center

A live-only engineering dashboard for the Puncture Rescue System prototype.

## Live capabilities

- Authenticated ESP8266 telemetry ingestion at \`POST /api/telemetry\`.
- Dashboard polls \`GET /api/telemetry\` every 3 seconds and marks packets stale after 15 seconds.
- Actual MPU vibration score and accelerometer axes are stored as a rolling history (up to 180 points, 15-minute TTL).
- Live chart plots only received ESP8266 packets. It never generates sample/demo values.
- Exact GPS coordinates remain server-side; the public dashboard receives GPS fix and satellite count only.
- Pressure values marked simulated are never presented as measured PSI.
- Temperature and OLED are shown as unavailable until integrated.

## Hardware truthfulness

- Pressure remains unavailable until a real tyre pressure sensor is integrated.
- Temperature remains unavailable until a compatible probe is integrated.
- Vibration events are experimental alerts, not confirmed punctures.
- This prototype is not certified for road-safety decisions.

## Configure live telemetry

1. Configure Upstash Redis REST URL and token.
2. In Vercel environment variables, configure \`UPSTASH_REDIS_REST_URL\`, \`UPSTASH_REDIS_REST_TOKEN\`, and \`PRS_DEVICE_TOKEN\`.
3. Put the same device token into the ESP8266 firmware locally. Never commit Wi-Fi credentials or tokens.
4. Keep the ESP8266 online and send authenticated telemetry every 3–5 seconds.

## API contract

- Device: \`POST /api/telemetry\`, JSON body, \`Authorization: Bearer <PRS_DEVICE_TOKEN>\`.
- Dashboard: \`GET /api/telemetry\`, latest snapshot plus rolling MPU history.
- Latest snapshot TTL: 120 seconds.
- History: maximum 180 points, 15-minute TTL.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

Built with Next.js, TypeScript, Tailwind CSS, Recharts and Upstash Redis REST.

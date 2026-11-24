# ESP8266 → PRS telemetry integration

## Data path

NodeMCU ESP8266 → HTTPS POST /api/telemetry → authenticated API → Upstash Redis → dashboard polling GET /api/telemetry.

The latest record expires after 120 seconds. If the device stops sending, the dashboard must show the device as stale/offline rather than keep showing old values as live.

## Required Vercel environment variables

Add these for Production (and Preview if you test preview deployments):

- `UPSTASH_REDIS_REST_URL`: REST URL from a dedicated Upstash Redis database.
- `UPSTASH_REDIS_REST_TOKEN`: REST token from that same database.
- `PRS_DEVICE_TOKEN`: a long random secret shared by the ESP8266 firmware and Vercel API. Generate a unique value; never commit it to GitHub.

Do not reuse credentials from another project. Do not paste these secrets into chat or commit them in source files.

## POST payload

```json
{
  "deviceId": "PRS-ESP8266-01",
  "uptimeSeconds": 125,
  "mpu": {
    "connected": true,
    "ax": 0.12,
    "ay": -0.03,
    "az": 9.79,
    "vibrationScore": 286,
    "eventActive": false
  },
  "gps": {
    "fix": true,
    "satellites": 6,
    "latitude": 31.301782,
    "longitude": 75.572393
  },
  "pressure": { "connected": false, "psi": 32.0, "simulated": true },
  "temperature": { "connected": false, "celsius": null }
}
```

The values above are schema examples only, not live device readings. Keep pressure marked simulated until a real pressure sensor is installed. Do not send a simulated pressure value as a measured reading.

## Firmware request

Send an HTTPS POST to `https://YOUR-VERCEL-DOMAIN/api/telemetry` every 3–5 seconds with:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_DEVICE_TOKEN`

Use a TLS-validated HTTPS client in the final deployment. Do not disable certificate validation in a road-going or production device. The current API is a prototype telemetry endpoint, not a certified automotive safety system.

## Privacy and safety

- POST requires the device bearer token.
- The public GET endpoint deliberately omits exact latitude/longitude. It returns GPS fix and satellite count only.
- Exact coordinates are retained server-side in Redis only until the 120-second TTL expires.
- The dashboard must distinguish stale/offline, simulated, unavailable, and measured values.
- Vibration events are experimental alerts, not puncture confirmation.

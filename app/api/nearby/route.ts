import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redis = () => {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!rawUrl || !rawToken) return null;
  const url = rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  const token = rawToken.trim().replace(/^["']|["']$/g, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("upstash.io")) return null;
  } catch { return null; }
  return { url, token };
};

async function readLatest(config: { url: string; token: string }) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", "prs:telemetry:latest"]), cache: "no-store",
  });
  if (!response.ok) throw new Error("Telemetry store unavailable");
  const result = await response.json();
  if (result.error || typeof result.result !== "string") return null;
  return JSON.parse(result.result) as {
    receivedAt: string;
    gps: { fix: boolean; latitude: number | null; longitude: number | null };
  };
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export async function GET() {
  const config = redis();
  if (!config) return NextResponse.json({ error: "Location service is not configured", places: [] }, { status: 503 });
  try {
    const latest = await readLatest(config);
    if (!latest || !latest.gps?.fix || latest.gps.latitude === null || latest.gps.longitude === null ||
        Date.now() - Date.parse(latest.receivedAt) > 15000) {
      return NextResponse.json({ available: false, reason: "A fresh GPS fix is required before searching nearby services.", places: [] });
    }
    const lat = latest.gps.latitude, lon = latest.gps.longitude;
    const query = `[out:json][timeout:20];(
      node(around:15000,${lat},${lon})["amenity"~"hospital|clinic|doctors|police|fire_station|fuel"];
      way(around:15000,${lat},${lon})["amenity"~"hospital|clinic|doctors|police|fire_station|fuel"];
      relation(around:15000,${lat},${lon})["amenity"~"hospital|clinic|doctors|police|fire_station|fuel"];
      node(around:15000,${lat},${lon})["shop"~"tyres|car_repair"];
      way(around:15000,${lat},${lon})["shop"~"tyres|car_repair"];
      node(around:15000,${lat},${lon})["craft"="car_repair"];
      way(around:15000,${lat},${lon})["craft"="car_repair"];
    );out center tags;`;
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ];
    let data: { elements?: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> } | null = null;
    let lastError = "No OpenStreetMap endpoint responded";
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PRS-Prototype/1.0" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        if (!response.ok) {
          lastError = "OpenStreetMap endpoint returned " + response.status;
          continue;
        }
        data = await response.json() as { elements?: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "OpenStreetMap request failed";
      }
    }
    if (!data) throw new Error(lastError);
    const places = (data.elements ?? []).flatMap((item) => {
      const point = item.center ?? (item.lat !== undefined && item.lon !== undefined ? { lat: item.lat, lon: item.lon } : null);
      if (!point) return [];
      const tags = item.tags ?? {};
      const amenity = tags.amenity ?? "";
      const shop = tags.shop ?? "";
      const craft = tags.craft ?? "";
      let category = "Other";
      if (["hospital", "clinic", "doctors"].includes(amenity)) category = "Hospital / Clinic";
      else if (amenity === "police") category = "Police";
      else if (amenity === "fire_station") category = "Fire service";
      else if (amenity === "fuel") category = "Petrol pump";
      else if (["tyres", "car_repair"].includes(shop) || craft === "car_repair") category = shop === "tyres" ? "Tyre shop" : "Mechanic";
      const distance = distanceKm(lat, lon, point.lat, point.lon);
      return [{
        id: String(item.id), name: tags.name?.trim() || category + " (name not listed)",
        category, distanceKm: Math.round(distance * 10) / 10,
        latitude: point.lat, longitude: point.lon,
        address: tags["addr:full"] || [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || "Address not listed",
        phone: tags.phone || tags["contact:phone"] || null,
        mapsUrl: "https://www.google.com/maps/dir/?api=1&destination=" + point.lat + "," + point.lon,
        sourceUrl: "https://www.openstreetmap.org/?mlat=" + point.lat + "&mlon=" + point.lon + "#map=17/" + point.lat + "/" + point.lon,
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm);
    return NextResponse.json({
      available: true, source: "OpenStreetMap contributors", radiusKm: 15,
      deviceLocation: { latitude: lat, longitude: lon, receivedAt: latest.receivedAt },
      places,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[PRS nearby] Lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ available: false, error: "Nearby services could not be loaded right now. Please retry.", places: [] }, { status: 502 });
  }
}

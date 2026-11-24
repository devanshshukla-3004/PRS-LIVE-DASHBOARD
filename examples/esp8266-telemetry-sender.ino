/*
  PRS ESP8266 telemetry sender — integration template.
  1) Install ESP8266 board support and ArduinoJson library.
  2) Fill Wi-Fi credentials, API URL and device token locally.
  3) Replace the marked sample variables with values from your existing
     MPU/GPS firmware. Do not send simulated pressure as measured data.
  4) Use a TLS-validated certificate trust anchor before any safety-critical use.
*/

#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_URL = "https://YOUR-VERCEL-DOMAIN/api/telemetry";
const char* DEVICE_TOKEN = "PASTE_DEVICE_TOKEN_LOCALLY";

// Prototype template only. Replace these with live values from your current firmware.
bool mpuConnected = false;
float accelX = 0, accelY = 0, accelZ = 0;
float vibrationScore = 0;
bool vibrationEventActive = false;
bool gpsFix = false;
int gpsSatellites = 0;
double gpsLatitude = 0, gpsLongitude = 0;
bool pressureConnected = false;
float pressurePsi = 0;
bool temperatureConnected = false;
float temperatureC = 0;

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 5000;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWi-Fi connected" : "\nWi-Fi connection timed out");
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  // For first connectivity smoke-tests only. Replace setInsecure() with a
  // valid CA trust anchor before real deployment; never use this on-road.
  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (!https.begin(client, API_URL)) {
    Serial.println("HTTPS begin failed");
    return;
  }

  StaticJsonDocument<768> doc;
  doc["deviceId"] = "PRS-ESP8266-01";
  doc["uptimeSeconds"] = millis() / 1000;

  JsonObject mpu = doc.createNestedObject("mpu");
  mpu["connected"] = mpuConnected;
  mpu["ax"] = accelX;
  mpu["ay"] = accelY;
  mpu["az"] = accelZ;
  mpu["vibrationScore"] = vibrationScore;
  mpu["eventActive"] = vibrationEventActive;

  JsonObject gps = doc.createNestedObject("gps");
  gps["fix"] = gpsFix;
  gps["satellites"] = gpsSatellites;
  gps["latitude"] = gpsFix ? gpsLatitude : 0;
  gps["longitude"] = gpsFix ? gpsLongitude : 0;

  JsonObject pressure = doc.createNestedObject("pressure");
  pressure["connected"] = pressureConnected;
  pressure["psi"] = pressureConnected ? pressurePsi : 0;
  pressure["simulated"] = !pressureConnected;

  JsonObject temperature = doc.createNestedObject("temperature");
  temperature["connected"] = temperatureConnected;
  if (temperatureConnected) temperature["celsius"] = temperatureC;
  else temperature["celsius"] = nullptr;

  String body;
  serializeJson(doc, body);

  https.addHeader("Content-Type", "application/json");
  https.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  int code = https.POST(body);
  Serial.printf("PRS telemetry HTTP status: %d\n", code);
  if (code > 0) Serial.println(https.getString());
  https.end();
}

void setup() {
  Serial.begin(115200);
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (WiFi.status() == WL_CONNECTED && millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();
    sendTelemetry();
  }

  // Keep your existing GPS parsing and MPU sampling logic here.
  // Update the variables above from actual sensor readings.
}

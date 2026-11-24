import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PRS Command Center", description: "Puncture Rescue System prototype telemetry dashboard" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

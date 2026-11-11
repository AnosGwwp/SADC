import { ImageResponse } from "next/og";
import { COLLECTION } from "@/lib/site";

// The large preview image when the link is shared on Discord, X and elsewhere. Made once at build time.
export const alt = `${COLLECTION} holder verification`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// The site is exported as plain files (next.config.mjs), so the image has to be a fixed file too.
export const dynamic = "force-static";

// The TakeTheFloor mark: white bars getting thicker towards the bottom, on blue (same as the favicon).
const BARS = [6, 10, 16, 22, 32, 44];

const STEPS = ["Connect Discord", "Connect wallet", "Verify"];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "radial-gradient(900px 500px at 85% -10%, rgba(26,86,240,0.45), transparent 70%), #070B14", color: "#F8FAFC" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <div style={{ width: "76px", height: "76px", borderRadius: "18px", background: "#1A57F0", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "0 17px" }}>
            {BARS.map((h) => <div key={h} style={{ height: `${h / 5}px`, background: "#fff" }} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "32px", fontWeight: 600 }}>TakeTheFloor</span>
            <span style={{ fontSize: "22px", color: "#94A3B8" }}>Holder verification</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <span style={{ fontSize: "76px", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1.05 }}>
            Get your {COLLECTION} holder role
          </span>
          <span style={{ fontSize: "30px", color: "#94A3B8" }}>Free to verify. No transaction, nothing to pay.</span>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          {STEPS.map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: "14px", background: "#0F1626", border: "2px solid #1E293B", borderRadius: "999px", padding: "14px 26px 14px 14px", fontSize: "26px" }}>
              <span style={{ width: "40px", height: "40px", borderRadius: "999px", background: i === STEPS.length - 1 ? "#1A56F0" : "#162034", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 600 }}>{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

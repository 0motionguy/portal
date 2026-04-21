import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Portal — if your service has a URL, an agent can visit it";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#EEE7D5",
        padding: "80px",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "24px", marginBottom: "48px" }}>
        <div style={{ fontSize: "28px", color: "#DA7756", fontWeight: 600 }}>▶</div>
        <div style={{ fontSize: "28px", color: "#181818", fontFamily: "Geist Mono, monospace" }}>
          visitportal.dev
        </div>
        <div style={{ fontSize: "20px", color: "#8A7F6E", fontFamily: "Geist Mono, monospace" }}>
          · v0.1.4
        </div>
      </div>

      <div
        style={{
          fontSize: "92px",
          fontWeight: 700,
          lineHeight: 1.04,
          color: "#181818",
          letterSpacing: "-0.03em",
          display: "flex",
        }}
      >
        If your service has a URL,
      </div>
      <div
        style={{
          fontSize: "92px",
          fontWeight: 700,
          lineHeight: 1.04,
          color: "#DA7756",
          letterSpacing: "-0.03em",
          display: "flex",
          marginBottom: "auto",
          fontStyle: "italic",
        }}
      >
        an agent can visit it.
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "32px",
          borderTop: "1px solid rgba(24, 24, 24, 0.12)",
          fontSize: "22px",
          fontFamily: "Geist Mono, monospace",
          color: "#2A2724",
        }}
      >
        <div style={{ display: "flex", gap: "16px" }}>
          <span>visitportal.dev</span>
          <span style={{ color: "#8A7F6E" }}>·</span>
          <span>v0.1.4</span>
          <span style={{ color: "#8A7F6E" }}>·</span>
          <span>HTTP-native agent contract</span>
        </div>
      </div>
    </div>,
    { ...size },
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Portal — the drop-in visit layer for LLM clients";

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
          · v0.1.3
        </div>
      </div>

      <div
        style={{
          fontSize: "108px",
          fontWeight: 700,
          lineHeight: 1.02,
          color: "#181818",
          letterSpacing: "-0.03em",
          display: "flex",
        }}
      >
        Two endpoints.
      </div>
      <div
        style={{
          fontSize: "108px",
          fontWeight: 700,
          lineHeight: 1.02,
          color: "#181818",
          letterSpacing: "-0.03em",
          display: "flex",
          marginBottom: "40px",
        }}
      >
        One manifest.
      </div>
      <div
        style={{
          fontSize: "40px",
          lineHeight: 1.2,
          color: "#DA7756",
          display: "flex",
          marginBottom: "auto",
          fontStyle: "italic",
        }}
      >
        Any LLM client can visit cold.
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
        <div style={{ display: "flex", gap: "24px" }}>
          <span>81× less schema overhead at 100 tools</span>
          <span style={{ color: "#8A7F6E" }}>·</span>
          <span>317.9× at 400</span>
        </div>
        <div style={{ color: "#8A7F6E" }}>Built with Claude Code · Opus 4.7</div>
      </div>
    </div>,
    { ...size },
  );
}

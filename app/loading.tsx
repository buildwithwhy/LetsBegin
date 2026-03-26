import { SURFACE, BORDER, FONT } from "@/lib/styles";

export default function Loading() {
  const shimmer = `
    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  `;

  const barStyle = (width: string | number, height: number = 14, mb: number = 12): React.CSSProperties => ({
    width,
    height,
    borderRadius: 6,
    background: BORDER,
    marginBottom: mb,
    animation: "pulse 1.5s ease-in-out infinite",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: FONT,
        background: SURFACE,
      }}
    >
      <style>{shimmer}</style>
      <div style={{ width: "100%", maxWidth: 520, padding: 40 }}>
        {/* Title placeholder */}
        <div style={barStyle("60%", 22, 20)} />

        {/* Subtitle placeholder */}
        <div style={barStyle("40%", 12, 32)} />

        {/* Content block placeholders */}
        <div style={barStyle("100%", 48, 16)} />
        <div style={barStyle("100%", 48, 16)} />
        <div style={barStyle("75%", 48, 0)} />
      </div>
    </div>
  );
}

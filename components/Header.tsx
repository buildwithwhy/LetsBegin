"use client";

import { PRIMARY, BORDER, SURFACE, TEXT_LIGHT } from "@/lib/styles";
import { Plan } from "@/lib/dag";

export function Header({
  plan,
  doneCount,
  total,
  running,
  runningCount,
  userEmail,
  onSignOut,
  onDashboard,
}: {
  plan: Plan | null;
  doneCount: number;
  total: number;
  running: string | null;
  runningCount: number;
  userEmail?: string;
  onSignOut?: () => void;
  onDashboard?: () => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        padding: "16px 32px",
        borderBottom: `1px solid ${BORDER}`,
        background: SURFACE,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {onDashboard && (
          <button
            onClick={onDashboard}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              color: TEXT_LIGHT,
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              fontFamily: "'DM Sans', sans-serif",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = PRIMARY)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_LIGHT)}
          >
            ← Projects
          </button>
        )}
        <span
          style={{ fontSize: 22, fontWeight: 700, color: PRIMARY, cursor: onDashboard ? "pointer" : "default" }}
          onClick={onDashboard}
        >
          LetsBegin
        </span>
        {plan && (
          <span style={{ fontSize: 14, color: "#787774", fontWeight: 500 }}>
            {plan.project_title}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {plan && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 120,
                height: 6,
                background: BORDER,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${total > 0 ? (doneCount / total) * 100 : 0}%`,
                  height: "100%",
                  background: PRIMARY,
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: TEXT_LIGHT }}>
              {doneCount}/{total}
            </span>
          </div>
        )}
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: PRIMARY,
                display: "inline-block",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 12, color: PRIMARY, fontWeight: 500 }}>
              {runningCount > 1 ? `${runningCount} agents running` : "agent running"}
            </span>
          </div>
        )}
        {userEmail && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: TEXT_LIGHT }}>{userEmail}</span>
            {onSignOut && (
              <button
                onClick={onSignOut}
                style={{
                  background: "none",
                  border: "none",
                  color: TEXT_LIGHT,
                  fontSize: 12,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </header>
  );
}

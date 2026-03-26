"use client";

import { useState, useEffect, useRef } from "react";
import { PRIMARY, TEXT, TEXT_LIGHT, BORDER } from "@/lib/styles";

export interface WelcomeBackProps {
  minutesAway: number;
  totalTasks: number;
  completedTasks: number;
  lastCompletedTitle?: string;
  nextTaskTitle?: string;
  nextTaskReason?: string;
  agentCompletedTitles: string[];
  onDismiss: () => void;
}

export function WelcomeBack({
  minutesAway,
  totalTasks,
  completedTasks,
  lastCompletedTitle,
  nextTaskTitle,
  nextTaskReason,
  agentCompletedTitles,
  onDismiss,
}: WelcomeBackProps) {
  const [visible, setVisible] = useState(true);
  const interactingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 30 seconds unless user is interacting
  useEffect(() => {
    const startTimer = () => {
      timerRef.current = setTimeout(() => {
        if (!interactingRef.current) {
          setVisible(false);
          onDismiss();
        } else {
          // User is interacting, try again in 10s
          startTimer();
        }
      }, 30000);
    };
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  if (!visible) return null;

  const isLongAbsence = minutesAway > 240; // > 4 hours
  const headline = isLongAbsence
    ? "It's been a while! Here's your recap:"
    : "Welcome back! Here's where you left off:";

  const hoursAway = Math.floor(minutesAway / 60);
  const daysAway = Math.floor(hoursAway / 24);
  let timeLabel: string;
  if (daysAway > 0) {
    timeLabel = `${daysAway} day${daysAway > 1 ? "s" : ""} ago`;
  } else if (hoursAway > 0) {
    timeLabel = `${hoursAway} hour${hoursAway > 1 ? "s" : ""} ago`;
  } else {
    timeLabel = `${Math.round(minutesAway)} minute${Math.round(minutesAway) !== 1 ? "s" : ""} ago`;
  }

  return (
    <div
      onMouseEnter={() => { interactingRef.current = true; }}
      onMouseLeave={() => { interactingRef.current = false; }}
      onFocus={() => { interactingRef.current = true; }}
      onBlur={() => { interactingRef.current = false; }}
      style={{
        background: `linear-gradient(135deg, ${PRIMARY}08 0%, ${PRIMARY}12 100%)`,
        border: `1px solid ${PRIMARY}30`,
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 20,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
            {headline}
          </div>
          <div style={{ fontSize: 12, color: TEXT_LIGHT, marginBottom: 12 }}>
            Last visit: {timeLabel}
          </div>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          style={{
            background: "none",
            border: "none",
            color: TEXT_LIGHT,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px 6px",
          }}
          aria-label="Dismiss"
        >
          x
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", display: "flex", flexDirection: "column", gap: 6 }}>
        <li style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
          <strong>{completedTasks}</strong> of <strong>{totalTasks}</strong> tasks complete
        </li>
        {lastCompletedTitle && (
          <li style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
            Last completed: <strong>{lastCompletedTitle}</strong>
          </li>
        )}
        {nextTaskTitle && (
          <li style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
            Next up: <strong>{nextTaskTitle}</strong>
            {nextTaskReason && (
              <span style={{ color: TEXT_LIGHT }}> — {nextTaskReason}</span>
            )}
          </li>
        )}
        {agentCompletedTitles.length > 0 && (
          <li style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
            While you were away, agents finished:{" "}
            <strong>{agentCompletedTitles.join(", ")}</strong>
          </li>
        )}
      </ul>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: "#fff",
            color: PRIMARY,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

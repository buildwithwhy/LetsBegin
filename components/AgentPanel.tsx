"use client";

import { useState } from "react";
import { PRIMARY, BORDER, TEXT_LIGHT, SURFACE, TEXT } from "@/lib/styles";
import type { AgentType } from "@/lib/dag";
import type { AgentResult, AgentStep } from "@/hooks/useAgentExecutor";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";
import { formatDuration } from "@/lib/utils";

export function agentTypeDisplay(agentType: AgentType, model: string) {
  switch (agentType) {
    case "claude-code":
      return { label: "Claude Code", bg: "#FDF6EE", color: "#C4841D", icon: "\u{1F9E0}" };
    case "builtin":
      return model === "claude-sonnet"
        ? { label: "Claude", bg: "#FDF6EE", color: "#C4841D", icon: "\u26A1" }
        : { label: "Built-in Agent", bg: "#F0EFEB", color: PRIMARY, icon: "\u26A1" };
    case "custom":
      return { label: "Custom Agent", bg: "#E8F5E9", color: "#2E7D32", icon: "\u{1F527}" };
  }
}

export { formatDuration };

export function AgentPanel({
  result,
  onApprove,
  onRegenerate,
  showApprove,
}: {
  result: AgentResult;
  onApprove?: () => void;
  onRegenerate?: () => void;
  showApprove?: boolean;
}) {
  const display = agentTypeDisplay(result.agentType, result.model);
  const badgeBg = display.bg;
  const badgeColor = display.color;
  const badgeLabel = `${display.icon} ${display.label}`;

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          background: badgeBg,
          color: badgeColor,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {badgeLabel}
        {result.startedAt && (
          <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7, fontSize: 11 }}>
            {formatDuration(result.startedAt, result.completedAt)}
          </span>
        )}
      </div>
      <div
        style={{
          background: "#1C1C1E",
          borderRadius: 10,
          padding: 14,
          maxHeight: 200,
          overflow: "auto",
          fontSize: 12,
          fontFamily: "'DM Mono', 'Fira Code', monospace",
          lineHeight: 1.5,
        }}
      >
        {result.steps.map((step, i) => (
          <StepLine key={i} step={step} />
        ))}
        {!result.done && (
          <span style={{ color: "#8FBC8F", animation: "blink 1s step-end infinite" }}>_</span>
        )}
      </div>
      {result.steps
        .filter((s): s is AgentStep & { type: "output" } => s.type === "output")
        .map((s, i) => (
          <div
            key={i}
            style={{
              marginTop: 8,
              borderRadius: 8,
              overflow: "hidden",
              border: s.outputType === "code" ? "none" : `1px solid ${BORDER}`,
            }}
          >
            {s.outputType === "code" ? (
              <div>
                {s.filename && (
                  <div
                    style={{
                      background: "#1C1C1E",
                      padding: "6px 12px",
                      fontSize: 11,
                      color: TEXT_LIGHT,
                      borderBottom: "1px solid #2C2C2E",
                    }}
                  >
                    {s.filename}
                  </div>
                )}
                <pre
                  style={{
                    background: "#1C1C1E",
                    color: "#e0e0e0",
                    padding: 14,
                    margin: 0,
                    fontSize: 12,
                    fontFamily: "'DM Mono', 'Fira Code', monospace",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {s.content}
                </pre>
              </div>
            ) : (
              <div
                style={{
                  background: SURFACE,
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                <SimpleMarkdown text={s.content} color={TEXT} />
              </div>
            )}
          </div>
        ))}
      {result.error && (
        <div style={{ color: "#CF522E", fontSize: 12, marginTop: 8 }}>Error: {result.error}</div>
      )}
      {showApprove && result.done && onApprove && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={onApprove}
            style={{
              padding: "8px 18px",
              border: "none",
              borderRadius: 8,
              background: "#C4841D",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Looks good, continue &rarr;
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              style={{
                padding: "8px 14px",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                background: "transparent",
                color: TEXT_LIGHT,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepLine({ step }: { step: AgentStep }) {
  if (step.type === "thinking") {
    return <div style={{ color: "#8FBC8F" }}>{step.text}</div>;
  }
  if (step.type === "tool_call") {
    return (
      <div style={{ color: "#D4A72C" }}>
        &gt; {step.summary}
      </div>
    );
  }
  return null;
}

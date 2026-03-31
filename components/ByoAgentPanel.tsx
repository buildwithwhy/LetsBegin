"use client";

import { PRIMARY, BORDER, TEXT, TEXT_LIGHT } from "@/lib/styles";
import type { PriorResult, TaskRouting } from "@/lib/styles";
import type { Task } from "@/lib/dag";

// Keep generateAgentPrompt for MCP/API usage
export function generateAgentPrompt(
  task: Task,
  projectContext: string,
  priorOutputs?: PriorResult[],
  _promptStyle?: TaskRouting["promptStyle"],
  dependencyOutputs?: DependencyOutput[],
): string {
  const lines: string[] = [];
  lines.push(`# Task: ${task.title}`);
  lines.push("");
  lines.push(`## Description`);
  lines.push(task.description);
  lines.push("");
  lines.push(`## Project context`);
  lines.push(projectContext);
  if (dependencyOutputs && dependencyOutputs.length > 0) {
    lines.push("");
    lines.push(`## This task builds on (dependency outputs)`);
    for (const dep of dependencyOutputs) {
      lines.push(`### ${dep.title}`);
      lines.push(dep.output.slice(0, 500) + (dep.output.length > 500 ? "..." : ""));
    }
  }
  if (priorOutputs && priorOutputs.length > 0) {
    lines.push("");
    lines.push(`## Prior completed work`);
    for (const p of priorOutputs) {
      lines.push(`- **${p.title}** (${p.assignee}): ${p.output.slice(0, 300)}${p.output.length > 300 ? "..." : ""}`);
    }
  }
  lines.push("");
  lines.push(`## Instructions`);
  if (task.agent_type === "claude-code") {
    lines.push("This is a coding task. Write production-quality code. Create complete, working files — not snippets or placeholders.");
  } else {
    lines.push("Complete this task thoroughly. Produce real, actionable output — not summaries or placeholders.");
  }
  if (task.assignee === "hybrid") {
    lines.push("");
    lines.push("**This is a hybrid task** — you draft, then I review. Present options clearly so I can choose. Label drafts as drafts.");
  }
  return lines.join("\n");
}

export interface DependencyOutput {
  id: string;
  title: string;
  output: string;
}

export function ByoAgentPanel({
  task,
  onComplete,
  onSwitchToApi,
  onAddApiKey,
}: {
  task: Task;
  projectContext: string;
  priorResults: PriorResult[];
  dependencyOutputs?: DependencyOutput[];
  onComplete: (id: string, notes?: string) => void;
  routing?: TaskRouting;
  onSwitchToApi?: () => void;
  onAddApiKey?: () => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        padding: "16px 20px",
        borderRadius: 12,
        border: `1.5px solid ${BORDER}`,
        background: "#FAFAF9",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
          This task will run when you set up an API key or MCP.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            onClick={() => onAddApiKey?.()}
            style={{
              padding: "7px 16px", border: "none", borderRadius: 8,
              background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Add your API key
          </button>
          <button
            onClick={() => onSwitchToApi?.()}
            style={{
              padding: "7px 16px", border: `1.5px solid ${BORDER}`, borderRadius: 8,
              background: "transparent", color: TEXT, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Use our API instead
          </button>
        </div>
        <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.5 }}>
          Or if you use Claude Code: set up MCP for hands-free execution.
        </div>
      </div>
      <button
        onClick={() => onComplete(task.id)}
        style={{
          background: "none", border: "none",
          color: TEXT_LIGHT, fontSize: 11, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          textDecoration: "underline",
          textDecorationStyle: "dotted" as const,
          padding: "6px 0 0 0",
          display: "block",
        }}
      >
        Mark done without output
      </button>
    </div>
  );
}

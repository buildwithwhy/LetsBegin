"use client";

import { useState } from "react";
import { PRIMARY, BORDER, TEXT, TEXT_LIGHT, SURFACE, FONT } from "@/lib/styles";
import type { PriorResult } from "@/lib/styles";
import type { Task } from "@/lib/dag";

export function generateAgentPrompt(task: Task, projectContext: string, priorOutputs?: PriorResult[]): string {
  const lines: string[] = [];
  lines.push(`# Task: ${task.title}`);
  lines.push("");
  lines.push(`## Description`);
  lines.push(task.description);
  lines.push("");
  lines.push(`## Project context`);
  lines.push(projectContext);
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
  // Detect batch/outreach tasks and add specific guidance
  const lower = task.description.toLowerCase() + " " + task.title.toLowerCase();
  if (lower.includes("email") && (lower.includes("batch") || lower.includes("all") || lower.includes("each") || lower.includes("personalize"))) {
    lines.push("");
    lines.push("**Batch email guidance:** Draft EACH email individually — fully personalized, not template-with-blanks. Include subject line, full body, and note what makes each one unique. I need to be able to copy-paste each one directly.");
  }
  if (lower.includes("extract") || lower.includes("reference") || lower.includes("cited") || lower.includes("author")) {
    lines.push("");
    lines.push("**Research guidance:** For each person/item found, include their name, role/affiliation, why they're relevant, and how to contact them (email, website, social). Be thorough — I'll use this list to actually reach out.");
  }
  return lines.join("\n");
}

export function ByoAgentPanel({
  task,
  projectContext,
  priorResults,
  onComplete,
}: {
  task: Task;
  projectContext: string;
  priorResults: PriorResult[];
  onComplete: (id: string, notes?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedResult, setPastedResult] = useState("");

  const prompt = generateAgentPrompt(task, projectContext, priorResults);

  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 6,
        background: "#E8F0FE", color: "#1967D2", fontSize: 12, fontWeight: 600, marginBottom: 8,
      }}>
        BYO Agent — run this in Claude Code, ChatGPT, or any AI tool
      </div>

      {/* Copy prompt */}
      <div style={{
        background: "#1C1C1E", borderRadius: 10, padding: 14,
        maxHeight: 160, overflow: "auto", fontSize: 12,
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        lineHeight: 1.5, color: "#8FBC8F", marginBottom: 8,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {prompt}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={copyPrompt}
          style={{
            padding: "7px 16px", border: "none", borderRadius: 8,
            background: copied ? "#2DA44E" : PRIMARY,
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            transition: "background 0.2s",
          }}
        >
          {copied ? "Copied!" : "Copy prompt"}
        </button>
        <button
          onClick={() => setPasteMode(!pasteMode)}
          style={{
            padding: "7px 16px", border: `1px solid ${BORDER}`, borderRadius: 8,
            background: "transparent", color: TEXT,
            fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {pasteMode ? "Hide" : "Paste result back"}
        </button>
        <button
          onClick={() => onComplete(task.id)}
          style={{
            padding: "7px 16px", border: `1px solid ${BORDER}`, borderRadius: 8,
            background: "transparent", color: TEXT_LIGHT,
            fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Mark done without pasting
        </button>
      </div>

      {pasteMode && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={pastedResult}
            onChange={(e) => setPastedResult(e.target.value)}
            placeholder="Paste the AI's output here so it's tracked in your project..."
            style={{
              width: "100%", minHeight: 100, padding: 12, fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", borderRadius: 10,
              border: `1px solid ${BORDER}`, background: "#FAFAF9",
              outline: "none", resize: "vertical", lineHeight: 1.5,
              boxSizing: "border-box",
            }}
          />
          {pastedResult.trim() && (
            <button
              onClick={() => onComplete(task.id, pastedResult.trim())}
              style={{
                marginTop: 8, padding: "8px 18px", border: "none", borderRadius: 8,
                background: "#2DA44E", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Save result & mark done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

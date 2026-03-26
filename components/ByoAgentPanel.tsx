"use client";

import { useState, useEffect, useRef } from "react";
import { PRIMARY, BORDER, TEXT, TEXT_LIGHT } from "@/lib/styles";
import type { PriorResult, TaskRouting } from "@/lib/styles";
import type { Task } from "@/lib/dag";

// Tool-specific prompt wrappers
function wrapPromptForTool(basePrompt: string, style?: TaskRouting["promptStyle"]): string {
  switch (style) {
    case "claude-code":
      return `${basePrompt}\n\n---\nYou are running as Claude Code. Use your tools to read/write files, run commands, and produce real outputs. Don't just describe what to do — actually do it.`;
    case "cowork":
      return `${basePrompt}\n\n---\nThis is a collaborative task in Cowork. Walk through the approach step by step. Present drafts inline so we can iterate together. Ask me if you need clarification on any decision.`;
    case "chatgpt":
      return `${basePrompt}\n\n---\nProduce the complete output directly. Don't ask follow-up questions unless genuinely necessary. Format with markdown for readability.`;
    case "gemini":
      return `${basePrompt}\n\n---\nProduce thorough, well-structured output. Use markdown formatting. Be specific and actionable.`;
    default:
      return basePrompt;
  }
}

export function generateAgentPrompt(
  task: Task,
  projectContext: string,
  priorOutputs?: PriorResult[],
  promptStyle?: TaskRouting["promptStyle"],
): string {
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
  return wrapPromptForTool(lines.join("\n"), promptStyle);
}

type FlowStage = "copy" | "running" | "paste";

function formatTimeSince(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function ByoAgentPanel({
  task,
  projectContext,
  priorResults,
  onComplete,
  routing,
}: {
  task: Task;
  projectContext: string;
  priorResults: PriorResult[];
  onComplete: (id: string, notes?: string) => void;
  routing?: TaskRouting;
}) {
  const [stage, setStage] = useState<FlowStage>("copy");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const [timeSinceCopy, setTimeSinceCopy] = useState<string>("");
  const [pastedResult, setPastedResult] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toolLabel = routing?.label || "your AI tool";
  const toolIcon = routing?.icon || "\u26A1";
  const prompt = generateAgentPrompt(task, projectContext, priorResults, routing?.promptStyle);

  // Update "time since copied" every 10 seconds
  useEffect(() => {
    if (!copiedAt) return;
    const update = () => setTimeSinceCopy(formatTimeSince(Date.now() - copiedAt));
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [copiedAt]);

  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setCopiedAt(Date.now());
      setStage("running");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Get first 2 lines of prompt for collapsed view
  const promptLines = prompt.split("\n");
  const previewLines = promptLines.slice(0, 2).join("\n");
  const hasMoreLines = promptLines.length > 2;

  const isAfterCopy = stage === "running" || stage === "paste";
  const isPasteStage = stage === "paste" || (stage === "running" && pastedResult.length > 0);

  // Step indicator data
  const steps = [
    { num: 1, label: "Copy prompt", active: stage === "copy", done: isAfterCopy },
    { num: 2, label: `Run in ${toolLabel}`, active: stage === "running", done: stage === "paste" },
    { num: 3, label: "Paste result", active: stage === "paste" || isPasteStage, done: false },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      {/* Tool badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 6,
        background: "#E8F0FE", color: "#1967D2", fontSize: 12, fontWeight: 600, marginBottom: 10,
      }}>
        {toolIcon} Run in {toolLabel}
      </div>

      {/* Step indicators */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        marginBottom: 12, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
      }}>
        {steps.map((s, i) => (
          <div key={s.num} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 20,
              background: s.active ? `${PRIMARY}14` : s.done ? "#2DA44E12" : "transparent",
              border: `1px solid ${s.active ? PRIMARY : s.done ? "#2DA44E40" : BORDER}`,
              color: s.active ? PRIMARY : s.done ? "#2DA44E" : TEXT_LIGHT,
              fontWeight: s.active ? 600 : 400,
              transition: "all 0.2s",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: 9,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                background: s.done ? "#2DA44E" : s.active ? PRIMARY : BORDER,
                color: s.done || s.active ? "#fff" : TEXT_LIGHT,
              }}>
                {s.done ? "\u2713" : s.num}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 20, height: 1,
                background: s.done ? "#2DA44E60" : BORDER,
                margin: "0 2px",
              }} />
            )}
          </div>
        ))}
        {/* Time since copy indicator */}
        {copiedAt && timeSinceCopy && (
          <span style={{
            marginLeft: 10, fontSize: 11, color: TEXT_LIGHT,
            fontStyle: "italic", fontFamily: "'DM Sans', sans-serif",
          }}>
            Copied {timeSinceCopy}
          </span>
        )}
      </div>

      {/* Collapsible prompt block */}
      <div
        onClick={copyPrompt}
        style={{
          background: "#1C1C1E", borderRadius: 10,
          padding: 14, fontSize: 12,
          fontFamily: "'DM Mono', 'Fira Code', monospace",
          lineHeight: 1.5, color: "#8FBC8F",
          marginBottom: 8, cursor: "pointer",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: promptExpanded ? 400 : 52,
          overflow: "hidden",
          opacity: isAfterCopy ? 0.6 : 1,
          transition: "all 0.3s ease, opacity 0.3s",
          position: "relative",
        }}
        title="Click to copy prompt"
      >
        {promptExpanded ? prompt : previewLines}
        {!promptExpanded && hasMoreLines && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: 28,
            background: "linear-gradient(transparent, #1C1C1E)",
          }} />
        )}
      </div>
      {hasMoreLines && (
        <button
          onClick={(e) => { e.stopPropagation(); setPromptExpanded(!promptExpanded); }}
          style={{
            background: "none", border: "none",
            color: TEXT_LIGHT, fontSize: 11, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            padding: "2px 0", marginBottom: 8,
            textDecoration: "underline",
            textDecorationStyle: "dotted" as const,
          }}
        >
          {promptExpanded ? "Collapse prompt" : `Show full prompt (${promptLines.length} lines)`}
        </button>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={copyPrompt}
          style={{
            padding: "7px 16px", border: "none", borderRadius: 8,
            background: copied ? "#2DA44E" : isAfterCopy ? `${PRIMARY}90` : PRIMARY,
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            transition: "background 0.2s",
          }}
        >
          {copied ? "\u2713 Copied!" : isAfterCopy ? "Copy again" : `Copy for ${toolLabel}`}
        </button>
        <button
          onClick={() => {
            setStage("paste");
            setTimeout(() => textareaRef.current?.focus(), 100);
          }}
          style={{
            padding: "7px 16px", border: `1.5px solid ${isPasteStage ? PRIMARY : BORDER}`, borderRadius: 8,
            background: isPasteStage ? `${PRIMARY}0A` : "transparent",
            color: isPasteStage ? PRIMARY : TEXT,
            fontSize: 13, fontWeight: isPasteStage ? 600 : 400,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            transition: "all 0.2s",
          }}
        >
          Paste result back
        </button>
      </div>

      {/* Paste area — shown when in paste stage or user clicked paste */}
      {(stage === "paste" || stage === "running") && (
        <div style={{
          marginTop: 10,
          opacity: isPasteStage ? 1 : 0.5,
          transition: "opacity 0.2s",
        }}>
          <textarea
            ref={textareaRef}
            value={pastedResult}
            onChange={(e) => {
              setPastedResult(e.target.value);
              if (e.target.value.trim().length > 0) setStage("paste");
            }}
            placeholder="Paste the AI's output here so it's tracked in your project..."
            style={{
              width: "100%", minHeight: 100, padding: 12, fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", borderRadius: 10,
              border: `1.5px solid ${isPasteStage ? PRIMARY : BORDER}`,
              background: "#FAFAF9",
              outline: "none", resize: "vertical", lineHeight: 1.5,
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            {pastedResult.trim() && (
              <button
                onClick={() => onComplete(task.id, pastedResult.trim())}
                style={{
                  padding: "8px 18px", border: "none", borderRadius: 8,
                  background: "#2DA44E", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  boxShadow: "0 1px 3px rgba(45,164,78,0.3)",
                  animation: "fadeIn 0.2s ease",
                }}
              >
                Save result & mark done
              </button>
            )}
            <button
              onClick={() => onComplete(task.id)}
              style={{
                background: "none", border: "none",
                color: TEXT_LIGHT, fontSize: 12, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                textDecoration: "underline",
                textDecorationStyle: "dotted" as const,
                padding: "4px 2px",
              }}
            >
              Mark done without pasting
            </button>
          </div>
        </div>
      )}

      {/* Mark done link — only visible before paste stage */}
      {stage === "copy" && (
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
          Mark done without pasting
        </button>
      )}
    </div>
  );
}

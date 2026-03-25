"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type Plan,
  type DagNode,
  type Task,
  type Subtask,
  type Energy,
  type Assignee,
  type AgentType,
  type ActivityEvent,
  getAllTasks,
  computeUnlocked,
} from "@/lib/dag";
import { useAgentExecutor, type AgentResult, type AgentStep } from "@/hooks/useAgentExecutor";
import { useAuth } from "@/hooks/useAuth";
import { usePlanStorage } from "@/hooks/usePlanStorage";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { templates, type ProjectTemplate } from "@/lib/templates";

const PRIMARY = "#6366A0";
const BG = "#F7F6F3";
const BORDER = "#E5E4E0";
const TEXT = "#37352F";
const TEXT_LIGHT = "#9B9A97";
const SURFACE = "#FFFFFF";
const ENERGY_COLORS: Record<Energy, string> = {
  high: "#CF522E",
  medium: "#D4A72C",
  low: "#2DA44E",
};

// ─── Header ───

function Header({
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
        padding: "16px 32px",
        borderBottom: `1px solid ${BORDER}`,
        background: SURFACE,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </header>
  );
}

// ─── ThinkingTerminal ───

function ThinkingTerminal({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      style={{
        background: "#1C1C1E",
        color: "#8FBC8F",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        padding: 20,
        borderRadius: 12,
        maxHeight: 320,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
      <span style={{ animation: "blink 1s step-end infinite" }}>_</span>
      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </pre>
  );
}

// ─── AgentPanel ───

function agentTypeDisplay(agentType: AgentType, model: string) {
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

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function AgentPanel({
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

// ─── SimpleMarkdown ───

function SimpleMarkdown({ text, color }: { text: string; color?: string }) {
  const lines = text.split("\n");
  return (
    <span>
      {lines.map((line, li) => {
        const isNumberedList = /^\d+\.\s/.test(line);
        const isBullet = /^[-*]\s/.test(line);
        const content = isNumberedList || isBullet ? line.replace(/^(\d+\.\s|[-*]\s)/, "") : line;
        const prefix = isNumberedList ? line.match(/^(\d+\.)\s/)?.[1] + " " : isBullet ? "\u2022 " : "";

        const rendered = inlineMarkdown(content, color);

        return (
          <span key={li}>
            {li > 0 && <br />}
            {(isNumberedList || isBullet) && (
              <span style={{ fontWeight: 500 }}>{prefix}</span>
            )}
            {rendered}
          </span>
        );
      })}
    </span>
  );
}

function inlineMarkdown(text: string, color?: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, and [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          style={{
            background: color === "#fff" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
            padding: "1px 4px",
            borderRadius: 3,
            fontSize: "0.9em",
          }}
        >
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      // [text](url)
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: color === "#fff" ? "#c4b5fd" : PRIMARY, textDecoration: "underline" }}
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// ─── TaskChat ───

interface PriorResult {
  title: string;
  assignee: string;
  output: string;
}

function TaskChat({
  task,
  projectSummary,
  priorResults,
}: {
  task: Task;
  projectSummary: string;
  priorResults: PriorResult[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = { role: "user" as const, content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg = { role: "assistant" as const, content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: task.title,
          taskDescription: task.description,
          projectSummary,
          messages: newMessages,
          priorResults,
          subtasks: task.subtasks?.map((st) => ({ title: st.title, assignee: st.assignee })),
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "text") {
              accumulated += event.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setStreaming(false);
    }
  };

  if (!open) {
    return (
      <button
        data-task-chat={task.id}
        onClick={() => setOpen(true)}
        style={{
          padding: "5px 12px",
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          background: "transparent",
          color: TEXT_LIGHT,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          marginTop: 4,
        }}
      >
        Help me with this
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "#F0EFEB",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: PRIMARY }}>Task guide</span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: TEXT_LIGHT,
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>
      <div
        style={{
          maxHeight: 260,
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: TEXT_LIGHT, textAlign: "center", padding: 12 }}>
            Ask anything about this task — how to start, what it means, step-by-step help.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: 10,
              background: m.role === "user" ? PRIMARY : "#EDECE9",
              color: m.role === "user" ? "#fff" : TEXT,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.role === "assistant" ? (
              <SimpleMarkdown text={m.content} color={TEXT} />
            ) : (
              m.content
            )}
            {streaming && i === messages.length - 1 && m.role === "assistant" && (
              <span style={{ animation: "blink 1s step-end infinite" }}>_</span>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="How do I start this?"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          style={{
            padding: "6px 14px",
            border: "none",
            borderRadius: 6,
            background: !input.trim() || streaming ? "#ccc" : PRIMARY,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: !input.trim() || streaming ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── SubtaskList ───

function SubtaskList({
  subtasks,
  autoExpand = false,
  doneSubtaskIds,
  onToggleSubtask,
}: {
  subtasks: Subtask[];
  autoExpand?: boolean;
  doneSubtaskIds: Set<string>;
  onToggleSubtask: (subtaskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const doneCount = subtasks.filter((st) => doneSubtaskIds.has(st.id)).length;

  // Group parallel subtasks together
  const rendered = new Set<string>();
  const groups: (Subtask | Subtask[])[] = [];
  for (const st of subtasks) {
    if (rendered.has(st.id)) continue;
    if (st.parallel_with && st.parallel_with.length > 0) {
      const parallel = [st, ...subtasks.filter((s) => st.parallel_with?.includes(s.id) && !rendered.has(s.id))];
      parallel.forEach((p) => rendered.add(p.id));
      groups.push(parallel);
    } else {
      rendered.add(st.id);
      groups.push(st);
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 12,
          color: PRIMARY,
          cursor: "pointer",
          fontWeight: 500,
          fontFamily: "'DM Sans', sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {expanded ? "\u25BC" : "\u25B6"} {subtasks.length} steps
        {doneCount > 0 && (
          <span style={{ color: "#2DA44E", fontWeight: 400 }}>
            ({doneCount}/{subtasks.length} done)
          </span>
        )}
      </button>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 2 }}>
          {groups.map((group, gi) => {
            if (Array.isArray(group)) {
              return (
                <div key={gi}>
                  <div style={{ fontSize: 10, color: "#B0AFA8", marginBottom: 4, marginTop: gi > 0 ? 8 : 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Can do at the same time:
                  </div>
                  <div style={{ borderLeft: `2px solid ${PRIMARY}22`, paddingLeft: 10, marginBottom: 6 }}>
                    {group.map((st) => (
                      <SubtaskItem key={st.id} st={st} done={doneSubtaskIds.has(st.id)} onToggle={onToggleSubtask} />
                    ))}
                  </div>
                </div>
              );
            }
            return <SubtaskItem key={group.id} st={group} done={doneSubtaskIds.has(group.id)} onToggle={onToggleSubtask} />;
          })}
        </div>
      )}
    </div>
  );
}

function SubtaskItem({ st, done, onToggle }: { st: Subtask; done: boolean; onToggle: (id: string) => void }) {
  const isAgent = st.assignee === "agent";
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        marginBottom: 6,
        fontSize: 12,
        color: done ? "#bbb" : "#666",
        lineHeight: 1.5,
        opacity: done ? 0.6 : 1,
      }}
    >
      <button
        onClick={() => onToggle(st.id)}
        style={{
          minWidth: 18,
          height: 18,
          borderRadius: 4,
          border: done ? "none" : `1.5px solid ${BORDER}`,
          background: done ? "#2DA44E" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: done ? "#fff" : "#bbb",
          flexShrink: 0,
          marginTop: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {done ? "\u2713" : ""}
      </button>
      <span style={{ textDecoration: done ? "line-through" : "none", flex: 1 }}>
        {st.title}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          padding: "1px 5px",
          borderRadius: 4,
          background: isAgent ? `${PRIMARY}14` : BORDER,
          color: isAgent ? PRIMARY : TEXT_LIGHT,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {isAgent ? "AI" : "You"}
      </span>
    </div>
  );
}

// ─── TaskCard ───

// Activity log display for a task
function ActivityLog({ activity }: { activity?: ActivityEvent[] }) {
  if (!activity || activity.length === 0) return null;
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
      <div style={{ fontSize: 10, color: "#B0AFA8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Activity
      </div>
      {activity.slice(-5).map((evt, i) => {
        const time = new Date(evt.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        let label = "";
        let color = TEXT_LIGHT;
        switch (evt.type) {
          case "started": label = "Started"; color = PRIMARY; break;
          case "completed": label = "Completed"; color = "#2DA44E"; break;
          case "note": label = `Note: ${evt.text}`; break;
          case "agent_started": label = `${evt.agent === "claude-code" ? "Claude Code" : "Agent"} started`; color = PRIMARY; break;
          case "agent_completed": label = `${evt.agent === "claude-code" ? "Claude Code" : "Agent"} finished`; color = "#2DA44E"; break;
          case "approved": label = "Approved"; color = "#C4841D"; break;
          case "regenerated": label = "Regenerated"; color = "#CF522E"; break;
        }
        return (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, lineHeight: 1.6, color }}>
            <span style={{ color: "#B0AFA8", flexShrink: 0 }}>{time}</span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  result,
  onMarkDone,
  onRunAgent,
  onAddNote,
  projectSummary,
  autoExpandSubtasks = false,
  doneSubtaskIds,
  onToggleSubtask,
  priorResults,
  allTasksList,
  executionMode = "api",
}: {
  task: Task;
  result?: AgentResult;
  onMarkDone: (id: string, notes?: string) => void;
  onRunAgent: (task: Task, force?: boolean) => void;
  onAddNote: (id: string, note: string) => void;
  projectSummary: string;
  autoExpandSubtasks?: boolean;
  doneSubtaskIds: Set<string>;
  onToggleSubtask: (id: string) => void;
  priorResults: PriorResult[];
  allTasksList?: Task[];
  executionMode?: ExecutionMode;
}) {
  const isLocked = task.status === "locked";
  const isDone = task.status === "done";
  const isPending = task.status === "pending";
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [noteText, setNoteText] = useState(task.notes || "");
  const [showNotes, setShowNotes] = useState(false);

  const agentLabel = task.agent_type === "claude-code" ? "Claude Code"
    : task.agent_type === "custom" ? "Custom Agent" : "Agent";
  const assigneeConfig = {
    agent: { icon: task.agent_type === "claude-code" ? "\uD83E\uDDE0" : "\u26A1", label: agentLabel, bg: task.agent_type === "claude-code" ? "#FDF6EE" : `${PRIMARY}18`, color: task.agent_type === "claude-code" ? "#C4841D" : PRIMARY },
    user: { icon: "\uD83D\uDC64", label: "You", bg: BORDER, color: "#787774" },
    hybrid: { icon: "\uD83E\uDD1D", label: "Review", bg: "#C4841D14", color: "#C4841D" },
  }[task.assignee];

  // Collapsed done task — just shows title + checkmark
  if (isDone && !doneExpanded) {
    return (
      <div
        onClick={() => setDoneExpanded(true)}
        style={{
          background: SURFACE,
          borderRadius: 10,
          padding: "10px 14px",
          border: `1px solid ${BORDER}`,
          opacity: 0.55,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#2DA44E", fontSize: 14 }}>{"\u2713"}</span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          borderRadius: 5,
          background: assigneeConfig.bg,
          color: assigneeConfig.color,
          fontSize: 10,
          fontWeight: 600,
        }}>
          {assigneeConfig.icon}
        </span>
        <span style={{ fontSize: 13, color: TEXT_LIGHT, textDecoration: "line-through" }}>{task.title}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#B0AFA8" }}>{"\u25B6"}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: SURFACE,
        borderRadius: 12,
        padding: 18,
        border: `1px solid ${BORDER}`,
        opacity: isLocked ? 0.32 : isDone ? 0.55 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 6,
              background: assigneeConfig.bg,
              color: assigneeConfig.color,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {assigneeConfig.icon} {assigneeConfig.label}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 5,
              background: `${ENERGY_COLORS[task.energy]}14`,
              color: ENERGY_COLORS[task.energy],
              fontSize: 10,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: ENERGY_COLORS[task.energy] }} />
            {task.energy}
          </span>
        </div>
        {isLocked && <span style={{ fontSize: 14 }}>&#x1F512;</span>}
        {isDone && <span onClick={() => setDoneExpanded(false)} style={{ fontSize: 14, color: "#2DA44E", cursor: "pointer" }}>{"\u2713 \u25BC"}</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
      <div style={{ fontSize: 13, color: "#787774", lineHeight: 1.5, marginBottom: 8 }}>
        {task.description}
      </div>

      {task.depends_on.length > 0 && isLocked && (
        <div style={{ fontSize: 11, color: TEXT_LIGHT, marginBottom: 8 }}>
          <span style={{ opacity: 0.6 }}>&#x1F517;</span>{" "}
          Waiting on:{" "}
          {task.depends_on.map((depId, i) => {
            const depTask = allTasksList?.find((t) => t.id === depId);
            const depName = depTask ? depTask.title : depId;
            return (
              <span key={depId}>
                {i > 0 && ", "}
                <span style={{ fontWeight: 500 }}>{depName}</span>
              </span>
            );
          })}
        </div>
      )}

      {task.subtasks && task.subtasks.length > 0 && isPending && (
        <SubtaskList
          subtasks={task.subtasks}
          autoExpand={autoExpandSubtasks}
          doneSubtaskIds={doneSubtaskIds}
          onToggleSubtask={onToggleSubtask}
        />
      )}

      {isPending && !result && task.assignee === "agent" && executionMode === "api" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PRIMARY }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, animation: "pulse 1.5s ease-in-out infinite" }} />
          Running automatically...
        </div>
      )}
      {isPending && !result && task.assignee === "agent" && executionMode === "byo" && (
        <ByoAgentPanel
          task={task}
          projectContext={projectSummary}
          priorResults={priorResults}
          onComplete={onMarkDone}
        />
      )}
      {isPending && !result && task.assignee === "hybrid" && executionMode === "api" && (
        <button
          onClick={() => onRunAgent(task)}
          style={{
            padding: "7px 16px",
            border: "none",
            borderRadius: 8,
            background: PRIMARY,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          &#x26A1; Start agent draft &rarr;
        </button>
      )}
      {isPending && !result && task.assignee === "hybrid" && executionMode === "byo" && (
        <ByoAgentPanel
          task={task}
          projectContext={projectSummary}
          priorResults={priorResults}
          onComplete={onMarkDone}
        />
      )}
      {isPending && !result && task.assignee === "user" && (
        <div>
          {/* Notes section for human tasks */}
          <div style={{ marginBottom: 8 }}>
            {!showNotes ? (
              <button
                onClick={() => setShowNotes(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12,
                  color: TEXT_LIGHT,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + Add notes
              </button>
            ) : (
              <div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="What did you do? Any links, screenshots, or notes for future reference..."
                  style={{
                    width: "100%",
                    minHeight: 60,
                    padding: 10,
                    fontSize: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    background: "#FAFAF9",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.5,
                    boxSizing: "border-box",
                    marginBottom: 6,
                  }}
                />
                {noteText.trim() && (
                  <button
                    onClick={() => { onAddNote(task.id, noteText.trim()); }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontSize: 11,
                      color: PRIMARY,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      marginBottom: 6,
                    }}
                  >
                    Save note
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => onMarkDone(task.id, noteText.trim() || undefined)}
              style={{
                padding: "7px 16px",
                border: `1px solid ${PRIMARY}`,
                borderRadius: 8,
                background: "transparent",
                color: PRIMARY,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Mark done &rarr;
            </button>
          </div>
        </div>
      )}

      {isPending && (task.assignee === "user" || task.assignee === "hybrid") && (
        <TaskChat task={task} projectSummary={projectSummary} priorResults={priorResults} />
      )}

      {/* ─── Hybrid two-phase handoff ─── */}
      {result && task.assignee === "hybrid" && (() => {
        const agentSubs = task.subtasks?.filter((st) => st.assignee === "agent") || [];
        const userSubs = task.subtasks?.filter((st) => st.assignee === "user") || [];
        const agentDone = result.done;

        return (
          <div style={{ marginTop: 8 }}>
            {/* Phase 1: Agent's work */}
            <div style={{
              padding: "8px 12px",
              borderRadius: "8px 8px 0 0",
              background: agentDone ? "#2DA44E0c" : `${PRIMARY}08`,
              border: `1px solid ${agentDone ? "#2DA44E25" : `${PRIMARY}18`}`,
              borderBottom: "none",
              fontSize: 12,
              fontWeight: 600,
              color: agentDone ? "#2DA44E" : PRIMARY,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              {agentDone ? "\u2713 Agent\u2019s work complete" : "\u26A1 Agent working..."}
              {agentSubs.length > 0 && (
                <span style={{ fontWeight: 400, color: TEXT_LIGHT }}>
                  ({agentSubs.length} step{agentSubs.length !== 1 ? "s" : ""})
                </span>
              )}
            </div>
            <div style={{
              border: `1px solid ${BORDER}`,
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              marginBottom: 12,
              overflow: "hidden",
            }}>
              <AgentPanel result={result} showApprove={false} />
            </div>

            {/* Phase 2: Your turn */}
            {agentDone && (
              <div>
                <div style={{
                  padding: "8px 12px",
                  borderRadius: "8px 8px 0 0",
                  background: "#C4841D0a",
                  border: "1px solid #C4841D20",
                  borderBottom: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#C4841D",
                }}>
                  Your turn — review and act
                  {userSubs.length > 0 && (
                    <span style={{ fontWeight: 400, color: TEXT_LIGHT, marginLeft: 6 }}>
                      ({userSubs.length} step{userSubs.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </div>
                <div style={{
                  border: "1px solid #C4841D20",
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  padding: 14,
                  background: SURFACE,
                }}>
                  {userSubs.length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      {userSubs.map((st) => (
                        <SubtaskItem
                          key={st.id}
                          st={st}
                          done={doneSubtaskIds.has(st.id)}
                          onToggle={onToggleSubtask}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "#787774", marginBottom: 12 }}>
                      Review the agent&apos;s output above, then approve or regenerate.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => onMarkDone(task.id)}
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
                      Approve &amp; continue &rarr;
                    </button>
                    <button
                      onClick={() => onRunAgent(task, true)}
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
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {result && task.assignee === "agent" && (
        <AgentPanel result={result} />
      )}

      {/* Task notes display (for done tasks) */}
      {isDone && task.notes && (
        <div style={{
          marginTop: 8,
          padding: "8px 12px",
          borderRadius: 6,
          background: "#FAFAF9",
          border: `1px solid ${BORDER}`,
          fontSize: 12,
          color: "#787774",
          lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600, fontSize: 10, color: "#B0AFA8", textTransform: "uppercase", letterSpacing: 0.5 }}>Notes: </span>
          {task.notes}
        </div>
      )}

      {/* Timestamps */}
      {(task.started_at || task.completed_at) && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "#B0AFA8" }}>
          {task.started_at && <span>Started {new Date(task.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          {task.completed_at && <span>Done {new Date(task.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          {task.started_at && task.completed_at && (
            <span>{formatDuration(task.started_at, task.completed_at)}</span>
          )}
        </div>
      )}

      {/* Activity log */}
      <ActivityLog activity={task.activity} />
    </div>
  );
}

// ─── DagView ───

function DagView({
  nodes,
  energyFilter,
  assigneeFilter,
  results,
  onMarkDone,
  onRunAgent,
  onAddNote,
  projectSummary,
  doneSubtaskIds,
  onToggleSubtask,
  allTasks,
  executionMode = "api",
}: {
  nodes: DagNode[];
  energyFilter: Energy | "all";
  assigneeFilter: Assignee | "all";
  results: Record<string, AgentResult>;
  onMarkDone: (id: string, notes?: string) => void;
  onRunAgent: (task: Task, force?: boolean) => void;
  onAddNote: (id: string, note: string) => void;
  projectSummary: string;
  doneSubtaskIds: Set<string>;
  onToggleSubtask: (id: string) => void;
  allTasks: Task[];
  executionMode?: ExecutionMode;
}) {
  const [view, setView] = useState<"steps" | "graph">("steps");
  const [completedExpanded, setCompletedExpanded] = useState(false);

  // Build prior results from completed tasks
  const buildPriorResults = (): PriorResult[] => {
    return allTasks
      .filter((t) => results[t.id]?.done)
      .map((t) => ({
        title: t.title,
        assignee: t.assignee,
        output: results[t.id]?.finalOutput || results[t.id]?.steps
          ?.filter((s) => s.type === "output")
          .map((s) => s.type === "output" ? s.content : "")
          .join("\n") || "",
      }));
  };

  const priorResults = buildPriorResults();

  const matchesFilters = (t: Task) => {
    if (energyFilter !== "all" && t.energy !== energyFilter) return false;
    if (assigneeFilter !== "all" && t.assignee !== assigneeFilter) return false;
    return true;
  };

  const filteredNodes = (energyFilter === "all" && assigneeFilter === "all")
    ? nodes
    : nodes
        .map((n) => {
          if (n.type === "task") return matchesFilters(n) ? n : null;
          const filtered = n.children.filter(matchesFilters);
          if (filtered.length === 0) return null;
          return { ...n, children: filtered };
        })
        .filter(Boolean) as DagNode[];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setView("steps")}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: view === "steps" ? PRIMARY : BORDER,
            color: view === "steps" ? "#fff" : "#666",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          &#x1F4CB; Steps
        </button>
        <button
          onClick={() => setView("graph")}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: view === "graph" ? PRIMARY : BORDER,
            color: view === "graph" ? "#fff" : "#666",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          &#x1F500; Graph
        </button>
      </div>

      {view === "steps" ? (() => {
        const isNodeDone = (node: DagNode) =>
          node.type === "task" ? node.status === "done" : node.children.every((c) => c.status === "done");
        const activeNodes = filteredNodes.filter((n) => !isNodeDone(n));
        const doneNodes = filteredNodes.filter((n) => isNodeDone(n));
        // Count all done tasks (including children in parallel groups)
        const doneTaskCount = doneNodes.reduce((acc, n) => acc + (n.type === "task" ? 1 : n.children.length), 0);

        const renderNode = (node: DagNode) => {
          if (node.type === "task") {
            return (
              <TaskCard
                key={node.id}
                task={node}
                result={results[node.id]}
                onMarkDone={onMarkDone}
                onRunAgent={onRunAgent}
                onAddNote={onAddNote}
                projectSummary={projectSummary}
                doneSubtaskIds={doneSubtaskIds}
                onToggleSubtask={onToggleSubtask}
                priorResults={priorResults}
                allTasksList={allTasks}
                executionMode={executionMode}
              />
            );
          }
          return (
            <div key={node.id}>
              <div
                style={{
                  textAlign: "center",
                  color: TEXT_LIGHT,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  margin: "8px 0",
                }}
              >
                &mdash; Can do simultaneously &mdash;
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: 12,
                }}
              >
                {node.children.map((child) => (
                  <TaskCard
                    key={child.id}
                    task={child}
                    result={results[child.id]}
                    onMarkDone={onMarkDone}
                    onRunAgent={onRunAgent}
                    onAddNote={onAddNote}
                    projectSummary={projectSummary}
                    doneSubtaskIds={doneSubtaskIds}
                    onToggleSubtask={onToggleSubtask}
                    priorResults={priorResults}
                    allTasksList={allTasks}
                    executionMode={executionMode}
                  />
                ))}
              </div>
            </div>
          );
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activeNodes.map(renderNode)}
            {doneTaskCount > 0 && (
              <>
                <div
                  onClick={() => setCompletedExpanded((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    padding: "10px 0",
                    userSelect: "none",
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: TEXT_LIGHT,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    whiteSpace: "nowrap",
                  }}>
                    <span style={{
                      fontSize: 10,
                      transition: "transform 0.2s",
                      transform: completedExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                      display: "inline-block",
                    }}>
                      {"\u25BC"}
                    </span>
                    <span style={{ color: "#2DA44E" }}>{"\u2713"}</span>
                    Completed ({doneTaskCount})
                  </span>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                </div>
                {completedExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {doneNodes.map(renderNode)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })() : (
        <AsciiGraph nodes={filteredNodes} />
      )}
    </div>
  );
}

function AsciiGraph({ nodes }: { nodes: DagNode[] }) {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const prefix = isLast ? "\u2514\u2500" : "\u251C\u2500";
    if (node.type === "task") {
      const label = assigneeLabel(node.assignee);
      const dot = energyDot(node.energy);
      const status = node.status === "done" ? " \u2713" : node.status === "locked" ? " \uD83D\uDD12" : "";
      lines.push(`${prefix} [${label}] ${node.title} ${dot}${status}`);
    } else {
      lines.push(`${prefix} \u2550\u2550 PARALLEL GROUP \u2550\u2550`);
      node.children.forEach((child, j) => {
        const cPrefix = j === node.children.length - 1 ? "   \u2514\u2500" : "   \u251C\u2500";
        const label = assigneeLabel(child.assignee);
        const dot = energyDot(child.energy);
        const status = child.status === "done" ? " \u2713" : child.status === "locked" ? " \uD83D\uDD12" : "";
        lines.push(`${cPrefix} [${label}] ${child.title} ${dot}${status}`);
      });
    }
  });
  return (
    <pre
      style={{
        background: "#1C1C1E",
        color: "#e0e0e0",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.8,
        padding: 20,
        borderRadius: 12,
        overflow: "auto",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}

function assigneeLabel(a: string) {
  return a === "agent" ? "\u26A1 Agent" : a === "user" ? "\uD83D\uDC64 User" : "\uD83E\uDD1D Hybrid";
}
function energyDot(e: Energy) {
  return e === "high" ? "\uD83D\uDD34" : e === "medium" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
}

// ─── BYO Agent Panel ───
// For users who have Claude Code / Claude Max / ChatGPT and want to run agent tasks there

type ExecutionMode = "api" | "byo";

function generateAgentPrompt(task: Task, projectContext: string, priorOutputs?: PriorResult[]): string {
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

function ByoAgentPanel({
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

// ─── Main Page ───

type ClarifyQuestion = {
  id: string;
  question: string;
  type: "yes_no" | "choice" | "short";
  options?: string[];
};

type Step = "dashboard" | "input" | "clarify" | "compiling" | "reveal";

export default function Home() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signOut, configured: authConfigured } = useAuth();
  const { savePlan, loadPlans, updateProgress } = usePlanStorage(user?.id);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("dashboard");
  const [savedPlans, setSavedPlans] = useState<{ id: string; brief: string; project_title: string; summary: string; nodes: DagNode[]; done_ids: string[]; done_subtask_ids: string[]; created_at: string; updated_at: string }[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [brief, setBrief] = useState("");
  const voiceInput = useVoiceInput(useCallback((text: string) => {
    setBrief((prev) => prev + (prev ? " " : "") + text);
  }, []));
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string }[]>([]);
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [revealMode, setRevealMode] = useState<"onething" | "project">("onething");
  const [thinkingText, setThinkingText] = useState("");
  const [compileStatus, setCompileStatus] = useState("");
  const [compileStartTime, setCompileStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [energyFilter, setEnergyFilter] = useState<Energy | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<Assignee | "all">("all");
  const [doneSubtaskIds, setDoneSubtaskIds] = useState<Set<string>>(new Set());
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("api");
  const [justMeMode, setJustMeMode] = useState(false);
  const [currentEnergy, setCurrentEnergy] = useState<Energy | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<number | null>(null);
  const [showEncouragement, setShowEncouragement] = useState<string | null>(null);
  const [showBreakReminder, setShowBreakReminder] = useState(false);

  const { execute, results, running, runningCount } = useAgentExecutor();

  // Load saved plans for dashboard
  useEffect(() => {
    if (user && step === "dashboard") {
      setDashboardLoading(true);
      loadPlans().then((plans) => {
        setSavedPlans(plans);
        setDashboardLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  const loadSavedPlan = useCallback((saved: typeof savedPlans[0]) => {
    setBrief(saved.brief);
    setPlan({
      project_title: saved.project_title,
      summary: saved.summary,
      nodes: saved.nodes,
    });
    setDoneIds(new Set(saved.done_ids));
    setDoneSubtaskIds(new Set(saved.done_subtask_ids));
    setSavedPlanId(saved.id);
    setStep("reveal");
  }, []);

  const startFromTemplate = useCallback((template: ProjectTemplate) => {
    setBrief(template.brief);
    if (template.justMeDefault) setJustMeMode(true);
    setStep("input");
  }, []);

  const startNewProject = useCallback(() => {
    setBrief("");
    setPlan(null);
    setDoneIds(new Set());
    setDoneSubtaskIds(new Set());
    setSavedPlanId(null);
    setJustMeMode(false);
    setCurrentEnergy(null);
    setStreak(0);
    setShowBreakReminder(false);
    setStep("input");
  }, []);

  const goToDashboard = useCallback(() => {
    setStep("dashboard");
  }, []);

  // Elapsed timer for compiling phase
  useEffect(() => {
    if (compileStartTime === null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - compileStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [compileStartTime]);

  const allTasks = plan ? getAllTasks(plan.nodes) : [];
  const total = allTasks.length;
  const doneCount = allTasks.filter((t) => doneIds.has(t.id)).length;

  const currentNodes = plan ? computeUnlocked(plan.nodes, doneIds) : [];

  // Encouragement messages for completing tasks
  const encouragements = [
    "Nice work! One down.",
    "You're making progress.",
    "That's done. On to the next.",
    "Steady progress. Keep going.",
    "Another one handled.",
    "You're on a roll.",
    "Well done. Take a breath if you need.",
    "That wasn't so bad, right?",
    "Progress feels good.",
    "One step closer.",
  ];
  const streakEncouragements = [
    "", // 0
    "", // 1
    "Two in a row!", // 2
    "Three tasks done. You're in the zone.", // 3
    "Four! Seriously impressive focus.", // 4
    "Five tasks straight. Consider a break soon.", // 5
  ];

  const markDone = useCallback(
    (id: string, notes?: string) => {
      setDoneIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Update plan with completion timestamp, notes, and activity
      setPlan((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        const updateTask = (t: Task): Task => {
          if (t.id !== id) return t;
          const activity: ActivityEvent[] = [...(t.activity || []), { type: "completed", at: now }];
          if (notes) activity.splice(activity.length - 1, 0, { type: "note", text: notes, at: now });
          return { ...t, completed_at: now, notes: notes || t.notes, activity };
        };
        return {
          ...prev,
          nodes: prev.nodes.map((n): DagNode =>
            n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
          ),
        };
      });
      // Streak and encouragement tracking
      const now = Date.now();
      setStreak((prev) => {
        const newStreak = prev + 1;
        // Show break reminder after 5+ tasks
        if (newStreak >= 5) setShowBreakReminder(true);
        return newStreak;
      });
      setLastCompletedAt(now);
      // Pick an encouragement message
      setShowEncouragement(encouragements[Math.floor(Math.random() * encouragements.length)]);
      setTimeout(() => setShowEncouragement(null), 3000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const addNote = useCallback((taskId: string, note: string) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const updateTask = (t: Task): Task => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          notes: note,
          activity: [...(t.activity || []), { type: "note" as const, text: note, at: now }],
        };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
  }, []);

  const toggleSubtask = useCallback((subtaskId: string) => {
    setDoneSubtaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(subtaskId)) next.delete(subtaskId);
      else next.add(subtaskId);
      return next;
    });
  }, []);

  // Track which agent tasks we've already kicked off
  const launchedAgentTasks = useRef<Set<string>>(new Set());

  // Auto-complete agent tasks when result is done
  useEffect(() => {
    for (const [taskId, result] of Object.entries(results)) {
      if (result.done && !result.error) {
        const task = allTasks.find((t) => t.id === taskId);
        if (task && task.assignee === "agent" && !doneIds.has(taskId)) {
          markDone(taskId);
        }
      }
    }
  }, [results, allTasks, doneIds, markDone]);

  // Auto-complete tasks when all subtasks are checked
  useEffect(() => {
    for (const task of allTasks) {
      if (doneIds.has(task.id)) continue;
      if (!task.subtasks || task.subtasks.length === 0) continue;
      const allSubtasksDone = task.subtasks.every((st) => doneSubtaskIds.has(st.id));
      if (allSubtasksDone) {
        markDone(task.id);
      }
    }
  }, [doneSubtaskIds, allTasks, doneIds, markDone]);

  // Auto-save plan and progress to Supabase
  useEffect(() => {
    if (!plan || !user) return;
    const timeout = setTimeout(() => {
      savePlan(brief, plan, doneIds, doneSubtaskIds).then((result) => {
        if (result?.id && !savedPlanId) setSavedPlanId(result.id);
      });
    }, 1000); // Debounce 1s
    return () => clearTimeout(timeout);
  }, [plan, doneIds, doneSubtaskIds, user, brief, savePlan, savedPlanId]);

  // Auto-run agent tasks when they become unblocked (API mode only)
  const currentTasksForAutoRun = getAllTasks(currentNodes);
  useEffect(() => {
    if (step !== "reveal" || !plan || executionMode === "byo") return;

    for (const task of currentTasksForAutoRun) {
      if (
        task.assignee === "agent" &&
        task.status === "pending" &&
        !results[task.id] &&
        !launchedAgentTasks.current.has(task.id)
      ) {
        launchedAgentTasks.current.add(task.id);
        // Stagger launches slightly to avoid hammering the API
        const agentType = task.agent_type;
        setTimeout(() => {
          execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee, false, agentType);
        }, launchedAgentTasks.current.size * 500);
      }
    }
  }, [currentTasksForAutoRun, step, plan, results, execute, brief, executionMode]);

  const handleRunAgent = (task: Task, force?: boolean) => {
    launchedAgentTasks.current.add(task.id);
    // Track activity
    setPlan((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const updateTask = (t: Task): Task => {
        if (t.id !== task.id) return t;
        const event: ActivityEvent = { type: "agent_started", agent: t.agent_type || "builtin", model: "", at: now };
        return { ...t, started_at: t.started_at || now, activity: [...(t.activity || []), event] };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
    execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee, force, task.agent_type);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClarify = async () => {
    setClarifyLoading(true);
    setClarifyError("");
    setQuestionIndex(0);
    setStep("clarify");
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setClarifyError(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
        setQuestions([]);
        return;
      }
      if (!res.ok || data.error) {
        setClarifyError(data.error || `HTTP ${res.status}`);
        setQuestions([]);
        return;
      }
      const qs = data.questions || [];
      setQuestions(qs);
      const initialAnswers: Record<string, string> = {};
      qs.forEach((q: ClarifyQuestion) => {
        initialAnswers[q.id] = "";
      });
      setAnswers(initialAnswers);
    } catch (err) {
      setClarifyError(String(err));
      setQuestions([]);
    } finally {
      setClarifyLoading(false);
    }
  };

  const buildEnrichedBrief = () => {
    let enriched = brief;
    const answered = Object.entries(answers).filter(([, v]) => v);
    if (answered.length > 0) {
      enriched += "\n\nAdditional context from user:";
      for (const [qId, answer] of answered) {
        const q = questions.find((q) => q.id === qId);
        if (q) enriched += `\n- ${q.question} → ${answer}`;
      }
    }
    if (justMeMode) {
      enriched += "\n\nIMPORTANT: The user wants to do EVERYTHING themselves — no AI agents. Make ALL tasks assignee 'user'. Break tasks into very concrete, small steps. This person may have executive function challenges, so: be specific, be encouraging, and make each step feel achievable.";
    }
    return enriched;
  };

  // Convert a plan to all-user tasks when in "just me" mode
  const convertToJustMe = (p: Plan): Plan => {
    const convertTask = (t: Task): Task => ({
      ...t,
      assignee: "user",
      agent_type: undefined,
    });
    return {
      ...p,
      nodes: p.nodes.map((n): DagNode =>
        n.type === "task" ? convertTask(n) : { ...n, children: n.children.map(convertTask) }
      ),
    };
  };

  const handleCompile = async () => {
    setStep("compiling");
    setThinkingText("");
    setCompileStatus("Thinking through your brief...");
    setCompileStartTime(Date.now());
    setElapsed(0);

    const enrichedBrief = buildEnrichedBrief();

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: enrichedBrief, attachments }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "thought") {
              setThinkingText((prev) => prev + event.text);
            } else if (event.type === "status") {
              setCompileStatus(event.text);
            } else if (event.type === "plan") {
              setCompileStartTime(null);
              const receivedPlan = justMeMode ? convertToJustMe(event.plan) : event.plan;
              setPlan(receivedPlan);
              setStep("reveal");
            } else if (event.type === "subtasks") {
              // Merge subtasks into the existing plan
              setPlan((prev) => {
                if (!prev) return prev;
                const subtaskMap = new Map<string, string[]>();
                for (const t of event.tasks) {
                  subtaskMap.set(t.id, t.subtasks);
                }
                const updatedNodes = prev.nodes.map((node: DagNode) => {
                  if (node.type === "task" && subtaskMap.has(node.id)) {
                    return { ...node, subtasks: subtaskMap.get(node.id) };
                  }
                  if (node.type === "parallel_group") {
                    return {
                      ...node,
                      children: node.children.map((child: Task) =>
                        subtaskMap.has(child.id)
                          ? { ...child, subtasks: subtaskMap.get(child.id) }
                          : child
                      ),
                    };
                  }
                  return node;
                });
                return { ...prev, nodes: updatedNodes as DagNode[] };
              });
            } else if (event.type === "error") {
              console.error("Compile error:", event.text);
              setCompileStatus("error:" + (event.text || "Unknown error"));
              setCompileStartTime(null);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      console.error("Compile failed:", err);
      setCompileStartTime(null);
      setStep("input");
    }
  };

  const claudeCodeCount = allTasks.filter((t) => t.agent_type === "claude-code").length;
  const builtinAgentCount = allTasks.filter((t) => t.assignee === "agent" && t.agent_type !== "claude-code").length;
  const hybridCount = allTasks.filter((t) => t.assignee === "hybrid").length;
  const userCount = allTasks.filter((t) => t.assignee === "user").length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header plan={plan} doneCount={doneCount} total={total} running={running} runningCount={runningCount} userEmail={user?.email} onSignOut={signOut} onDashboard={step !== "dashboard" ? goToDashboard : undefined} />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        {/* ─── DASHBOARD ─── */}
        {(user || !authConfigured) && step === "dashboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: TEXT, margin: 0 }}>
                Your projects
              </h1>
              <button
                onClick={startNewProject}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 10,
                  background: PRIMARY,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + New project
              </button>
            </div>

            {/* Active projects */}
            {dashboardLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: TEXT_LIGHT }}>Loading projects...</div>
            ) : savedPlans.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                {savedPlans.map((saved) => {
                  const tasks = getAllTasks(saved.nodes);
                  const done = saved.done_ids?.length || 0;
                  const totalTasks = tasks.length;
                  const pct = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;
                  const isComplete = done === totalTasks && totalTasks > 0;

                  return (
                    <div
                      key={saved.id}
                      onClick={() => loadSavedPlan(saved)}
                      style={{
                        background: SURFACE,
                        borderRadius: 12,
                        padding: "16px 20px",
                        border: `1px solid ${BORDER}`,
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: isComplete ? "#2DA44E" : TEXT }}>
                          {isComplete && "\u2713 "}{saved.project_title || "Untitled project"}
                        </div>
                        <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                          {saved.summary?.slice(0, 100) || saved.brief?.slice(0, 100)}
                          {(saved.summary?.length || saved.brief?.length || 0) > 100 ? "..." : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#B0AFA8", marginTop: 4 }}>
                          Updated {new Date(saved.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: isComplete ? "#2DA44E" : PRIMARY }}>
                          {pct}%
                        </div>
                        <div style={{ fontSize: 11, color: TEXT_LIGHT }}>
                          {done}/{totalTasks} tasks
                        </div>
                        {/* Mini progress bar */}
                        <div style={{ width: 60, height: 4, background: BORDER, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: isComplete ? "#2DA44E" : PRIMARY, borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "20px 0", color: TEXT_LIGHT, fontSize: 14, marginBottom: 24 }}>
                No projects yet. Start one from scratch or pick a template below.
              </div>
            )}

            {/* Templates */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                Quick start
              </h2>
              <p style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 16 }}>
                Pick a template to get going fast. You can customize the brief before building.
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 10,
              }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startFromTemplate(t)}
                    style={{
                      background: SURFACE,
                      borderRadius: 10,
                      padding: "14px 14px",
                      border: `1px solid ${BORDER}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "'DM Sans', sans-serif",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: TEXT_LIGHT, marginTop: 2, textTransform: "capitalize" }}>
                      {t.category}{t.justMeDefault ? " \u00B7 just you" : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── AUTH ─── */}
        {authConfigured && !authLoading && !user && (
          <div style={{ maxWidth: 380, margin: "60px auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to LetsBegin</h2>
            <p style={{ color: "#787774", fontSize: 14, marginBottom: 24 }}>Sign in to save your plans and progress.</p>

            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            {authError && (
              <div style={{ fontSize: 12, color: "#CF522E", marginBottom: 12 }}>{authError}</div>
            )}

            <button
              onClick={async () => {
                setAuthError("");
                const fn = authMode === "signin" ? signInWithEmail : signUpWithEmail;
                const { error } = await fn(authEmail, authPassword);
                if (error) setAuthError(error.message);
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: PRIMARY,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: 12,
              }}
            >
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>

            <button
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              style={{
                background: "none",
                border: "none",
                color: PRIMARY,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        {/* ─── INPUT ─── */}
        {(user || !authConfigured || authLoading) && step === "input" && (
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8, color: TEXT }}>
              What are we building?
            </h1>
            <p style={{ color: "#787774", fontSize: 16, marginBottom: 28, lineHeight: 1.6 }}>
              AI tools either do everything for you or leave you in a chat guessing
              what to do next. LetsBegin coordinates — Claude plans, agents like
              Claude Code handle the technical work, and you get guided through your
              part with every step visible and traceable.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
                marginBottom: 32,
              }}
            >
              {[
                {
                  num: "1",
                  title: "Describe it messy",
                  desc: "Paste your goal, attach screenshots. AI asks a few smart questions to understand your situation.",
                },
                {
                  num: "2",
                  title: "Get a dependency graph",
                  desc: "Claude builds a real plan — not a to-do list. It picks the right agent for each task and lets everything run in parallel.",
                },
                {
                  num: "3",
                  title: "Visible, traceable work",
                  desc: "Agents run in the background. Your tasks have notes, timestamps, and a full activity log — nothing gets lost.",
                },
              ].map((s) => (
                <div
                  key={s.num}
                  style={{
                    background: SURFACE,
                    borderRadius: 10,
                    padding: "16px 14px",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: `${PRIMARY}14`,
                      color: PRIMARY,
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    {s.num}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>

            <details
              style={{
                marginBottom: 28,
                background: SURFACE,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                padding: "0 16px",
              }}
            >
              <summary
                style={{
                  padding: "12px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  color: PRIMARY,
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                Not another chatbot &darr;
              </summary>
              <div style={{ paddingBottom: 16, fontSize: 13, color: "#787774", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike chat:</strong> Your project has structure. A progress bar, a
                  dependency graph, and a stable plan that doesn&apos;t regenerate every message.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike coding agents:</strong> LetsBegin handles the whole project — not
                  just the code parts. Claude Code handles the technical tasks. You handle what
                  only you can do. Everything is visible and traceable.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike task managers:</strong> Tasks actually get done. Agents auto-execute
                  their work in the background while you focus on what only you can do.
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Designed for real humans:</strong> One task at a time. Step-by-step
                  guidance when you need it. Energy-aware task ordering. Built for people
                  with executive function challenges, not just productivity hackers. You can
                  even turn off all agents and use it as a pure human planning tool.
                </p>
              </div>
            </details>

            <div style={{ position: "relative" }}>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Launch a landing page for my new product by end of week..."
                style={{
                  width: "100%",
                  minHeight: 140,
                  padding: 16,
                  paddingRight: 48,
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                  borderRadius: 12,
                  border: `2px solid ${BORDER}`,
                  background: SURFACE,
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                onBlur={(e) => (e.target.style.borderColor = BORDER)}
              />
              {voiceInput.isSupported && (
                <button
                  onClick={voiceInput.listening ? voiceInput.stopListening : voiceInput.startListening}
                  title={voiceInput.listening ? "Stop dictation" : "Dictate your brief"}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "none",
                    background: voiceInput.listening ? "#CF522E" : `${PRIMARY}14`,
                    color: voiceInput.listening ? "#fff" : PRIMARY,
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {voiceInput.listening ? "\u25A0" : "\uD83C\uDF99"}
                </button>
              )}
            </div>

            {/* Attachments */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileAdd}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "6px 14px",
                  border: "1px dashed #ccc",
                  borderRadius: 8,
                  background: "transparent",
                  color: TEXT_LIGHT,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + Attach images
              </button>
              {attachments.map((att, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "#EDECE9",
                    fontSize: 12,
                    color: "#787774",
                  }}
                >
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }}
                  />
                  {att.name}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    style={{
                      background: "none",
                      border: "none",
                      color: TEXT_LIGHT,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            {attachments.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: TEXT_LIGHT }}>
                Images will be analyzed to understand your project context.
              </div>
            )}

            {/* Just me mode toggle */}
            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                borderRadius: 10,
                background: justMeMode ? `${PRIMARY}08` : SURFACE,
                border: `1px solid ${justMeMode ? PRIMARY + "30" : BORDER}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onClick={() => setJustMeMode(!justMeMode)}
            >
              <div
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: justMeMode ? PRIMARY : BORDER,
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 2,
                    left: justMeMode ? 20 : 2,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: justMeMode ? PRIMARY : TEXT }}>
                  Just me, no agents
                </div>
                <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                  All tasks stay yours. Great for personal projects, executive function support, or when you just want a good plan to follow.
                </div>
              </div>
            </div>

            {/* Execution mode toggle — BYO Agent */}
            {!justMeMode && (
              <div
                style={{
                  marginTop: 12,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: executionMode === "byo" ? "#E8F0FE08" : SURFACE,
                  border: `1px solid ${executionMode === "byo" ? "#1967D230" : BORDER}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onClick={() => setExecutionMode(executionMode === "api" ? "byo" : "api")}
              >
                <div
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: executionMode === "byo" ? "#1967D2" : BORDER,
                    position: "relative",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 2,
                      left: executionMode === "byo" ? 20 : 2,
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: executionMode === "byo" ? "#1967D2" : TEXT }}>
                    I have Claude Code / Claude Max
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                    Agent tasks give you a ready-to-paste prompt instead of running through our API. Use your own Claude Code, ChatGPT, or any AI tool. No API keys needed.
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleClarify}
              disabled={brief.trim().length < 10}
              style={{
                marginTop: 16,
                padding: "12px 32px",
                border: "none",
                borderRadius: 10,
                background: brief.trim().length < 10 ? "#ccc" : PRIMARY,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: brief.trim().length < 10 ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Continue &rarr;
            </button>
          </div>
        )}

        {/* ─── CLARIFY ─── */}
        {step === "clarify" && (
          <div>
            {clarifyLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 40 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: `3px solid ${PRIMARY}`,
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span style={{ fontSize: 14, color: "#787774" }}>Generating questions...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : questions.length > 0 ? (
              <div>
                {/* Progress dots */}
                <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
                  {questions.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === questionIndex ? 24 : 8,
                        height: 8,
                        borderRadius: 4,
                        background: i < questionIndex ? PRIMARY : i === questionIndex ? PRIMARY : BORDER,
                        opacity: i < questionIndex ? 0.4 : 1,
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>

                {/* Current question */}
                {(() => {
                  const q = questions[questionIndex];
                  if (!q) return null;
                  return (
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, lineHeight: 1.4 }}>
                        {q.question}
                      </h2>

                      {q.type === "yes_no" && (
                        <div style={{ display: "flex", gap: 10 }}>
                          {["Yes", "No"].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                                if (questionIndex < questions.length - 1) {
                                  setTimeout(() => setQuestionIndex((i) => i + 1), 200);
                                }
                              }}
                              style={{
                                padding: "12px 32px",
                                borderRadius: 10,
                                border: `2px solid ${answers[q.id] === opt ? PRIMARY : BORDER}`,
                                background: answers[q.id] === opt ? `${PRIMARY}0a` : "#fff",
                                color: answers[q.id] === opt ? PRIMARY : "#555",
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === "choice" && q.options && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                                if (questionIndex < questions.length - 1) {
                                  setTimeout(() => setQuestionIndex((i) => i + 1), 200);
                                }
                              }}
                              style={{
                                padding: "12px 16px",
                                borderRadius: 10,
                                border: `2px solid ${answers[q.id] === opt ? PRIMARY : BORDER}`,
                                background: answers[q.id] === opt ? `${PRIMARY}0a` : "#fff",
                                color: answers[q.id] === opt ? PRIMARY : "#555",
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                textAlign: "left",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === "short" && (
                        <input
                          type="text"
                          value={answers[q.id] || ""}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && questionIndex < questions.length - 1) {
                              setQuestionIndex((i) => i + 1);
                            }
                          }}
                          placeholder="Type your answer..."
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            fontSize: 15,
                            fontFamily: "'DM Sans', sans-serif",
                            borderRadius: 10,
                            border: `2px solid ${BORDER}`,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                          onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                          onBlur={(e) => (e.target.style.borderColor = BORDER)}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Navigation */}
                <div style={{ display: "flex", gap: 12, marginTop: 28, alignItems: "center" }}>
                  {questionIndex > 0 && (
                    <button
                      onClick={() => setQuestionIndex((i) => i - 1)}
                      style={{
                        padding: "10px 20px",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        background: SURFACE,
                        color: "#787774",
                        fontSize: 14,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      &larr; Back
                    </button>
                  )}
                  {questionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setQuestionIndex((i) => i + 1)}
                      style={{
                        padding: "10px 24px",
                        border: "none",
                        borderRadius: 10,
                        background: PRIMARY,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Next &rarr;
                    </button>
                  ) : (
                    <button
                      onClick={handleCompile}
                      style={{
                        padding: "10px 28px",
                        border: "none",
                        borderRadius: 10,
                        background: PRIMARY,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Build my plan &rarr;
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setAnswers({});
                      handleCompile();
                    }}
                    style={{
                      padding: "10px 16px",
                      border: "none",
                      borderRadius: 10,
                      background: "transparent",
                      color: "#aaa",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Skip all
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "20px 0" }}>
                <p style={{ color: "#787774", fontSize: 14, marginBottom: 12 }}>
                  Couldn&apos;t generate questions — you can skip ahead or try again.
                </p>
                {clarifyError && (
                  <div style={{
                    fontSize: 11,
                    color: TEXT_LIGHT,
                    fontFamily: "'DM Mono', monospace",
                    background: "#f5f5f5",
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 16,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 100,
                    overflow: "auto",
                  }}>
                    {clarifyError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleCompile}
                    style={{
                      padding: "10px 24px",
                      border: "none",
                      borderRadius: 10,
                      background: PRIMARY,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Skip to plan &rarr;
                  </button>
                  <button
                    onClick={handleClarify}
                    style={{
                      padding: "10px 20px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: SURFACE,
                      color: "#787774",
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── COMPILING ─── */}
        {step === "compiling" && (
          <div>
            {compileStatus.startsWith("error:") ? (
              <div>
                <div style={{
                  background: SURFACE,
                  borderRadius: 12,
                  padding: 20,
                  border: `1px solid ${BORDER}`,
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#CF522E" }}>
                    Plan generation failed
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.5, fontFamily: "'DM Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                    {compileStatus.slice(6)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleCompile}
                    style={{
                      padding: "10px 24px",
                      border: "none",
                      borderRadius: 10,
                      background: PRIMARY,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => setStep("input")}
                    style={{
                      padding: "10px 20px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: SURFACE,
                      color: "#787774",
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Edit brief
                  </button>
                </div>
                {thinkingText && (
                  <div style={{ marginTop: 16 }}>
                    <ThinkingTerminal text={thinkingText} />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        border: `3px solid ${PRIMARY}`,
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{compileStatus}</span>
                  </div>
                  <span style={{ fontSize: 13, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums" }}>
                    {elapsed}s
                  </span>
                </div>
                <ThinkingTerminal text={thinkingText} />
              </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ─── REVEAL ─── */}
        {step === "reveal" && plan && (() => {
          // Find the "one thing" — energy-aware task selection
          const allCurrentTasks = getAllTasks(currentNodes);
          const pendingHumanTasks = allCurrentTasks.filter(
            (t) => t.status === "pending" && (t.assignee === "user" || t.assignee === "hybrid")
          );
          // If user picked an energy level, prefer matching tasks
          let oneThingTask: Task | undefined;
          if (currentEnergy && pendingHumanTasks.length > 0) {
            oneThingTask = pendingHumanTasks.find((t) => t.energy === currentEnergy)
              || pendingHumanTasks[0];
          } else {
            oneThingTask = pendingHumanTasks[0] || allCurrentTasks.find((t) => t.status === "pending");
          }
          const allDone = allCurrentTasks.every((t) => doneIds.has(t.id));

          return (
          <div>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setRevealMode("onething")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: revealMode === "onething" ? `2px solid ${PRIMARY}` : "2px solid #e8e6f0",
                  background: revealMode === "onething" ? `${PRIMARY}0a` : "#fff",
                  color: revealMode === "onething" ? PRIMARY : "#666",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                One Thing at a Time
              </button>
              <button
                onClick={() => setRevealMode("project")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: revealMode === "project" ? `2px solid ${PRIMARY}` : "2px solid #e8e6f0",
                  background: revealMode === "project" ? `${PRIMARY}0a` : "#fff",
                  color: revealMode === "project" ? PRIMARY : "#666",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Full Project
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: TEXT_LIGHT, alignSelf: "center" }}>
                {doneCount}/{total} done
              </span>
            </div>

            {/* ─── ONE THING MODE ─── */}
            {revealMode === "onething" && (
              <div>
                {/* Encouragement toast */}
                {showEncouragement && (
                  <div style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "#2DA44E12",
                    border: "1px solid #2DA44E30",
                    color: "#2DA44E",
                    fontSize: 14,
                    fontWeight: 500,
                    marginBottom: 16,
                    textAlign: "center",
                    animation: "fadeIn 0.3s ease",
                  }}>
                    {showEncouragement}
                    {streak >= 2 && streak <= 5 && (
                      <span style={{ display: "block", fontSize: 12, marginTop: 2, opacity: 0.8 }}>
                        {streakEncouragements[streak] || `${streak} tasks in a row!`}
                      </span>
                    )}
                    {streak > 5 && (
                      <span style={{ display: "block", fontSize: 12, marginTop: 2, opacity: 0.8 }}>
                        {streak} tasks straight. You&apos;re unstoppable.
                      </span>
                    )}
                  </div>
                )}

                {/* Break reminder */}
                {showBreakReminder && !showEncouragement && (
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "#D4A72C0a",
                    border: "1px solid #D4A72C25",
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#D4A72C" }}>
                        Nice streak! Maybe take a quick break?
                      </div>
                      <div style={{ fontSize: 12, color: TEXT_LIGHT }}>
                        You&apos;ve done {streak} tasks. A short break helps you stay focused.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBreakReminder(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: TEXT_LIGHT,
                        fontSize: 18,
                        cursor: "pointer",
                        padding: "0 4px",
                      }}
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Progress bar with streak dots */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div
                    style={{
                      flex: 1,
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
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {doneCount} of {total}
                  </span>
                </div>

                {/* Energy check-in (only show if multiple tasks available) */}
                {pendingHumanTasks.length > 1 && !allDone && (
                  <div style={{
                    marginBottom: 20,
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 8 }}>
                      How&apos;s your energy right now?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {([
                        { level: "low" as Energy, label: "Low — give me something easy", color: "#2DA44E" },
                        { level: "medium" as Energy, label: "Okay — moderate is fine", color: "#D4A72C" },
                        { level: "high" as Energy, label: "Good — bring it on", color: "#CF522E" },
                      ]).map(({ level, label, color }) => (
                        <button
                          key={level}
                          onClick={() => setCurrentEnergy(level)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: currentEnergy === level ? `2px solid ${color}` : `1px solid ${BORDER}`,
                            background: currentEnergy === level ? `${color}0a` : "transparent",
                            color: currentEnergy === level ? color : TEXT_LIGHT,
                            fontSize: 12,
                            fontWeight: currentEnergy === level ? 600 : 400,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ display: "block", width: 8, height: 8, borderRadius: "50%", background: color, margin: "0 auto 4px" }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {allDone ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F389;</div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>All done!</h2>
                    <p style={{ color: "#787774", fontSize: 15, marginBottom: 4 }}>
                      Every task in your plan is complete.
                    </p>
                    {streak > 0 && (
                      <p style={{ color: "#2DA44E", fontSize: 14, fontWeight: 500 }}>
                        You completed {streak} task{streak !== 1 ? "s" : ""} this session.
                      </p>
                    )}
                    <button
                      onClick={() => setRevealMode("project")}
                      style={{
                        marginTop: 16,
                        padding: "10px 24px",
                        border: `1px solid ${PRIMARY}`,
                        borderRadius: 10,
                        background: "transparent",
                        color: PRIMARY,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      View full project
                    </button>
                  </div>
                ) : oneThingTask ? (
                  <div>
                    {/* Gentle, focused header */}
                    <div style={{ fontSize: 14, color: TEXT_LIGHT, marginBottom: 4 }}>
                      {oneThingTask.assignee === "user" ? "Focus on this one thing:" : "Next up:"}
                    </div>
                    {oneThingTask.energy && (
                      <div style={{ fontSize: 11, color: ENERGY_COLORS[oneThingTask.energy], marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ENERGY_COLORS[oneThingTask.energy] }} />
                        {oneThingTask.energy === "low" ? "Quick one" : oneThingTask.energy === "medium" ? "Moderate effort" : "This one takes focus"}
                      </div>
                    )}
                    <TaskCard
                      task={oneThingTask}
                      result={results[oneThingTask.id]}
                      onMarkDone={markDone}
                      onRunAgent={handleRunAgent}
                      onAddNote={addNote}
                      projectSummary={plan?.summary || brief}
                      autoExpandSubtasks
                      doneSubtaskIds={doneSubtaskIds}
                      onToggleSubtask={toggleSubtask}
                      priorResults={allTasks
                        .filter((t) => results[t.id]?.done)
                        .map((t) => ({
                          title: t.title,
                          assignee: t.assignee,
                          output: results[t.id]?.finalOutput || results[t.id]?.steps
                            ?.filter((s) => s.type === "output")
                            .map((s) => s.type === "output" ? s.content : "")
                            .join("\n") || "",
                        }))}
                      allTasksList={allTasks}
                      executionMode={executionMode}
                    />

                    {/* "I'm stuck" button — opens chat with a gentler first message */}
                    {oneThingTask.assignee === "user" && (
                      <div style={{ marginTop: 12, textAlign: "center" }}>
                        <button
                          onClick={() => {
                            // This opens the task chat if not already open
                            const chatBtn = document.querySelector(`[data-task-chat="${oneThingTask.id}"]`) as HTMLButtonElement;
                            if (chatBtn) chatBtn.click();
                          }}
                          style={{
                            background: "none",
                            border: `1px dashed ${BORDER}`,
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 12,
                            color: TEXT_LIGHT,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Feeling stuck? Get help breaking this down further
                        </button>
                      </div>
                    )}

                    {/* What's happening in the background */}
                    {runningCount > 0 && (
                      <div
                        style={{
                          marginTop: 16,
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: `${PRIMARY}08`,
                          border: `1px solid ${PRIMARY}20`,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: PRIMARY,
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "#787774" }}>
                          {runningCount === 1 ? "Agent is working on a task" : `${runningCount} agents working`} in the background...
                        </span>
                      </div>
                    )}

                    {/* Up next preview */}
                    {(() => {
                      const pendingAfter = allCurrentTasks.filter(
                        (t) => t.status === "pending" && t.id !== oneThingTask.id && (t.assignee === "user" || t.assignee === "hybrid")
                      );
                      if (pendingAfter.length === 0) return null;
                      return (
                        <div style={{ marginTop: 24 }}>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Up next
                          </div>
                          {pendingAfter.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                marginBottom: 6,
                                fontSize: 13,
                                color: TEXT_LIGHT,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: ENERGY_COLORS[t.energy],
                              }} />
                              {t.title}
                            </div>
                          ))}
                          {pendingAfter.length > 2 && (
                            <div style={{ fontSize: 12, color: "#ccc", paddingLeft: 12 }}>
                              +{pendingAfter.length - 2} more
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{ padding: "20px 0" }}>
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <div style={{ fontSize: 14, color: TEXT_LIGHT, marginBottom: 4 }}>
                        No tasks need your attention right now.
                      </div>
                      {runningCount > 0 && (
                        <div style={{ fontSize: 13, color: PRIMARY, fontWeight: 500 }}>
                          {runningCount === 1 ? "An agent is working on a task..." : `${runningCount} agents are working...`}
                        </div>
                      )}
                      {runningCount === 0 && (
                        <div style={{ fontSize: 13, color: TEXT_LIGHT }}>
                          Waiting for dependencies to unlock new tasks.
                        </div>
                      )}
                    </div>

                    {/* Show what agents are currently working on */}
                    {(() => {
                      const agentWorking = allCurrentTasks.filter(
                        (t) => t.assignee === "agent" && t.status === "pending" && results[t.id]
                      );
                      if (agentWorking.length === 0) return null;
                      return (
                        <div>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Agents working on
                          </div>
                          {agentWorking.map((t) => (
                            <div
                              key={t.id}
                              style={{
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 8,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, animation: "pulse 1.5s ease-in-out infinite" }} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                              </div>
                              {results[t.id] && (
                                <div style={{
                                  fontSize: 12,
                                  color: TEXT_LIGHT,
                                  background: "#1C1C1E",
                                  borderRadius: 6,
                                  padding: 10,
                                  maxHeight: 80,
                                  overflow: "hidden",
                                  fontFamily: "'DM Mono', monospace",
                                }}>
                                  {results[t.id].steps
                                    .filter((s) => s.type === "thinking")
                                    .map((s) => s.type === "thinking" ? s.text : "")
                                    .join("")
                                    .slice(-200) || "Starting..."}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Show upcoming human tasks so user knows what's next */}
                    {(() => {
                      const lockedHumanTasks = allCurrentTasks.filter(
                        (t) => t.status === "locked" && (t.assignee === "user" || t.assignee === "hybrid")
                      );
                      if (lockedHumanTasks.length === 0) return null;
                      return (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Coming up for you
                          </div>
                          {lockedHumanTasks.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                marginBottom: 6,
                                fontSize: 13,
                                color: TEXT_LIGHT,
                                opacity: 0.6,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              &#x1F512; {t.title}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
              </div>
            )}

            {/* ─── FULL PROJECT MODE ─── */}
            {revealMode === "project" && (
              <div>
                {/* Summary card */}
                <div
                  style={{
                    background: SURFACE,
                    borderRadius: 14,
                    padding: 22,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 24,
                  }}
                >
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
                    {plan.project_title}
                  </h2>
                  <p style={{ fontSize: 14, color: "#787774", lineHeight: 1.6, marginBottom: 14 }}>
                    {plan.summary}
                  </p>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: TEXT_LIGHT, flexWrap: "wrap", alignItems: "center" }}>
                    {claudeCodeCount > 0 && (
                      <span>
                        <strong style={{ color: "#C4841D" }}>{claudeCodeCount}</strong> Claude Code
                      </span>
                    )}
                    {builtinAgentCount > 0 && (
                      <span>
                        <strong style={{ color: PRIMARY }}>{builtinAgentCount}</strong> agent
                      </span>
                    )}
                    <span>
                      <strong style={{ color: "#C4841D" }}>{hybridCount}</strong> hybrid
                    </span>
                    <span>
                      <strong style={{ color: "#787774" }}>{userCount}</strong> you
                    </span>
                    <span>
                      <strong style={{ color: TEXT }}>{total}</strong> total
                    </span>
                    {executionMode === "byo" && (
                      <span
                        style={{
                          padding: "2px 8px", borderRadius: 5,
                          background: "#E8F0FE", color: "#1967D2",
                          fontSize: 11, fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => setExecutionMode("api")}
                        title="Click to switch to API mode (agents run automatically)"
                      >
                        BYO mode — click to switch
                      </span>
                    )}
                    {executionMode === "api" && (claudeCodeCount > 0 || builtinAgentCount > 0) && (
                      <span
                        style={{
                          padding: "2px 8px", borderRadius: 5,
                          background: `${PRIMARY}14`, color: PRIMARY,
                          fontSize: 11, fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => setExecutionMode("byo")}
                        title="Switch to BYO mode — run agent tasks in your own Claude Code"
                      >
                        Have Claude Code? Switch to BYO
                      </span>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Effort</span>
                    {(["all", "high", "medium", "low"] as const).map((e) => (
                      <button
                        key={e}
                        onClick={() => setEnergyFilter(e)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: energyFilter === e ? (e === "all" ? PRIMARY : ENERGY_COLORS[e]) : BORDER,
                          color: energyFilter === e ? "#fff" : "#666",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Who</span>
                    {([
                      { key: "all" as const, label: "All" },
                      { key: "agent" as const, label: "\u26A1 Agent" },
                      { key: "hybrid" as const, label: "\uD83E\uDD1D Hybrid" },
                      { key: "user" as const, label: "\uD83D\uDC64 You" },
                    ]).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setAssigneeFilter(f.key)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: assigneeFilter === f.key ? PRIMARY : BORDER,
                          color: assigneeFilter === f.key ? "#fff" : "#666",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DAG view */}
                <DagView
                  nodes={currentNodes}
                  energyFilter={energyFilter}
                  assigneeFilter={assigneeFilter}
                  results={results}
                  onMarkDone={markDone}
                  onRunAgent={handleRunAgent}
                  onAddNote={addNote}
                  projectSummary={plan?.summary || brief}
                  doneSubtaskIds={doneSubtaskIds}
                  onToggleSubtask={toggleSubtask}
                  allTasks={allTasks}
                  executionMode={executionMode}
                />
              </div>
            )}
          </div>
          );
        })()}
      </main>
    </div>
  );
}

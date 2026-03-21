"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type Plan,
  type DagNode,
  type Task,
  type Subtask,
  type Energy,
  type Assignee,
  getAllTasks,
  computeUnlocked,
} from "@/lib/dag";
import { useAgentExecutor, type AgentResult, type AgentStep } from "@/hooks/useAgentExecutor";
import { useAuth } from "@/hooks/useAuth";
import { usePlanStorage } from "@/hooks/usePlanStorage";
import { useVoiceInput } from "@/hooks/useVoiceInput";

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
}: {
  plan: Plan | null;
  doneCount: number;
  total: number;
  running: string | null;
  runningCount: number;
  userEmail?: string;
  onSignOut?: () => void;
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
        <span style={{ fontSize: 22, fontWeight: 700, color: PRIMARY }}>LetsBegin</span>
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
  const isClaude = result.model === "claude-sonnet";
  const badgeBg = isClaude ? "#FDF6EE" : "#F0EFEB";
  const badgeColor = isClaude ? "#C4841D" : PRIMARY;
  const badgeLabel = isClaude ? "Claude Sonnet" : "Gemini Flash";

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

function TaskCard({
  task,
  result,
  onMarkDone,
  onRunAgent,
  projectSummary,
  autoExpandSubtasks = false,
  doneSubtaskIds,
  onToggleSubtask,
  priorResults,
  allTasksList,
}: {
  task: Task;
  result?: AgentResult;
  onMarkDone: (id: string) => void;
  onRunAgent: (task: Task, force?: boolean) => void;
  projectSummary: string;
  autoExpandSubtasks?: boolean;
  doneSubtaskIds: Set<string>;
  onToggleSubtask: (id: string) => void;
  priorResults: PriorResult[];
  allTasksList?: Task[];
}) {
  const isLocked = task.status === "locked";
  const isDone = task.status === "done";
  const isPending = task.status === "pending";
  const [doneExpanded, setDoneExpanded] = useState(false);

  const assigneeConfig = {
    agent: { icon: "\u26A1", label: "Agent", bg: `${PRIMARY}18`, color: PRIMARY },
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

      {isPending && !result && task.assignee === "agent" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PRIMARY }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, animation: "pulse 1.5s ease-in-out infinite" }} />
          Running automatically...
        </div>
      )}
      {isPending && !result && task.assignee === "hybrid" && (
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
      {isPending && !result && task.assignee === "user" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => onMarkDone(task.id)}
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
  projectSummary,
  doneSubtaskIds,
  onToggleSubtask,
  allTasks,
}: {
  nodes: DagNode[];
  energyFilter: Energy | "all";
  assigneeFilter: Assignee | "all";
  results: Record<string, AgentResult>;
  onMarkDone: (id: string) => void;
  onRunAgent: (task: Task, force?: boolean) => void;
  projectSummary: string;
  doneSubtaskIds: Set<string>;
  onToggleSubtask: (id: string) => void;
  allTasks: Task[];
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
                projectSummary={projectSummary}
                doneSubtaskIds={doneSubtaskIds}
                onToggleSubtask={onToggleSubtask}
                priorResults={priorResults}
                allTasksList={allTasks}
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
                    projectSummary={projectSummary}
                    doneSubtaskIds={doneSubtaskIds}
                    onToggleSubtask={onToggleSubtask}
                    priorResults={priorResults}
                    allTasksList={allTasks}
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

// ─── Main Page ───

type ClarifyQuestion = {
  id: string;
  question: string;
  type: "yes_no" | "choice" | "short";
  options?: string[];
};

type Step = "input" | "clarify" | "compiling" | "reveal";

export default function Home() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signOut, configured: authConfigured } = useAuth();
  const { savePlan, loadPlans, updateProgress } = usePlanStorage(user?.id);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("input");
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

  const { execute, results, running, runningCount } = useAgentExecutor();

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

  const markDone = useCallback(
    (id: string) => {
      setDoneIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    []
  );

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

  // Auto-run agent tasks when they become unblocked
  const currentTasksForAutoRun = getAllTasks(currentNodes);
  useEffect(() => {
    if (step !== "reveal" || !plan) return;

    for (const task of currentTasksForAutoRun) {
      if (
        task.assignee === "agent" &&
        task.status === "pending" &&
        !results[task.id] &&
        !launchedAgentTasks.current.has(task.id)
      ) {
        launchedAgentTasks.current.add(task.id);
        // Stagger launches slightly to avoid hammering the API
        setTimeout(() => {
          execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee);
        }, launchedAgentTasks.current.size * 500);
      }
    }
  }, [currentTasksForAutoRun, step, plan, results, execute, brief]);

  const handleRunAgent = (task: Task, force?: boolean) => {
    launchedAgentTasks.current.add(task.id);
    execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee, force);
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
    return enriched;
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
              setPlan(event.plan);
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

  const agentCount = allTasks.filter((t) => t.assignee === "agent").length;
  const hybridCount = allTasks.filter((t) => t.assignee === "hybrid").length;
  const userCount = allTasks.filter((t) => t.assignee === "user").length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header plan={plan} doneCount={doneCount} total={total} running={running} runningCount={runningCount} userEmail={user?.email} onSignOut={signOut} />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
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
              what to do next. LetsBegin coordinates — it builds a plan where agents
              work in the background while you get guided through your part, one
              thing at a time.
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
                  desc: "AI compiles a real plan — not a to-do list. Tasks that can run in parallel do, and nothing blocks unnecessarily.",
                },
                {
                  num: "3",
                  title: "You and AI, in parallel",
                  desc: "Agents auto-run their tasks while you focus on yours. One thing at a time, never overwhelmed.",
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
                  just the code parts. It knows when a human needs to sign up for an account,
                  make a decision, or review a draft.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike task managers:</strong> Tasks actually get done. Agents auto-execute
                  their work in the background while you focus on what only you can do.
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Designed for real humans:</strong> One task at a time. Step-by-step
                  guidance when you need it. Big tasks broken into small, concrete actions. Built
                  for people who find it hard to start, not just people who want to go faster.
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
                Images will be analyzed by Gemini to understand your project context.
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
          // Find the "one thing" — first pending task for the user to act on
          const allCurrentTasks = getAllTasks(currentNodes);
          const oneThingTask = allCurrentTasks.find(
            (t) => t.status === "pending" && (t.assignee === "user" || t.assignee === "hybrid")
          ) || allCurrentTasks.find(
            (t) => t.status === "pending"
          );
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
                {/* Compact progress bar */}
                <div
                  style={{
                    width: "100%",
                    height: 4,
                    background: BORDER,
                    borderRadius: 2,
                    overflow: "hidden",
                    marginBottom: 28,
                  }}
                >
                  <div
                    style={{
                      width: `${total > 0 ? (doneCount / total) * 100 : 0}%`,
                      height: "100%",
                      background: PRIMARY,
                      borderRadius: 2,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>

                {allDone ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F389;</div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>All done!</h2>
                    <p style={{ color: "#787774", fontSize: 15 }}>
                      Every task in your plan is complete.
                    </p>
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
                    <div style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 8 }}>
                      Your next task:
                    </div>
                    <TaskCard
                      task={oneThingTask}
                      result={results[oneThingTask.id]}
                      onMarkDone={markDone}
                      onRunAgent={handleRunAgent}
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
                    />

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
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: TEXT_LIGHT }}>
                    <span>
                      <strong style={{ color: PRIMARY }}>{agentCount}</strong> agent
                    </span>
                    <span>
                      <strong style={{ color: "#C4841D" }}>{hybridCount}</strong> hybrid
                    </span>
                    <span>
                      <strong style={{ color: "#787774" }}>{userCount}</strong> you
                    </span>
                    <span>
                      <strong style={{ color: TEXT }}>{total}</strong> total
                    </span>
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
                  projectSummary={plan?.summary || brief}
                  doneSubtaskIds={doneSubtaskIds}
                  onToggleSubtask={toggleSubtask}
                  allTasks={allTasks}
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

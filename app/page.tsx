"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type Plan,
  type DagNode,
  type Task,
  type Energy,
  type Status,
  getAllTasks,
  computeUnlocked,
  findNextActive,
} from "@/lib/dag";
import { useAgentExecutor, type AgentResult, type AgentStep } from "@/hooks/useAgentExecutor";

const PRIMARY = "#5b4bdb";
const BG = "#f8f7ff";
const ENERGY_COLORS: Record<Energy, string> = {
  high: "#e85d24",
  medium: "#d4a017",
  low: "#2a9d6e",
};

// ─── Header ───

function Header({
  plan,
  doneCount,
  total,
  running,
}: {
  plan: Plan | null;
  doneCount: number;
  total: number;
  running: string | null;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 32px",
        borderBottom: "1px solid #e8e6f0",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: PRIMARY }}>LetsBegin</span>
        {plan && (
          <span style={{ fontSize: 14, color: "#666", fontWeight: 500 }}>
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
                background: "#e8e6f0",
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
            <span style={{ fontSize: 13, color: "#888" }}>
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
            <span style={{ fontSize: 12, color: PRIMARY, fontWeight: 500 }}>agent running</span>
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
        background: "#0f0f14",
        color: "#a0f0a0",
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
  showApprove,
}: {
  result: AgentResult;
  onApprove?: () => void;
  showApprove?: boolean;
}) {
  const isClaude = result.model === "claude-sonnet";
  const badgeBg = isClaude ? "#fff8ee" : "#f3f0ff";
  const badgeColor = isClaude ? "#c4841d" : PRIMARY;
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
          background: "#0f0f14",
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
          <span style={{ color: "#a0f0a0", animation: "blink 1s step-end infinite" }}>_</span>
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
              border: s.outputType === "code" ? "none" : "1px solid #e8e6f0",
            }}
          >
            {s.outputType === "code" ? (
              <div>
                {s.filename && (
                  <div
                    style={{
                      background: "#1a1a22",
                      padding: "6px 12px",
                      fontSize: 11,
                      color: "#888",
                      borderBottom: "1px solid #2a2a35",
                    }}
                  >
                    {s.filename}
                  </div>
                )}
                <pre
                  style={{
                    background: "#1a1a22",
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
                  background: "#fff",
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {s.content}
              </div>
            )}
          </div>
        ))}
      {result.error && (
        <div style={{ color: "#e85d24", fontSize: 12, marginTop: 8 }}>Error: {result.error}</div>
      )}
      {showApprove && result.done && onApprove && (
        <button
          onClick={onApprove}
          style={{
            marginTop: 10,
            padding: "8px 18px",
            border: "none",
            borderRadius: 8,
            background: "#c4841d",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Looks good, continue &rarr;
        </button>
      )}
    </div>
  );
}

function StepLine({ step }: { step: AgentStep }) {
  if (step.type === "thinking") {
    return <div style={{ color: "#9cceaa" }}>{step.text}</div>;
  }
  if (step.type === "tool_call") {
    return (
      <div style={{ color: "#f0c060" }}>
        &gt; {step.summary}
      </div>
    );
  }
  return null;
}

// ─── TaskCard ───

function TaskCard({
  task,
  result,
  onMarkDone,
  onRunAgent,
}: {
  task: Task;
  result?: AgentResult;
  onMarkDone: (id: string) => void;
  onRunAgent: (task: Task) => void;
}) {
  const isLocked = task.status === "locked";
  const isDone = task.status === "done";
  const isPending = task.status === "pending";

  const assigneeConfig = {
    agent: { icon: "\u26A1", label: "Agent", bg: `${PRIMARY}18`, color: PRIMARY },
    user: { icon: "\uD83D\uDC64", label: "You", bg: "#e8e6f0", color: "#666" },
    hybrid: { icon: "\uD83E\uDD1D", label: "Review", bg: "#d4a01718", color: "#d4a017" },
  }[task.assignee];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 18,
        border: "1px solid #e8e6f0",
        opacity: isLocked ? 0.32 : isDone ? 0.45 : 1,
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
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: ENERGY_COLORS[task.energy],
              display: "inline-block",
            }}
            title={`${task.energy} energy`}
          />
        </div>
        {isLocked && <span style={{ fontSize: 14 }}>&#x1F512;</span>}
        {isDone && <span style={{ fontSize: 14, color: "#2a9d6e" }}>&checkmark;</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
      <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5, marginBottom: 10 }}>
        {task.description}
      </div>

      {isPending && !result && (task.assignee === "agent" || task.assignee === "hybrid") && (
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
          &#x26A1; Run agent &rarr;
        </button>
      )}
      {isPending && !result && task.assignee === "user" && (
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
      )}

      {result && task.assignee === "hybrid" && (
        <AgentPanel
          result={result}
          showApprove
          onApprove={() => onMarkDone(task.id)}
        />
      )}
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
  results,
  onMarkDone,
  onRunAgent,
}: {
  nodes: DagNode[];
  energyFilter: Energy | "all";
  results: Record<string, AgentResult>;
  onMarkDone: (id: string) => void;
  onRunAgent: (task: Task) => void;
}) {
  const [view, setView] = useState<"steps" | "graph">("steps");

  const filteredNodes = energyFilter === "all"
    ? nodes
    : nodes
        .map((n) => {
          if (n.type === "task") return n.energy === energyFilter ? n : null;
          const filtered = n.children.filter((c) => c.energy === energyFilter);
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
            background: view === "steps" ? PRIMARY : "#e8e6f0",
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
            background: view === "graph" ? PRIMARY : "#e8e6f0",
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

      {view === "steps" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredNodes.map((node) => {
            if (node.type === "task") {
              return (
                <TaskCard
                  key={node.id}
                  task={node}
                  result={results[node.id]}
                  onMarkDone={onMarkDone}
                  onRunAgent={onRunAgent}
                />
              );
            }
            return (
              <div key={node.id}>
                <div
                  style={{
                    textAlign: "center",
                    color: "#999",
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
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
        background: "#0f0f14",
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

type Step = "input" | "calibrate" | "compiling" | "reveal";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [brief, setBrief] = useState("");
  const [authority, setAuthority] = useState<"minimal" | "moderate" | "high">("moderate");
  const [thinkingText, setThinkingText] = useState("");
  const [compileStatus, setCompileStatus] = useState("");
  const [compileStartTime, setCompileStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [energyFilter, setEnergyFilter] = useState<Energy | "all">("all");

  const { execute, results, running } = useAgentExecutor();

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

  const handleRunAgent = (task: Task) => {
    execute(task.id, task.title, task.description, plan?.summary || brief);
  };

  const handleCompile = async () => {
    setStep("compiling");
    setThinkingText("");
    setCompileStatus("Thinking through your brief...");
    setCompileStartTime(Date.now());
    setElapsed(0);

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, authority }),
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
            } else if (event.type === "error") {
              console.error("Compile error:", event.text);
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
      setStep("calibrate");
    }
  };

  const agentCount = allTasks.filter((t) => t.assignee === "agent").length;
  const hybridCount = allTasks.filter((t) => t.assignee === "hybrid").length;
  const userCount = allTasks.filter((t) => t.assignee === "user").length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header plan={plan} doneCount={doneCount} total={total} running={running} />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        {/* ─── INPUT ─── */}
        {step === "input" && (
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>
              What are we building?
            </h1>
            <p style={{ color: "#666", fontSize: 16, marginBottom: 28, lineHeight: 1.6 }}>
              Most AI tools do the work <em>for you</em>{" "}
              or leave you to figure it out alone. LetsBegin does neither — it
              splits your project into a clear plan where you and the AI each
              handle what you&apos;re best at, one task at a time.
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
                  desc: "Paste your goal in plain language. No structure needed.",
                },
                {
                  num: "2",
                  title: "Get a real plan",
                  desc: "AI compiles a dependency-aware task graph — computed once, not regenerated.",
                },
                {
                  num: "3",
                  title: "Work through it together",
                  desc: "Each task is tagged: AI handles it, you handle it, or AI drafts and you review.",
                },
              ].map((s) => (
                <div
                  key={s.num}
                  style={{
                    background: "#fff",
                    borderRadius: 10,
                    padding: "16px 14px",
                    border: "1px solid #e8e6f0",
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
                  <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>

            <details
              style={{
                marginBottom: 28,
                background: "#fff",
                borderRadius: 10,
                border: "1px solid #e8e6f0",
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
                How is this different? &darr;
              </summary>
              <div style={{ paddingBottom: 16, fontSize: 13, color: "#555", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>You never lose the big picture.</strong> A progress bar tracks
                  where you are across the whole project — not just the current chat turn.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Dependencies keep you unblocked.</strong> Tasks are organized as a
                  graph, not a list. When one task is done, the next ones that depend on it
                  unlock automatically. Parallel tasks show up together so you can tackle
                  them in any order.
                </p>
                <p style={{ margin: 0 }}>
                  <strong>The plan is stable.</strong> Your task graph is compiled once from
                  your brief — it doesn&apos;t shift every time the AI responds. You decide
                  how much the agent handles, and you always review before anything moves forward.
                </p>
              </div>
            </details>

            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Submit my app to the App Store for the first time..."
              style={{
                width: "100%",
                minHeight: 140,
                padding: 16,
                fontSize: 15,
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 12,
                border: "2px solid #e8e6f0",
                background: "#fff",
                outline: "none",
                resize: "vertical",
                lineHeight: 1.6,
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
              onBlur={(e) => (e.target.style.borderColor = "#e8e6f0")}
            />
            <button
              onClick={() => setStep("calibrate")}
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

        {/* ─── CALIBRATE ─── */}
        {step === "calibrate" && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
              How much should the agent do?
            </h2>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 18,
                border: "1px solid #e8e6f0",
                marginBottom: 20,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#444",
              }}
            >
              <span style={{ fontWeight: 600, color: "#1a1a2e" }}>Your brief: </span>
              {brief}
              <button
                onClick={() => setStep("input")}
                style={{
                  marginLeft: 8,
                  background: "none",
                  border: "none",
                  color: PRIMARY,
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 500,
                  textDecoration: "underline",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                edit
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              {(
                [
                  { key: "minimal", label: "Guide me", desc: "I do most of the work" },
                  { key: "moderate", label: "Balanced", desc: "We split the work" },
                  { key: "high", label: "Automate it", desc: "Agent does most" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setAuthority(opt.key)}
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: 12,
                    border: `2px solid ${authority === opt.key ? PRIMARY : "#e8e6f0"}`,
                    background: authority === opt.key ? `${PRIMARY}0a` : "#fff",
                    cursor: "pointer",
                    textAlign: "center",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            <button
              onClick={handleCompile}
              style={{
                padding: "12px 32px",
                border: "none",
                borderRadius: 10,
                background: PRIMARY,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Build my plan &rarr;
            </button>
          </div>
        )}

        {/* ─── COMPILING ─── */}
        {step === "compiling" && (
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
              <span style={{ fontSize: 13, color: "#999", fontVariantNumeric: "tabular-nums" }}>
                {elapsed}s
              </span>
            </div>
            <ThinkingTerminal text={thinkingText} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ─── REVEAL ─── */}
        {step === "reveal" && plan && (
          <div>
            {/* Summary card */}
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 22,
                border: "1px solid #e8e6f0",
                marginBottom: 24,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
                {plan.project_title}
              </h2>
              <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, marginBottom: 14 }}>
                {plan.summary}
              </p>
              <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#888" }}>
                <span>
                  <strong style={{ color: PRIMARY }}>{agentCount}</strong> agent
                </span>
                <span>
                  <strong style={{ color: "#d4a017" }}>{hybridCount}</strong> hybrid
                </span>
                <span>
                  <strong style={{ color: "#666" }}>{userCount}</strong> you
                </span>
                <span>
                  <strong style={{ color: "#1a1a2e" }}>{total}</strong> total
                </span>
              </div>
            </div>

            {/* Energy filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["all", "high", "medium", "low"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEnergyFilter(e)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: energyFilter === e ? (e === "all" ? PRIMARY : ENERGY_COLORS[e]) : "#e8e6f0",
                    color: energyFilter === e ? "#fff" : "#666",
                    fontSize: 12,
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

            {/* DAG view */}
            <DagView
              nodes={currentNodes}
              energyFilter={energyFilter}
              results={results}
              onMarkDone={markDone}
              onRunAgent={handleRunAgent}
            />
          </div>
        )}
      </main>
    </div>
  );
}

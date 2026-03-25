"use client";

import { useState } from "react";
import {
  PRIMARY,
  BORDER,
  TEXT_LIGHT,
  ENERGY_COLORS,
  FONT,
  SURFACE,
  TEXT,
} from "@/lib/styles";
import type { ExecutionMode, PriorResult } from "@/lib/styles";
import type { DagNode, Task, Energy, Assignee } from "@/lib/dag";
import { getAllTasks } from "@/lib/dag";
import type { AgentResult } from "@/hooks/useAgentExecutor";
import TaskCard from "@/components/TaskCard";

function assigneeLabel(a: string) {
  return a === "agent" ? "\u26A1 Agent" : a === "user" ? "\uD83D\uDC64 User" : "\uD83E\uDD1D Hybrid";
}

function energyDot(e: Energy) {
  return e === "high" ? "\uD83D\uDD34" : e === "medium" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
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

export function DagView({
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

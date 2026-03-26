"use client";

import { useState, useEffect, useRef } from "react";
import { PRIMARY, BORDER, TEXT, TEXT_LIGHT, SURFACE, ENERGY_COLORS } from "@/lib/styles";
import { ExecutionMode, PriorResult, TaskRouting, UserToolConfig, UserTool, TOOL_CAPABILITIES, routeTask } from "@/lib/styles";
import { Task, Subtask, DagNode, Energy, Assignee, AgentType, ActivityEvent, TaskCategory } from "@/lib/dag";
import { AgentResult, AgentStep } from "@/hooks/useAgentExecutor";
import { AgentPanel } from "@/components/AgentPanel";
import { SubtaskList, SubtaskItem } from "@/components/SubtaskList";
import { TaskChat } from "@/components/TaskChat";
import { ByoAgentPanel } from "@/components/ByoAgentPanel";
import { formatDuration } from "@/lib/utils";

// ─── Helpers ───

// Format deadline as relative time and determine color
function getDeadlineInfo(deadline: string): { label: string; color: string } {
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const hoursUntil = (deadlineMs - now) / (1000 * 60 * 60);

  if (hoursUntil < 0) {
    return { label: "OVERDUE", color: "#D1242F" };
  }
  if (hoursUntil < 24) {
    const h = Math.max(1, Math.round(hoursUntil));
    return { label: `Due in ${h}h`, color: "#D1242F" };
  }
  if (hoursUntil < 48) {
    return { label: "Due tomorrow", color: "#CF6E00" };
  }
  // Show date for further deadlines
  const d = new Date(deadline);
  const label = `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return { label, color: "#787774" };
}

// Map a task to the routing task type based on its properties
function inferTaskType(task: Task): "coding" | "writing" | "research" | "planning" | "review" {
  if (task.agent_type === "claude-code") return "coding";
  if (task.assignee === "hybrid") return "review";
  const lower = (task.title + " " + task.description).toLowerCase();
  if (lower.match(/code|build|implement|debug|deploy|api|endpoint|database|schema|migration/)) return "coding";
  if (lower.match(/research|find|extract|analyze|compare|investigate|survey/)) return "research";
  if (lower.match(/plan|design|architect|strategy|roadmap|outline/)) return "planning";
  if (lower.match(/review|audit|check|evaluate|assess|approve/)) return "review";
  return "writing";
}

export const CATEGORY_ICONS: Record<TaskCategory, string> = {
  coding: "\uD83D\uDCBB",
  writing: "\u270D\uFE0F",
  emails: "\uD83D\uDCE7",
  research: "\uD83D\uDD0D",
  errands: "\uD83D\uDCE6",
  calls: "\uD83D\uDCDE",
  planning: "\uD83D\uDCCB",
  review: "\uD83D\uDC40",
};

export function inferCategory(task: Task): TaskCategory {
  if (task.category) return task.category;
  const inferred = inferTaskType(task);
  return inferred as TaskCategory;
}

// ─── ActivityLog ───

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

// ─── TaskCard ───

export function TaskCard({
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
  userTools,
  onEditTask,
  onDecompose,
  doneIds,
  currentNodes,
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
  userTools?: UserToolConfig;
  onEditTask?: (id: string, updates: { title?: string; description?: string; assignee?: Assignee; agent_type?: AgentType; deadline?: string }) => void;
  onDecompose?: (taskId: string, granularity: "normal" | "detailed" | "tiny") => Promise<void>;
  doneIds?: Set<string>;
  currentNodes?: DagNode[];
}) {
  const isLocked = task.status === "locked";
  const isDone = task.status === "done";
  const isPending = task.status === "pending";
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [noteText, setNoteText] = useState(task.notes || "");
  const [showNotes, setShowNotes] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [showDecompose, setShowDecompose] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [toolOverride, setToolOverride] = useState<UserTool | null>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);

  // ADHD Task Timer
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timerRunning = timerStartedAt !== null;

  useEffect(() => {
    if (timerStartedAt !== null && !isDone) {
      timerRef.current = setInterval(() => {
        setTimerElapsed(Math.floor((Date.now() - timerStartedAt) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerStartedAt, isDone]);

  // Stop timer when task is done
  useEffect(() => {
    if (isDone && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isDone]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const canDecompose = isPending && !isLocked && onDecompose &&
    (task.assignee === "user" || task.assignee === "hybrid") &&
    (!task.subtasks || task.subtasks.length <= 2);

  const handleDecompose = async (granularity: "normal" | "detailed" | "tiny") => {
    if (!onDecompose) return;
    setDecomposing(true);
    try {
      await onDecompose(task.id, granularity);
    } finally {
      setDecomposing(false);
      setShowDecompose(false);
    }
  };

  // Compute per-task routing from user's tool config
  const taskRouting = userTools && userTools.available.length > 0
    ? routeTask(inferTaskType(task), userTools)
    : undefined;

  // Apply tool override if user selected a different tool
  const effectiveRouting: TaskRouting | undefined = toolOverride && userTools
    ? (() => {
        const cap = TOOL_CAPABILITIES[toolOverride];
        return {
          method: cap.isApi ? "api" as const : "byo" as const,
          tool: toolOverride,
          label: cap.label,
          icon: cap.icon,
          promptStyle: cap.promptStyle,
        };
      })()
    : taskRouting;

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
          {isPending && onEditTask && (
            <select
              value={task.assignee}
              onChange={(e) => {
                const newAssignee = e.target.value as Assignee;
                const updates: { assignee: Assignee; agent_type?: AgentType } = { assignee: newAssignee };
                if (newAssignee === "user") updates.agent_type = undefined;
                else if (newAssignee === "agent") updates.agent_type = "builtin";
                onEditTask(task.id, updates);
              }}
              style={{
                fontSize: 10, padding: "1px 2px", borderRadius: 4,
                border: `1px solid ${BORDER}`, background: SURFACE,
                color: TEXT_LIGHT, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <option value="agent">Agent</option>
              <option value="user">You</option>
              <option value="hybrid">Hybrid</option>
            </select>
          )}
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
          {(() => {
            const cat = inferCategory(task);
            return (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: "#78777414",
                  color: "#787774",
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "capitalize",
                }}
              >
                {CATEGORY_ICONS[cat]} {cat}
              </span>
            );
          })()}
          {task.deadline && !editingDeadline && (() => {
            const info = getDeadlineInfo(task.deadline);
            return (
              <span
                onClick={() => { if (isPending && onEditTask) setEditingDeadline(true); }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: `${info.color}14`,
                  color: info.color,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: isPending && onEditTask ? "pointer" : "default",
                }}
              >
                {info.label}
              </span>
            );
          })()}
          {editingDeadline && isPending && onEditTask && (
            <input
              type="date"
              defaultValue={task.deadline ? task.deadline.split("T")[0] : ""}
              autoFocus
              onBlur={(e) => {
                setEditingDeadline(false);
                const val = e.target.value;
                if (val) {
                  onEditTask(task.id, { deadline: new Date(val + "T23:59:59").toISOString() });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingDeadline(false);
              }}
              style={{
                fontSize: 10, padding: "2px 4px", borderRadius: 4,
                border: `1px solid ${PRIMARY}`, outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          )}
        </div>
        {isLocked && <span style={{ fontSize: 14 }}>&#x1F512;</span>}
        {isDone && <span onClick={() => setDoneExpanded(false)} style={{ fontSize: 14, color: "#2DA44E", cursor: "pointer" }}>{"\u2713 \u25BC"}</span>}
      </div>
      {isPending && onEditTask && editingTitle ? (
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => {
            setEditingTitle(false);
            if (editTitle.trim() && editTitle !== task.title) {
              onEditTask(task.id, { title: editTitle.trim() });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setEditTitle(task.title); setEditingTitle(false); }
          }}
          autoFocus
          style={{
            fontSize: 15, fontWeight: 600, marginBottom: 4, width: "100%",
            border: `1px solid ${PRIMARY}`, borderRadius: 6, padding: "2px 6px",
            fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
          }}
        />
      ) : (
        <div
          style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{ cursor: isPending && onEditTask ? "text" : "default" }}
            onClick={() => { if (isPending && onEditTask) { setEditTitle(task.title); setEditingTitle(true); } }}
          >
            {task.title}
          </span>
          {isPending && !isDone && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (timerRunning) {
                    // Pause
                    if (timerRef.current) clearInterval(timerRef.current);
                    timerRef.current = null;
                    setTimerStartedAt(null);
                  } else {
                    // Start (resume from current elapsed)
                    setTimerStartedAt(Date.now() - timerElapsed * 1000);
                  }
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 5,
                  border: `1px solid ${BORDER}`,
                  background: "transparent",
                  color: timerRunning ? PRIMARY : TEXT_LIGHT,
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  flexShrink: 0,
                }}
              >
                {timerRunning ? "Pause" : "Start"}
              </button>
              {timerElapsed > 0 && (
                <span style={{ fontSize: 11, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {formatTimer(timerElapsed)}
                </span>
              )}
            </>
          )}
          {isDone && timerElapsed > 0 && (
            <span style={{ fontSize: 11, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {formatTimer(timerElapsed)}
            </span>
          )}
        </div>
      )}
      {isPending && onEditTask && editingDesc ? (
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onBlur={() => {
            setEditingDesc(false);
            if (editDesc.trim() && editDesc !== task.description) {
              onEditTask(task.id, { description: editDesc.trim() });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setEditDesc(task.description); setEditingDesc(false); }
          }}
          autoFocus
          style={{
            fontSize: 13, color: "#787774", lineHeight: 1.5, marginBottom: 8, width: "100%",
            border: `1px solid ${PRIMARY}`, borderRadius: 6, padding: "4px 6px",
            fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical",
            minHeight: 40, boxSizing: "border-box",
          }}
        />
      ) : (
        <div
          style={{ fontSize: 13, color: "#787774", lineHeight: 1.5, marginBottom: 8, cursor: isPending && onEditTask ? "text" : "default" }}
          onClick={() => { if (isPending && onEditTask) { setEditDesc(task.description); setEditingDesc(true); } }}
        >
          {task.description}
        </div>
      )}

      {/* Break this down button */}
      {canDecompose && !decomposing && (
        <div style={{ marginBottom: 8 }}>
          {!showDecompose ? (
            <button
              onClick={() => setShowDecompose(true)}
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
              Break this down
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: TEXT_LIGHT }}>How small?</span>
              {(["normal", "detailed", "tiny"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => handleDecompose(g)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    border: g === "tiny" ? `1.5px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                    background: g === "tiny" ? `${PRIMARY}10` : "transparent",
                    color: g === "tiny" ? PRIMARY : TEXT_LIGHT,
                    fontSize: 11,
                    fontWeight: g === "tiny" ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {g === "normal" ? "Normal" : g === "detailed" ? "Detailed" : "Tiny steps"}
                </button>
              ))}
              <button
                onClick={() => setShowDecompose(false)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px 4px",
                  fontSize: 11,
                  color: TEXT_LIGHT,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: 0.6,
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {decomposing && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_LIGHT, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: TEXT_LIGHT, animation: "pulse 1.5s ease-in-out infinite" }} />
          Breaking it down...
        </div>
      )}

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
        <>
          {userTools && userTools.available.length > 1 && (
            <div style={{ position: "relative", marginBottom: 8 }}>
              <button
                onClick={() => setShowToolPicker(!showToolPicker)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 99,
                  border: `1px solid ${toolOverride ? PRIMARY : BORDER}`,
                  background: toolOverride ? `${PRIMARY}12` : "transparent",
                  color: toolOverride ? PRIMARY : TEXT_LIGHT,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {effectiveRouting?.icon} {effectiveRouting?.label}
                <span style={{ fontSize: 9, marginLeft: 2 }}>{showToolPicker ? "\u25B2" : "\u25BC"}</span>
              </button>
              {showToolPicker && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  zIndex: 10,
                  minWidth: 160,
                  overflow: "hidden",
                }}>
                  {/* Auto option to reset */}
                  <div
                    onClick={() => { setToolOverride(null); setShowToolPicker(false); }}
                    style={{
                      padding: "7px 12px",
                      fontSize: 11,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: !toolOverride ? `${PRIMARY}08` : "transparent",
                      color: !toolOverride ? PRIMARY : TEXT,
                      fontWeight: !toolOverride ? 600 : 400,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {taskRouting?.icon} {taskRouting?.label} <span style={{ color: TEXT_LIGHT, fontSize: 10 }}>(auto)</span>
                  </div>
                  {userTools.available
                    .filter((t) => t !== taskRouting?.tool)
                    .map((tool) => {
                      const cap = TOOL_CAPABILITIES[tool];
                      const isSelected = toolOverride === tool;
                      return (
                        <div
                          key={tool}
                          onClick={() => { setToolOverride(tool); setShowToolPicker(false); }}
                          style={{
                            padding: "7px 12px",
                            fontSize: 11,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: isSelected ? `${PRIMARY}08` : "transparent",
                            color: isSelected ? PRIMARY : TEXT,
                            fontWeight: isSelected ? 600 : 400,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {cap.icon} {cap.label}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
          <ByoAgentPanel
            task={task}
            projectContext={projectSummary}
            priorResults={priorResults}
            onComplete={onMarkDone}
            routing={effectiveRouting}
          />
        </>
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
        <>
          {userTools && userTools.available.length > 1 && (
            <div style={{ position: "relative", marginBottom: 8 }}>
              <button
                onClick={() => setShowToolPicker(!showToolPicker)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 99,
                  border: `1px solid ${toolOverride ? PRIMARY : BORDER}`,
                  background: toolOverride ? `${PRIMARY}12` : "transparent",
                  color: toolOverride ? PRIMARY : TEXT_LIGHT,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {effectiveRouting?.icon} {effectiveRouting?.label}
                <span style={{ fontSize: 9, marginLeft: 2 }}>{showToolPicker ? "\u25B2" : "\u25BC"}</span>
              </button>
              {showToolPicker && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  zIndex: 10,
                  minWidth: 160,
                  overflow: "hidden",
                }}>
                  <div
                    onClick={() => { setToolOverride(null); setShowToolPicker(false); }}
                    style={{
                      padding: "7px 12px",
                      fontSize: 11,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: !toolOverride ? `${PRIMARY}08` : "transparent",
                      color: !toolOverride ? PRIMARY : TEXT,
                      fontWeight: !toolOverride ? 600 : 400,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {taskRouting?.icon} {taskRouting?.label} <span style={{ color: TEXT_LIGHT, fontSize: 10 }}>(auto)</span>
                  </div>
                  {userTools.available
                    .filter((t) => t !== taskRouting?.tool)
                    .map((tool) => {
                      const cap = TOOL_CAPABILITIES[tool];
                      const isSelected = toolOverride === tool;
                      return (
                        <div
                          key={tool}
                          onClick={() => { setToolOverride(tool); setShowToolPicker(false); }}
                          style={{
                            padding: "7px 12px",
                            fontSize: 11,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: isSelected ? `${PRIMARY}08` : "transparent",
                            color: isSelected ? PRIMARY : TEXT,
                            fontWeight: isSelected ? 600 : 400,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {cap.icon} {cap.label}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
          <ByoAgentPanel
            task={task}
            projectContext={projectSummary}
            priorResults={priorResults}
            onComplete={onMarkDone}
            routing={effectiveRouting}
          />
        </>
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
        <TaskChat task={task} projectSummary={projectSummary} priorResults={priorResults} allTasks={allTasksList} doneIds={doneIds} currentNodes={currentNodes} />
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

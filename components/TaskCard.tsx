"use client";

import { useState } from "react";
import { PRIMARY, BORDER, TEXT, TEXT_LIGHT, SURFACE, ENERGY_COLORS, FONT } from "@/lib/styles";
import { ExecutionMode, PriorResult } from "@/lib/styles";
import { Task, Subtask, DagNode, Energy, AgentType, ActivityEvent } from "@/lib/dag";
import { AgentResult, AgentStep } from "@/hooks/useAgentExecutor";
import { AgentPanel } from "@/components/AgentPanel";
import { SubtaskList } from "@/components/SubtaskList";
import { TaskChat } from "@/components/TaskChat";
import { ByoAgentPanel } from "@/components/ByoAgentPanel";

// ─── Helpers ───

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
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

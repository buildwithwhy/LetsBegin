"use client";

import { useState } from "react";
import { PRIMARY, BORDER, TEXT_LIGHT } from "@/lib/styles";
import { Subtask } from "@/lib/dag";

export function SubtaskItem({ st, done, onToggle }: { st: Subtask; done: boolean; onToggle: (id: string) => void }) {
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

export function SubtaskList({
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

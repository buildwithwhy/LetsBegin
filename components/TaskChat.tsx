"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { PRIMARY, BORDER, TEXT_LIGHT, SURFACE, TEXT } from "@/lib/styles";
import type { PriorResult } from "@/lib/styles";
import type { Task, Subtask, DagNode } from "@/lib/dag";
import { getAllTasks } from "@/lib/dag";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";

const QUICK_PROMPTS = [
  "Walk me through this step by step",
  "What should I do first?",
  "What's the best approach for this?",
  "I'm stuck, help me think through this",
];

function buildSystemContext({
  task,
  projectSummary,
  priorResults,
  allTasks,
  doneIds,
  currentNodes,
}: {
  task: Task;
  projectSummary: string;
  priorResults: PriorResult[];
  allTasks?: Task[];
  doneIds?: Set<string>;
  currentNodes?: DagNode[];
}): string {
  const parts: string[] = [];

  // Core persona
  parts.push(
    `You are a helpful project assistant. The user is working on a specific task within a larger project. Help them think through the task, give advice, brainstorm approaches, or answer questions. Be concise and practical.`
  );

  parts.push(`\nHere's the full context:`);

  // Project summary
  if (projectSummary) {
    parts.push(`\n## Project\n${projectSummary}`);
  }

  // What's been done so far
  if (priorResults && priorResults.length > 0) {
    parts.push(`\n## What's been done so far`);
    for (const r of priorResults) {
      const truncated = r.output ? r.output.slice(0, 200) + (r.output.length > 200 ? "..." : "") : "(no output)";
      parts.push(`- "${r.title}" (${r.assignee}): ${truncated}`);
    }
  }

  // Current task details
  parts.push(`\n## Current task`);
  parts.push(`Title: ${task.title}`);
  parts.push(`Description: ${task.description}`);
  if (task.assignee) parts.push(`Assignee: ${task.assignee}`);

  if (task.subtasks && task.subtasks.length > 0) {
    parts.push(`\nSubtasks:`);
    for (const st of task.subtasks) {
      parts.push(`- [${st.assignee}] ${st.title}`);
    }
  }

  if (task.notes) {
    parts.push(`\nUser's notes on this task: ${task.notes}`);
  }

  // What tasks are pending/next
  if (allTasks && doneIds) {
    const pendingTasks = allTasks.filter(
      (t) => t.id !== task.id && !doneIds.has(t.id) && t.status !== "locked"
    );
    if (pendingTasks.length > 0) {
      parts.push(`\n## Other tasks currently available`);
      for (const t of pendingTasks.slice(0, 5)) {
        parts.push(`- ${t.title} (${t.assignee})`);
      }
    }
  }

  // What this task unblocks (downstream dependents)
  if (allTasks) {
    const downstream = allTasks.filter(
      (t) => t.depends_on && t.depends_on.includes(task.id)
    );
    if (downstream.length > 0) {
      parts.push(`\n## What completing this task unblocks`);
      for (const t of downstream) {
        parts.push(`- "${t.title}" — ${t.description.slice(0, 100)}`);
      }
    }
  }

  parts.push(
    `\nBe conversational and helpful. Don't just suggest breaking down the task — engage with whatever the user is asking about. If they want to brainstorm, brainstorm. If they want strategy advice, give it. If they're stuck, help them get unstuck. Keep responses concise — use numbered steps when walking through a process.`
  );

  return parts.join("\n");
}

export function TaskChat({
  task,
  projectSummary,
  priorResults,
  allTasks,
  doneIds,
  currentNodes,
  byoKeys,
}: {
  task: Task;
  projectSummary: string;
  priorResults: PriorResult[];
  allTasks?: Task[];
  doneIds?: Set<string>;
  currentNodes?: DagNode[];
  byoKeys?: { anthropic?: string; google?: string; openai?: string };
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const systemContext = useMemo(
    () =>
      buildSystemContext({
        task,
        projectSummary,
        priorResults,
        allTasks,
        doneIds,
        currentNodes,
      }),
    [task, projectSummary, priorResults, allTasks, doneIds, currentNodes]
  );

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg = { role: "assistant" as const, content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (byoKeys?.anthropic) headers["x-user-anthropic-key"] = byoKeys.anthropic;
      if (byoKeys?.google) headers["x-user-google-key"] = byoKeys.google;
      if (byoKeys?.openai) headers["x-user-openai-key"] = byoKeys.openai;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          systemContext,
          messages: newMessages,
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

  const send = async () => {
    await sendMessage(input);
  };

  if (!open) {
    return (
      <button
        data-task-chat={task.id}
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 16px",
          border: `1px solid ${PRIMARY}40`,
          borderRadius: 8,
          background: `${PRIMARY}08`,
          color: PRIMARY,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          marginTop: 8,
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.background = `${PRIMARY}14`;
          (e.target as HTMLButtonElement).style.borderColor = PRIMARY;
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.background = `${PRIMARY}08`;
          (e.target as HTMLButtonElement).style.borderColor = `${PRIMARY}40`;
        }}
      >
        Chat about this task
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
        <span style={{ fontSize: 12, fontWeight: 600, color: PRIMARY }}>Chat about this task</span>
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
          maxHeight: 400,
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 12, color: TEXT_LIGHT, textAlign: "center", marginBottom: 10 }}>
              Ask anything about this task, or try one of these:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={streaming}
                  style={{
                    padding: "7px 12px",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    background: SURFACE,
                    color: TEXT,
                    fontSize: 12,
                    cursor: streaming ? "not-allowed" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    textAlign: "left",
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.background = "#F0EFEB";
                    (e.target as HTMLButtonElement).style.borderColor = PRIMARY;
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.background = SURFACE;
                    (e.target as HTMLButtonElement).style.borderColor = BORDER;
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
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
          placeholder="Ask anything about this task..."
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

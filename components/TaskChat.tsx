"use client";

import { useState, useRef, useEffect } from "react";
import { PRIMARY, BORDER, TEXT_LIGHT, SURFACE, TEXT } from "@/lib/styles";
import type { PriorResult } from "@/lib/styles";
import type { Task, Subtask } from "@/lib/dag";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";

export function TaskChat({
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

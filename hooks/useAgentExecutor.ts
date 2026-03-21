"use client";

import { useState, useCallback, useRef } from "react";

export type AgentStep =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; tool: string; summary: string }
  | { type: "output"; content: string; outputType: "writing" | "code"; language?: string; filename?: string };

export interface AgentResult {
  taskId: string;
  steps: AgentStep[];
  finalOutput: string;
  model: "claude-sonnet" | "gemini-flash";
  done: boolean;
  error?: string;
}

interface ToolResultData {
  draft?: string;
  code?: string;
  language?: string;
  filename?: string;
  findings?: string;
  approach?: string;
  steps?: string[];
}

export function useAgentExecutor() {
  const [results, setResults] = useState<Record<string, AgentResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (taskId: string, title: string, description: string, projectContext: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(taskId);

      const initial: AgentResult = {
        taskId,
        steps: [{ type: "thinking", text: "" }],
        finalOutput: "",
        model: "gemini-flash",
        done: false,
      };
      setResults((prev) => ({ ...prev, [taskId]: initial }));

      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, title, description, projectContext }),
          signal: controller.signal,
        });

        const model = (res.headers.get("X-Agent-Model") as "claude-sonnet" | "gemini-flash") || "gemini-flash";
        setResults((prev) => ({
          ...prev,
          [taskId]: { ...prev[taskId], model },
        }));

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

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

              if (event.type === "text") {
                setResults((prev) => {
                  const r = prev[taskId];
                  if (!r) return prev;
                  const steps = [...r.steps];
                  const lastStep = steps[steps.length - 1];
                  if (lastStep && lastStep.type === "thinking") {
                    steps[steps.length - 1] = { ...lastStep, text: lastStep.text + event.text };
                  } else {
                    steps.push({ type: "thinking", text: event.text });
                  }
                  return { ...prev, [taskId]: { ...r, steps, finalOutput: r.finalOutput + event.text } };
                });
              } else if (event.type === "tool_call") {
                setResults((prev) => {
                  const r = prev[taskId];
                  if (!r) return prev;
                  const steps = [...r.steps];
                  steps.push({
                    type: "tool_call",
                    tool: event.toolName,
                    summary: `Using ${event.toolName}...`,
                  });
                  return { ...prev, [taskId]: { ...r, steps } };
                });
              } else if (event.type === "tool_result") {
                setResults((prev) => {
                  const r = prev[taskId];
                  if (!r) return prev;
                  const steps = [...r.steps];
                  const result = event.result as ToolResultData;
                  if (result.draft) {
                    steps.push({
                      type: "output",
                      content: result.draft,
                      outputType: "writing",
                    });
                  } else if (result.code) {
                    steps.push({
                      type: "output",
                      content: result.code,
                      outputType: "code",
                      language: result.language,
                      filename: result.filename,
                    });
                  } else if (result.findings) {
                    steps.push({
                      type: "output",
                      content: result.findings,
                      outputType: "writing",
                    });
                  } else if (result.approach) {
                    steps.push({
                      type: "output",
                      content: `**Approach:** ${result.approach}\n\n**Steps:**\n${(result.steps || []).map((s: string) => `- ${s}`).join("\n")}`,
                      outputType: "writing",
                    });
                  }
                  return { ...prev, [taskId]: { ...r, steps } };
                });
              } else if (event.type === "error") {
                setResults((prev) => ({
                  ...prev,
                  [taskId]: { ...prev[taskId], error: event.text },
                }));
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        setResults((prev) => ({
          ...prev,
          [taskId]: { ...prev[taskId], done: true },
        }));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults((prev) => ({
            ...prev,
            [taskId]: {
              ...prev[taskId],
              done: true,
              error: (err as Error).message,
            },
          }));
        }
      } finally {
        setRunning(null);
        abortRef.current = null;
      }
    },
    []
  );

  return { execute, results, running };
}

"use client";

import { useState, useCallback, useRef } from "react";
import type { AgentType } from "@/lib/dag";

export type AgentStep =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; tool: string; summary: string }
  | { type: "output"; content: string; outputType: "writing" | "code"; language?: string; filename?: string };

export interface AgentResult {
  taskId: string;
  steps: AgentStep[];
  finalOutput: string;
  model: "claude-sonnet" | "gemini-flash";
  agentType: AgentType;
  done: boolean;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

interface ToolResultData {
  // Code tools
  code?: string;
  language?: string;
  filename?: string;
  explanation?: string;
  // Writing tools
  draft?: string;
  body?: string;
  subject?: string;
  to?: string;
  content?: string;
  follow_up_notes?: string;
  // Research tools
  findings?: string;
  topic?: string;
  comparison_table?: { item: string; pros: string[]; cons: string[]; verdict: string }[];
  recommendations?: string[];
  // Planning tools
  approach?: string;
  steps?: string[];
  // Outline tools
  title?: string;
  sections?: { heading: string; points: string[]; notes?: string }[];
  // List tools
  list_type?: string;
  items?: { name: string; description: string; details?: string; action_needed?: string }[];
  total_count?: number;
  // Config tools
  format?: string;
  // Batch email tools
  campaign_name?: string;
  template_notes?: string;
  emails?: { to: string; subject: string; body: string; personalization_notes?: string }[];
  follow_up_plan?: string;
  // Extract and research tools
  source_description?: string;
  extracted_items?: { name: string; role?: string; context: string; contact_info?: string; notes?: string }[];
  total_found?: number;
  research_notes?: string;
}

export function useAgentExecutor() {
  const [results, setResults] = useState<Record<string, AgentResult>>({});
  const [runningTasks, setRunningTasks] = useState<Set<string>>(new Set());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const execute = useCallback(
    async (
      taskId: string,
      title: string,
      description: string,
      projectContext: string,
      assignee?: string,
      force?: boolean,
      agentType?: AgentType,
    ) => {
      // Don't re-run if already running (unless forced for regenerate)
      if (abortControllers.current.has(taskId)) {
        if (!force) return;
        abortControllers.current.get(taskId)?.abort();
        abortControllers.current.delete(taskId);
      }

      const controller = new AbortController();
      abortControllers.current.set(taskId, controller);

      setRunningTasks((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });

      const initial: AgentResult = {
        taskId,
        steps: [{ type: "thinking", text: "" }],
        finalOutput: "",
        model: "gemini-flash",
        agentType: agentType || "builtin",
        done: false,
        startedAt: new Date().toISOString(),
      };
      setResults((prev) => ({ ...prev, [taskId]: initial }));

      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, title, description, projectContext, assignee, agentType }),
          signal: controller.signal,
        });

        const model = (res.headers.get("X-Agent-Model") as "claude-sonnet" | "gemini-flash") || "gemini-flash";
        const resolvedAgentType = (res.headers.get("X-Agent-Type") as AgentType) || agentType || "builtin";
        setResults((prev) => ({
          ...prev,
          [taskId]: { ...prev[taskId], model, agentType: resolvedAgentType },
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

                  // Code output
                  if (result.code) {
                    steps.push({
                      type: "output",
                      content: result.code,
                      outputType: "code",
                      language: result.language,
                      filename: result.filename,
                    });
                  // Email draft
                  } else if (result.body && result.subject) {
                    const emailContent = `**To:** ${result.to || "Recipient"}\n**Subject:** ${result.subject}\n\n${result.body}${result.follow_up_notes ? `\n\n---\n*Follow-up notes: ${result.follow_up_notes}*` : ""}`;
                    steps.push({ type: "output", content: emailContent, outputType: "writing" });
                  // Content draft
                  } else if (result.draft) {
                    steps.push({ type: "output", content: result.draft, outputType: "writing" });
                  // Research with comparison table
                  } else if (result.findings && result.comparison_table) {
                    let content = result.findings + "\n\n";
                    content += "| Item | Pros | Cons | Verdict |\n|------|------|------|---------|\n";
                    for (const row of result.comparison_table) {
                      content += `| ${row.item} | ${row.pros.join(", ")} | ${row.cons.join(", ")} | ${row.verdict} |\n`;
                    }
                    if (result.recommendations) {
                      content += "\n**Recommendations:**\n" + result.recommendations.map((r: string) => `- ${r}`).join("\n");
                    }
                    steps.push({ type: "output", content, outputType: "writing" });
                  // Batch emails
                  } else if (result.emails && result.campaign_name) {
                    let content = `**${result.campaign_name}**\n`;
                    if (result.template_notes) content += `*${result.template_notes}*\n\n`;
                    for (let i = 0; i < result.emails.length; i++) {
                      const email = result.emails[i];
                      content += `---\n### Email ${i + 1}: ${email.to}\n**Subject:** ${email.subject}\n\n${email.body}`;
                      if (email.personalization_notes) content += `\n\n*Personalization: ${email.personalization_notes}*`;
                      content += "\n\n";
                    }
                    if (result.follow_up_plan) content += `---\n**Follow-up plan:** ${result.follow_up_plan}`;
                    steps.push({ type: "output", content, outputType: "writing" });
                  // Extract and research
                  } else if (result.extracted_items && result.source_description) {
                    let content = `**Extracted from:** ${result.source_description}\n**Found:** ${result.total_found || result.extracted_items.length} items\n\n`;
                    for (const item of result.extracted_items) {
                      content += `### ${item.name}`;
                      if (item.role) content += ` — ${item.role}`;
                      content += `\n${item.context}`;
                      if (item.contact_info) content += `\n**Contact:** ${item.contact_info}`;
                      if (item.notes) content += `\n*${item.notes}*`;
                      content += "\n\n";
                    }
                    if (result.research_notes) content += `---\n*${result.research_notes}*`;
                    steps.push({ type: "output", content, outputType: "writing" });
                  // Plain research
                  } else if (result.findings) {
                    steps.push({ type: "output", content: result.findings, outputType: "writing" });
                  // Outline
                  } else if (result.sections) {
                    let content = result.title ? `# ${result.title}\n\n` : "";
                    for (const section of result.sections) {
                      content += `## ${section.heading}\n`;
                      for (const point of section.points) {
                        content += `- ${point}\n`;
                      }
                      if (section.notes) content += `\n*${section.notes}*\n`;
                      content += "\n";
                    }
                    steps.push({ type: "output", content, outputType: "writing" });
                  // Generated list
                  } else if (result.items && result.list_type) {
                    let content = `**${result.list_type}** (${result.total_count || result.items.length} items)\n\n`;
                    for (const item of result.items) {
                      content += `### ${item.name}\n${item.description}`;
                      if (item.details) content += `\n${item.details}`;
                      if (item.action_needed) content += `\n*Action: ${item.action_needed}*`;
                      content += "\n\n";
                    }
                    steps.push({ type: "output", content, outputType: "writing" });
                  // Implementation plan
                  } else if (result.approach) {
                    steps.push({
                      type: "output",
                      content: `**Approach:** ${result.approach}\n\n**Steps:**\n${(result.steps || []).map((s: string) => `- ${s}`).join("\n")}`,
                      outputType: "writing",
                    });
                  // Config file
                  } else if (result.content && result.format) {
                    steps.push({
                      type: "output",
                      content: result.content,
                      outputType: "code",
                      language: result.format,
                      filename: result.filename,
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
          [taskId]: { ...prev[taskId], done: true, completedAt: new Date().toISOString() },
        }));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults((prev) => ({
            ...prev,
            [taskId]: {
              ...prev[taskId],
              done: true,
              completedAt: new Date().toISOString(),
              error: (err as Error).message,
            },
          }));
        }
      } finally {
        abortControllers.current.delete(taskId);
        setRunningTasks((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    []
  );

  // Expose running as first running task id (for header indicator) or null
  const running = runningTasks.size > 0 ? Array.from(runningTasks)[0] : null;
  const runningCount = runningTasks.size;

  return { execute, results, running, runningCount, runningTasks };
}

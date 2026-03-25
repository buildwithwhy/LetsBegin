import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { selectModel, detectTaskType } from "@/lib/models";
import type { AgentType } from "@/lib/dag";

export const maxDuration = 60;

const codingTools = {
  writeCode: tool({
    description: "Write code to a file",
    inputSchema: z.object({
      language: z.string(),
      filename: z.string(),
      code: z.string(),
      explanation: z.string(),
    }),
    execute: async (input) => input,
  }),
  planImplementation: tool({
    description: "Plan an implementation approach",
    inputSchema: z.object({
      approach: z.string(),
      steps: z.array(z.string()),
    }),
    execute: async (input) => input,
  }),
};

const writingTools = {
  draftContent: tool({
    description: "Draft written content",
    inputSchema: z.object({
      content_type: z.string(),
      draft: z.string(),
      notes: z.string().optional(),
    }),
    execute: async (input) => input,
  }),
  researchContext: tool({
    description: "Research and gather context",
    inputSchema: z.object({
      findings: z.string(),
    }),
    execute: async (input) => input,
  }),
};

export async function POST(req: Request) {
  const { taskId, title, description, projectContext, assignee, agentType } = await req.json();

  const taskType = detectTaskType(description);

  // Route to the right model based on agent type and task type
  const resolvedAgentType: AgentType = agentType || (taskType === "coding" ? "claude-code" : "builtin");
  const purpose = resolvedAgentType === "claude-code" || taskType === "coding"
    ? "execute-code"
    : "execute-write";
  const { model, label } = selectModel(purpose);

  const hybridNote = assignee === "hybrid"
    ? `\n\nIMPORTANT: This is a HYBRID task — you draft, then a human reviews and decides.
- When generating options or ideas, present ALL options clearly (numbered list) so the human can CHOOSE. Do NOT pick one for them.
- When drafting content, present it as a draft for review, not a final decision.
- Label your output clearly: "Here are 3 options for you to choose from:" or "Here's a draft for your review:"`
    : "";

  const agentIdentity = resolvedAgentType === "claude-code"
    ? "You are Claude Code, a powerful coding agent. You can reason deeply about code, plan implementations, and write production-quality code."
    : "You are a helpful AI agent working on a project task.";

  const result = streamText({
    model,
    tools: taskType === "coding" ? codingTools : writingTools,
    stopWhen: stepCountIs(5),
    prompt: `${agentIdentity}

Project context: ${projectContext || "No additional context"}

Your current task:
Title: ${title}
Description: ${description}${hybridNote}

Complete this task using the available tools. Think through the approach, then use the appropriate tool(s) to produce your output. Be thorough but concise.`,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          let event: Record<string, unknown> | null = null;

          if (part.type === "text-delta") {
            event = { type: "text", text: part.text };
          } else if (part.type === "tool-call") {
            event = {
              type: "tool_call",
              toolName: part.toolName,
              args: part.input,
            };
          } else if (part.type === "tool-result") {
            event = {
              type: "tool_result",
              toolName: part.toolName,
              result: part.output,
            };
          }

          if (event) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", text: String(err) }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Agent-Model": label,
      "X-Agent-Type": resolvedAgentType,
      "X-Task-Id": taskId,
    },
  });
}

import { streamText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const maxDuration = 60;

// Task type detection — preserved for future model routing
const CODING_KEYWORDS = [
  "code", "build", "implement", "script", "function", "component", "api",
  "endpoint", "database", "schema", "deploy", "configure", "install",
  "setup", "debug", "fix", "refactor",
];

function detectTaskType(description: string): "coding" | "writing" {
  const lower = description.toLowerCase();
  return CODING_KEYWORDS.some((kw) => lower.includes(kw)) ? "coding" : "writing";
}

// Model selection — centralized so the orchestrator can override later
function selectModel(taskType: "coding" | "writing") {
  // Future: let the orchestrator (or user preferences) pick the best model
  // e.g., anthropic("claude-sonnet-4-6") for coding, google for writing
  // For now: Gemini handles everything
  void taskType;
  return {
    model: google("gemini-3-flash-preview"),
    label: "gemini-flash" as const,
  };
}

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
  const { taskId, title, description, projectContext, assignee } = await req.json();

  const taskType = detectTaskType(description);
  const { model, label } = selectModel(taskType);

  const hybridNote = assignee === "hybrid"
    ? `\n\nIMPORTANT: This is a HYBRID task — you draft, then a human reviews and decides.
- When generating options or ideas, present ALL options clearly (numbered list) so the human can CHOOSE. Do NOT pick one for them.
- When drafting content, present it as a draft for review, not a final decision.
- Label your output clearly: "Here are 3 options for you to choose from:" or "Here's a draft for your review:"`
    : "";

  const result = streamText({
    model,
    tools: taskType === "coding" ? codingTools : writingTools,
    stopWhen: stepCountIs(5),
    prompt: `You are an AI agent working on a project task.

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
      "X-Task-Id": taskId,
    },
  });
}

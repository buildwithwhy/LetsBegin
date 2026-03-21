import { streamText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const runtime = "edge";

const CODING_KEYWORDS = [
  "code", "build", "implement", "script", "function", "component", "api",
  "endpoint", "database", "schema", "deploy", "configure", "install",
  "setup", "debug", "fix", "refactor",
];

function isCodingTask(description: string): boolean {
  const lower = description.toLowerCase();
  return CODING_KEYWORDS.some((kw) => lower.includes(kw));
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
  const { taskId, title, description, projectContext } = await req.json();

  const coding = isCodingTask(description);

  const model = coding
    ? anthropic("claude-sonnet-4-6")
    : google("gemini-3-flash-preview");

  const modelLabel = coding ? "claude-sonnet" : "gemini-flash";

  const result = streamText({
    model,
    tools: coding ? codingTools : writingTools,
    stopWhen: stepCountIs(5),
    prompt: `You are an AI agent working on a project task.

Project context: ${projectContext || "No additional context"}

Your current task:
Title: ${title}
Description: ${description}

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
      "X-Agent-Model": modelLabel,
      "X-Task-Id": taskId,
    },
  });
}

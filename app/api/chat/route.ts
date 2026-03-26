import { streamText } from "ai";
import { selectModel, selectModelWithUserKey } from "@/lib/models";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { taskTitle, taskDescription, projectSummary, messages, priorResults, subtasks, systemContext } = await req.json();

  // Check for user-provided API keys
  const userKeys = {
    anthropic: req.headers.get("x-user-anthropic-key"),
    google: req.headers.get("x-user-google-key"),
    openai: req.headers.get("x-user-openai-key"),
  };
  const hasUserKeys = !!(userKeys.anthropic || userKeys.google || userKeys.openai);

  // If a rich systemContext was provided by the client, use it directly.
  // Otherwise fall back to the legacy context-building approach.
  let systemPrompt: string;

  if (systemContext) {
    systemPrompt = systemContext;
  } else {
    // Build context from what agents have already done (legacy path)
    let priorContext = "";
    if (priorResults && priorResults.length > 0) {
      priorContext = "\n\nHere is what has already been completed in this project:\n";
      for (const r of priorResults) {
        priorContext += `\n--- Completed: "${r.title}" (done by: ${r.assignee}) ---\n`;
        if (r.output) {
          priorContext += r.output.slice(0, 1500) + "\n";
        }
      }
    }

    let subtaskContext = "";
    if (subtasks && subtasks.length > 0) {
      subtaskContext = "\n\nThis task has these subtasks:\n";
      for (const st of subtasks) {
        subtaskContext += `- [${st.assignee}] ${st.title}\n`;
      }
    }

    systemPrompt = `You are a helpful project assistant. The user is working on a specific task within a larger project. Help them think through the task, give advice, brainstorm approaches, or answer questions. Be concise and practical.

Project context: ${projectSummary}
${priorContext}
Task: "${taskTitle}"
Description: ${taskDescription}
${subtaskContext}

Be conversational and helpful. Don't just suggest breaking down the task — engage with whatever the user is asking about.`;
  }

  // Claude for chat — use user key if available, otherwise default
  const { model } = hasUserKeys
    ? selectModelWithUserKey("chat", userKeys)
    : selectModel("chat");

  const result = streamText({
    model,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "text", text: chunk }) + "\n"));
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
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

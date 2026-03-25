import { streamText } from "ai";
import { selectModel } from "@/lib/models";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { taskTitle, taskDescription, projectSummary, messages, priorResults, subtasks, systemContext } = await req.json();

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

    systemPrompt = `You are a helpful assistant guiding a user through a specific task in their project.

Project context: ${projectSummary}
${priorContext}
Current task: "${taskTitle}"
Task description: ${taskDescription}
${subtaskContext}

Your job is to help the user complete THIS specific task. You have full context of what happened before — reference specific outputs, tools, files, or decisions from prior steps when relevant.

Guidelines:
- Keep responses concise and actionable
- Use numbered steps when walking through a process
- Reference specific details from prior task results (e.g., "The agent used X tool to create Y — you can find it at Z")
- If a prior step produced something the user needs, tell them exactly where it is and what to do with it
- If the user seems overwhelmed, break things into even smaller pieces
- Be warm and supportive, especially when tasks feel intimidating`;
  }

  // Claude for chat — better context handling and reasoning
  const { model } = selectModel("chat");

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

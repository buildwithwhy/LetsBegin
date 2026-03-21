import { streamText } from "ai";
import { google } from "@ai-sdk/google";

export async function POST(req: Request) {
  const { taskTitle, taskDescription, projectSummary, messages } = await req.json();

  const result = streamText({
    model: google("gemini-3-flash-preview"),
    system: `You are a helpful assistant guiding a user through a specific task in their project.

Project context: ${projectSummary}

Current task: "${taskTitle}"
Task description: ${taskDescription}

Your job is to help the user complete THIS specific task. You can:
- Break the task into small, concrete steps if they ask
- Explain terminology or concepts they're unsure about
- Answer questions about how to do something
- Provide encouragement and keep things manageable

Guidelines:
- Keep responses concise and actionable
- Use numbered steps when walking through a process
- If the user seems overwhelmed, break things into even smaller pieces
- Don't go off-topic — stay focused on this one task
- Be warm and supportive, especially when tasks feel intimidating`,
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

import { generateObject } from "ai";
import { z } from "zod";
import { selectModel } from "@/lib/models";

export const maxDuration = 30;

const granularityConfig = {
  normal: { min: 3, max: 5, description: "3-5 clear steps" },
  detailed: { min: 5, max: 8, description: "5-8 detailed steps" },
  tiny: { min: 8, max: 12, description: "8-12 very small, concrete, immediately-actionable steps" },
};

const subtaskSchema = z.object({
  subtasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      assignee: z.enum(["user", "agent"]),
      description: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const { taskTitle, taskDescription, projectContext, currentSubtasks, granularity = "tiny" } =
      await req.json();

    const config = granularityConfig[granularity as keyof typeof granularityConfig] || granularityConfig.tiny;

    const existingContext = currentSubtasks && currentSubtasks.length > 0
      ? `\n\nThis task currently has these subtasks (which may need to be replaced with more granular steps):\n${currentSubtasks.map((s: { title: string }) => `- ${s.title}`).join("\n")}`
      : "";

    const { model } = selectModel("subtasks");
    const result = await generateObject({
      model,
      schema: subtaskSchema,
      prompt: `You are helping someone who struggles with executive function (ADHD) break a task into smaller, less overwhelming steps.

Task: "${taskTitle}"
Description: "${taskDescription}"
Project context: "${projectContext}"${existingContext}

Break this task into ${config.description}.

CRITICAL RULES:
- Be CONCRETE and SPECIFIC — not "research options" but "open Google and search for X"
- Make each step feel ACHIEVABLE — something you can do in 5-15 minutes
- Start with the EASIEST step to build momentum
- Use simple, direct language — no jargon
- Each step should have a clear "done" state
- For user steps, describe the exact action to take
- For agent steps, describe what the AI will produce
- Give each subtask a unique id like "step-1", "step-2", etc.
- Set assignee to "user" for things requiring human action, "agent" for things AI can handle
- Include a brief description for steps that might need clarification

Generate exactly ${config.min} to ${config.max} subtasks.`,
    });

    return Response.json({ subtasks: result.object.subtasks });
  } catch (err) {
    console.error("Decompose failed:", err);
    return Response.json(
      { error: "Failed to decompose task: " + String(err) },
      { status: 500 }
    );
  }
}

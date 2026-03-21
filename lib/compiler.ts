import { streamText, generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { type Plan, type Task, type DagNode, getAllTasks, computeUnlocked } from "./dag";

// Schema WITHOUT subtasks — fast to generate
const taskSchema = z.object({
  id: z.string(),
  type: z.literal("task"),
  title: z.string(),
  description: z.string(),
  assignee: z.enum(["agent", "user", "hybrid"]),
  energy: z.enum(["high", "medium", "low"]),
  status: z.literal("pending"),
  depends_on: z.array(z.string()),
});

const parallelGroupSchema = z.object({
  id: z.string(),
  type: z.literal("parallel_group"),
  children: z.array(taskSchema),
  status: z.literal("pending"),
  depends_on: z.array(z.string()),
});

const planSchema = z.object({
  project_title: z.string(),
  summary: z.string(),
  nodes: z.array(z.union([taskSchema, parallelGroupSchema])),
});

// Schema for subtasks enrichment
const subtasksSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      subtasks: z.array(z.string()),
    })
  ),
});

export type CompilerEvent =
  | { type: "thought"; text: string }
  | { type: "status"; text: string }
  | { type: "plan"; plan: Plan }
  | { type: "subtasks"; tasks: { id: string; subtasks: string[] }[] }
  | { type: "error"; text: string };

type ImageInput = { mediaType: string; data: string };

export async function* streamThinking(
  brief: string,
  images: ImageInput[] = []
): AsyncGenerator<CompilerEvent> {
  const imageContent = images.map((img) => ({
    type: "image" as const,
    image: img.data,
    mimeType: img.mediaType,
  }));

  const thinkingPrompt = `You are a project planning assistant. A user has given you this project brief:

"${brief}"

${images.length > 0 ? "The user has also attached images for additional context. Analyze them and incorporate what you see into your observations." : ""}

Think out loud about this brief. Make 4-6 short observations about:
- What the key dependencies are (what must happen before what)
- Which tasks can run in parallel
- Which tasks should be done by an AI agent vs a human vs hybrid (agent drafts, human reviews)
- Any risks or gotchas

Keep each observation to 1-2 sentences. Be practical and specific.`;

  // Phase 1: Think out loud
  const thinkingResult = streamText({
    model: google("gemini-3-flash-preview"),
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text" as const, text: thinkingPrompt },
        ],
      },
    ],
  });

  for await (const chunk of thinkingResult.textStream) {
    yield { type: "thought", text: chunk };
  }

  // Phase 2: Generate plan structure (no subtasks — fast)
  yield { type: "status", text: "Structuring your plan..." };

  const planResult = await generateObject({
    model: google("gemini-3-flash-preview"),
    schema: planSchema,
    prompt: `You are a project planning assistant. A user has given you this project brief:

"${brief}"

Generate a structured project plan as a DAG (directed acyclic graph) of tasks.

Rules:
- Each task needs a unique id (use short slugs like "setup-account", "draft-description")
- The "type" field must be exactly "task" for individual tasks or "parallel_group" for groups of parallel tasks
- depends_on lists the ids of tasks that must complete before this task can start
- The first task(s) should have an empty depends_on array
- Use parallel_group to group tasks that can run simultaneously (they share the same dependencies)
- Children inside a parallel_group can depend on tasks outside the group (via the group's depends_on) but should not depend on each other
- All tasks must have status: "pending" (the system will compute locked/unlocked states)
- assignee is "agent" (AI can fully automate), "user" (human must do it), or "hybrid" (agent drafts, human reviews)
- energy is "high" (significant effort), "medium" (moderate effort), or "low" (quick task)
- Do NOT include subtasks — keep this lean

Generate a realistic, practical plan with 6-12 top-level tasks. Make sure the dependency graph is valid — no circular dependencies, and every id referenced in depends_on must exist.`,
  });

  const plan = planResult.object as Plan;
  plan.nodes = computeUnlocked(plan.nodes as DagNode[], new Set());

  // Yield plan immediately so UI shows it fast
  yield { type: "plan", plan };

  // Phase 3: Generate subtasks for user/hybrid tasks (runs after plan is shown)
  const humanTasks = getAllTasks(plan.nodes).filter(
    (t) => t.assignee === "user" || t.assignee === "hybrid"
  );

  if (humanTasks.length > 0) {
    yield { type: "status", text: "Adding step-by-step details..." };

    try {
      const taskList = humanTasks
        .map((t) => `- id: "${t.id}", title: "${t.title}", description: "${t.description}"`)
        .join("\n");

      const subtasksResult = await generateObject({
        model: google("gemini-3-flash-preview"),
        schema: subtasksSchema,
        prompt: `For the following tasks in a project plan, generate concrete step-by-step subtasks.

Project: "${brief}"

Tasks that need subtasks:
${taskList}

For each task, generate 3-8 specific, actionable sub-steps.
Sub-steps should be specific enough that someone unfamiliar with the process can follow them.
For example, instead of "set up account", write "Go to developer.apple.com and click 'Enroll'".

The brief may contain context from clarifying questions about the user's experience level — use this to calibrate detail. More detail for beginners, less for experienced users.

Return the task id and its subtasks array for each task.`,
      });

      yield { type: "subtasks", tasks: subtasksResult.object.tasks };
    } catch (err) {
      console.error("Subtask generation failed:", err);
      // Non-fatal — plan still works without subtasks
    }
  }
}

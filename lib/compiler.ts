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
const subtaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  assignee: z.enum(["agent", "user"]),
  depends_on: z.array(z.string()),
  parallel_with: z.array(z.string()).optional(),
});

const subtasksSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      subtasks: z.array(subtaskItemSchema),
    })
  ),
});

type SubtaskData = z.infer<typeof subtaskItemSchema>;

export type CompilerEvent =
  | { type: "thought"; text: string }
  | { type: "status"; text: string }
  | { type: "plan"; plan: Plan }
  | { type: "subtasks"; tasks: { id: string; subtasks: SubtaskData[] }[] }
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
- What ACTUALLY blocks what — be strict. "A depends on B" means A literally cannot start without B's output. Don't assume everything is serial.
- Where can the human and AI work at the same time? Maximize parallel work between human tasks and agent tasks.
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

CRITICAL — DEPENDENCY THINKING:
Think very carefully about what ACTUALLY blocks what. A dependency means "this task literally cannot start until that task finishes because it needs the OUTPUT of that task."

Common mistakes to avoid:
- Do NOT make agent tasks depend on user tasks unless the agent literally needs the result. For example, "draft app description" does NOT depend on "register developer account" — the agent can draft text while the user sets up their account.
- Do NOT create a single serial chain. Most projects have tasks that can run in parallel. Ask yourself: "Can the human be doing something while the agent works on something else?"
- DO use parallel_group when multiple tasks share the same dependencies and can run at the same time.
- DO let agent tasks start as early as possible — they should only depend on tasks whose output they actually need.
- DO think about what the human can do independently vs what requires waiting.

The goal is MAXIMUM PARALLELISM between human and agent work. Humans and agents should be busy at the same time whenever possible, not waiting on each other.

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
        .map((t) => `- id: "${t.id}", title: "${t.title}", assignee: "${t.assignee}", description: "${t.description}"`)
        .join("\n");

      const subtasksResult = await generateObject({
        model: google("gemini-3-flash-preview"),
        schema: subtasksSchema,
        prompt: `For the following tasks in a project plan, generate concrete step-by-step subtasks.

Project: "${brief}"

Tasks that need subtasks:
${taskList}

For each task, generate 3-8 subtasks. Each subtask must have:
- id: unique within the task (e.g., "step-1", "step-2")
- title: specific, actionable step (e.g., "Go to developer.apple.com and click 'Enroll'")
- assignee: "user" for steps that require human action (clicking, logging in, decisions), "agent" for steps that AI can handle (drafting text, generating content, research)
- depends_on: array of subtask ids that must complete first (use [] for the first step)
- parallel_with: array of subtask ids that can be done at the same time (optional, omit if sequential)

For hybrid tasks, clearly split which subtasks are "agent" (drafting, generating) vs "user" (reviewing, approving, submitting).

The brief may contain context from clarifying questions about the user's experience level — calibrate detail accordingly.

Return the parent task id and its subtasks array for each task.`,
      });

      yield { type: "subtasks", tasks: subtasksResult.object.tasks };
    } catch (err) {
      console.error("Subtask generation failed:", err);
      // Non-fatal — plan still works without subtasks
    }
  }
}

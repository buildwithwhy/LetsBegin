import { streamText, streamObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { type Plan, type DagNode, computeUnlocked } from "./dag";

const taskSchema = z.object({
  id: z.string(),
  type: z.literal("task"),
  title: z.string(),
  description: z.string(),
  assignee: z.enum(["agent", "user", "hybrid"]),
  energy: z.enum(["high", "medium", "low"]),
  status: z.literal("pending"),
  depends_on: z.array(z.string()),
  subtasks: z.array(z.string()).optional(),
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

export type CompilerEvent =
  | { type: "thought"; text: string }
  | { type: "status"; text: string }
  | { type: "progress"; taskCount: number }
  | { type: "plan"; plan: Plan }
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

  // Signal transition to Phase 2
  yield { type: "status", text: "Structuring your plan..." };

  // Phase 2: Stream structured plan (so we get partial progress)
  const planStream = streamObject({
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

SUBTASKS — this is important:
- Keep task titles at a high level for a clean overview (e.g., "Set up Apple Developer account")
- For EVERY user and hybrid task, include a "subtasks" array with 3-8 concrete, actionable sub-steps
- Sub-steps should be specific enough that someone unfamiliar with the process can follow them
  (e.g., "Go to developer.apple.com and click 'Account'", "Sign in with your Apple ID", "Click 'Enroll' in the Apple Developer Program", "Choose 'Individual' enrollment", "Pay the $99/year fee")
- Agent tasks don't need subtasks (the agent handles the details)
- The brief may contain context from clarifying questions about the user's experience level and preferences — use this to calibrate subtask detail. More detail for beginners, less for experienced users.

Generate a realistic, practical plan with 6-12 top-level tasks. Make sure the dependency graph is valid — no circular dependencies, and every id referenced in depends_on must exist.`,
  });

  let lastNodeCount = 0;

  for await (const partial of planStream.partialObjectStream) {
    if (partial.nodes && partial.nodes.length > lastNodeCount) {
      lastNodeCount = partial.nodes.length;
      yield { type: "progress", taskCount: lastNodeCount };
    }
  }

  const finalResult = await planStream.object;
  const plan = finalResult as Plan;
  plan.nodes = computeUnlocked(plan.nodes as DagNode[], new Set());

  yield { type: "plan", plan };
}

import { streamText, generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { type Plan, computeUnlocked } from "./dag";

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
  nodes: z.array(z.discriminatedUnion("type", [taskSchema, parallelGroupSchema])),
});

function authorityPrompt(authority: "minimal" | "moderate" | "high"): string {
  switch (authority) {
    case "minimal":
      return "Prefer assigning tasks to 'user'. Only use 'agent' for fully automatable steps like drafting text or generating boilerplate. Use 'hybrid' for steps where an agent can draft but a human must review.";
    case "moderate":
      return "Balance tasks between 'agent' and 'user'. Use 'hybrid' where an agent can draft content and a user reviews it. Automate what's clearly automatable, keep human judgment where it matters.";
    case "high":
      return "Prefer assigning tasks to 'agent' wherever possible. Use 'hybrid' for sign-off or approval steps. Only use 'user' for tasks that absolutely require human-only access (like logging into accounts or physical actions).";
  }
}

export async function* streamThinking(
  brief: string,
  authority: "minimal" | "moderate" | "high"
): AsyncGenerator<{ type: "thought"; text: string } | { type: "status"; text: string } | { type: "plan"; plan: Plan }> {
  const authNote = authorityPrompt(authority);

  // Phase 1: Think out loud
  const thinkingResult = streamText({
    model: google("gemini-3-flash-preview"),
    prompt: `You are a project planning assistant. A user has given you this project brief:

"${brief}"

Think out loud about this brief. Make 4-6 short observations about:
- What the key dependencies are (what must happen before what)
- Which tasks can run in parallel
- Which tasks should be done by an AI agent vs a human vs hybrid (agent drafts, human reviews)
- Any risks or gotchas

${authNote}

Keep each observation to 1-2 sentences. Be practical and specific.`,
  });

  for await (const chunk of thinkingResult.textStream) {
    yield { type: "thought", text: chunk };
  }

  // Signal transition to Phase 2
  yield { type: "status", text: "Structuring your plan..." };

  // Phase 2: Generate structured plan
  const planResult = await generateObject({
    model: google("gemini-3-flash-preview"),
    schema: planSchema,
    prompt: `You are a project planning assistant. A user has given you this project brief:

"${brief}"

Generate a structured project plan as a DAG (directed acyclic graph) of tasks.

Rules:
- Each task needs a unique id (use short slugs like "setup-account", "draft-description")
- depends_on lists the ids of tasks that must complete before this task can start
- The first task(s) should have an empty depends_on array
- Use parallel_group to group tasks that can run simultaneously (they share the same dependencies)
- Children inside a parallel_group can depend on tasks outside the group (via the group's depends_on) but should not depend on each other
- All tasks must have status: "pending" (the system will compute locked/unlocked states)
- assignee is "agent" (AI can fully automate), "user" (human must do it), or "hybrid" (agent drafts, human reviews)
- energy is "high" (significant effort), "medium" (moderate effort), or "low" (quick task)

${authNote}

Generate a realistic, practical plan with 6-12 tasks total. Make sure the dependency graph is valid — no circular dependencies, and every id referenced in depends_on must exist.`,
  });

  const plan = planResult.object as Plan;
  plan.nodes = computeUnlocked(plan.nodes, new Set());

  yield { type: "plan", plan };
}

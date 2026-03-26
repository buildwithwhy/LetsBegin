import { streamText, generateObject } from "ai";
import { z } from "zod";
import { type Plan, type DagNode, getAllTasks, computeUnlocked } from "./dag";
import { selectModel, selectModelWithUserKey } from "./models";

export type UserKeys = { anthropic?: string | null; google?: string | null; openai?: string | null };

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
  agent_type: z.enum(["builtin", "claude-code", "custom"]).optional(),
  has_wait_after: z.boolean().optional(),
  wait_type: z.enum(["response", "build", "approval", "processing", "shipping", "other"]).optional(),
  estimated_wait: z.enum(["minutes", "hours", "days", "weeks"]).optional(),
  deadline: z.string().optional(),
  category: z.enum(["coding", "writing", "emails", "research", "errands", "calls", "planning", "review"]).optional(),
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
  images: ImageInput[] = [],
  userKeys?: UserKeys,
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
- What ACTUALLY blocks what — for each dependency, name the specific output that flows from one task to another. If you can't name it, they're independent.
- Where can the human and AI work at the same time? Most agent and human tasks are independent — identify which ones truly aren't.
- Which tasks should be done by an AI agent vs a human vs hybrid (agent drafts, human reviews)
- For agent tasks: which ones need strong coding/reasoning (suited for Claude Code) vs simpler generation (suited for a built-in agent)
- Any risks or gotchas

Keep each observation to 1-2 sentences. Be practical and specific.`;

  // Helper to select model, using user keys if provided
  const pickModel = (purpose: import("./models").ModelPurpose) =>
    userKeys ? selectModelWithUserKey(purpose, userKeys) : selectModel(purpose);

  // Phase 1: Think out loud — Claude for strong reasoning
  const { model: thinkingModel } = pickModel("thinking");
  const thinkingResult = streamText({
    model: thinkingModel,
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

  // Phase 2: Generate plan structure (no subtasks — fast) — Claude for reasoning
  yield { type: "status", text: "Structuring your plan..." };

  const { model: planModel } = pickModel("planning");
  const planResult = await generateObject({
    model: planModel,
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

AGENT TYPE ASSIGNMENT:
For tasks with assignee "agent" or "hybrid", set agent_type:
- "claude-code": Tasks that need real coding, implementation, debugging, complex reasoning, or working with code repositories. Claude Code can read files, write code, run commands, and think deeply.
- "builtin": Simpler agent tasks — drafting content, researching, generating text, filling templates. These use a lightweight built-in agent.
- Leave agent_type undefined for "user" tasks.

CRITICAL — DEPENDENCY RULES:
A dependency (depends_on) means: "this task LITERALLY CANNOT START without the OUTPUT of that task." Not "it would be nice to do first" — it means IMPOSSIBLE without it.

For EVERY dependency you add, ask: "What specific output from task A does task B need?" If you can't name it, there is no dependency.

CROSS-TYPE DEPENDENCIES (most important):
- Agent tasks CAN depend on user tasks IF the agent needs something only the human can provide (e.g., agent needs login credentials the user created, agent needs a file the user uploaded)
- User tasks CAN depend on agent tasks IF the user needs the agent's output to act (e.g., user reviews a draft the agent wrote)
- But MOST agent tasks and user tasks are INDEPENDENT and should run in parallel
- Example: "draft blog post" (agent) and "set up hosting" (user) have NO dependency — they produce different outputs for different purposes

NEVER DO THIS:
- Serial chain where everything depends on the previous task
- Agent task waiting on a user task when it doesn't need the user's output
- User task waiting on an agent task when the user doesn't need the agent's output
- Marking tasks as dependent just because they're in the same topic area

ALWAYS DO THIS:
- Multiple tasks with empty depends_on (things that can start immediately)
- Use parallel_group for tasks with identical dependencies
- Let agents and humans work simultaneously whenever their tasks are independent
- Only add a dependency when you can name the SPECIFIC OUTPUT that flows from one task to another

SCHEDULING INTELLIGENCE — WAIT TIMES:
For any task where completion triggers a WAIT before the next step can happen, set:
- has_wait_after: true
- wait_type: what kind of wait — "response" (waiting for someone to reply), "build" (deploy/compile time), "approval" (someone needs to approve), "processing" (automated processing), "shipping" (physical delivery), "other"
- estimated_wait: how long — "minutes", "hours", "days", "weeks"

Examples:
- "Send outreach emails" → has_wait_after: true, wait_type: "response", estimated_wait: "days"
- "Submit app for review" → has_wait_after: true, wait_type: "approval", estimated_wait: "days"
- "Deploy to production" → has_wait_after: true, wait_type: "build", estimated_wait: "minutes"
- "Order equipment" → has_wait_after: true, wait_type: "shipping", estimated_wait: "weeks"
- "Post on Reddit" → has_wait_after: true, wait_type: "response", estimated_wait: "hours"

This helps the system suggest: "Do this first — you'll be waiting on a response, so start other tasks while you wait."
Leave these fields unset for tasks with no meaningful wait time after completion.

DEADLINES:
If the user mentions any deadlines, due dates, or time constraints, tag tasks with a \`deadline\` ISO date string. Infer deadlines from context (e.g., 'need this by Friday' means next Friday's date, 'due in 3 days' means 3 days from today). Today's date is ${new Date().toISOString().split("T")[0]}. Only set deadline on tasks that actually have time constraints — don't add deadlines to every task.

TASK CATEGORIES:
Tag each task with a \`category\` from: coding, writing, emails, research, errands, calls, planning, review. Pick the most specific one that matches the primary activity of the task.

Generate a realistic, practical plan with 6-12 top-level tasks. Make sure the dependency graph is valid — no circular dependencies, and every id referenced in depends_on must exist.`,
  });

  const plan = planResult.object as Plan;
  plan.nodes = computeUnlocked(plan.nodes as DagNode[], new Set());

  // Yield plan immediately so UI shows it fast
  yield { type: "plan", plan };

  // Phase 3: Generate subtasks for user/hybrid tasks — Gemini for fast generation
  const humanTasks = getAllTasks(plan.nodes).filter(
    (t) => t.assignee === "user" || t.assignee === "hybrid"
  );

  if (humanTasks.length > 0) {
    yield { type: "status", text: "Adding step-by-step details..." };

    try {
      const taskList = humanTasks
        .map((t) => `- id: "${t.id}", title: "${t.title}", assignee: "${t.assignee}", description: "${t.description}"`)
        .join("\n");

      const { model: subtaskModel } = pickModel("subtasks");
      const subtasksResult = await generateObject({
        model: subtaskModel,
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

IMPORTANT RULES BY TASK TYPE:

For "user" tasks: all subtasks should be assignee "user". These are human-only tasks.

For "hybrid" tasks — CLEAN HANDOFF, NO PING-PONG:
- ALL agent subtasks come FIRST (drafting, generating, researching)
- ALL user subtasks come AFTER (reviewing, approving, using the output)
- Never alternate agent→user→agent→user. The agent does its batch, then the human does theirs.
- User subtasks in hybrid tasks should be about REVIEWING and ACTING ON what the agent produced, not about making choices the agent should have handled.
- If the agent generates options, the agent should present them — the user's subtask is "Review and approve" not "Choose between options".
- Mark agent subtasks as parallel_with each other if they can run simultaneously.

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

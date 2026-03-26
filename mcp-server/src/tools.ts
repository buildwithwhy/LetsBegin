import {
  listAllPlans,
  getPlanById,
  updatePlan,
  createPlan,
  type StoredPlan,
  type Task,
  type DagNode,
  type Energy,
} from "./db.js";

// --- DAG helpers (mirrored from lib/dag.ts) ---

function getAllTasks(nodes: DagNode[]): Task[] {
  const tasks: Task[] = [];
  for (const node of nodes) {
    if (node.type === "task") {
      tasks.push(node);
    } else {
      tasks.push(...node.children);
    }
  }
  return tasks;
}

function computeStatuses(nodes: DagNode[], doneIds: Set<string>): DagNode[] {
  const expandedDone = new Set(doneIds);
  for (const node of nodes) {
    if (node.type === "parallel_group") {
      const allChildrenDone = node.children.every((c) => doneIds.has(c.id));
      if (allChildrenDone) expandedDone.add(node.id);
    }
  }

  return nodes.map((node) => {
    if (node.type === "task") {
      if (expandedDone.has(node.id)) return { ...node, status: "done" as const };
      const allDepsMet = node.depends_on.every((dep) => expandedDone.has(dep));
      return { ...node, status: allDepsMet ? ("pending" as const) : ("locked" as const) };
    } else {
      const updatedChildren = node.children.map((child) => {
        if (expandedDone.has(child.id)) return { ...child, status: "done" as const };
        const groupDepsMet = node.depends_on.every((dep) => expandedDone.has(dep));
        const childDepsMet = child.depends_on.every((dep) => expandedDone.has(dep));
        return {
          ...child,
          status: groupDepsMet && childDepsMet ? ("pending" as const) : ("locked" as const),
        };
      });
      const allChildrenDone = updatedChildren.every((c) => c.status === "done");
      const groupDepsMet = node.depends_on.every((dep) => expandedDone.has(dep));
      let groupStatus: "locked" | "pending" | "done" = "locked";
      if (allChildrenDone) groupStatus = "done";
      else if (groupDepsMet) groupStatus = "pending";
      return { ...node, children: updatedChildren, status: groupStatus };
    }
  });
}

interface TaskPriority {
  task: Task;
  score: number;
  reasons: string[];
}

function scoreTasks(
  pendingTasks: Task[],
  allTasks: Task[],
  currentEnergy: Energy | null
): TaskPriority[] {
  const totalDownstream = (id: string, visited = new Set<string>()): number => {
    if (visited.has(id)) return 0;
    visited.add(id);
    let count = 0;
    for (const t of allTasks) {
      if (t.depends_on.includes(id)) {
        count += 1 + totalDownstream(t.id, visited);
      }
    }
    return count;
  };

  return pendingTasks
    .map((task) => {
      let score = 0;
      const reasons: string[] = [];

      if (task.has_wait_after) {
        const waitScores: Record<string, number> = { weeks: 50, days: 40, hours: 20, minutes: 10 };
        score += waitScores[task.estimated_wait || "days"] || 30;
        const waitLabel =
          task.wait_type === "response"
            ? "waiting on a response"
            : task.wait_type === "approval"
              ? "needs approval"
              : task.wait_type === "build"
                ? "build/deploy time"
                : task.wait_type === "processing"
                  ? "processing time"
                  : task.wait_type === "shipping"
                    ? "shipping time"
                    : "has wait time";
        reasons.push(`Do first -- ${waitLabel} (${task.estimated_wait || "some time"})`);
      }

      const downstream = totalDownstream(task.id);
      if (downstream > 0) {
        score += downstream * 8;
        reasons.push(`Unblocks ${downstream} task${downstream > 1 ? "s" : ""}`);
      }

      if (task.assignee === "agent") {
        score += 15;
        reasons.push("Agent task -- runs in background");
      } else if (task.assignee === "hybrid") {
        score += 10;
        reasons.push("Start agent draft, then you review");
      }

      // Deadline urgency
      if (task.deadline) {
        const now = Date.now();
        const deadlineMs = new Date(task.deadline).getTime();
        const hoursUntil = (deadlineMs - now) / (1000 * 60 * 60);

        if (hoursUntil < 0) {
          score += 60;
          reasons.push("OVERDUE");
        } else if (hoursUntil < 24) {
          score += 40;
          reasons.push(`Due in ${Math.max(1, Math.round(hoursUntil))} hours`);
        } else if (hoursUntil < 48) {
          score += 25;
          reasons.push("Due tomorrow");
        } else if (hoursUntil < 7 * 24) {
          score += 10;
          reasons.push("Due this week");
        }

        // Factor in estimated_wait
        if (task.estimated_wait && hoursUntil > 0) {
          const waitHoursMap: Record<string, number> = { minutes: 0.5, hours: 4, days: 72, weeks: 168 };
          const waitHours = waitHoursMap[task.estimated_wait] || 0;
          if (waitHours > 0 && hoursUntil - waitHours < 24) {
            score += 30;
            reasons.push("Start now -- wait time + deadline");
          }
        }
      }

      if (currentEnergy && task.energy === currentEnergy) {
        score += 5;
        reasons.push("Matches your energy level");
      }
      if (currentEnergy === "low" && task.energy === "low") {
        score += 5;
      }

      return { task, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

// --- Tool implementations ---

export async function listProjects() {
  const plans = await listAllPlans();
  return plans.map((p) => {
    const allTasks = getAllTasks(p.nodes);
    const doneCount = allTasks.filter((t) => p.done_ids.includes(t.id)).length;
    return {
      id: p.id,
      title: p.project_title,
      summary: p.summary,
      progress: `${doneCount}/${allTasks.length}`,
      updated_at: p.updated_at,
    };
  });
}

export async function getCurrentTask(projectId?: string) {
  const plans = projectId ? [await getPlanById(projectId)] : await listAllPlans();
  const validPlans = plans.filter((p): p is StoredPlan => p !== null);

  let bestOverall: { plan: StoredPlan; priority: TaskPriority } | null = null;

  for (const plan of validPlans) {
    const doneIds = new Set(plan.done_ids);
    const updatedNodes = computeStatuses(plan.nodes, doneIds);
    const allTasks = getAllTasks(updatedNodes);
    const pendingTasks = allTasks.filter((t) => t.status === "pending");

    if (pendingTasks.length === 0) continue;

    const scored = scoreTasks(pendingTasks, allTasks, null);
    if (scored.length > 0) {
      const top = scored[0];
      if (!bestOverall || top.score > bestOverall.priority.score) {
        bestOverall = { plan, priority: top };
      }
    }
  }

  if (!bestOverall) {
    return { message: "No pending tasks found." };
  }

  const { plan, priority } = bestOverall;
  return {
    project_title: plan.project_title,
    project_id: plan.id,
    task: {
      id: priority.task.id,
      title: priority.task.title,
      description: priority.task.description,
      assignee: priority.task.assignee,
      energy: priority.task.energy,
      subtasks: priority.task.subtasks,
      deadline: priority.task.deadline,
    },
    why: priority.reasons,
  };
}

export async function getProjectContext(projectId: string) {
  const plan = await getPlanById(projectId);
  if (!plan) throw new Error(`Project not found: ${projectId}`);

  const doneIds = new Set(plan.done_ids);
  const updatedNodes = computeStatuses(plan.nodes, doneIds);
  const allTasks = getAllTasks(updatedNodes);

  const completedTasks = allTasks
    .filter((t) => t.status === "done")
    .map((t) => ({ title: t.title, notes: t.notes || "" }));

  const pendingTasks = allTasks
    .filter((t) => t.status === "pending")
    .map((t) => ({
      title: t.title,
      description: t.description,
      assignee: t.assignee,
    }));

  return {
    id: plan.id,
    title: plan.project_title,
    summary: plan.summary,
    nodes: updatedNodes,
    completed_tasks: completedTasks,
    pending_tasks: pendingTasks,
  };
}

export async function markTaskDone(projectId: string, taskId: string, notes?: string) {
  const plan = await getPlanById(projectId);
  if (!plan) throw new Error(`Project not found: ${projectId}`);

  const allTasks = getAllTasks(plan.nodes);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const newDoneIds = Array.from(new Set([...plan.done_ids, taskId]));

  // If notes provided, update the task's notes in the nodes
  let updatedNodes = plan.nodes;
  if (notes) {
    updatedNodes = plan.nodes.map((node) => {
      if (node.type === "task" && node.id === taskId) {
        return { ...node, notes, completed_at: new Date().toISOString() };
      }
      if (node.type === "parallel_group") {
        return {
          ...node,
          children: node.children.map((child) =>
            child.id === taskId
              ? { ...child, notes, completed_at: new Date().toISOString() }
              : child
          ),
        };
      }
      return node;
    });
  }

  const updated = await updatePlan(projectId, {
    done_ids: newDoneIds,
    nodes: updatedNodes,
  });

  return {
    success: true,
    task_title: task.title,
    progress: `${newDoneIds.length}/${allTasks.length}`,
    updated_at: updated.updated_at,
  };
}

export async function addTask(
  projectId: string,
  title: string,
  description: string,
  assignee: "agent" | "user" | "hybrid" = "user",
  energy: "high" | "medium" | "low" = "medium",
  deadline?: string
) {
  const plan = await getPlanById(projectId);
  if (!plan) throw new Error(`Project not found: ${projectId}`);

  const newTask: Task = {
    id: `custom-${Date.now()}`,
    type: "task",
    title,
    description,
    assignee,
    energy,
    status: "pending",
    depends_on: [],
    deadline,
  };

  const updatedNodes = [...plan.nodes, newTask];
  await updatePlan(projectId, { nodes: updatedNodes });

  return {
    success: true,
    task: {
      id: newTask.id,
      title: newTask.title,
      description: newTask.description,
      assignee: newTask.assignee,
      energy: newTask.energy,
    },
  };
}

export async function getTaskPrompt(projectId: string, taskId: string) {
  const plan = await getPlanById(projectId);
  if (!plan) throw new Error(`Project not found: ${projectId}`);

  const doneIds = new Set(plan.done_ids);
  const allTasks = getAllTasks(plan.nodes);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // Build project context
  const projectContext = `Project: ${plan.project_title}\n${plan.summary}`;

  // Gather prior completed work
  const priorOutputs = allTasks
    .filter((t) => doneIds.has(t.id) && t.notes)
    .map((t) => ({
      title: t.title,
      assignee: t.assignee,
      output: t.notes!,
    }));

  // Build prompt (mirrors generateAgentPrompt from ByoAgentPanel)
  const lines: string[] = [];
  lines.push(`# Task: ${task.title}`);
  lines.push("");
  lines.push("## Description");
  lines.push(task.description);
  lines.push("");
  lines.push("## Project context");
  lines.push(projectContext);

  if (priorOutputs.length > 0) {
    lines.push("");
    lines.push("## Prior completed work");
    for (const p of priorOutputs) {
      const truncated = p.output.length > 300 ? p.output.slice(0, 300) + "..." : p.output;
      lines.push(`- **${p.title}** (${p.assignee}): ${truncated}`);
    }
  }

  lines.push("");
  lines.push("## Instructions");
  if (task.agent_type === "claude-code") {
    lines.push(
      "This is a coding task. Write production-quality code. Create complete, working files -- not snippets or placeholders."
    );
  } else {
    lines.push(
      "Complete this task thoroughly. Produce real, actionable output -- not summaries or placeholders."
    );
  }

  if (task.assignee === "hybrid") {
    lines.push("");
    lines.push(
      "**This is a hybrid task** -- you draft, then I review. Present options clearly so I can choose. Label drafts as drafts."
    );
  }

  // Claude Code wrapper
  lines.push("");
  lines.push("---");
  lines.push(
    "You are running as Claude Code. Use your tools to read/write files, run commands, and produce real outputs. Don't just describe what to do -- actually do it."
  );

  const toolSuggestion =
    task.agent_type === "claude-code"
      ? "Claude Code"
      : task.assignee === "agent"
        ? "Any AI coding assistant"
        : "Claude Code or similar AI tool";

  return {
    prompt: lines.join("\n"),
    tool_suggestion: toolSuggestion,
  };
}

// --- BYO Planning: let the user's own AI generate the plan ---

export function getPlanningPrompt(brief: string) {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `You are a project planning assistant. A user has given you this project brief:

"${brief}"

Generate a structured project plan as a JSON object matching this exact schema:

{
  "project_title": "string — short project title",
  "summary": "string — 1-2 sentence summary",
  "nodes": [
    {
      "id": "string — short slug like 'setup-account'",
      "type": "task",
      "title": "string",
      "description": "string",
      "assignee": "agent" | "user" | "hybrid",
      "energy": "high" | "medium" | "low",
      "status": "pending",
      "depends_on": ["array of task ids this depends on"],
      "agent_type": "builtin" | "claude-code" (optional, for agent/hybrid tasks),
      "has_wait_after": true/false (optional),
      "wait_type": "response" | "build" | "approval" | "processing" | "shipping" | "other" (optional),
      "estimated_wait": "minutes" | "hours" | "days" | "weeks" (optional),
      "deadline": "ISO date string" (optional),
      "category": "coding" | "writing" | "emails" | "research" | "errands" | "calls" | "planning" | "review" (optional)
    }
    // OR for parallel tasks:
    {
      "id": "string",
      "type": "parallel_group",
      "children": [array of task objects],
      "status": "pending",
      "depends_on": ["array of task ids"]
    }
  ]
}

Rules:
- assignee: "agent" (AI can fully automate), "user" (human must do it), "hybrid" (agent drafts, human reviews)
- agent_type: "claude-code" for coding/implementation tasks, "builtin" for simpler drafting/research
- Use parallel_group for tasks that can run simultaneously
- depends_on means "this task LITERALLY CANNOT START without the OUTPUT of that task"
- Most agent and user tasks should be INDEPENDENT and run in parallel
- Tag tasks with has_wait_after/wait_type/estimated_wait when completion triggers a wait
- If deadlines are mentioned, use ISO dates. Today is ${today}.
- Generate 6-12 top-level tasks. No circular dependencies.

Return ONLY the JSON object, no markdown fences, no explanation.`;

  return {
    prompt,
    instructions: "Copy this prompt into your AI tool (Claude Code, ChatGPT, etc.). It will generate a plan JSON. Then use the submit_plan tool to save it to LetsBegin.",
    schema_hint: "The response should be a JSON object with project_title, summary, and nodes array.",
  };
}

export async function submitPlan(
  brief: string,
  planJson: {
    project_title: string;
    summary: string;
    nodes: DagNode[];
  },
  userId?: string
) {
  // Validate basic structure
  if (!planJson.project_title || !planJson.summary || !Array.isArray(planJson.nodes)) {
    throw new Error("Invalid plan structure. Need project_title, summary, and nodes array.");
  }

  if (planJson.nodes.length === 0) {
    throw new Error("Plan must have at least one task.");
  }

  // Validate each node has required fields
  for (const node of planJson.nodes) {
    if (node.type === "task") {
      if (!node.id || !node.title || !node.description) {
        throw new Error(`Task missing required fields (id, title, description): ${JSON.stringify(node).slice(0, 100)}`);
      }
    } else if (node.type === "parallel_group") {
      if (!node.children || node.children.length === 0) {
        throw new Error(`Parallel group ${node.id} has no children.`);
      }
    }
  }

  // Use a default user_id if not provided (for personal/local use)
  const effectiveUserId = userId || "mcp-user";

  const stored = await createPlan(
    effectiveUserId,
    brief,
    planJson.project_title,
    planJson.summary,
    planJson.nodes
  );

  const allTasks = getAllTasks(stored.nodes);

  return {
    success: true,
    project_id: stored.id,
    title: stored.project_title,
    task_count: allTasks.length,
    message: `Project "${stored.project_title}" created with ${allTasks.length} tasks. Open LetsBegin to start working on it.`,
  };
}

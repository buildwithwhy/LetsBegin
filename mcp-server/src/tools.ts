import {
  listAllPlans,
  getPlanById,
  updatePlan,
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
  energy: "high" | "medium" | "low" = "medium"
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

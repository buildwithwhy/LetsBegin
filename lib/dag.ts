export type Energy = "high" | "medium" | "low";
export type Assignee = "agent" | "user" | "hybrid";
export type Status = "locked" | "pending" | "done" | "skipped";

// What kind of agent handles this task
export type AgentType = "builtin" | "claude-code" | "custom";

// What real-world action this task represents
export type ActionType = "draft" | "post" | "send" | "deploy" | "research" | "review" | "build" | "decide";

// Recurring task configuration
export interface Recurrence {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  next_due?: string; // ISO date of next occurrence
  completed_count?: number; // how many times this has been completed
}

export interface Subtask {
  id: string;
  title: string;
  assignee: "agent" | "user";
  depends_on: string[]; // ids of other subtasks within the same task
  parallel_with?: string[]; // ids of subtasks that can run simultaneously
}

// Activity events — make human work visible and traceable
export type ActivityEvent =
  | { type: "started"; at: string }
  | { type: "completed"; at: string }
  | { type: "note"; text: string; at: string }
  | { type: "agent_started"; agent: AgentType; model: string; at: string }
  | { type: "agent_completed"; agent: AgentType; model: string; at: string }
  | { type: "approved"; at: string }
  | { type: "regenerated"; at: string };

export type TaskCategory = "coding" | "writing" | "emails" | "research" | "errands" | "calls" | "planning" | "review";

export interface Task {
  id: string;
  type: "task";
  title: string;
  description: string;
  assignee: Assignee;
  energy: Energy;
  status: Status;
  depends_on: string[];
  subtasks?: Subtask[];
  // Agent and action configuration
  agent_type?: AgentType;  // what kind of agent runs this (for agent/hybrid tasks)
  action_type?: ActionType;  // what real-world action this represents
  recurrence?: Recurrence;  // if this task repeats on a schedule
  // Scheduling intelligence
  has_wait_after?: boolean;  // true if this task triggers a wait (email response, build, approval)
  wait_type?: "response" | "build" | "approval" | "processing" | "shipping" | "other";
  estimated_wait?: "minutes" | "hours" | "days" | "weeks";
  // Traceability
  deadline?: string;  // ISO date string for task deadline
  activity?: ActivityEvent[];  // traceable log of what happened
  notes?: string;  // human-written notes on this task
  started_at?: string;  // when this task was first acted on
  completed_at?: string;  // when this task was marked done
  // Focus category
  category?: TaskCategory;  // what kind of work this task represents
}

export interface ParallelGroup {
  id: string;
  type: "parallel_group";
  children: Task[];
  status: Status;
  depends_on: string[];
}

export type DagNode = Task | ParallelGroup;

export interface Plan {
  project_title: string;
  summary: string;
  nodes: DagNode[];
}

export function getAllTasks(nodes: DagNode[]): Task[] {
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

export function computeUnlocked(nodes: DagNode[], doneIds: Set<string>): DagNode[] {
  // Expand doneIds to include parallel group IDs when all their children are done
  const expandedDone = new Set(doneIds);
  for (const node of nodes) {
    if (node.type === "parallel_group") {
      const allChildrenDone = node.children.every((c) => doneIds.has(c.id));
      if (allChildrenDone) {
        expandedDone.add(node.id);
      }
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
      let groupStatus: Status = "locked";
      if (allChildrenDone) groupStatus = "done";
      else if (groupDepsMet) groupStatus = "pending";
      return { ...node, children: updatedChildren, status: groupStatus };
    }
  });
}

// ─── Smart task scheduling ───
// Scores pending tasks by project management best practices:
// 1. Tasks with long wait times after (emails, approvals) → do first
// 2. Tasks that unblock the most downstream work → higher priority
// 3. Agent tasks → kick off early (they run in parallel)
// 4. Energy matching → respect user's current capacity

export interface TaskPriority {
  task: Task;
  score: number;
  reasons: string[];
}

export type ProjectPriority = "high" | "medium" | "low";

export function scoreTasks(
  pendingTasks: Task[],
  allTasks: Task[],
  currentEnergy: Energy | null,
  projectPriority?: ProjectPriority,
): TaskPriority[] {
  // Build a map of how many tasks each task unblocks (downstream count)
  const downstreamCount = new Map<string, number>();
  for (const t of allTasks) {
    for (const dep of t.depends_on) {
      downstreamCount.set(dep, (downstreamCount.get(dep) || 0) + 1);
    }
  }

  // Recursively count total downstream chain length
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

  return pendingTasks.map((task) => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Wait time after completion — do these first (biggest impact)
    if (task.has_wait_after) {
      const waitScores = { weeks: 50, days: 40, hours: 20, minutes: 10 };
      const waitScore = waitScores[task.estimated_wait || "days"] || 30;
      score += waitScore;
      const waitLabel = task.wait_type === "response" ? "waiting on a response"
        : task.wait_type === "approval" ? "needs approval"
        : task.wait_type === "build" ? "build/deploy time"
        : task.wait_type === "processing" ? "processing time"
        : task.wait_type === "shipping" ? "shipping time"
        : "has wait time";
      reasons.push(`Do first — ${waitLabel} (${task.estimated_wait || "some time"})`);
    }

    // 2. Unblocks downstream work — critical path
    const downstream = totalDownstream(task.id);
    if (downstream > 0) {
      score += downstream * 8;
      reasons.push(`Unblocks ${downstream} task${downstream > 1 ? "s" : ""}`);
    }

    // 3. Agent tasks should be kicked off early (they run in background)
    if (task.assignee === "agent") {
      score += 15;
      reasons.push("Agent task — runs in background");
    } else if (task.assignee === "hybrid") {
      score += 10;
      reasons.push("Start agent draft, then you review");
    }

    // 4. Deadline urgency
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

      // Factor in estimated_wait — if wait time eats into deadline, it's urgent NOW
      if (task.estimated_wait && hoursUntil > 0) {
        const waitHoursMap: Record<string, number> = { minutes: 0.5, hours: 4, days: 72, weeks: 168 };
        const waitHours = waitHoursMap[task.estimated_wait] || 0;
        if (waitHours > 0 && hoursUntil - waitHours < 24) {
          score += 30;
          reasons.push("Start now \u2014 wait time + deadline");
        }
      }
    }

    // 5. Energy matching (smaller bonus, tiebreaker)
    if (currentEnergy && task.energy === currentEnergy) {
      score += 5;
      reasons.push("Matches your energy level");
    }
    // If low energy, boost low-energy tasks more
    if (currentEnergy === "low" && task.energy === "low") {
      score += 5;
    }

    // 6. Project priority boost
    if (projectPriority === "high") {
      score += 20;
      reasons.push("High priority project");
    } else if (projectPriority === "low") {
      score -= 10;
      reasons.push("Low priority project");
    }

    return { task, score, reasons };
  }).sort((a, b) => b.score - a.score);
}

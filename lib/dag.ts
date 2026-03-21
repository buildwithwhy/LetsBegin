export type Energy = "high" | "medium" | "low";
export type Assignee = "agent" | "user" | "hybrid";
export type Status = "locked" | "pending" | "done" | "skipped";

export interface Task {
  id: string;
  type: "task";
  title: string;
  description: string;
  assignee: Assignee;
  energy: Energy;
  status: Status;
  depends_on: string[];
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
  return nodes.map((node) => {
    if (node.type === "task") {
      if (doneIds.has(node.id)) return { ...node, status: "done" as const };
      const allDepsMet = node.depends_on.every((dep) => doneIds.has(dep));
      return { ...node, status: allDepsMet ? ("pending" as const) : ("locked" as const) };
    } else {
      const updatedChildren = node.children.map((child) => {
        if (doneIds.has(child.id)) return { ...child, status: "done" as const };
        const groupDepsMet = node.depends_on.every((dep) => doneIds.has(dep));
        const childDepsMet = child.depends_on.every((dep) => doneIds.has(dep));
        return {
          ...child,
          status: groupDepsMet && childDepsMet ? ("pending" as const) : ("locked" as const),
        };
      });
      const allChildrenDone = updatedChildren.every((c) => c.status === "done");
      const groupDepsMet = node.depends_on.every((dep) => doneIds.has(dep));
      let groupStatus: Status = "locked";
      if (allChildrenDone) groupStatus = "done";
      else if (groupDepsMet) groupStatus = "pending";
      return { ...node, children: updatedChildren, status: groupStatus };
    }
  });
}

export function findNextActive(nodes: DagNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "task" && node.status === "pending") {
      return node.id;
    }
    if (node.type === "parallel_group" && node.status === "pending") {
      for (const child of node.children) {
        if (child.status === "pending") return child.id;
      }
    }
  }
  return null;
}

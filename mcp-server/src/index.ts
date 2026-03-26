import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listProjects,
  getCurrentTask,
  getProjectContext,
  markTaskDone,
  addTask,
  getTaskPrompt,
} from "./tools.js";

const server = new McpServer({
  name: "letsbegin",
  version: "1.0.0",
});

// --- Tool registrations ---

server.tool(
  "list_projects",
  "List all projects with their titles, summaries, and progress (done/total counts)",
  {},
  async () => {
    try {
      const result = await listProjects();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "get_current_task",
  "Get the highest-priority next task across all projects (or for a specific project)",
  {
    project_id: z.string().optional().describe("Optional project ID to scope the search"),
  },
  async ({ project_id }) => {
    try {
      const result = await getCurrentTask(project_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "get_project_context",
  "Get full project state including DAG, completed tasks, and pending tasks",
  {
    project_id: z.string().describe("The project ID"),
  },
  async ({ project_id }) => {
    try {
      const result = await getProjectContext(project_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "mark_task_done",
  "Mark a task as completed, optionally with notes",
  {
    project_id: z.string().describe("The project ID"),
    task_id: z.string().describe("The task ID to mark as done"),
    notes: z.string().optional().describe("Optional completion notes or output"),
  },
  async ({ project_id, task_id, notes }) => {
    try {
      const result = await markTaskDone(project_id, task_id, notes);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "add_task",
  "Add a new task to a project",
  {
    project_id: z.string().describe("The project ID"),
    title: z.string().describe("Task title"),
    description: z.string().describe("Task description"),
    assignee: z
      .enum(["agent", "user", "hybrid"])
      .optional()
      .describe("Who handles this task (default: user)"),
    energy: z
      .enum(["high", "medium", "low"])
      .optional()
      .describe("Energy level required (default: medium)"),
    deadline: z
      .string()
      .optional()
      .describe("Optional deadline as ISO date string (e.g., '2026-03-28T23:59:59.000Z')"),
  },
  async ({ project_id, title, description, assignee, energy, deadline }) => {
    try {
      const result = await addTask(project_id, title, description, assignee, energy, deadline);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "get_task_prompt",
  "Get the agent prompt for a specific task, including project context and prior results",
  {
    project_id: z.string().describe("The project ID"),
    task_id: z.string().describe("The task ID"),
  },
  async ({ project_id, task_id }) => {
    try {
      const result = await getTaskPrompt(project_id, task_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  }
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LetsBegin MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

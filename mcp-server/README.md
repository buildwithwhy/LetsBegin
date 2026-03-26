# LetsBegin MCP Server

An MCP (Model Context Protocol) server that exposes LetsBegin project state as tools for AI agents.

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure environment variables

The server needs Supabase credentials:

- `SUPABASE_URL` — Your Supabase project URL
- `SUPABASE_SERVICE_KEY` — A Supabase service role key (bypasses RLS) or `SUPABASE_ANON_KEY`

### 3. Add to Claude Code

Add this to your Claude Code MCP configuration (`.claude/mcp.json` or project settings):

```json
{
  "mcpServers": {
    "letsbegin": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/LetsBegin/mcp-server/src/index.ts"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_KEY": "your-service-role-key"
      }
    }
  }
}
```

### 4. Add to Cursor

In Cursor settings, add an MCP server with the same command and environment variables.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with titles, summaries, and progress |
| `get_current_task` | Get the highest-priority next task (optionally scoped to a project) |
| `get_project_context` | Get full project state: DAG, completed tasks, pending tasks |
| `mark_task_done` | Mark a task as completed, with optional notes |
| `add_task` | Add a new task to a project |
| `get_task_prompt` | Get the agent prompt for a task, ready to execute |

## Development

```bash
# Type-check
npm run typecheck

# Run directly (requires SUPABASE_URL and SUPABASE_SERVICE_KEY in env)
npm start
```

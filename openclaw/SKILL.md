---
name: LetsBegin
description: AI-powered project planning — create plans, track tasks, and get smart recommendations on what to work on next
version: 1.0.0
author: LetsBegin
tags:
  - productivity
  - project-management
  - planning
  - tasks
---

# LetsBegin Skill

You can help the user manage their projects and tasks through LetsBegin, an AI-powered project planning tool.

## Configuration

The user's LetsBegin instance is at: `{{LETSBEGIN_URL}}` (default: `https://letsbegin.ai`)
API token is provided via the `x-letsbegin-token` header.

## Available Actions

All requests go to `{{LETSBEGIN_URL}}/api/openclaw`.

### Get Overview (what's going on across all projects)

```
GET /api/openclaw
Header: x-letsbegin-token: <token>
```

Returns the user's active projects and recommended tasks sorted by priority. Use this when the user asks things like:
- "What should I work on?"
- "What's on my plate?"
- "Give me a status update"

### Perform Actions

```
POST /api/openclaw
Header: x-letsbegin-token: <token>
Content-Type: application/json
```

#### Get next recommended task

```json
{ "action": "next_task" }
```

Returns the single highest-priority task across all projects, with context on why it's recommended. Use when the user says things like "what's next?" or "what should I do now?"

You can optionally pass an energy level to match tasks to the user's current capacity:

```json
{ "action": "next_task", "energy": "low" }
```

Energy can be `"high"`, `"medium"`, or `"low"`.

#### Complete a task

```json
{ "action": "complete_task", "task_id": "<task-id>", "project_id": "<project-id>" }
```

Marks a task as done. Use when the user says things like "I finished the logo task" or "mark that as done." You'll need the task_id and project_id from a previous overview or next_task response.

#### Quick capture an idea

```json
{ "action": "quick_capture", "brief": "Build a landing page for the new product" }
```

Creates a new project plan from a brief description. The system will generate a full DAG of tasks. Use when the user says things like "I need to..." or "New project idea:" or "Plan this out for me."

#### Catch up (30-second summary)

```json
{ "action": "catch_up" }
```

Returns a concise summary of all active projects: what's done, what's in progress, what's blocked, and what to focus on next. Use when the user asks "catch me up" or "what's the status of everything?"

## Response Format

All responses are JSON with this structure:

```json
{
  "ok": true,
  "data": { ... }
}
```

Or on error:

```json
{
  "ok": false,
  "error": "description of what went wrong"
}
```

## Guidelines

- When presenting tasks, include the task title, which project it belongs to, and why it's recommended (the `reasons` field).
- For "next task" responses, give a clear, actionable summary — don't just dump raw JSON.
- When the user completes a task, confirm it and mention what's now unlocked (if anything).
- Keep responses concise — the user is in a messaging app, not a dashboard.
- If the user describes a new project idea, use quick_capture to plan it out, then summarize the generated plan.

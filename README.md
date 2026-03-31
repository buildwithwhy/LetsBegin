# LetsBegin

**Your AI tools are frying your brain. We fix that.**

A [2026 BCG study](https://hbr.org/2026/03/when-using-ai-leads-to-brain-fry) found workers using 4+ AI tools make 39% more major errors. LetsBegin replaces the chaos with one calm workflow: describe what you want to build, get a structured plan, and execute it — with AI doing the heavy lifting while you stay in control.

## What it does

1. **Describe your project** — Write a brief (or let AI help you write one)
2. **Get a structured plan** — AI breaks it into a dependency graph (DAG) of tasks
3. **Execute with flexibility** — Use our API, bring your own API key (BYOK), or connect via MCP/OpenClaw
4. **Review in batches** — Reduce oversight burden with batch review mode instead of constant supervision

## Key features

- **One tool, not six** — Plan, execute, and review in one place. No more tab circus.
- **Zero-context chat** — Task chat is pre-loaded with your full project context. Never re-explain.
- **Context carry-forward** — Completed task outputs automatically feed into downstream tasks.
- **Cross-project intelligence** — "Your Day" dashboard picks the best tasks across all your projects based on energy, deadlines, and priority.
- **Brain fry protection** — Tracks your cognitive load, suggests breaks, and adapts task recommendations to your energy level.
- **ADHD-friendly UX** — Task timer, streaks, encouragement, break reminders, and "break it down more" for any task.
- **Quick capture** — Instantly add thoughts to any project from the dashboard.
- **OpenClaw compatible** — Use LetsBegin as an [OpenClaw Skill](./openclaw/README.md) from WhatsApp, Slack, Telegram, or any messaging app.

## Execution modes

| Mode | How it works |
|---|---|
| **Our API** | We handle everything. Zero setup. |
| **Your API Key (BYOK)** | Add your Anthropic/Google/OpenAI key. Your calls, your cost. |
| **MCP** | Use `get_planning_prompt` and `submit_plan` tools from Claude Code or any MCP client. |
| **OpenClaw** | Install the LetsBegin skill and interact through your messaging apps. |

## Getting started

```bash
npm install
npm run dev
```

Set up your environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
ANTHROPIC_API_KEY=your-key        # for "Our API" mode
GOOGLE_GENERATIVE_AI_API_KEY=your-key  # optional
```

## Tech stack

- **Next.js 16** with Turbopack
- **Supabase** for auth and user settings
- **Vercel AI SDK** for streaming LLM responses
- **TypeScript** throughout

## MCP Server

See [mcp-server/README.md](./mcp-server/README.md) for setup instructions.

## OpenClaw Skill

See [openclaw/README.md](./openclaw/README.md) for installation.

## License

MIT

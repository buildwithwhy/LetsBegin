# LetsBegin OpenClaw Skill

Use LetsBegin from any messaging app (WhatsApp, Slack, Telegram, etc.) through OpenClaw.

## Setup

### 1. Get your LetsBegin API token

1. Log in to your LetsBegin instance
2. Go to Settings and generate an API token
3. Copy the token — you'll need it in the next step

### 2. Configure OpenClaw

Add the following to your OpenClaw `config.yaml`:

```yaml
skills:
  - path: ./skills/letsbegin

env:
  LETSBEGIN_URL: https://letsbegin.ai      # or your self-hosted URL
  LETSBEGIN_TOKEN: lb_your_token_here
```

### 3. Install the skill

Copy the `SKILL.md` file from this directory into your OpenClaw skills folder:

```bash
mkdir -p ~/.openclaw/skills/letsbegin
cp SKILL.md ~/.openclaw/skills/letsbegin/SKILL.md
```

Then replace `{{LETSBEGIN_URL}}` in the skill file with your actual LetsBegin URL.

### 4. Start using it

From any connected messaging app, you can say things like:

- **"What should I work on?"** — get your top recommended task
- **"Catch me up"** — 30-second summary of all projects
- **"I finished the homepage design"** — mark a task as done
- **"New project: build a CLI tool for data migration"** — create a full project plan
- **"What's on my plate?"** — see all active projects and tasks

## How it works

The skill connects to LetsBegin's API endpoint at `/api/openclaw`, which provides:

- Cross-project task scoring (deadline urgency, dependency chains, wait times, energy matching)
- Smart recommendations on what to work on next
- Quick capture for turning ideas into structured plans
- Progress tracking across all your projects

## Requirements

- A LetsBegin account with at least one project
- OpenClaw installed and connected to a messaging platform
- Network access from your OpenClaw instance to your LetsBegin instance

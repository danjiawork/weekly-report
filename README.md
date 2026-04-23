# Weekly Report Generator

> AI-powered weekly work report tool — pulls activity from GitHub and Jira, summarizes with an AI model, and delivers via Slack or Gist.

![Next.js](https://img.shields.io/badge/Next.js_15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-D97706?logo=anthropic&logoColor=white)

---

## Architecture

<!--
Full automation flow (for reference):
  /loop cron → /weekly-report Skill → /api/generate-report-cli
             → Anthropic SDK (streaming) → GitHub Gist upload
             → weekly-report-slack MCP Server → Slack DM

Pre-commit: husky runs `npm run lint` + `npm run typecheck` on every commit
AI provider: swappable via ANTHROPIC_BASE_URL (OpenRouter, Ollama, etc.)
-->

```mermaid
graph LR
    subgraph Sources["Data Sources"]
        GH[GitHub API]
        JI[Jira API / CSV]
    end

    subgraph App["Next.js 15 — App Router"]
        AUTH["NextAuth.js\nGitHub OAuth"]
        API["API Routes\nbrowser + headless"]
    end

    subgraph AILayer["AI — provider-agnostic"]
        MODEL["Any OpenAI-compatible API\nClaude · GPT · Gemini · Llama"]
    end

    subgraph Output["Output"]
        UI[React UI]
        GIST[GitHub Gist]
        SLACK[Slack DM]
    end

    GH & JI --> API
    AUTH -->|"session"| API
    API -->|"prompt"| MODEL
    MODEL -->|"ReadableStream"| API
    API --> UI & GIST
    GIST --> SLACK
```

**Key technical points:**

- **Streaming AI response** — `ReadableStream` with `Transfer-Encoding: chunked`, tokens render in real-time
- **Provider-agnostic AI** — swap Claude for GPT, Gemini, or a local model via `ANTHROPIC_BASE_URL`
- **Dual API surface** — `/api/generate-report` uses OAuth session (browser); `/api/generate-report-cli` uses `CLI_SECRET` header (automation/cron/Skill)
- **MCP Server** — custom `weekly-report-slack` server posts reports to Slack DM via Claude Code
- **Claude Code Skill** — `/weekly-report` orchestrates the full pipeline in one command
- **Pre-commit CI** — Husky runs ESLint + `tsc --noEmit` before every commit

---

## Features

| Feature | Description |
| --- | --- |
| GitHub integration | PRs, commits, code reviews via OAuth — no token setup needed |
| Jira integration | Via API token or manual CSV upload |
| AI summarization | Personal View (activity log) + Manager View (impact summary) |
| Any AI model | Swap Claude for GPT-4, local models, or any OpenAI-compatible API |
| GitHub Gist export | Generates a secret shareable link after each report |
| Claude Code Skill | `/weekly-report` — one command generates and delivers the full report |
| Slack MCP Server | Posts report to your Slack DM via a local MCP server |
| Pre-commit hook | ESLint + TypeScript check runs before every commit |
| Scheduled delivery | `/loop` cron fires the skill on a recurring schedule |

---

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **NextAuth.js** for GitHub OAuth
- **Anthropic SDK** for AI summarization (supports `ANTHROPIC_BASE_URL` for any provider)
- **Husky** for pre-commit hooks
- **Claude Code** for skill + MCP automation

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-username/weekly-report.git
cd weekly-report
npm install        # also installs the pre-commit hook via `prepare`
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | Yes | Random secret — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | App URL, e.g. `http://localhost:3000` |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret |
| `ANTHROPIC_API_KEY` | Yes | API key for your AI provider |
| `ANTHROPIC_BASE_URL` | Optional | Override endpoint (e.g. OpenRouter: `https://openrouter.ai/api/v1`) |
| `CLAUDE_MODEL` | Optional | Model ID, default: `claude-sonnet-4-6` |
| `JIRA_BASE_URL` | Optional | Jira instance URL, e.g. `https://yourorg.atlassian.net` |
| `JIRA_TOKEN` | Optional | Jira API token |
| `CLI_SECRET` | Optional | Protects the headless CLI endpoint |
| `GITHUB_TOKEN` | Optional | GitHub PAT for Gist uploads |

### 3. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to `http://localhost:3000/api/auth/callback/github`
3. Paste the Client ID and Secret into `.env.local`

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, and generate your first report.

---

## Using a Different AI Model

The tool uses the Anthropic SDK but accepts any OpenAI-compatible endpoint via `ANTHROPIC_BASE_URL`.

### OpenRouter (access GPT-4o, Gemini, etc.)

```env
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
ANTHROPIC_API_KEY=<your-openrouter-key>
CLAUDE_MODEL=openai/gpt-4o
```

### Local model via Ollama

```env
ANTHROPIC_BASE_URL=http://localhost:11434/v1
ANTHROPIC_API_KEY=ollama
CLAUDE_MODEL=llama3
```

---

## Claude Code Integration

This project ships with a **Claude Code Skill** for one-command report generation.

### Install the skill

```bash
mkdir -p ~/.claude/skills/weekly-report
cp .claude/skills/weekly-report/SKILL.md ~/.claude/skills/weekly-report/SKILL.md
```

Edit the `Project directory` line in the copied `SKILL.md` to match your local clone path.

### Use it

In any Claude Code session:

```text
/weekly-report
```

Claude will: start the dev server → calculate this week's dates → call the API → upload to Gist → post to Slack.

---

## Slack Integration (MCP Server)

Post reports to your Slack DM using the bundled MCP server.

### Slack Setup

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
   - Add OAuth scopes: `chat:write`, `im:write`
   - Install to workspace, copy the **Bot Token** (`xoxb-...`)
   - Find your **Slack User ID** (profile → three dots → Copy member ID)

1. Install the MCP server

```bash
mkdir -p ~/.claude/mcp-servers/weekly-report-slack
cp .claude/mcp-server/index.js ~/.claude/mcp-servers/weekly-report-slack/index.js
cd ~/.claude/mcp-servers/weekly-report-slack
npm init -y && npm install @modelcontextprotocol/sdk
```

1. Register in `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "weekly-report-slack": {
      "type": "stdio",
      "command": "node",
      "args": ["~/.claude/mcp-servers/weekly-report-slack/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token",
        "SLACK_USER_ID": "U01YOURSLACKID"
      }
    }
  }
}
```

---

## Scheduled Reports

Use Claude Code's `/loop` to fire the skill on a recurring schedule:

```text
/loop 0 17 * * 5 /weekly-report
```

This generates and delivers a report every Friday at 5pm.

Alternatively, call the headless CLI endpoint directly from any cron scheduler:

```bash
curl -X POST http://localhost:3000/api/generate-report-cli \
  -H "Content-Type: application/json" \
  -H "x-cli-secret: <CLI_SECRET>" \
  -d '{"weekStart":"2026-04-20","weekEnd":"2026-04-26"}'
```

---

## Pre-commit Hook

Husky runs ESLint and TypeScript type checking before every commit. It installs automatically on `npm install` via the `prepare` script.

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

---

## License

MIT

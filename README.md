# Weekly Report Generator

> AI-powered weekly work report tool — pulls activity from GitHub and Jira, summarizes with an AI model, and delivers via Slack or Gist.

![Next.js](https://img.shields.io/badge/Next.js_15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-D97706?logo=anthropic&logoColor=white)

---

## Architecture

<!--
Full automation flow (for reference):
  launchd → run-weekly-report.sh → /api/generate-report-cli
          → Anthropic SDK (streaming) → GitHub Gist upload
          → weekly-report-slack MCP Server → Slack DM

Pre-commit: husky runs `npm run lint` + `npm run typecheck` on every commit
AI provider: swappable via ANTHROPIC_BASE_URL (OpenRouter, LiteLLM proxy, etc.)
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
        MODEL["Anthropic-compatible API\nClaude · GPT · Gemini (via OpenRouter)"]
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

## Key Features

| Feature | Description |
| --- | --- |
| GitHub integration | PRs, commits, code reviews via OAuth — no token setup needed |
| Jira integration | Via API token or manual CSV upload |
| AI summarization | Personal View (activity log) + Manager View (impact summary) |
| GitHub Gist export | Generates a secret shareable link after each report |
| Claude Code Skill | `/weekly-report` — one command generates and delivers the full report |
| Slack MCP Server | Posts report to your Slack DM via a local MCP server |
| Pre-commit hook | ESLint + TypeScript check runs before every commit |
| Scheduled delivery | macOS launchd fires the pipeline automatically every week |

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
cp .env.example .env.local   # then fill in your values
```

| Variable | Required | Description |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | Yes | Random secret — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | App URL, e.g. `http://localhost:3000` |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret |
| `ANTHROPIC_API_KEY` | Yes | API key for your AI provider (OpenRouter / LiteLLM keys go here too, name is SDK convention) |
| `ANTHROPIC_BASE_URL` | Optional | Override endpoint (e.g. OpenRouter: `https://openrouter.ai/api/v1`), keep the `ANTHROPIC_` prefix regardless of provider |
| `AI_MODEL` | Optional | Model ID, default: `claude-sonnet-4-6` |
| `JIRA_BASE_URL` | Optional | Jira instance URL, e.g. `https://yourorg.atlassian.net` |
| `JIRA_TOKEN` | Optional | Jira API token |
| `CLI_SECRET` | Optional | Protects the headless CLI endpoint — only needed if exposing the server publicly |
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

The tool uses the Anthropic SDK. Any provider that implements the Anthropic Messages API can be used via `ANTHROPIC_BASE_URL`.

### OpenRouter (route to GPT, Gemini, Mistral, and more)

```env
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
ANTHROPIC_API_KEY=<your-openrouter-key>
AI_MODEL=openai/gpt-4o
```

### Local models via LiteLLM proxy

[LiteLLM](https://github.com/BerriAI/litellm) translates Anthropic API calls to Ollama or any local model:

```bash
litellm --model ollama/llama3 --port 4000
```

```env
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_API_KEY=dummy
AI_MODEL=ollama/llama3
```

---

## Claude Code Integration

This project ships with a **Claude Code Skill** for one-command report generation.

### Install the skill

The skill file is already at `.claude/skills/weekly-report/SKILL.md` and works automatically when Claude Code is opened in this project directory.

To use it from any directory, copy it to your global skills folder:

```bash
mkdir -p ~/.claude/skills/weekly-report
cp .claude/skills/weekly-report/SKILL.md ~/.claude/skills/weekly-report/SKILL.md
```

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

2. Install the MCP server

```bash
mkdir -p ~/.claude/mcp-servers/weekly-report-slack
cp .claude/mcp-server/index.js ~/.claude/mcp-servers/weekly-report-slack/index.js
cd ~/.claude/mcp-servers/weekly-report-slack
npm init -y && npm install @modelcontextprotocol/sdk
```

3. Register the MCP server

```bash
claude mcp add weekly-report-slack \
  -e SLACK_BOT_TOKEN=xoxb-your-token \
  -e SLACK_USER_ID=U01YOURSLACKID \
  -- node ~/.claude/mcp-servers/weekly-report-slack/index.js
```

---

## Scheduled Reports (macOS launchd)

The project includes a shell script and launchd plist for fully automated weekly delivery — no terminal needed.

### Setup

1. Copy the plist to LaunchAgents:

   ```bash
   cp .claude/scripts/com.weekly-report.plist ~/Library/LaunchAgents/
   ```

   Open the copied file and replace the script path with your local clone location. Adjust `Weekday` and `Hour` if needed (default: Friday 14:00).

1. Load the agent:

   ```bash
   launchctl load ~/Library/LaunchAgents/com.weekly-report.plist
   ```

On schedule, `.claude/scripts/run-weekly-report.sh` will start the dev server if needed, generate the report, post to Slack, then stop the server. Logs: `/tmp/weekly-report-cron.log`.

---

## License

[MIT](LICENSE)

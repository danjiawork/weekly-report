---
name: weekly-report
description: Generate and export the weekly work report as a self-contained HTML file. Use this skill whenever the user asks to generate, view, create, or export their weekly report, start the weekly report tool, or run the weekly report app. Automatically starts the dev server, generates the report via GitHub activity, and saves a shareable HTML file to the Desktop.
---

# Weekly Report Skill

## Steps

### 1. Get the project root and check if dev server is running

```bash
PROJECT_DIR=$(git rev-parse --show-toplevel)
lsof -ti tcp:3000 | head -1
```

If nothing is returned, start the server:

```bash
npm run dev > /tmp/weekly-report-dev.log 2>&1 &
```

Then wait up to 30 seconds for it to be ready:

```bash
for i in $(seq 1 30); do
  curl -sf http://localhost:3000 > /dev/null 2>&1 && echo "ready" && break
  sleep 1
done
```

If not ready after 30s, show: `tail -20 /tmp/weekly-report-dev.log` and stop.

### 2. Calculate this week's Monday and today's date

```bash
python3 -c "
from datetime import date, timedelta
today = date.today()
monday = today - timedelta(days=(today.weekday()))
print(monday.isoformat(), today.isoformat())
"
```

This gives `weekStart` and `weekEnd` (space-separated).

### 3. Read CLI_SECRET from .env.local (if set)

```bash
grep '^CLI_SECRET=' .env.local | cut -d= -f2-
```

If empty, send requests without the header.

### 4. Call the CLI API to generate the report

```bash
curl -s -X POST http://localhost:3000/api/generate-report-cli \
  -H "Content-Type: application/json" \
  -H "x-cli-secret: <CLI_SECRET_VALUE_OR_OMIT>" \
  -d "{\"weekStart\": \"<WEEK_START>\", \"weekEnd\": \"<WEEK_END>\"}"
```

This returns `{"markdown": "..."}`. Extract the markdown field.

**Note:** This call takes 30–60 seconds (AI is summarizing). Be patient and don't time out early.

### 5. Extract markdown and Gist URL from response

Parse the JSON response:
- `markdown` — the report text
- `gistUrl` — the secret Gist URL (may be null if upload failed)

If `gistUrl` is present, go to step 5a.
If `gistUrl` is null, fall through to step 5b to save a local HTML file as fallback.

### 5a. Gist upload succeeded

Report the Gist URL to the user and proceed to step 6.

### 5b. Convert markdown to self-contained HTML (fallback only)

Use this Python snippet to produce a styled, self-contained HTML file:

```python
import json, sys, re

markdown_text = sys.stdin.read()

def md_to_html(md):
    lines = md.split('\n')
    html_lines = []
    in_ul = False
    for line in lines:
        if line.startswith('### '):
            if in_ul: html_lines.append('</ul>'); in_ul = False
            html_lines.append(f'<h3>{escape(line[4:])}</h3>')
        elif line.startswith('## '):
            if in_ul: html_lines.append('</ul>'); in_ul = False
            html_lines.append(f'<h2>{escape(line[3:])}</h2>')
        elif line.startswith('# '):
            if in_ul: html_lines.append('</ul>'); in_ul = False
            html_lines.append(f'<h1>{escape(line[2:])}</h1>')
        elif line.startswith('- '):
            if not in_ul: html_lines.append('<ul>'); in_ul = True
            html_lines.append(f'<li>{inline_fmt(line[2:])}</li>')
        elif line.strip() == '':
            if in_ul: html_lines.append('</ul>'); in_ul = False
            html_lines.append('<br>')
        else:
            if in_ul: html_lines.append('</ul>'); in_ul = False
            html_lines.append(f'<p>{inline_fmt(line)}</p>')
    if in_ul: html_lines.append('</ul>')
    return '\n'.join(html_lines)

def escape(s):
    return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def inline_fmt(s):
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2)}">{escape(m.group(1))}</a>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    return s

body = md_to_html(markdown_text)
print(body)
```

Wrap the output in a complete HTML document with this template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weekly Report — WEEK_START</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.6rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  h2 { font-size: 1.25rem; margin-top: 2rem; color: #111; }
  h3 { font-size: 1rem; color: #555; margin-top: 1.2rem; }
  ul { padding-left: 1.4rem; }
  li { margin: 4px 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  strong { font-weight: 600; }
  .meta { color: #888; font-size: 0.85rem; margin-bottom: 2rem; }
</style>
</head>
<body>
BODY_CONTENT
<p class="meta">Generated on DATE_TODAY · Weekly Report Generator</p>
</body>
</html>
```

### 6. Post to Slack via MCP

Call the `post_weekly_report` tool from the `weekly-report-slack` MCP server with:
- `markdown`: the full report markdown
- `gistUrl`: the Gist URL (if available)
- `weekStart` and `weekEnd`: the date strings

This will send a DM to you on Slack with the formatted report and a download link for the `.md` file.

### 7. Tell the user

If Gist upload succeeded:
```
✓ Weekly report generated and posted to your Slack DM!

🔗 Share this link (anyone with the URL can view):
  <gistUrl>

Coverage: WEEK_START → WEEK_END (GitHub activity only; add Jira by uploading CSV at http://localhost:3000/report)
```

If Gist upload failed:
```
✓ Weekly report posted to your Slack DM (no Gist link — check Slack for the .md attachment)
```

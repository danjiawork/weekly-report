#!/bin/bash
# Weekly report scheduled script — triggered by launchd (macOS)
# Starts dev server if needed, generates report, posts to Slack

# Load nvm so node/npm are available in launchd's minimal PATH
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Fallback: find and add the latest installed node bin to PATH
NODE_BIN=$(ls -d "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin:$PATH"

# Derive project root from this script's location (.claude/scripts/run-weekly-report.sh)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="/tmp/weekly-report-cron.log"

echo "=== $(date) ===" >> "$LOG"

# Load all env vars from .env.local
export $(grep -v '^#' "$PROJECT_DIR/.env.local" | grep -v '^$' | sed 's/"//g' | xargs)

# Calculate this week's Monday and today's date
export WEEK_START=$(python3 -c "from datetime import date, timedelta; today=date.today(); print((today - timedelta(days=today.weekday())).isoformat())")
export WEEK_END=$(python3 -c "from datetime import date; print(date.today().isoformat())")
echo "Week: $WEEK_START → $WEEK_END" >> "$LOG"

# Start dev server if not already running
if ! lsof -ti tcp:3000 > /dev/null 2>&1; then
  echo "Starting dev server..." >> "$LOG"
  cd "$PROJECT_DIR" && npm run dev >> "$LOG" 2>&1 &
  DEV_SERVER_STARTED=1
  for i in $(seq 1 30); do
    curl -sf http://localhost:3000 > /dev/null 2>&1 && break
    sleep 1
  done
fi

# Generate report via headless CLI endpoint
echo "Generating report..." >> "$LOG"
curl -s -X POST http://localhost:3000/api/generate-report-cli \
  -H "Content-Type: application/json" \
  -d "{\"weekStart\": \"$WEEK_START\", \"weekEnd\": \"$WEEK_END\"}" \
  --max-time 120 \
  -o /tmp/weekly-report-cron-response.json

# Post to Slack via Node inline script
node << 'EOF' >> "$LOG" 2>&1
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/weekly-report-cron-response.json'));
const markdown = d.markdown;
const gistUrl = d.gistUrl;
const weekStart = process.env.WEEK_START;
const weekEnd = process.env.WEEK_END;
const token = process.env.SLACK_BOT_TOKEN;
const userId = process.env.SLACK_USER_ID;

async function run() {
  const channelId = (await (await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId })
  })).json()).channel.id;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Weekly Report: ${weekStart} → ${weekEnd}` } },
    { type: 'section', text: { type: 'mrkdwn', text: gistUrl ? `<${gistUrl}|View full report on GitHub Gist>` : 'Report generated — see attachment.' } },
  ];
  const postData = await (await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, blocks, text: `Weekly Report ${weekStart}` })
  })).json();
  console.log('post:', postData.ok, postData.error || '');

  const filename = `weekly-report-${weekStart}.md`;
  const uploadUrlData = await (await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ filename, length: String(Buffer.byteLength(markdown, 'utf8')) })
  })).json();

  if (uploadUrlData.ok) {
    await fetch(uploadUrlData.upload_url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: markdown });
    const complete = await (await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ id: uploadUrlData.file_id }], channel_id: channelId })
    })).json();
    console.log('upload:', complete.ok, complete.error || '');
  }
}
run().catch(e => console.error('ERROR:', e));
EOF

# Stop dev server if we started it
if [ "${DEV_SERVER_STARTED}" = "1" ]; then
  pkill -f "next dev" 2>/dev/null || true
fi

echo "Done." >> "$LOG"

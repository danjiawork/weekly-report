#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const server = new Server(
  { name: "weekly-report-slack", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "post_weekly_report",
      description: "Post the weekly work report to your Slack DM with a Gist link and optional markdown attachment",
      inputSchema: {
        type: "object",
        properties: {
          markdown: { type: "string", description: "The full report markdown content" },
          gistUrl: { type: "string", description: "The GitHub Gist URL for the report" },
          weekStart: { type: "string", description: "Week start date (YYYY-MM-DD)" },
          weekEnd: { type: "string", description: "Week end date (YYYY-MM-DD)" },
        },
        required: ["markdown", "weekStart", "weekEnd"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "post_weekly_report") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { markdown, gistUrl, weekStart, weekEnd } = request.params.arguments;
  const token = process.env.SLACK_BOT_TOKEN;
  const userId = process.env.SLACK_USER_ID;

  if (!token || !userId) {
    return { content: [{ type: "text", text: "Error: SLACK_BOT_TOKEN and SLACK_USER_ID must be set" }] };
  }

  // Open a DM channel with the user
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });
  const openData = await openRes.json();
  if (!openData.ok) {
    return { content: [{ type: "text", text: `Failed to open DM: ${openData.error}` }] };
  }
  const channelId = openData.channel.id;

  // Build message blocks
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `Weekly Report: ${weekStart} → ${weekEnd}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: gistUrl
          ? `<${gistUrl}|View full report on GitHub Gist>`
          : "Report generated — see .md attachment below.",
      },
    },
  ];

  // Post the message
  const postRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, blocks, text: `Weekly Report ${weekStart}` }),
  });
  const postData = await postRes.json();
  if (!postData.ok) {
    return { content: [{ type: "text", text: `Failed to post message: ${postData.error}` }] };
  }

  // Upload .md file as attachment
  const filename = `weekly-report-${weekStart}.md`;
  const uploadUrlRes = await fetch("https://slack.com/api/files.getUploadURLExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ filename, length: String(Buffer.byteLength(markdown, "utf8")) }),
  });
  const uploadUrlData = await uploadUrlRes.json();

  if (uploadUrlData.ok) {
    // Upload file content
    await fetch(uploadUrlData.upload_url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: markdown,
    });

    // Complete the upload and share to DM channel
    await fetch("https://slack.com/api/files.completeUploadExternal", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: [{ id: uploadUrlData.file_id }], channel_id: channelId }),
    });
  }

  return {
    content: [{ type: "text", text: `✓ Report posted to your Slack DM${gistUrl ? `\nGist: ${gistUrl}` : ""}` }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

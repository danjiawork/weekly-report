import Anthropic from "@anthropic-ai/sdk";
import type { GitHubActivity } from "../sources/github/types";
import type { JiraActivity } from "../sources/jira/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "dummy",
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

const SYSTEM_PROMPT = `You are a helpful assistant that generates weekly work reports for software engineers.
Given GitHub activity and Jira tickets, produce a structured report with two top-level sections.

IMPORTANT FORMATTING RULES:
- Every PR and Jira ticket MUST be on its own separate line as a bullet point
- Never put multiple items on the same line
- Use exactly this bullet format: "- [text](url)"

## Personal View

### GitHub
- **Merged PRs**: each merged PR on its own bullet line with [Title](url)
- **In Progress**: each open PR on its own bullet line with [Title](url)
- **Code Reviews**: each reviewed PR on its own bullet line with [Title](url)

### Jira
List tickets grouped by their exact status. Each status is its own subsection.
Each ticket on its own bullet line: - [[KEY](url)] Summary

## Manager View
3-5 impact-focused bullet points combining GitHub and Jira work.
Each bullet point on its own line.
- Key contributions and why they matter
- Quality signals (reviews, architecture decisions)
- Overall output and momentum

If a section has no items, write "None".
Be concise and professional.`;

export async function summarizeActivity(
  github: GitHubActivity,
  jira: JiraActivity | null,
  weekStart: string,
  weekEnd: string
): Promise<ReadableStream<Uint8Array>> {
  let jiraSection = "\n**Jira:** not configured";
  if (jira) {
    // Group tickets by their exact Jira status
    const byStatus = new Map<string, typeof jira.resolved>();
    for (const ticket of [...jira.resolved, ...jira.inProgress, ...jira.committed, ...jira.blocked]) {
      const group = byStatus.get(ticket.status) ?? [];
      group.push(ticket);
      byStatus.set(ticket.status, group);
    }

    const total = jira.resolved.length + jira.inProgress.length + jira.committed.length + jira.blocked.length;
    jiraSection = `\n**Jira Tickets (${total} total, grouped by status):**\n` +
      Array.from(byStatus.entries())
        .map(([status, tickets]) =>
          `${status} (${tickets.length}):\n` +
          tickets.map((t) => `- [${t.key}](${t.url}): ${t.summary}`).join("\n")
        )
        .join("\n\n");
  }

  const userMessage = `Here is my work activity for the week of ${weekStart} to ${weekEnd}:

**GitHub Pull Requests (${github.prs.length}):**
${github.prs.map((pr) => `- [${pr.state.toUpperCase()}] [${pr.title}](${pr.url}) — ${pr.repo}`).join("\n") || "None"}

**GitHub Commits (${github.commits.length}):**
${github.commits.map((c) => `- ${c.repo}: ${c.message} (${c.date.slice(0, 10)})`).join("\n") || "None"}

**GitHub Code Reviews (${github.reviews.length}):**
${github.reviews.map((r) => `- ${r.repo}: [${r.prTitle}](${r.prUrl})`).join("\n") || "None"}
${jiraSection}

Generate my weekly report.`;

  const stream = await client.messages.stream({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });
}

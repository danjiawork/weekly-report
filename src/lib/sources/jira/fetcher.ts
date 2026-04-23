import type { JiraActivity, JiraTicket } from "./types";

export async function getWeeklyJiraActivity(
  weekStart: string,
  weekEnd: string
): Promise<JiraActivity | null> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const token = process.env.JIRA_TOKEN;

  if (!baseUrl || !token) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // JQL: assigned to me OR reported by me, updated this week
  const jql = `(assignee = currentUser() OR reporter = currentUser()) AND updated >= "${weekStart}" AND updated <= "${weekEnd}" ORDER BY updated DESC`;

  const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,status,issuetype,updated,priority`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[jira fetcher] failed: ${res.status} — ${body}`);
    return null;
  }

  const data = await res.json();
  const issues: JiraTicket[] = (data.issues ?? []).map((issue: Record<string, unknown>) => {
    const fields = issue.fields as Record<string, unknown>;
    const status = (fields.status as Record<string, unknown>)?.name as string;
    const type = (fields.issuetype as Record<string, unknown>)?.name as string;
    return {
      key: issue.key as string,
      summary: fields.summary as string,
      status,
      url: `${baseUrl}/browse/${issue.key}`,
      updatedAt: fields.updated as string,
      type,
    };
  });

  console.log(`[jira fetcher] ${issues.length} tickets found`);

  const resolved = issues.filter((t) =>
    ["done", "resolved", "closed", "fixed", "won't fix", "inactive"].some((s) =>
      t.status.toLowerCase().includes(s)
    )
  );
  const blocked = issues.filter((t) =>
    ["blocked", "impediment"].some((s) => t.status.toLowerCase().includes(s))
  );
  const inProgress = issues.filter((t) =>
    ["in progress", "in development", "active", "in review"].some((s) =>
      t.status.toLowerCase().includes(s)
    )
  );
  const committed = issues.filter(
    (t) => !resolved.includes(t) && !blocked.includes(t) && !inProgress.includes(t)
  );

  return { resolved, inProgress, committed, blocked };
}

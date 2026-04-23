import type { JiraActivity, JiraTicket } from "./types";

const RESOLVED_STATUSES = ["done", "resolved", "closed", "fixed", "won't fix", "wont fix", "inactive", "cancelled", "canceled", "complete", "completed"];
const IN_PROGRESS_STATUSES = ["in progress", "in development", "in dev", "active", "in review", "under review", "testing", "in testing"];
const BLOCKED_STATUSES = ["blocked", "impediment", "on hold"];
// Everything else (Planned, Committed, Open, Ready, Backlog, etc.) → committed

function classifyStatus(status: string): "resolved" | "inProgress" | "committed" | "blocked" {
  const s = status.toLowerCase().trim();
  if (BLOCKED_STATUSES.some((b) => s.includes(b))) return "blocked";
  if (RESOLVED_STATUSES.some((r) => s.includes(r))) return "resolved";
  if (IN_PROGRESS_STATUSES.some((p) => s.includes(p))) return "inProgress";
  return "committed";
}

export function parseJiraCsv(csvText: string, baseUrl: string): JiraActivity {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { resolved: [], inProgress: [], committed: [], blocked: [] };

  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());

  const summaryIdx = idx("Summary");
  const keyIdx = idx("Issue key");
  const statusIdx = idx("Status");
  const updatedIdx = idx("Updated");
  const createdIdx = idx("Created");
  const typeIdx = idx("Issue Type");

  if (summaryIdx === -1 || keyIdx === -1) {
    throw new Error("CSV missing required columns: Summary, Issue key");
  }

  const result: JiraActivity = { resolved: [], inProgress: [], committed: [], blocked: [] };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const key = cols[keyIdx]?.trim();
    const summary = cols[summaryIdx]?.trim();
    if (!key || !summary) continue;

    const status = cols[statusIdx]?.trim() ?? "Unknown";
    const ticket: JiraTicket = {
      key,
      summary,
      status,
      url: `${baseUrl}/browse/${key}`,
      updatedAt: cols[updatedIdx]?.trim() ?? "",
      createdAt: createdIdx >= 0 ? cols[createdIdx]?.trim() : undefined,
      type: cols[typeIdx]?.trim() ?? "",
    };

    result[classifyStatus(status)].push(ticket);
  }

  console.log(`[jira csv] resolved=${result.resolved.length} inProgress=${result.inProgress.length} committed=${result.committed.length} blocked=${result.blocked.length}`);
  return result;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

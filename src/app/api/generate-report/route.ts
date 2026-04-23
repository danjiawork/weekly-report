import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getWeeklyActivity } from "@/lib/sources/github/fetcher";
import { getWeeklyJiraActivity } from "@/lib/sources/jira/fetcher";
import { parseJiraCsv } from "@/lib/sources/jira/csv-parser";
import { summarizeActivity } from "@/lib/claude/summarize";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { weekStart, weekEnd, jiraCsv } = await req.json();
    if (!weekStart || !weekEnd) {
      return new Response(JSON.stringify({ error: "weekStart and weekEnd are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = session.accessToken as string;
    const username = session.user?.login as string;

    const [githubActivity, jiraApiActivity] = await Promise.all([
      getWeeklyActivity(token, username, weekStart, weekEnd),
      getWeeklyJiraActivity(weekStart, weekEnd),
    ]);

    // CSV upload takes priority over API (which may be rate-limited)
    let jiraActivity = jiraApiActivity;
    if (jiraCsv) {
      const baseUrl = process.env.JIRA_BASE_URL ?? "";
      jiraActivity = parseJiraCsv(jiraCsv, baseUrl);
      console.log(`[jira csv] ${jiraActivity.resolved.length} resolved, ${jiraActivity.inProgress.length} in progress`);
    }

    const stream = await summarizeActivity(githubActivity, jiraActivity, weekStart, weekEnd);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("generate-report error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

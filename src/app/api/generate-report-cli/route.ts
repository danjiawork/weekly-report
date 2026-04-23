import { getWeeklyActivity } from "@/lib/sources/github/fetcher";
import { summarizeActivity } from "@/lib/claude/summarize";

// Simple shared secret to prevent accidental exposure — set CLI_SECRET in .env.local
const CLI_SECRET = process.env.CLI_SECRET;

export async function POST(req: Request) {
  try {
    // Verify local CLI secret if configured
    if (CLI_SECRET) {
      const auth = req.headers.get("x-cli-secret");
      if (auth !== CLI_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const { weekStart, weekEnd } = await req.json();
    if (!weekStart || !weekEnd) {
      return new Response(JSON.stringify({ error: "weekStart and weekEnd are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use github.com token/username as the primary credential; fetcher will also
    // pick up GITHUB_ENTERPRISE_* from env for the Enterprise instance.
    const token = process.env.GITHUB_COM_TOKEN ?? process.env.GITHUB_ENTERPRISE_TOKEN;
    const username = process.env.GITHUB_COM_USERNAME ?? process.env.GITHUB_ENTERPRISE_USERNAME;
    if (!token || !username) {
      return new Response(
        JSON.stringify({ error: "GITHUB_COM_TOKEN and GITHUB_COM_USERNAME must be set in .env.local" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const githubActivity = await getWeeklyActivity(token, username, weekStart, weekEnd);
    const stream = await summarizeActivity(githubActivity, null, weekStart, weekEnd);

    // Collect the full streaming response into a string
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let markdown = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      markdown += decoder.decode(value, { stream: true });
    }

    // Upload as a secret Gist (public=false means only people with the URL can view)
    const filename = `weekly-report-${weekStart}.md`;
    const gistRes = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `Weekly Report ${weekStart} to ${weekEnd}`,
        public: false,
        files: { [filename]: { content: markdown } },
      }),
    });

    let gistUrl: string | null = null;
    if (gistRes.ok) {
      const gistData = await gistRes.json();
      gistUrl = gistData.html_url as string;
    } else {
      console.error("[gist] upload failed:", await gistRes.text());
    }

    return new Response(JSON.stringify({ markdown, gistUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-report-cli error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

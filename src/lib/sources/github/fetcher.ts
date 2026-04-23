import type { GitHubActivity, GitHubPR } from "./types";

interface GitHubInstance {
  baseUrl: string;  // e.g. "https://api.github.com" or "https://github.tools.sap/api/v3"
  token: string;
  username: string;
}

function getInstances(token: string, username: string): GitHubInstance[] {
  const instances: GitHubInstance[] = [
    {
      baseUrl: "https://api.github.com",
      token: process.env.GITHUB_COM_TOKEN ?? token,
      username: process.env.GITHUB_COM_USERNAME ?? username,
    },
  ];

  // Additional GitHub Enterprise instances from env
  // Format: GITHUB_ENTERPRISE_URL=https://github.tools.sap/api/v3
  //         GITHUB_ENTERPRISE_TOKEN=<pat>
  //         GITHUB_ENTERPRISE_USERNAME=<username> (optional, falls back to same username)
  if (process.env.GITHUB_ENTERPRISE_URL) {
    instances.push({
      baseUrl: process.env.GITHUB_ENTERPRISE_URL,
      token: process.env.GITHUB_ENTERPRISE_TOKEN ?? token,
      username: process.env.GITHUB_ENTERPRISE_USERNAME ?? username,
    });
  }

  return instances;
}

async function fetchFromInstance(
  instance: GitHubInstance,
  weekStart: string,
  weekEnd: string
): Promise<GitHubActivity> {
  const { baseUrl, token, username } = instance;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Fetch: this week's PRs + currently open PRs (may predate this week)
  const [newPrsRes, openPrsRes, commitsRes, reviewsRes] = await Promise.all([
    fetch(
      `${baseUrl}/search/issues?q=author:${username}+type:pr+created:${weekStart}..${weekEnd}&per_page=50`,
      { headers }
    ),
    fetch(
      `${baseUrl}/search/issues?q=author:${username}+type:pr+state:open&per_page=50`,
      { headers }
    ),
    fetch(
      `${baseUrl}/search/commits?q=author:${username}+committer-date:${weekStart}..${weekEnd}&per_page=50`,
      { headers: { ...headers, Accept: "application/vnd.github.cloak-preview+json" } }
    ),
    fetch(
      `${baseUrl}/search/issues?q=reviewed-by:${username}+type:pr+updated:${weekStart}..${weekEnd}&per_page=20`,
      { headers }
    ),
  ]);

  if (!newPrsRes.ok) {
    const body = await newPrsRes.text();
    throw new Error(`GitHub PRs fetch failed (${baseUrl}): ${newPrsRes.status} — ${body}`);
  }
  if (!commitsRes.ok) {
    const body = await commitsRes.text();
    throw new Error(`GitHub commits fetch failed (${baseUrl}): ${commitsRes.status} — ${body}`);
  }

  const [newPrsData, openPrsData, commitsData, reviewsData] = await Promise.all([
    newPrsRes.json(),
    openPrsRes.ok ? openPrsRes.json() : { items: [] },
    commitsRes.json(),
    reviewsRes.ok ? reviewsRes.json() : { items: [] },
  ]);

  function parsePR(item: Record<string, unknown>): GitHubPR {
    const repoUrl = item.repository_url as string;
    const repo = repoUrl.replace(`${baseUrl}/repos/`, "").replace("https://api.github.com/repos/", "");
    const prMeta = item.pull_request as Record<string, unknown> | undefined;
    return {
      id: item.number as number,
      title: item.title as string,
      url: item.html_url as string,
      state: prMeta?.merged_at ? "merged" : (item.state as string) === "closed" ? "closed" : "open",
      createdAt: item.created_at as string,
      mergedAt: (prMeta?.merged_at as string) ?? undefined,
      repo,
    };
  }

  // Merge new PRs + open PRs, deduplicate by PR number+repo
  const allPRsMap = new Map<string, GitHubPR>();
  for (const item of [...(newPrsData.items ?? []), ...(openPrsData.items ?? [])]) {
    const pr = parsePR(item as Record<string, unknown>);
    const key = `${pr.repo}#${pr.id}`;
    allPRsMap.set(key, pr);
  }
  const prs = Array.from(allPRsMap.values());

  const commits = (commitsData.items ?? []).map((item: Record<string, unknown>) => {
    const commitObj = item.commit as Record<string, unknown>;
    const authorObj = commitObj?.author as Record<string, unknown>;
    return {
      sha: item.sha as string,
      message: (commitObj?.message as string)?.split("\n")[0] ?? "",
      repo: (item.repository as Record<string, unknown>)?.full_name as string,
      date: authorObj?.date as string,
    };
  });

  const reviews = (reviewsData.items ?? []).map((item: Record<string, unknown>) => {
    const repoUrl = item.repository_url as string;
    const repo = repoUrl.replace(`${baseUrl}/repos/`, "").replace("https://api.github.com/repos/", "");
    return {
      prTitle: item.title as string,
      prUrl: item.html_url as string,
      repo,
      date: item.updated_at as string,
    };
  });

  console.log(`[github fetcher] ${baseUrl}: ${prs.length} PRs, ${commits.length} commits, ${reviews.length} reviews`);
  return { prs, commits, reviews };
}

export async function getWeeklyActivity(
  token: string,
  username: string,
  weekStart: string,
  weekEnd: string
): Promise<GitHubActivity> {
  const instances = getInstances(token, username);
  const results = await Promise.allSettled(
    instances.map((inst) => fetchFromInstance(inst, weekStart, weekEnd))
  );

  // Merge results from all instances; log but don't fail on secondary instance errors
  const merged: GitHubActivity = { prs: [], commits: [], reviews: [] };
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      merged.prs.push(...result.value.prs);
      merged.commits.push(...result.value.commits);
      merged.reviews.push(...result.value.reviews);
    } else {
      console.warn(`GitHub instance ${i} failed:`, result.reason);
    }
  }

  return merged;
}

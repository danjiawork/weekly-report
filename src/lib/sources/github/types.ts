export interface GitHubConfig {
  token: string;
  username: string;
  repos?: string[];
}

export interface GitHubPR {
  id: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  createdAt: string;
  mergedAt?: string;
  repo: string;
}

export interface GitHubActivity {
  prs: GitHubPR[];
  commits: { sha: string; message: string; repo: string; date: string }[];
  reviews: { prTitle: string; prUrl: string; repo: string; date: string }[];
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys?: string[];
}

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  url: string;
  updatedAt: string;
  createdAt?: string;
  type: string;
}

export interface JiraActivity {
  resolved: JiraTicket[];    // Done, Resolved, Closed, Fixed, Won't Fix, Inactive
  inProgress: JiraTicket[];  // In Progress, In Development, Active, In Review
  committed: JiraTicket[];   // Committed, Planned, Ready for Dev, Open
  blocked: JiraTicket[];     // Blocked, Impediment
}

import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]/route";
import SignInButton from "@/components/SignInButton";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Weekly Report
          </h1>
          <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
            Aggregate your work activity and generate impact-focused reports with Claude AI.
          </p>
        </div>

        {session ? (
          <>
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Signed in as <strong>{session.user?.name ?? session.user?.email}</strong>
              </span>
              <SignInButton mode="signout" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href="/report"
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Generate Report</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Fetch activity from GitHub, Jira, and more, then summarize with AI.
                </span>
              </Link>

              <Link
                href="/history"
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Past Reports</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Review and export your previous weekly reports.
                </span>
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-zinc-500 dark:text-zinc-400">
              Sign in with GitHub to get started.
            </p>
            <SignInButton mode="signin" />
          </div>
        )}

        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Sources: GitHub · Jira · Slack · Teams · Outlook · SAP Minutes
        </p>
      </div>
    </main>
  );
}

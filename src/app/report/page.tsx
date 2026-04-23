"use client";

import { useState, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

export default function ReportPage() {
  const { data: session, status } = useSession();
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jiraCsvName, setJiraCsvName] = useState("");
  const [jiraCsvContent, setJiraCsvContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { weekStart, weekEnd } = getWeekBounds();

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJiraCsvName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setJiraCsvContent(ev.target?.result as string);
    reader.readAsText(file);
  }

  async function handleGenerate() {
    setLoading(true);
    setReport("");
    setError("");

    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, weekEnd, jiraCsv: jiraCsvContent || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate report");
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setReport((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-report-${weekStart}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-600 dark:text-zinc-400">Sign in with GitHub to generate your report.</p>
        <button
          onClick={() => signIn("github")}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with GitHub
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">Generate Weekly Report</h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Week of {weekStart} — {weekEnd}
            </p>
          </div>
          <Link href="/" className="shrink-0 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Back
          </Link>
        </div>

        {/* Jira CSV upload */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Jira tickets (optional)</p>
            <p className="text-xs text-zinc-400 mt-0.5 break-words">
              Export from Jira → Issues → Export CSV, then upload here.
            </p>
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 mt-1 inline-block break-all">
              assignee = currentUser() AND updated &gt;= -7d
            </code>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          <div className="flex items-center gap-2 sm:shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors truncate"
            >
              {jiraCsvName ? `✓ ${jiraCsvName}` : "Upload CSV"}
            </button>
            {jiraCsvName && (
              <button
                onClick={() => { setJiraCsvName(""); setJiraCsvContent(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Action buttons — full-width on mobile */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2.5 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Generating…" : "Generate Report"}
          </button>
          {report && !loading && (
            <button
              onClick={handleDownload}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Download .md
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading && !report && (
          <p className="text-zinc-400 text-sm animate-pulse">Fetching your GitHub activity and summarizing with Claude…</p>
        )}

        {report && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-6">
            <div className="prose prose-sm sm:prose-base prose-zinc dark:prose-invert max-w-none prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-headings:font-semibold prose-h2:text-lg sm:prose-h2:text-xl prose-h3:text-sm sm:prose-h3:text-base prose-h3:text-zinc-600 dark:prose-h3:text-zinc-400 prose-pre:overflow-x-auto prose-code:break-words">
              <ReactMarkdown>{report}</ReactMarkdown>
              {loading && <span className="animate-pulse text-zinc-400">▍</span>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


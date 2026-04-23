"use client";

import { signIn, signOut } from "next-auth/react";

interface SignInButtonProps {
  mode: "signin" | "signout";
}

export default function SignInButton({ mode }: SignInButtonProps) {
  if (mode === "signout") {
    return (
      <button
        onClick={() => signOut()}
        className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("github")}
      className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
    >
      Sign in with GitHub
    </button>
  );
}

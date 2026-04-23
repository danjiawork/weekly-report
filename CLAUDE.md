@AGENTS.md

# Project Overview

AI-powered weekly report generator. Connects to GitHub, summarizes commits with AI, generates shareable report pages.

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS for styling
- NextAuth.js for GitHub Auth
- Claude API (via Anthropic SDK) for summarization

## Code Style

- Use server components by default, `use client` only when needed
- API routes in `app/api/`, use Route Handlers
- Prefer named exports
- Error handling: always use try-catch in API routes

## Testing

- Run `npm run lint` before committing
- Test API routes with curl before building UI

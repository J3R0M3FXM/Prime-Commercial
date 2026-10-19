# Project Instructions & Persistent Rules

## Typography Rules
- The font family for `.font-mono`, technical labels, numbers, codes, order details, and secondary notices is strictly **Lato Condensed** (`'Lato Condensed', 'Lato', 'Arial Narrow', sans-serif`).
- `IBM Plex Mono`, `Arial Narrow`, and `Open Sans Condensed` have been replaced with **Lato Condensed** / **Lato** across all storefront and admin modules. All future implementations using monospace, receipt, order, or technical labels must use Lato Condensed (`font-mono` / `'Lato Condensed', 'Lato', sans-serif`).
- Headings and section titles use **Roboto Condensed Regular** (weight 400).
- Body and layout text use **Lato Condensed** / **Lato** / sans-serif.

## Checkout UI Rules
- In the multi-step checkout modal header, never display verbose or highlighted badges like "STEP 1 OF 4" or pills with colored borders/backgrounds.
- Always display a clean, unhighlighted step counter strictly formatted as `1/4`, `2/4`, `3/4`, or `4/4` in neutral text (`text-gray-500 font-mono`).

## Viewport & Orientation Lock Rules
- Both the shopfront (`/`) and admin (`/admin`) pages must strictly be locked to a portrait mobile view dimension (`max-w-[430px]` centered horizontally with `mx-auto`).
- When opened on tablet or desktop screens, the app must never expand into a wide layout; it must continue rendering the portrait mobile view size inside a centered phone container with a dark neutral backdrop (`bg-slate-950`).
- All interactive sheets, drawers, and modal dialogs across shopfront and admin must also stay locked to this mobile portrait dimension (`max-w-[430px]`).

## Codex / Agent Operating Rules
- Read this file, the repository README, package scripts, and relevant architecture/deployment docs before editing. Inspect the current Git branch, worktree status, recent commits, and open pull requests first.
- Work autonomously on safe repository tasks: inspect code, trace failures, implement focused fixes, run the appropriate lint/typecheck/tests/build, inspect logs, and summarize concrete results. Do not stop at a plan when a safe next action is available.
- Preserve the user's existing work. Never discard, reset, clean, overwrite, or stage unrelated/untracked files. Before changing files, inspect `git status --short` and the diff. Keep changes scoped to the task.
- Do not print, paste, commit, or expose secrets. Never display the contents of `.env`, credential files, private SSH keys, access tokens, service-role keys, database URLs, or session cookies. Redact secret values from logs and command output. Check whether required CLIs are installed and authenticated without revealing credentials.
- Treat GitHub, Vercel, Supabase, and Oracle Cloud as separate authorization boundaries. Use only existing authenticated CLIs or explicitly authorized integrations. Do not assume access to one grants access to another.
- Prefer least-privilege credentials and read-only inspection first. Do not create paid resources, change billing, alter production DNS, change production environment variables, deploy to production, rotate/revoke keys, change authentication policies, or run destructive database/schema/data operations without explicit user approval.
- Supabase is the source of truth for existing business data unless the user explicitly authorizes a change. Never reset, truncate, reseed, or replace production data to fix hydration, account, order-history, catalog, or admin issues. Investigate schema, RLS, API responses, and client hydration paths first.
- Oracle Cloud migration goal: stage the app on an explicitly Always Free eligible configuration while retaining Supabase PostgreSQL initially. Verify the free-tier label, region/shape availability, network exposure, storage, and estimated cost before provisioning. If the console or permissions block access, continue repository-side work and report the exact blocker; do not claim a VM was created unless verified.
- Vercel deployment restrictions may be account/billing related, but do not assert the cause without evidence from account status, deployment details, or support. Do not attempt to bypass platform restrictions.
- For the current migration, review the Oracle staging work and draft PR #104 (`https://github.com/J3R0M3FXM/Prime-Commercial/pull/104`) if it exists and is accessible. Confirm the latest commit's CI status before saying checks pass. Do not merge the draft PR automatically.
- The user prefers direct execution and concrete outcomes over repeated instructions. If a command can be run safely in the current environment, run it instead of asking the user to run it. Ask the user only when a required approval, interactive authentication, or unavailable permission genuinely blocks progress.
- If access to a service is unavailable, do not invent results or ask for pasted output as the first resort. Finish all independent local/repository work, then state the specific missing capability or user action.
- After each work session, report: files/commits changed; exact checks run and their outcomes; deployment/service state verified; remaining blockers; and any action that truly requires the user. Clearly distinguish verified facts from assumptions.

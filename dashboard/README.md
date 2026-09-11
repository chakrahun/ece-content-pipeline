# ECE Pipeline Dashboard

A local control panel over the early-childhood content pipeline's three Notion databases
(Topic Queue, Findings, Content Drafts). It reads and writes Notion directly — Notion stays
the source of truth, and your research/fact-check/script-writer agents and weekly routine keep
running exactly as before. This just gives you one screen to drive them.

## One-time setup

1. **Create a Notion integration**
   - Go to https://www.notion.so/my-integrations → **New integration**.
   - Name it e.g. `ECE Dashboard`, pick your workspace, submit.
   - Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`).

2. **Give the integration access to your 3 databases**
   - Open each database in Notion → `•••` (top-right) → **Connections** → add `ECE Dashboard`.
   - Do this for all three: Topic Queue, Findings, Content Drafts.

3. **Add your secret**
   - In this `dashboard/` folder, copy `.env.local.example` to `.env.local`.
   - Paste your secret after `NOTION_TOKEN=`. The three database IDs are already filled in.

4. **Install dependencies** (once): `npm install`

## Running it

```
npm run dev
```

Then open http://localhost:3000

To stop it, press `Ctrl+C` in the terminal. Run `npm run dev` again any time you want it back.

## What each screen does

- **Overview** — live counts: queue by status, findings by verdict and content status, drafts by status.
- **Topic Queue** — add new topics (they land as `Queued` so the weekly routine picks them up),
  change Status / Priority inline, and **run the pipeline on demand**:
  - **▶ Run** on a row, or **▶ Run all Queued** at the top, launches the research + fact-check
    agents for that topic (script-writing stays a separate, manual step).
  - A run spawns the Claude Code CLI (`claude.exe`) in the background with your repo as its
    working directory, so it uses your `.claude/agents/` subagents and the Notion connector,
    and writes Findings to Notion exactly like the weekly routine.
  - The row shows `In Progress` while running, then flips to `Done` (with Last Run Date) on
    success, or back to `Queued` if the run fails so you can retry.
  - The **Pipeline runs** panel below the table shows live status; **View log** shows the output.
  - Requirements: the `claude` CLI must be installed and logged in (it is, if you use Claude Code),
    with the Notion connector connected (`claude mcp list` should show "claude.ai Notion").
  - Note: each run uses your Claude usage and performs autonomous web research + Notion writes.
- **Findings** — search and filter by topic / verdict / content status; click a row for full detail
  (excerpt, framing, caveats, source, flags); change Content Status inline.
- **Drafts** — read the full script body; change the review Status inline.

Every change writes straight back to Notion.

## Notes

- Your Notion token lives only in `.env.local` (git-ignored) and is used only by the server, never
  sent to the browser.
- If you see a "Couldn't reach Notion" banner, it almost always means the token isn't set yet or a
  database hasn't had the integration added under **Connections** — the banner lists the fix.

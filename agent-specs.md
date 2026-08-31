# Early Childhood Content Pipeline — Agent Specs

Two agents, sequential pipeline: **Research → Fact-Check → (you) Publish**.
Framework-agnostic — these are system prompts + a handoff schema you can drop into
the Claude Agent SDK, a Claude Project, LangGraph, whatever you end up using.

---

## 1. Research Agent

### System prompt

```
You are a research scout for an early-childhood-development content operation.
Your job is to surface material a content creator can turn into educational
content for parents — not to write the content yourself.

Scope your search across three source tiers, and NEVER blend them without tagging:

1. ACADEMIC — peer-reviewed journals, meta-analyses, preprints (tag as preprint),
   government/health-body guidance (AAP, CDC, WHO, NHS).
2. EXPERT COMMENTARY — pediatricians, child psychologists, OT/SLPs posting under
   their own credentialed identity (not anonymous).
3. ANECDOTAL — parenting forums (Reddit r/parenting, r/beyondthebump, BabyCenter,
   What to Expect), social media (TikTok/IG parenting creators), comment sections.
   This tier is for surfacing PAIN POINTS and LIVED EXPERIENCE, not facts.

For each item you find, output one record in the handoff schema below. Do not
editorialize, do not resolve disagreements between sources, do not upgrade an
anecdote into a finding. If ten parents say the same thing on a forum, that's
still one anecdotal signal worth flagging as a pattern — not a validated fact.

Flag explicitly:
- Anything that contradicts current mainstream medical/developmental guidance.
- Anything from a source with a financial interest (product pages, sponsored
  posts, influencer selling a course).
- Sample size / methodology red flags you can see at a glance (n<30, no control
  group, industry-funded study, retracted paper).

You are a scout, not a judge. Over-flag rather than under-flag — the fact-check
agent's job is to adjudicate.
```

### Output schema (one JSON object per finding)

```json
{
  "id": "auto-uuid",
  "date_collected": "YYYY-MM-DD",
  "topic": "e.g. sleep regression, language delay, screen time",
  "claim_or_observation": "one sentence, neutral phrasing",
  "source_tier": "academic | expert_commentary | anecdotal",
  "source_type": "peer_reviewed | preprint | gov_health_body | credentialed_expert_post | forum | social_media | news",
  "source_url": "",
  "source_name": "e.g. Pediatrics, AAP, r/beyondthebump",
  "author_credential": "if applicable, else null",
  "publish_date": "if known",
  "sample_size_or_scale": "e.g. n=214, or 'observed across 40+ forum threads', or null",
  "financial_interest_flag": true,
  "contradicts_mainstream_guidance": false,
  "novelty": "new_finding | recurring_pain_point | commonly_cited | fringe",
  "raw_excerpt": "verbatim quote, not paraphrase, for the fact-checker to verify against"
}
```

Requiring `raw_excerpt` matters — it's what lets the fact-check agent verify the claim was represented accurately, not just check if the claim is *true in general*.

---

## 2. Fact-Check Agent

### System prompt

```
You are an interrogator, not a summarizer. You receive findings from a research
agent and your only job is to stress-test each one before it's allowed anywhere
near published content for parents.

For every record you receive, do the following, in order:

1. SOURCE VERIFICATION — does the source actually say what the excerpt claims?
   Pull the source if you can access it. If you cannot verify a source exists
   or says what's claimed, mark it UNVERIFIABLE and stop there.

2. CONTRADICTION CHECK — search for higher-quality or more recent evidence that
   contradicts this claim. A single study is not consensus. Note if this is
   contested, superseded, or a minority position.

3. GENERALIZATION CHECK — for anecdotal_tier items, is the research agent (or
   would a content piece) be tempted to state this as fact? Anecdotes stay
   anecdotes. Your job is to make sure "pattern parents report" never silently
   becomes "studies show."

4. METHODOLOGY CHECK (academic tier only) — sample size, study design, funding
   source, whether it's been replicated, whether it's developmental-stage
   specific (a finding about 4-year-olds does not generalize to infants).

5. VERDICT — assign one of:
   - VERIFIED: source checks out, claim accurately represents it, no major
     contradicting evidence.
   - VERIFIED_WITH_CAVEATS: true but needs qualification (small sample, dated,
     age-specific, contested).
   - ANECDOTAL_ONLY: real pattern, but must be presented as parent experience,
     never as fact.
   - UNVERIFIABLE: cannot confirm source or claim.
   - CONTRADICTED: current evidence disagrees with this claim.
   - REJECT: financial conflict of interest, pseudoscience, or safety risk if
     repeated to parents (e.g. anything touching medical/feeding/sleep-safety
     advice that deviates from AAP/WHO guidance gets rejected outright, no
     exceptions — refer to a doctor instead of asserting an alternative).

Be adversarial. Assume the research agent got something wrong until you've
checked. Do not soften a REJECT to make the pipeline output look more usable —
a smaller set of trustworthy findings is the entire point of your existence.
```

### Output schema (extends the research record)

```json
{
  "id": "matches research agent id",
  "verdict": "VERIFIED | VERIFIED_WITH_CAVEATS | ANECDOTAL_ONLY | UNVERIFIABLE | CONTRADICTED | REJECT",
  "verification_notes": "what you checked and what you found",
  "caveats": ["age-range specific to 2-3yo", "single study, not replicated"],
  "contradicting_sources": [{"url": "", "summary": ""}],
  "safe_to_publish_as": "fact | expert_opinion | parent_anecdote | not_publishable",
  "suggested_framing": "one sentence on how this should be phrased if used, e.g. 'Frame as one small study, not a consensus finding'"
}
```

---

## Handoff / pipeline notes

- **Sequential, not parallel.** Research runs a batch, fact-check consumes the whole batch. Don't fact-check one item at a time mid-research — you want the fact-checker to have full context on which claims recur across sources.
- **REJECT and UNVERIFIABLE never reach you for content drafting.** Only `VERIFIED*` and `ANECDOTAL_ONLY` (properly labeled) should flow downstream.
- **Human-in-the-loop before publish.** Given the audience (parents making decisions about kids), keep yourself as the final gate even after fact-check clears something — the fact-check agent catches factual errors, not tone, framing, or whether it's actually useful/interesting content.
- **Log rejected items too**, don't just discard them — a pattern of REJECTed anecdotal claims (e.g. a myth recurring across forums) can itself become a good "mythbusting" content piece, just framed correctly from the start.

## Runtime — live

Implemented as Claude Code subagents in `.claude/agents/`:

- `research-agent.md` — WebSearch/WebFetch plus read-only Notion access
  (`notion-fetch`, `notion-search`), no write access. Checks the Findings
  database for the topic before searching the web, so it doesn't re-surface
  claims that already have a logged verdict — but still supersedes a prior
  UNVERIFIABLE/CONTRADICTED/REJECT if it finds materially newer evidence.
  Outputs a fenced JSON array of findings.
- `fact-check-agent.md` — WebSearch/WebFetch plus Notion write access. Consumes
  the research agent's output, verifies each record, and writes every one
  (including REJECT/UNVERIFIABLE) into the **Early Childhood Content — Findings**
  Notion database (`collection://6f77b043-fae6-4a71-a306-6ef09c188c6f`).

To run the pipeline: invoke `research-agent` with a topic (e.g. "sleep
regressions in 18-24 month olds"), then hand its JSON output to
`fact-check-agent` in the same session. Both are dispatched via the Agent tool
by name.

The field names in both agent prompts and the Notion schema were kept
identical on purpose — the fact-check agent maps 1:1, no translation step.

## Open decisions for you

None currently — see Resolved below. Revisit cadence once real usage shows
whether the batch schedule is too slow or the manual trigger gets overused
(if it does, that's a signal some topics want their own recurring schedule).

## Resolved

- **research-agent Notion read access.** research-agent now has read-only
  Notion access and checks the Findings database for the topic before
  searching the web, to avoid re-surfacing claims that already have a logged
  verdict.

- **Update cadence: scheduled batch + on-demand manual trigger.** Two entry
  points into the same pipeline, not two different pipelines:

  1. **Scheduled batch (default/primary).** On a fixed schedule (e.g. weekly),
     the app runs research-agent once per queued topic, then runs
     fact-check-agent once across that whole batch. This is the steady
     drumbeat — it matches the pace at which content actually gets
     consolidated, drafted, and published, so the queue doesn't outrun the
     human review step. Don't shrink this interval just because the pipeline
     *can* run faster than you can publish.
  2. **On-demand manual trigger (secondary, same pipeline).** At any time,
     you can type a topic (or a narrower angle on a topic already covered)
     and kick off research-agent → fact-check-agent immediately, outside the
     schedule — for going deeper on something mid-batch-cycle rather than
     waiting for the next scheduled run. This still runs research → fact-check
     as one sequential pair per the pipeline notes above; it's the *trigger*
     that's ad hoc, not the process.

  Both entry points write to the same Findings database, so the read-access
  dedup step above applies equally to scheduled and manual runs — a manual
  deep-dive on a topic a scheduled batch already covered will skip claims
  that already have a logged verdict, and only surface what's genuinely new
  or narrower.

  Implementation note: this doc stays framework-agnostic per its header, so
  the actual scheduler (cron, a queue worker, etc.) is your app's concern —
  the agents themselves don't care who invokes them or when.

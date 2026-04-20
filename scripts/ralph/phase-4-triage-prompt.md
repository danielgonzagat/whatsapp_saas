# Phase 4A — Security Triage Ralph Loop

You are executing **Phase 4A of the Codacy convergence plan**, the
security triage stage. Read
`/Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md` for full
context on the very first iteration only.

## Goal

Classify every Opengrep / Semgrep / Trivy security finding (~1,287 total)
into `FALSE_POSITIVE`, `WRONG_RULE`, or `REAL_BUG`, and act on each
classification:

- **FALSE_POSITIVE**: document the evidence in the per-pattern ADR and leave
  the rule active. Do **not** suppress with comments.
- **WRONG_RULE**: document the evidence in the per-pattern ADR and escalate to
  the operator. Do **not** disable the pattern globally.
- **REAL_BUG**: branch `security/<patternId>/<slug>`, refactor with a
  proper fix, write a regression test, open a PR with `--label security`
  (NO `auto-merge`). The operator (Daniel) reviews and merges
  manually.

You output `<promise>PHASE_4A_TRIAGED</promise>` when, and only when,
every finding in `docs/security/codacy-opengrep-triage.json` has a
non-`PENDING` classification.

## Bootstrap (iteration 1 only)

If `docs/security/codacy-opengrep-triage.json` does not exist:

1. Run `npm run codacy:sync`.
2. Read `PULSE_CODACY_STATE.json`. Filter `byPatternId` to entries
   matching `/^(Semgrep|Opengrep|Trivy|Biome_lint_security_)/`.
3. Generate `docs/security/codacy-opengrep-triage.json` with shape:

   ```json
   [
     {
       "patternId": "...",
       "tool": "Opengrep",
       "totalCount": 259,
       "category": "PENDING",
       "rationale": "",
       "adrId": null
     }
   ]
   ```

   One entry per `patternId` cluster, NOT per finding (the cluster is
   the unit of decision; suppressing a pattern suppresses every instance).

## What one iteration does

One iteration = classify ONE pattern cluster + take action.

1. Read `docs/security/codacy-opengrep-triage.json`. Find the first entry
   with `category: "PENDING"`. If none, output the completion promise.
2. For that `patternId`, fetch a sample of findings via the Codacy REST
   API: `GET /repositories/whatsapp_saas/issues/search` with body
   `{"patternIds":["<patternId>"]}`. Read 5-10 sample issues, focus on
   the file paths and code context.
3. **Classify based on hard criteria**:
   - REAL_BUG if the rule is well-known security (e.g., SQL injection,
     XSS, hardcoded secrets, missing auth check, prototype pollution,
     SSRF, insecure deserialization) AND the sample findings show a
     genuine vulnerable pattern in product code.
   - FALSE_POSITIVE if the rule is right but the sample findings are in
     test fixtures, mock data, base64 strings that aren't credentials,
     or code paths that aren't reachable from user input.
   - WRONG_RULE if the rule is fundamentally inappropriate for this
     stack (e.g., a Python-specific rule firing on TypeScript, a
     deprecated rule, a rule with high known false-positive rate).
4. Write the classification to the triage JSON entry: update `category`
   and write a `rationale` (one-line summary).
5. Take action based on the category:
   - **FALSE_POSITIVE** OR **WRONG_RULE**:
     - Open or create
       `docs/adr/0002-security-<patternId-sanitized>.md`. Use the ADR
       template at the bottom of this prompt. Reference the `patternId`,
       count, classification, rationale, sample evidence (3-5 file:line
       references), and decision.
     - For **FALSE_POSITIVE**: write the ADR only. Do not touch product
       source and do not add suppression comments.
     - For **WRONG_RULE**: write the ADR only and escalate the evidence.
       The Codacy MAX-RIGOR lock forbids disabling patterns, creating
       relaxed drafts, or shrinking scope.
   - **REAL_BUG**: - Create branch `security/<patternId-sanitized>` . - Fix
     EVERY occurrence of the
     pattern (use the same `issues/search` call to enumerate). Add a regression
     test in the same
     workspace as the fix. - Run scoped validation:
     `npm --prefix <workspace> run typecheck && npm --prefix <workspace> test` .
     - `git add` +
     commit + push branch. - `gh pr create --label security --title
     "fix(security): <patternId> "
--body " <from ADR> "`. **Do NOT add `auto-merge` label**. - Pause here for
that pattern. Set
`category: REAL_BUG_PENDING_REVIEW` . - Continue to the next pattern in the next
iteration.

6. Commit the updated triage JSON + any ADRs + any sources you touched
   (suppressions). For real-bug PRs, the source touches are in the PR
   branch, not main.

7. Re-sync every 5 successful classifications:
   `npm run codacy:sync && npm run ratchet:update`.

8. Check completion: if every entry in the triage JSON has
   `category != "PENDING"` AND every `REAL_BUG_PENDING_REVIEW` PR has
   been merged (via `gh pr list --label security --state open` returning
   empty), output `<promise>PHASE_4A_TRIAGED</promise>`.

## Hard rules — never violate

- Never suppress a security finding with comments or Codacy config.
- Never relax Codacy patterns, coding standards, or exclude paths from this
  flow.
- Never auto-merge a `REAL_BUG` PR. The operator reviews each one.
- Never disable Trivy, Opengrep, or Semgrep entirely. Only specific
  patterns within them, and only with WRONG_RULE classification.
- Never modify product code in a `FALSE_POSITIVE` cluster's affected
  files except to add the suppression comment. Other refactors belong
  in their own PR.
- Never `--no-verify` or force-push.
- If a pattern is unclear (could be either FALSE_POSITIVE or REAL_BUG),
  default to **REAL_BUG** — better to escalate to the operator than
  silently suppress.

## ADR template

File: `docs/adr/0002-security-<patternId-sanitized>.md`

```markdown
---
id: 0002-security-<patternId>
title: 'Security triage: <patternId>'
status: accepted
date: <YYYY-MM-DD>
deciders: [convergence-ralph-loop, daniel]
---

## Context

Codacy reported `<count>` findings for pattern `<patternId>` from
`<tool>`. The findings are concentrated in:

- `<file:line>` — `<one-line description>`
- ...

## Decision

Classification: **<FALSE_POSITIVE | WRONG_RULE | REAL_BUG>**

### Rationale

<2-4 paragraphs explaining why this classification was chosen,
referencing the rule's intent and the actual code patterns observed.>

## Action taken

<- For FALSE_POSITIVE or WRONG_RULE: record the evidence only; no
suppression comments, no Codacy mutation.>
<- For REAL_BUG: link to the PR branch and the regression test added.>

## Alternatives rejected

<Why we did not take the other two paths.>

## Reversal cost

<How to undo this decision if it turns out wrong.>
```

## Failure mode

If after 30 iterations:

- Triage JSON still has > 5 PENDING entries → operator review needed.
  Write `docs/security/phase-4a-interim-report.md` with the gap,
  commit, exit via max-iterations.
- Real-bug PRs are stacking up unmerged → exit via max-iterations and
  let operator review the queue.

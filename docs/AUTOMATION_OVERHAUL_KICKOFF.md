# Kickoff Prompt for DeepSeek

Paste the block below into the DeepSeek session as the very first message. It is intentionally short — the long reference doc does the heavy lifting.

---

```
You are a senior engineer pair-programming on the HantaWatch repo at d:/Work/Hanta.

Your task is to execute the multi-phase plan in docs/AUTOMATION_OVERHAUL_BRIEF.md.

Before you write any code:
  1. Read docs/AUTOMATION_OVERHAUL_BRIEF.md sections 1–4 in full.
  2. Skim section 5 (phase plan) and section 6 (anti-patterns).
  3. Confirm in chat that you have read it by quoting these three things back to me:
     (a) the exact list in section 1 "Success criteria",
     (b) the file path mentioned in principle #2 (the MANUAL_FILES location),
     (c) the four phase names P0 through P3 with their one-line goals.

Once I have confirmed your readback is correct, proceed with phase P0 ONLY.

Operating rules (non-negotiable, repeated here so they cannot be missed):
  - One phase per PR/commit. Never combine.
  - Tests accompany every behavioural change. Pytest is the existing convention.
  - No new MANUAL_FILES. No band-aid string replacements. No regex on Chinese narrative.
  - Beijing TZ for all user-facing dates.
  - Never delete or weaken an existing test.
  - If a step in the brief contradicts what you see in the code, STOP and ask me.

For each phase, your final response in that phase must include:
  - List of files changed (with @absolute/path:lines citations).
  - List of new tests added.
  - One line of "evidence of acceptance" per acceptance bullet in the brief.
  - The exact shell commands you ran to verify, and their tail output (≤ 20 lines each).

When you finish P0, wait for my explicit "P0 looks good, proceed to P1" before starting P1.
Same gating between every subsequent phase. Do not freelance.

Begin now with step 1 above (read the brief, then post your readback).
```

---

## How to use this kickoff

1. Open DeepSeek (Coder, Chat, or whichever IDE plugin you use).
2. Paste the fenced block above as your first message.
3. Wait for DeepSeek's readback. Verify the three quoted items are accurate. If any is off, correct it before approving — that's the cheapest opportunity to catch a misunderstanding.
4. Tell DeepSeek "Readback correct. Begin P0."
5. After each phase, review the deliverables. If they meet the acceptance criteria in the brief, reply "Phase Px looks good, proceed to Px+1." Otherwise list the specific gaps and let DeepSeek iterate.
6. Keep this file and `AUTOMATION_OVERHAUL_BRIEF.md` open in your editor so you can quickly grep for any term DeepSeek mentions.

## Escalate to Cascade if

- DeepSeek asks "should I add Vitest?" — see section 7 of the brief; if you want it, say yes; if you don't, instruct DeepSeek to use the Python-fixture path.
- DeepSeek proposes touching a MANUAL_FILES entry — reject and point to principle #2 + the cluster-overrides template.
- DeepSeek proposes changing `_postprocess_brief_text` band-aids in P0 — that's P5.c, not P0. Defer.
- DeepSeek wants to deploy or run anything against production Supabase — do this yourself; the agent should only generate the SQL.
- A phase's acceptance criteria are met technically but the homepage still looks wrong on visual inspection — that's a sign the wiring missed a surface. Ask DeepSeek to grep for `mvHondiusImports` and `arcgisCases` and verify every consumer was migrated.

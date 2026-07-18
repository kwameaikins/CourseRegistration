# Centralised Course Registration & Follow-Up System
## Agent Prompt Engineering Guide

---

| Field | Value |
|---|---|
| **Document** | Agent Prompt Engineering Guide |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | Founder (directing the AI coding agent) |
| **Input from** | All previous documents (1–11) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial guide |

---

## Table of Contents

1. [Purpose of This Document](#1-purpose-of-this-document)
2. [How to Start Each Session with the Agent](#2-how-to-start-each-session-with-the-agent)
3. [Recommended Prompt Sequence — Week by Week](#3-recommended-prompt-sequence--week-by-week)
4. [Prompting Patterns That Work Well With This Documentation Suite](#4-prompting-patterns-that-work-well-with-this-documentation-suite)
5. [How to Handle Agent Deviation](#5-how-to-handle-agent-deviation)
6. [Questions to Ask the Agent Before Accepting Any Module as Done](#6-questions-to-ask-the-agent-before-accepting-any-module-as-done)
7. [What to Do When the Agent Is Uncertain](#7-what-to-do-when-the-agent-is-uncertain)
8. [Session Handoff Template](#8-session-handoff-template)
9. [Final Pre-Launch Review Prompt](#9-final-pre-launch-review-prompt)
10. [Ready for Development Checklist](#10-ready-for-development-checklist)

---

## 1. Purpose of This Document

You are directing an AI coding agent, not writing code yourself. The 11 documents that
precede this one are written so that an agent can implement this system with zero
clarifying questions (the Agent-Readiness Standard, FOUNDRY.md). This final document is for
**you** — it explains how to work with the agent across the 5-week plan so the documentation
suite is actually used as intended, rather than the agent guessing or drifting from spec.

---

## 2. How to Start Each Session with the Agent

At the start of every new coding session, give the agent this framing before any task
request:

> "You are building the Centralised Course Registration & Follow-Up System. Read these 11
> documents in full before writing any code: [attach or paste Documents 1–11]. Follow every
> business rule, naming convention, and architecture decision exactly as specified. If
> anything in my next request conflicts with these documents, tell me before proceeding —
> do not silently choose one over the other."

This single instruction operationalises Foundry's own Rule 5 (never resolve conflicts
silently) at the implementation stage, not just the documentation stage.

---

## 3. Recommended Prompt Sequence — Week by Week

Matches Document 10's plan exactly. Each week, feed the agent the relevant day's task using
the specific document section as the spec, not a paraphrase of it.

**Week 1 example prompt:**
> "Implement the database schema exactly as specified in Document 3, Section 4 (Full Table
> Definitions), including all triggers and the generated `balance` column. Then apply the
> RLS policies from Section 6 and the PostgREST grants from Section 7. Confirm each of the 8
> tables and all trigger functions were created without error before moving on."

**Week 2 example prompt:**
> "Implement the Paystack webhook handler exactly as specified in Document 5, Section 7 and
> Document 4, BR-13 and BR-14. Pay specific attention to the note in Document 5 Section 7
> about using the raw request body for signature validation, not the parsed JSON. After
> implementing, write the test case T-BR14-01 from Document 9 and run it before telling me
> this is done."

**General rule:** Always cite the specific document and section in your prompt. Never say
"build the payment screen" — say "build the Payment Tracking screen exactly as specified in
Document 8, Section 5, using the endpoint contract in Document 5, Section 6."

---

## 4. Prompting Patterns That Work Well With This Documentation Suite

| Pattern | Why it works with this suite |
|---|---|
| "Implement [Feature ID] from Document 1, using the schema in Document 3 and the endpoint contract in Document 5" | Forces the agent to cross-reference three documents rather than inventing its own interpretation of a feature description in isolation |
| "Before marking this done, check it against the Ready for Development checklist at the end of Document [N]" | Uses the checklists you already have as an in-built acceptance test — do not skip these |
| "Cite the Business Rule ID (BR-XX) in a code comment for any logic implementing a rule from Document 4" | Enforces Document 11's comment standard automatically |
| "Show me the diff against Document [N]'s specification before I approve this" | Keeps you, not the agent, as the final decision-maker per Foundry's own Rule 2 (never make product decisions without user confirmation) — extended here to mean the agent should not silently deviate from an already-confirmed spec |

---

## 5. How to Handle Agent Deviation

If the agent proposes something that is **not** in the documentation suite (a new library,
a different file structure, a shortcut around a business rule):

1. **Stop and ask why.** "Document 11 specifies [X]. Why are you proposing [Y] instead?"
2. **If the agent's reasoning is sound** (e.g. a library version issue, or a genuine gap the
   documentation missed), approve the deviation explicitly and **update the relevant
   document yourself** afterward — do not let the codebase and the documentation drift apart
   silently (Foundry's own Consistency Standard, applied post-launch).
3. **If the reasoning is not sound** (the agent is taking a shortcut around effort, not
   solving a real problem), redirect it back to the specification. The specification exists
   precisely so a 5-week deadline under pressure does not quietly erode the Business Rules,
   the RLS policies, or the DPA compliance features.

---

## 6. Questions to Ask the Agent Before Accepting Any Module as Done

Do not accept "it's done" as sufficient. Ask:

1. "Which Business Rules from Document 4 does this module implement, and where in the code
   is each one?"
2. "What test cases from Document 9 apply to this module, and have you run them?"
3. "Does this module make any direct database call outside of its `repository.ts` file?"
   (Should always be "no" — Document 11, Section 4.)
4. "Are there any TODOs, placeholder values, or `any` types in this module?" (Should be
   zero or explicitly justified — Document 11, Section 2.)

---

## 7. What to Do When the Agent Is Uncertain

If the agent says something like "the documentation doesn't specify what should happen if
[edge case]" — check Document 4, Section 3 (Edge Cases) first. If the specific case genuinely
is not covered:

1. Do not let the agent guess silently.
2. Make the decision yourself, using the same reasoning style as the rest of this suite —
   what does the Business Rule pattern suggest, what does the Ghana context require, what is
   reversible versus not.
3. Add the new edge case and its resolution to Document 4, Section 3, so it is captured for
   any future session (this is exactly Foundry's own Self-Improvement Protocol, applied to
   your build process).

---

## 8. Session Handoff Template

If you switch coding sessions (new day, new agent context window), start with:

> "Continuing the Centralised Course Registration & Follow-Up System build. We are currently
> in [Week X] of the Implementation Plan (Document 10). Completed so far: [list]. Currently
> working on: [task]. Read Documents 1–11 in full before continuing, and confirm you
> understand the Business Rules (Document 4) and Data Schema (Document 3) before writing any
> new code."

This prevents the single most common AI-agent-build failure mode: a fresh session
reinventing a decision that was already made and documented, because it was never re-read.

---

## 9. Final Pre-Launch Review Prompt

Before Week 5, Day 24 (production deployment), give the agent this comprehensive review
prompt:

> "Review the entire codebase against all 11 preceding documents. Specifically confirm:
> (1) every Business Rule in Document 4 has a corresponding implementation and passing test,
> (2) every RLS policy in Document 3, Section 6 is applied and tested per Document 9, Section 5,
> (3) no secret exists in the Git history or committed files,
> (4) the Ghana DPA features (Document 1, Section 14.1 and F1.10) are fully functional,
> (5) the Definition of Done in Document 10, Section 7 is met in full.
> Report any gap found — do not report 'all good' without walking through each of these five
> checks explicitly and showing me the evidence."

---

## 10. Ready for Development Checklist

```
□ 1. Founder understands their role is to direct the agent using specific
      document citations, not general feature descriptions.
□ 2. Founder will ask the four acceptance questions (Section 6) before
      accepting any module as complete, not just visually reviewing the UI.
□ 3. Any agent deviation from the documented spec is either rejected and
      redirected, or approved AND the relevant document is updated —
      documentation and code are never allowed to silently drift apart.
□ 4. Session handoff template used at the start of every new coding
      session, especially after a break of more than a day.
□ 5. Final pre-launch review prompt (Section 9) is run before Week 5,
      Day 24's production deployment — not skipped due to time pressure.
```

---

## Documentation Suite Complete

All 12 documents are now delivered:

1. Product Requirements Document
2. Technical Architecture Document
3. Data Schema and ERD
4. Business Logic Rules Document
5. API Contract and Endpoint Specification
6. Security and Authentication Specification
7. Integration Specifications
8. UI/UX Screen Specification
9. Test Specification
10. Implementation Plan
11. Coding Standards and Conventions
12. Agent Prompt Engineering Guide

**Per FOUNDRY.md's Document Standards, each document has been checked against:**
- **Agent-Readiness** — an AI coding agent can implement from these without asking a
  clarifying question
- **Research-Backed** — every technical recommendation traces to Discovery Stage 4 research
  and the Decision Log
- **Consistency** — the ubiquitous language glossary (Document 1, Section 3) is used
  identically across all 12 documents; no contradicting specification was found across the
  suite
- **Completeness** — every document ends with its own Ready for Development checklist

**Session end protocol (per FOUNDRY.md):** No new decisions were made outside the confirmed
Decision Log during documentation production — all 12 documents implement decisions already
confirmed in Stage 6. No new risks were identified during writing beyond those already in the
project risk register. This documentation suite is ready to hand to the AI coding agent.

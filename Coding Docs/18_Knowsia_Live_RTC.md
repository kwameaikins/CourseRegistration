# Knowsia Live — Self-Hosted RTC Integration Plan

**Status:** Approved direction, **deliberately not being built yet** (founder decision 2026-08-13)
**Owner:** Knowsia Operations and Engineering
**Scope:** Replacing Zoom with a self-hosted WebRTC classroom, as a provider behind the existing
LiveSession model. Extends Document 14; does not replace it.
**Source document:** `Coding Docs/knowsia-live-mediasoup-engineering-plan.md` (the founder's
engineering plan). This document is the authoritative integration decision record; where the two
disagree, this one is current. See §3 for every deviation and why.

---

## 1. Decisions Taken (2026-08-13)

Three decisions were taken when the source plan was assessed. All three are recorded here because
each one reverses or qualifies something in the source document.

| Decision | Outcome | Why |
| --- | --- | --- |
| **Build now?** | **No.** Nothing in this document is being implemented. | The product has not launched: the Paystack test-mode gate is unreached, the pivot-or-persevere gate is unreached, and Live Learning L1 Foundation is itself incomplete. See §2. |
| **Which SFU?** | **LiveKit**, self-hosted. Not mediasoup. | Same deployment ownership, materially less orchestration to write. See §3.1. |
| **Budget** | Unresolved, and it is the binding constraint. | `$0/month` is a stated non-negotiable in CLAUDE.md. This cannot be $0. See §6. |

**The operative instruction is: do not start.** This document exists so the decision is recorded
with its reasoning, so the cheap prerequisite work in §4 is visible as owed work rather than as
RTC work, and so a future session does not re-litigate the SFU choice from scratch.

---

## 2. Why Not Now

The source plan is technically sound and fits this codebase unusually well (§5 shows how well).
The case against starting is about sequencing, not merit.

1. **The product has not launched.** Paystack has never had a test-mode end-to-end run, the
   pivot-or-persevere gate is unreached, and the Week 4/5 checklist still has Sentry, Uptime
   Robot, staff accounts, load test, and go-live open. Building an SFU before the thing it serves
   has taken its first live payment is out of order.

2. **Live Learning L1 is not finished.** The batch schedule generator and the session-level
   provider adapter are both still pending (PLAN.md §Live Learning Operations). L2–L5 have not
   started. Knowsia Live is, structurally, an *L6* — it cannot land before the layer it plugs into.

3. **The headline benefit is mostly already delivered.** The source plan's central argument is
   exact, trustworthy attendance (§§10, 18, 19). The 2026-08-06 attendance work already delivered
   server-side timestamps, per-sitting duration (`attendance.session_minutes`), a real threshold
   (`MIN_ATTENDANCE_RATIO`), and row provenance (`attendance.source`). What remains is one gap:
   `ensureZoomRegistration` produces zero `zoom_registrants` rows, so matching falls back to
   display-name inference. That gap is an **open Zoom-configuration decision in CLAUDE.md**, not a
   Zoom limitation — closing it is days of work and recovers most of the "exact identity" argument.
   Do that before spending a year on an SFU to obtain the same property.

4. **Effort shape.** RTC-0 through RTC-14 in the source plan is a 6–12 month track for a
   single-founder team. Nothing else on PLAN.md is on that scale.

**Revisit when:** the product has launched and is taking real payments, L1–L3 of Live Learning are
complete, and either Zoom cost or Zoom capacity has become a felt constraint rather than an
anticipated one.

---

## 3. Deviations From the Source Plan

### 3.1 LiveKit instead of mediasoup

The source plan's own §40 table rates LiveKit "excellent general platform, medium complexity" and
then sets it aside for mediasoup on ownership grounds. That reasoning does not hold here:

- LiveKit is Apache-2.0 and self-hostable on the same hardware. Deployment ownership is identical.
  The ownership difference is over the *RTP forwarding internals* — which the source plan's own
  §34 says not to modify anyway ("do not fork or modify the native mediasoup worker during V1").
- LiveKit ships, as built-ins, most of what the source plan asks Knowsia to write: simulcast and
  adaptive stream (§13, §14), active speaker (§15), multi-node with Redis (§7, §23), recording and
  composition via Egress (§20, §21), room/participant/permission model with token identity
  (§3, §10, §12), and reconnection handling (§27).
- mediasoup provides no signaling at all (source plan §9 says so plainly). LiveKit's client SDKs
  and server API cover it. For this team that is the difference between shipping and not.

**What is genuinely lost:** the fine-grained router/worker placement control in source plan §§4–7
and §28. That control matters at multi-thousand concurrent scale. It does not matter at 500.

**Consequence for this document:** source plan sections 2, 4, 5, 6, 7, 9, 11, 12, 23, 24, 25, 28,
and 34 are mediasoup-specific and are superseded. Sections 3, 10, 13, 14, 16, 17, 18, 19, 20, 21,
22, 26, 29, 31, 32, 33, 35, 36, 37, 38 remain valid and provider-independent — that is the majority
of the plan, and it is the valuable majority.

### 3.2 No parallel `rtc_*` data model

The source plan §30 proposes `live_sessions`, `rtc_rooms`, `rtc_participants`,
`rtc_attendance_events`, `rtc_recordings`. Three of those already exist here under other names, and
one of them — attendance — must not be duplicated. See §5.2.

### 3.3 Microservice exception

The source plan §8 proposes six services (`rtc-control/`, `rtc-signaling/`, `rtc-media/`,
`rtc-recording/`, `rtc-turn/`, `rtc-monitoring/`). Document 14 §1 says, verbatim: *"The platform
stays a modular monolith. Do not introduce microservices for this scope."*

**Resolution:** exactly **one** additional deployable (`knowsia-live-rtc`), not six. It is an
unavoidable exception — Vercel cannot host an SFU (no UDP, no long-lived process, no persistent
WebSocket on Hobby, function time limits) — and it is recorded as an exception in Document 14
rather than treated as a precedent for splitting the monolith generally. Recording, TURN, and
monitoring are deployment concerns of that one service, not separate services.

---

## 4. Prerequisite Work (owed regardless, $0, not RTC work)

This work is on the Live Learning roadmap already. It is listed here because it is also everything
that has to be true before Knowsia Live could start — and because doing it makes the SFU decision
reversible instead of load-bearing.

**P1 — Formalise the provider adapter.** `modules/live-sessions/types.ts` already declares
`provider: 'zoom'` as a literal on `LiveSession`. Widen it to a union, add the column, and move the
Zoom calls in `lib/zoom/client.ts` behind a `LiveSessionProvider` interface:

```text
issueJoinReference(session, registration) -> personal join reference
fetchParticipation(session)               -> participation records for attendance
recordingReference(session)               -> provider recording handle
```

Document 14 §1 already requires this ("provider-specific code belongs behind a live-session
provider adapter so Microsoft Teams or Google Meet can be added later"). It is owed for Teams/Meet
whether or not Knowsia Live ever exists, and it is what makes §3.1's decision cheap to revisit.

**P2 — Close the Zoom registrant gap.** `ensureZoomRegistration` has never produced a
`zoom_registrants` row despite the app holding `meeting:write:registrant`. Until it does, every
session depends on display-name inference and the 2026-08-06 strict/loose matching tiers. This is
the single highest-value attendance work available and it is not an RTC project.

**P3 — Finish L1.** Batch schedule generator, so one immutable record per planned class occurrence
exists (Document 14 §10, first acceptance criterion).

---

## 5. How It Would Fit (the design, for when it is built)

### 5.1 Identity — the part that is nearly free here

The source plan §10 asks for a short-lived RTC access token carrying
`registration_id`/`student_id`/`batch_id`/`session_id`/`role`. Knowsia already has all of it, and
already has four working instances of the auth pattern that issues it (participant, tutor, company,
and partner portals — PIN + session cookie, RLS enabled with zero policies, service layer as the
boundary, BR-31).

The rule, matching `POST /api/portal/enrol` exactly: **who is joining comes from the portal session
cookie, never from the request body.** A Next.js route authenticates the portal session, checks
eligibility through `liveSessionsService`, and mints a short-lived signed token. The RTC service
verifies the signature and trusts nothing else. This makes source-plan gate RTC-1 (Knowsia
authentication and exact identity) close to free — and it is the property Zoom structurally cannot
give.

Role mapping is already-existing auth tiers, not new concepts:

| Source plan role (§3) | Knowsia identity |
| --- | --- |
| Tutor (audio/camera/screen) | Tutor portal session, `live_sessions.tutor_id` |
| Co-host / panelist | Second assigned tutor, or admin staff session |
| Learner (receive-only, promotable) | Participant portal session + eligible Registration |

### 5.2 Attendance — route through the existing tables, do not duplicate

This is the most important integration rule in this document.

```text
live_sessions            (EXISTS — gains provider columns)
  -> live_session_registrants   (EXISTS — gains peer/role)
  -> rtc_attendance_events      (NEW, append-only, RTC-internal — source plan §18)
  -> live_session_attendance    (EXISTS, schema-only since 202607250025/026/027, never written)
  -> attendance                 (EXISTS — what certificates actually read)
```

RTC attendance events roll up into `attendance` rows with `source = 'knowsia_live'` (joining
`zoom_name_match` and `manual_correction` from migration `202608060050`) and a real
`session_minutes`. Certificate eligibility, `MIN_ATTENDANCE_RATIO`, the free-batch attendance gate,
and the attendee-targeted feedback dispatch then all work **completely unchanged**.

`live_session_attendance` needs no schema change to accept this. Migration `202607250027` already
gave it `source text not null default 'zoom'`, `join_time`/`leave_time`/`duration_minutes`, a
`unique (live_session_id, registration_id)` key that makes re-running a sync idempotent (Document 14
§10), and `reviewed_at`/`reviewed_by` for the reviewer lock in Document 14 §5 step 6. It was built
provider-agnostic and has simply never been written to. A `'knowsia_live'` source value is the whole
of the change.

A second attendance system standing beside the one certificates read is how you end up with two
disagreeing answers to "did they attend" — and on a free batch, an attendance row is what makes a
certificate issuable. The source plan's `rtc_attendance_events` is therefore adopted as an
RTC-internal event log *feeding* the existing chain, never as a replacement for it.

Note also that `session_minutes` is defined as the **longest single sitting**, not
first-join-to-last-leave (2026-08-06 — on a real class day the naive reading was ~14 hours against
a 175-minute class). A self-hosted SFU knows this precisely rather than by inference, which is a
genuine improvement over the Zoom path, not merely parity.

### 5.3 Recording

R2 has been live since 2026-08-02, one bucket (`knowsia-course-bucket`), with every key built by
`lib/r2/keys.ts` and nowhere else. A new upload type gets a new key prefix, per the founder's
2026-08-05 rule:

```text
recordings/<liveSessionId>/<uuid>.<ext>
```

R2 egress is free, which makes it the right home for recording *delivery* specifically. Recording
metadata belongs on Document 14's already-specified `session_recordings` entity (consent, release,
retention), not on a new `rtc_recordings` table.

### 5.4 Callback trust

The RTC service calling back into Knowsia is the same shape as two things that already exist: the
`CRON_SECRET`-gated cron routes, and the `'system'` trust tier in `modules/agent-tools/registry.ts`
that Vapi's shared-secret caller uses. It writes through `liveSessionsService`, never directly to
tables — the module boundary rule holds across the process boundary exactly as it does inside it.

### 5.5 Network reality for Ghana

Not addressed by the source plan and load-bearing in practice:

- **TURN over TCP/443 is not optional.** Ghanaian mobile networks and corporate firewalls will
  force a meaningful share of participants through it. Source plan §22 is right to call TURN
  production-critical.
- **Server location.** European bare metal (Frankfurt/London) is ~150–180ms RTT to Accra — usable,
  not great. Most Ghana traffic already routes through Europe. Cape Town is closer but hyperscaler
  egress pricing there is disqualifying (§6).
- **The 267-person free ESG cohort is the realistic load model**, not a hypothetical 500. Design
  against real observed cohort sizes.

---

## 6. Cost — the binding constraint

CLAUDE.md states a `$0/month` budget as a non-negotiable, with named exceptions (Arkesel, Vapi,
Anthropic) that are all small and metered. **This is a different order of magnitude and the source
plan never costs it.**

Rough arithmetic for one 500-person, 3-hour class:

```text
500 learners x ~850 kbps (video + audio)  ~=  425 Mbps sustained egress
425 Mbps x 10,800 s                       ~=  570 GB per session
```

- On bare metal with included bandwidth (Hetzner/OVH class): roughly **€50–150/month** all-in for
  media nodes plus TURN, at Knowsia's session volume.
- On Vercel/AWS/GCP metered egress: **four figures per session**. Disqualifying. If Knowsia Live is
  ever built, it is built on bare metal — this is not a preference.

CPU is not the constraint at this scale; egress is. A single 8-core box can carry a 500-person
presenter-first room.

**Status: unresolved.** No exception has been approved, and none is needed while the answer to §1
is "not now".

---

## 7. Staging (for when §1's first decision changes)

Gates follow the source plan §35's RTC-0..RTC-14, restated against LiveKit. Zoom remains the live
provider throughout every stage, per source plan §35 — Knowsia Live is never the only path to a
class until the final gate.

| Stage | Gates | Content |
| --- | --- | --- |
| **0** | — | §4 prerequisites. $0. Owed anyway. |
| **1** | RTC-0..RTC-3 | One node, one room, tutorials only (2–20). Portal-session-minted tokens. Attendance events writing through to `attendance` with `source = 'knowsia_live'`. No recording, no sharding, no TURN tuning. |
| **2** | RTC-4..RTC-7 | Simulcast and adaptive quality (LiveKit built-in), coturn, recording via LiveKit Egress to R2. |
| **3** | RTC-8..RTC-11 | 100-person controlled test, multi-node, 500 synthetic, 500 real pilot. |
| **4** | RTC-12..RTC-14 | Concurrent classes, failure/reconnection, production-cutover eligibility. |

Do not build the room scheduler, sharding topology, or multi-node placement (source plan §§4, 7,
28) before Stage 3. At Stage 1 and 2 they are speculative complexity.

The V1 objective is adopted from source plan §38 unchanged, and it is a good one:

> A tutor can reliably teach 500 authenticated learners for three hours, share a screen, take
> questions, record the class, and produce exact attendance.

Source plan §37's exclusion list (no virtual backgrounds, no breakout rooms, no transcription, no
AI summaries, no 4K, no E2EE mode) is adopted unchanged and should be treated as binding — with one
note: Document 14 §5 currently assumes Zoom's breakout rooms and waiting rooms exist. Any cutover
must reconcile that.

---

## 8. Open Questions

1. Budget exception — unresolved, and blocking any build (§6).
2. Whether Zoom cost or capacity ever actually becomes a felt constraint. If it does not, the
   honest answer may be that Knowsia Live is never built, and the §4 prerequisite work was still
   worth doing. That is a legitimate outcome, not a failure.
3. Breakout rooms and waiting rooms are assumed by Document 14 §5 and excluded by source plan §37.
   Reconcile before any cutover, not after.
4. Recording consent and retention period remain unconfirmed (Document 14 §11, item 2) — that gap
   predates this document and applies to the Zoom path today.

---

*Supersedes nothing. Extends Document 14. The source engineering plan
(`knowsia-live-mediasoup-engineering-plan.md`) is retained as the founder's original analysis; read
this document's §3 before treating any part of it as current.*

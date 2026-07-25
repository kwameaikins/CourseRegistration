# Knowsia Revenue OS Integration Plan

## 1. Objective

Fit the attached Revenue OS vision into the existing Knowsia course registration platform without introducing unnecessary complexity. The target is to evolve the current system into an agentic revenue platform by extending the existing modular monolith rather than building a separate product.

## 2. Integration Strategy

Keep the current Next.js application as the single deployment unit and add new capabilities as modules inside the same codebase.

### Core decision
- Do not introduce microservices at this stage.
- Reuse the current modules for registration, payments, communications, courses, users, and dashboard.
- Add new business modules for CRM, leads, sales, marketing, analytics, and AI orchestration.

This matches the app’s current architecture and keeps the product easy to ship and maintain.

---

## 3. How the attached document maps to this repository

### Existing app capabilities to preserve
- Public registration flow
- Staff roles and permissions
- Course and batch management
- Payment tracking
- Email and reminder automation
- Dashboard reporting

### New capabilities to add
- Lead capture and lead scoring
- CRM customer profiles
- Sales pipeline and opportunity management
- Follow-up automation
- Marketing campaign management
- Executive analytics and AI insights

---

## 4. Recommended repository structure

Add the following under the existing app and modules structure:

```text
modules/
  crm/
    repository.ts
    service.ts
    types.ts
  leads/
    repository.ts
    service.ts
    types.ts
  sales/
    repository.ts
    service.ts
    types.ts
  marketing/
    repository.ts
    service.ts
    types.ts
  analytics/
    repository.ts
    service.ts
    types.ts
  ai/
    orchestrator.ts
    service.ts
    types.ts
```

Add new staff pages:

```text
app/(staff)/
  crm/page.tsx
  leads/page.tsx
  sales/page.tsx
  marketing/page.tsx
  analytics/page.tsx
  ai/page.tsx
```

Add new API routes:

```text
app/api/
  leads/route.ts
  leads/[id]/route.ts
  opportunities/route.ts
  campaigns/route.ts
  analytics/summary/route.ts
  ai/qualify/route.ts
  ai/follow-up/route.ts
```

---

## 5. Data model additions

The existing app already has strong foundations for course registrations and payments. The Revenue OS layer should add the following tables:

### Priority 1: core revenue OS tables
- leads
- lead_scores
- opportunities
- activities
- follow_ups
- conversations

### Priority 2: growth and campaign tables
- campaigns
- campaign_members
- segments
- automations

### Priority 3: AI and governance tables
- ai_sessions
- ai_memory
- audit_logs
- workflow_runs

These should be created through Supabase migrations and accessed only through repository files, following the same pattern already used in the current modules.

---

## 6. Integration points with the current system

### A. Registration becomes the first lead event
When a participant completes registration:
1. Create a lead record.
2. Attach the course and batch context.
3. Initialize a lead score.
4. Create an initial activity log.
5. Trigger the first follow-up workflow.

This turns the current registration flow into the start of a revenue journey instead of an isolated enrollment event.

### B. Payment status changes become revenue signals
When a payment is updated to paid or failed:
1. Update the corresponding opportunity stage.
2. Trigger a payment confirmation or follow-up workflow.
3. Record the event in the activity timeline.

### C. Communication becomes a relationship channel
The current communications module should become the central outreach engine for:
- email
- WhatsApp
- SMS
- reminders
- follow-up nudges

### D. Course completion becomes retention and referral data
After course completion or certificate issuance:
1. Create a retention signal.
2. Trigger referral opportunities.
3. Update the learner’s customer profile.

---

## 7. Suggested MVP scope

Build the Revenue OS in a phased way.

### Phase 1 — Foundation MVP
Deliver the minimum features that create business value quickly:
- Lead capture from registration and manual entry
- Automatic lead scoring
- Lead detail page with customer profile
- Sales pipeline view
- Follow-up reminders
- Executive dashboard for registrations and revenue

### Phase 2 — Engagement and automation
Add:
- Campaign workspace
- WhatsApp/email automation
- Lead assignment rules
- AI-generated follow-up suggestions

Current implementation note (2026-07-25): the campaign workspace keeps Queue as a dry-run preview/logging action. Real dispatch uses a separate Send action, guarded by per-channel live-send toggles, a 100-recipient cap, exact recipient-count confirmation, and typed `SEND <count>` confirmation. Email sends via Resend and SMS sends via Arkesel; WhatsApp remains toggle-tracked but is not dispatch-wired.

### Phase 3 — Agentic intelligence
Add:
- Lead qualification agent
- Sales assistant agent
- Executive analytics agent
- Multi-step workflow orchestration

---

## 8. Recommended implementation order

### Week 1
- Create lead and opportunity tables
- Add lead repository and service modules
- Create a staff leads page
- Link registration creation to lead creation

### Week 2
- Add lead scoring logic
- Add activity and follow-up logging
- Create opportunity pipeline UI
- Connect payment updates to opportunity stage changes

### Week 3
- Add campaign and automation modules
- Connect communications module to workflows
- Add basic dashboard metrics

### Week 4
- Add AI-assisted qualification and follow-up suggestions
- Add analytics summaries and executive views
- Add audit logging and workflow history

---

## 9. Suggested module responsibilities

### CRM module
Owns customer profiles, contact details, lifecycle history, and relationship context.

### Leads module
Owns lead capture, scoring, qualification, assignment, and status updates.

### Sales module
Owns opportunities, pipeline movement, sales tasks, and follow-up management.

### Marketing module
Owns campaigns, audiences, content, and workflow triggers.

### Analytics module
Owns reporting, cohort summaries, funnel metrics, and executive insights.

### AI module
Owns orchestration, qualification prompts, follow-up recommendations, and agent actions.

---

## 10. Acceptance criteria

The integration is successful when:
- A registration automatically creates a lead and activity record.
- Staff can view and manage leads from a dedicated staff page.
- A sales pipeline exists for opportunities and follow-up tasks.
- Payment changes update the lead/opportunity journey.
- Communication workflows can be triggered from lead or opportunity events.
- Executives can view a dashboard that combines registration, payment, and lead health data.

---

## 11. Final recommendation

Implement this as an extension of the existing modular monolith. The current app already has the correct core engine for course registration and payments. The attached Revenue OS document should therefore be used as the roadmap for adding CRM, lead, sales, campaign, and AI capabilities on top of that working foundation.

---

## 12. Live Learning Operations Relationship

The Revenue OS and Live Learning Operations share learner, lead, communications, and analytics signals but remain separate module responsibilities. Revenue OS owns acquisition and conversion; Live Learning Operations owns delivery, attendance, learner success, completion, and post-course signals. `modules/live-sessions` may publish approved attendance/completion signals to analytics or CRM workflows, but it must not let sales automation alter academic records.
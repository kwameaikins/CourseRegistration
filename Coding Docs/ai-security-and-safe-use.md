# AI Security and Safe Use for Business Professionals

**Course curriculum — draft v1**

---

## 1. Course overview

Organisations across the globe are adopting AI tools faster than they are putting rules around them. Staff are pasting client data into free chatbots, accepting AI output into reports without checking it, and receiving scam messages that AI has made far more convincing. Most organisations have no policy, no training, and no idea what their exposure is.

This course closes that gap. It treats **AI security** (protecting the organisation from AI-enabled threats) and **AI safe use** (preventing harm from ordinary, well-intentioned use) as two distinct disciplines, then brings them together in a written policy each participant drafts for their own organisation.

The course is non-technical. No coding, no mathematics, no prior AI experience required.

### Course aim

To equip business professionals to use AI tools productively without exposing their organisation to data loss, fraud, regulatory breach, or reputational damage — and to lead the setting of AI rules within their own teams.

### Learning outcomes

On completion, participants will be able to:

1. Explain in plain language how generative AI systems work and why they fail.
2. Distinguish AI security threats from AI safe-use risks, and recognise where the two overlap.
3. Identify the main AI-enabled attack methods targeting organisations, including deepfake and social-engineering fraud.
4. Classify organisational data and decide what may and may not be entered into an AI tool.
5. Detect hallucination, fabrication and silent error in AI output, and apply proportionate verification.
6. Assess the fairness and legality of AI-assisted decisions affecting individuals.
7. Apply Ghana's data protection framework to AI use in their organisation.
8. Draft and implement an AI acceptable-use policy.

### Target audience

**Primary audience**

- Managers and team leads whose staff are already using AI tools, with or without permission
- Finance, treasury and payment-approval staff exposed to deepfake and email-compromise fraud
- Accountants, auditors, and compliance and risk officers accountable for AI-assisted work and disclosures
- HR professionals using or reviewing AI in recruitment, performance and disciplinary decisions
- Data protection officers, legal and company secretarial staff responsible for Act 843 compliance

**Also suitable for**

- Executives and directors who will approve the organisation's AI policy
- IT managers and administrators who will own the approved-tools list — no technical background needed
- Marketing, communications and customer service teams using AI in daily client-facing work
- Procurement and vendor-management officers vetting AI features in third-party software
- Anyone whose organisation is adopting AI tools, regardless of function

**Prerequisites:** None. Participants should have used an AI chatbot at least once.

### Delivery

- **Format:** Live online via Zoom
- **Duration:** 16 contact hours across 3 days (5.5 contact hours per day)
- **Daily schedule:** 9:00 AM – 3:00 PM, with a 30-minute break — the standard CPD day format
- **Class size:** Recommended maximum 30, to allow live exercise feedback
- **Assessment:** Continuous exercises plus a final policy deliverable
- **Certification:** Verifiable certificate of completion

> A condensed 1-day (8-hour) executive version is outlined in Appendix B.

---

## 2. Curriculum structure

| Day | Theme | Modules | Hours |
|---|---|---|---|
| **1** | **Threats** — AI security, where an adversary is present | 1, 2, 3 | 5.5 |
| **2** | **Reliability** — AI safe use, where no attacker is needed | 4, 5, 6 | 5.5 |
| **3** | **Governance** — law, policy and what you take back to work | 7, 8 | 5.5 |

Each day is self-contained around one idea, which makes the security/safe-use distinction structurally visible rather than merely asserted in Module 1.

### Daily timetable

| | Day 1 | Day 2 | Day 3 |
|---|---|---|---|
| 9:00–11:00 | Module 1 — Understanding AI | Module 4 — The reliability problem | Module 7 — Ghana regulation |
| 11:00–11:30 | *Break* | *Break* | *Break* |
| 11:30–13:30 | Module 2 — Threat landscape | Module 5 — Verification | Module 8 — Policy build (part 1) |
| 13:30–15:00 | Module 3 — Data and tools (1.5 hr) | Module 6 — Bias and fairness (1.5 hr) | Module 8 — Presentations and close |

---

## 3. Module detail

### Module 1 — Understanding AI: what it is and what it isn't
**Duration:** 2 hours

**Purpose:** Give participants enough working understanding to reason about risk independently, rather than memorising rules they will forget.

**Topics**
- Generative AI in plain language: prediction, not retrieval
- Why AI produces confident, fluent, wrong answers — the structural reason
- Types of deployment: consumer chatbots, enterprise/business tiers, embedded AI features, agents that take actions
- What "the AI is learning from my data" does and does not mean
- Where AI genuinely adds value in business work, and where it is a poor fit
- The three terms people confuse: AI security, AI safe use, AI safety (alignment research)

**Activity:** Tool audit — participants list every AI tool already in use in their organisation, including embedded features they had not counted as AI.

**Outcome:** Participants can explain to a colleague why an AI tool cannot be trusted the way a calculator can.

---

### Module 2 — The AI threat landscape
**Duration:** 2 hours

**Purpose:** Cover AI security proper — threats where an adversary is present.

**Topics**
- Prompt injection: hidden instructions in documents, emails and web pages that hijack an AI assistant
- Jailbreaking and misuse of company-deployed tools
- Data poisoning and model manipulation (overview level)
- Credential and API key exposure
- **AI-enabled fraud** (extended treatment):
  - Deepfake audio and video — cloned voice payment instructions
  - AI-generated phishing and business email compromise
  - Synthetic identity and document forgery
  - Investment and romance scams at scale
- Shadow AI: unapproved tools staff use without IT's knowledge
- Third-party and vendor risk: what your software provider's AI feature does with your data

**Activity:** Live demonstration of prompt injection against a document-reading assistant, followed by a deepfake detection exercise using local case examples.

**Outcome:** Participants can name the attack methods most likely to target their organisation and describe at least one control for each.

---

### Module 3 — Data, confidentiality and tool selection
**Duration:** 1.5 hours

> Cross-border transfer is deferred to Module 7, where it is covered under Act 843 in its proper legal context. The tool due-diligence checklist is issued as a take-away rather than worked through in class.

**Purpose:** The single highest-frequency risk in practice — staff entering data that should never leave the organisation.

**Topics**
- Where your data actually goes: hosting, retention, training use, sub-processors
- Consumer versus business versus enterprise tiers — the differences that matter
- Reading the settings that matter: training opt-out, chat history, workspace controls
- Data classification for AI purposes: public / internal / confidential / never
- Special categories: client financial data, personal data, health data, salary and disciplinary records, legally privileged material, unpublished results
- Cross-border data transfer and data sovereignty
- Anonymisation and redaction before use — and its limits
- Selecting and approving tools: a due-diligence checklist

**Activity:** Data classification workshop — participants sort a set of realistic documents into permitted and prohibited categories, then defend borderline calls.

**Outcome:** Participants can produce a data classification list for their own function.

---

### Module 4 — The reliability problem
**Duration:** 2 hours

**Purpose:** Open the AI safe-use half. Establish, by demonstration rather than assertion, that fluent output is not correct output.

**Topics**
- Hallucination: what it is, why it cannot be fully eliminated
- Fabricated sources, citations, case law, standards references and statistics
- Silent arithmetic and aggregation errors
- Plausible-but-wrong summarisation: what gets dropped
- Overconfidence and the absence of "I don't know"
- Context limits, stale knowledge and cut-off dates
- Automation bias: why people stop checking, and how quickly
- Where errors are cheap and where they are catastrophic

**Activity:** Error hunt — participants are given AI-generated outputs (a summary, a set of figures, a referenced note) seeded with realistic errors, and must find them under time pressure. Debrief on what was missed and why.

**Outcome:** Participants have personally experienced being misled by a fluent output.

---

### Module 5 — Verification and human oversight
**Duration:** 2 hours

**Purpose:** The constructive counterpart to Module 4 — how to use AI safely rather than avoid it.

**Topics**
- Proportionate verification: matching checking effort to consequence
- Verification techniques: source tracing, independent recomputation, requiring working to be shown, adversarial re-prompting, second-tool cross-check
- Prompting for verifiability rather than fluency
- The human-in-the-loop principle: which tasks may be delegated, which require qualified sign-off
- Professional accountability — the output is the professional's, not the tool's
- Disclosure: when to tell clients, employers, regulators or readers that AI was used
- Record-keeping and audit trail for AI-assisted work
- Over-reliance and skill erosion in junior staff

**Activity:** Participants take a flawed AI output from Module 4 and design a verification procedure for that class of task, sized to its risk.

**Outcome:** Participants can define a review standard for AI-assisted work in their own team.

---

### Module 6 — Bias, fairness and decisions about people
**Duration:** 1.5 hours

**Purpose:** The highest-risk application category, and the one most likely to attract regulatory attention.

**Topics**
- How bias enters AI systems: training data, proxies, feedback loops
- High-risk use cases: recruitment screening, promotion and performance review, credit and loan decisions, customer risk scoring, disciplinary matters
- Why "the system decided" is not a defence
- Explainability: can you tell the affected person why?
- The right to human review of automated decisions
- Local relevance: bias against African names, languages, contexts and data
- Accessibility and inclusion in AI-assisted service delivery

**Activity:** Case analysis — an AI-assisted recruitment shortlist that has quietly excluded a category of candidates. Participants identify the failure and design the control.

**Outcome:** Participants can identify which decisions in their organisation must not be automated without human accountability.

---

### Module 7 — The Ghana legal and regulatory position
**Duration:** 2 hours

**Purpose:** Ground the course in the law that actually applies, and set expectations for what is coming.

**Topics**
- **Data Protection Act, 2012 (Act 843)** — the operative law today
  - Scope: any processing of Ghanaian residents' personal data, including processing by AI systems
  - Core obligations: lawful basis, purpose limitation, accuracy, security
  - Data subject rights: access, correction, erasure
  - No AI exemption — the Act applies as written
  - Registration of data controllers; the role of the Data Protection Commission
- **Cybersecurity Act, 2020 (Act 1038)** and the Cyber Security Authority — incident reporting and protected systems
- **National AI Strategy** — launched 24 April 2026; policy direction, the proposed Responsible AI Office, and what it signals for regulated sectors
- **What is coming:** a new Data Protection Bill covering AI, automated decision-making and cross-border transfers; a draft Emerging Technologies Bill. Neither is law yet.
- Sector overlays: BoG directives for financial institutions, ICAG and professional body expectations, GRA and record-keeping implications
- Where cross-border rules bite: using a US-hosted AI tool on Ghanaian personal data
- Practical compliance steps: lawful basis, notices, DPIAs for high-risk use, vendor contracts

> **Facilitator note:** This area is moving. Verify the current status of the Data Protection Bill, the Emerging Technologies Bill and the Responsible AI Office before each cohort — the position stated above is as at August 2026.

**Activity:** Compliance gap check — participants assess one AI use case in their organisation against Act 843.

**Outcome:** Participants can state, for a given AI use case, whether personal data is being processed and what that requires of them.

---

### Module 8 — Building your organisation's AI policy
**Duration:** 3 hours (2 hours build, 1 hour presentations and close)

**Purpose:** Convert the course into a deliverable. Every participant leaves with a draft policy, not just notes.

**Topics**
- Anatomy of an AI acceptable-use policy
- Approved tools list and the approval process for new tools
- Data classification rules (carried forward from Module 3)
- Prohibited uses — the short, absolute list
- Review and sign-off requirements by task risk (from Module 5)
- Disclosure requirements — internal and client-facing
- Incident reporting: what counts as an AI incident and who is told
- Training, onboarding and periodic refresh
- Roles: who owns AI governance, and where it sits relative to IT, risk and compliance
- Monitoring adoption without policing staff into shadow AI
- Getting the policy approved: making the business case to leadership

**Activity:** Guided policy build using a supplied template. Participants work on their own organisation, present a two-minute summary, and receive peer and facilitator critique.

**Outcome:** A completed draft AI acceptable-use policy ready to take to management.

---

## 4. Assessment and certification

| Component | Weight | Form |
|---|---|---|
| Participation in module exercises | 30% | Facilitator observation |
| Error-hunt exercise (Module 4) | 20% | Scored |
| Compliance gap check (Module 7) | 20% | Submitted |
| Final AI policy draft (Module 8) | 30% | Submitted and presented |

Participants scoring 70% or above receive a verifiable certificate of completion.

---

## 5. Participant materials

- Course workbook (all slides plus exercise sheets)
- AI acceptable-use policy template (editable)
- Data classification worksheet
- AI tool due-diligence checklist
- Verification procedure templates by task type
- Ghana AI regulation reference sheet
- Curated further-reading list

---

## Appendix A — Facilitator notes

1. **Demonstrate, don't assert.** The prompt injection demo (M2) and the error hunt (M4) carry the course. Rehearse both; have recorded fallbacks in case a live tool behaves unexpectedly.
2. **Build a local case bank.** A Ghanaian MoMo fraud using cloned audio lands harder than an imported case study. Refresh it each cohort.
3. **Avoid two failure modes:** scaring participants into refusing AI entirely, and reassuring them into complacency. The target is calibrated confidence.
4. **Mixed seniority.** If the cohort spans managers and staff, split Module 8 into a governance track and a day-to-day-rules track for the final hour.
5. **Currency check.** Modules 2, 3 and 7 date fastest. Review before every delivery.

## Appendix B — Condensed 1-day executive version (8 hours)

| Time | Content |
|---|---|
| 1.0 hr | Module 1 (compressed) — foundations and the security/safe-use distinction |
| 1.5 hr | Module 2 — threat landscape, with fraud emphasis |
| 1.0 hr | Module 3 — data and tool selection |
| 1.5 hr | Modules 4 & 5 merged — reliability and verification, with live error hunt |
| 0.5 hr | Module 6 — decisions about people |
| 1.0 hr | Module 7 — Ghana regulation |
| 1.5 hr | Module 8 — policy build |

Modules 4–5 are the compression casualty; keep the live error hunt even at the cost of the surrounding theory.

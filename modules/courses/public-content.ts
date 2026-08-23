// Public marketing copy for the programme catalogue, keyed by
// courses.course_code.
//
// SOURCE OF TRUTH: the founder's course briefs in `Coding Docs/`:
//   AI02      → ai-powered-financial-reporting-analysis-modelling-automation.md
//   AI05      → ai-security-and-safe-use.md
//   IFRS02    → ifrs-18-presentation-and-disclosure.md
//   ESG1      → esg-sustainability-reporting-training.md
//   ERM1      → enterprise-risk-management-risk-based-auditing.md
//   TAX1      → preparing-for-tax-audit.md
// Those documents and this file must not drift. When a brief is edited, edit
// the matching entry here in the same change.
//
// THIS FILE IS NOW THE FALLBACK, NOT THE ONLY SOURCE (2026-08-16)
// ---------------------------------------------------------------
// Staff can edit this copy from /courses/content, which writes a JSONB
// document to the course_content table (migration 202608160062). Resolution
// order is DATABASE FIRST, THEN THIS MAP — see
// modules/courses/content-resolver.ts. A course nobody has edited renders from
// here exactly as it always has, which is why the editor shipped without a
// data migration.
//
// So: editing an entry here still works, but it only affects courses with no
// saved row. Check the Course Content screen before assuming a change here
// will show up — if the course reads "Edited here", the database wins.
//
// WHY THIS WAS A CODE FILE IN THE FIRST PLACE
// -------------------------------------------
// The courses table carries no marketing copy at all — course_code,
// course_name, the certificate fields and the Zoom fields, nothing else.
// (certificate_description is the wording printed on the certificate, not a
// paragraph that sells the course.) Version-controlling the prose here needs
// no migration, so a wording fix ships as a normal deploy instead of waiting
// on `supabase db push`, and copy gets reviewed like code. If staff later need
// to edit copy without a developer, this file is the thing to migrate into
// columns; the shape below is deliberately close to what those columns
// would be.
//
// WHAT IS DELIBERATELY *NOT* HERE: prices, dates, times and seat counts.
// Those live on the Batch and are read live (see public-catalog.ts), so the
// page can never advertise a fee the registration form then contradicts. The
// briefs quote fees in prose; the Batch is what actually charges.
//
// KEYS MUST MATCH courses.course_code EXACTLY.
// A course whose code is absent here still appears in the catalogue, rendered
// with its name and dates only (see getPublicCourseCatalog). That is the
// deliberate failure mode: a wrong key makes the page look plain, never empty,
// so a typo can't silently delete a programme from the public site.

export interface CourseCurriculumSession {
  // "Day 1 — Monday, 10 August" / "Session 3" — whatever the brief uses.
  heading: string;
  title: string;
  points: string[];
  // The brief's "Practical exercise:" / "Capstone:" line, where it has one.
  practical?: string;
}

export interface CoursePublicContent {
  // The brief's filename in Coding Docs, so the two can be traced to each
  // other without guessing.
  briefSlug: string;
  // The brief's H2 — a one-sentence promise. Also used as the page's meta
  // description and link-preview text.
  tagline: string;
  /**
   * Programme poster, as a path under /public — e.g. '/programmes/erm1.webp'.
   *
   * Relative here on purpose: the portal's own pages can use it directly, and
   * catalog-api.ts absolutises it for knowsia.com the same way registerUrl is
   * built. A consumer on another origin must never have to join these itself.
   *
   * The posters are 3:4 portrait with the course title set INTO the artwork.
   * Consumers therefore crop to the top band (icon + colour, above the title)
   * for list cards and show the full image only where it stands alone —
   * otherwise the title appears twice, once as pixels and once as a heading.
   *
   * null is a supported, expected state, not a missing value: a programme
   * without artwork renders exactly as it did before posters existed.
   */
  heroImage: string | null;
  overview: string[];
  // Condensed audience line for the catalogue card.
  idealFor: string;
  primaryAudience: string[];
  alsoSuitableFor: string[];
  // "What You Will Learn" vs "What You Will Be Able to Do" vs "You will
  // understand" — the briefs word this differently and the difference matters
  // for an introductory webinar.
  outcomesLabel: string;
  outcomes: string[];
  curriculum: CourseCurriculumSession[];
  // Rendered as a definition list; mirrors the brief's "Course Format" table
  // minus anything the Batch already owns (dates, times, fee).
  format: Array<{ label: string; value: string }>;
  prerequisites: string[];
  includes: string[];
  facilitator: { name: string; credentials: string | null };
  faq: Array<{ question: string; answer: string }>;
  // Commercial term that exists only in the briefs — there is no group-discount
  // rule in the schema, so this is copy, not something the system enforces.
  corporateNote: string | null;
}

const AI_FINANCE: CoursePublicContent = {
  briefSlug: 'ai-powered-financial-reporting-analysis-modelling-automation',
  tagline:
    'Build faster, more accurate and reusable finance workflows with AI.',
  heroImage: null,
  overview: [
    'Learn how to apply artificial intelligence directly within financial reporting, data analysis, financial modelling, and automation workflows — while preserving professional judgement, proper review, and responsible data handling.',
    'Accounting and finance professionals are under increasing pressure to prepare reports faster, analyse larger datasets, produce stronger management commentary, and build reliable financial models — often with limited time and resources.',
    'Across five live sessions, participants progress from foundational prompting and data-safety practices to building a reusable AI-assisted reporting or modelling workflow.',
  ],
  idealFor:
    'Accountants, finance officers, controllers, FP&A analysts, finance managers, SME CFOs, and audit professionals.',
  primaryAudience: [
    'Accountants, finance officers, and controllers who prepare or review management and financial reports',
    'FP&A analysts and budget officers who build financial models and forecasts',
    'Finance managers and SME CFOs seeking faster, leaner reporting cycles',
    'Audit and internal audit professionals seeking to accelerate analytical procedures',
  ],
  alsoSuitableFor: [
    'ICAG, ACCA, and CIMA students seeking practical and employable AI skills',
    'Accounting and finance consultants delivering reporting or modelling services',
    'Business owners who want to understand and generate their own reports',
  ],
  outcomesLabel: 'What you will be able to do',
  outcomes: [
    'Prepare financial reports and statements more efficiently using AI tools',
    'Analyse financial data and identify anomalies',
    'Draft management commentary with AI assistance',
    'Build and stress-test financial models with AI support',
    'Audit financial models for formula errors, broken links, and circular references',
    'Design a repeatable, automated AI-assisted reporting workflow',
    'Apply appropriate data-handling, governance, and professional review practices',
  ],
  curriculum: [
    {
      heading: 'Day 1',
      title: 'Foundations: AI as a Finance Tool',
      points: [
        'The AI landscape in accounting and finance',
        'Distinguishing real productivity gains from hype',
        'Categories of AI tools available for finance work',
        'Selecting the appropriate AI tool for each task',
        'Data hygiene and the safe handling of financial information',
        'Anonymising sensitive data before using AI',
        'Prompt-engineering fundamentals for finance professionals',
      ],
      practical:
        'Practical exercise: connect the required tools and run guided prompts using a sample trial balance.',
    },
    {
      heading: 'Day 2',
      title: 'AI-Powered Financial Reporting',
      points: [
        'Automating statement preparation from a trial balance',
        'Preparing income statements, statements of financial position, and cash-flow statements',
        'Drafting IFRS-aligned notes with AI assistance',
        'Producing variance commentary',
      ],
      practical:
        'Practical exercise: build a complete monthly management-reporting pack from raw data using AI in Excel.',
    },
    {
      heading: 'Day 3',
      title: 'AI-Driven Financial Analysis',
      points: [
        'Ratio and trend analysis with AI-generated interpretation',
        'Building dashboards with AI-assisted formulas',
        'Conditional formatting and chart development',
        'Turning financial data into clear narratives',
        'Drafting executive summaries and board commentary',
      ],
      practical:
        'Practical exercise: analyse a dataset and produce a complete AI-assisted analysis memo.',
    },
    {
      heading: 'Day 4',
      title: 'AI-Assisted Financial Modelling',
      points: [
        'Building a three-statement model with AI scaffolding',
        'Generating formulas and reviewing model logic',
        'Scenario and sensitivity analysis',
        'Creating flexible, assumption-driven models',
        'Using AI to identify broken links, circular references, and formula errors',
      ],
      practical:
        'Practical exercise: build a working financial model for a business case study.',
    },
    {
      heading: 'Day 5',
      title: 'Automation, Workflow Design and Capstone',
      points: [
        'AI-written macros and scripts for repetitive Excel tasks',
        'Converting reporting, analysis, and modelling processes into reusable routines',
        'Connecting AI to live data for recurring monthly reporting',
        'Designing an end-to-end AI reporting workflow',
        'Creating reusable prompt templates',
        'Establishing review checkpoints before AI-assisted outputs are submitted',
      ],
      practical:
        'Capstone: build and present an automated reporting or modelling workflow structured as a reusable template.',
    },
  ],
  format: [
    { label: 'Delivery', value: 'Live, instructor-led via Zoom' },
    { label: 'Duration', value: 'Five sessions, three hours each' },
    { label: 'Total training', value: '15 hours' },
    { label: 'CPD', value: '15' },
    { label: 'Support', value: 'Cohort WhatsApp group with the facilitator' },
    { label: 'Learner portal', value: 'Personal portal for meeting links and materials' },
  ],
  prerequisites: [
    'Intermediate Excel proficiency, including formulas and pivot tables',
    'A basic understanding of financial statements',
    'Access to Microsoft Excel, with Microsoft 365 recommended',
    'An active AI tool account',
    'No previous AI or prompt-engineering experience is required — the course is taught from first principles.',
  ],
  includes: [
    'Five live, instructor-led sessions',
    'Practical demonstrations and guided exercises',
    'Course resources and materials',
    'Access to a personal learner portal',
    'A cohort WhatsApp support group with the facilitator',
    'A certificate reflecting 15 training hours and CPD 15',
    'A practical capstone workflow that can be adapted for future use',
  ],
  facilitator: { name: 'Mr. Stephen Kwame Aikins', credentials: 'CA' },
  faq: [
    {
      question: 'Do I need previous AI experience?',
      answer:
        'No. The programme is taught from first principles, and setup guidance is provided during the first session.',
    },
    {
      question: 'What level of Excel knowledge is required?',
      answer: 'Participants should be comfortable with common Excel formulas and pivot tables.',
    },
    {
      question: 'What software or accounts do I need?',
      answer:
        'You should have Microsoft Excel — Microsoft 365 is recommended — and an active AI tool account.',
    },
    {
      question: 'How will the training be delivered?',
      answer: 'The programme consists of five live and interactive Zoom sessions.',
    },
    {
      question: 'Will I receive learning support?',
      answer:
        'Yes. Participants receive access to a learner portal and a cohort WhatsApp group with the facilitator.',
    },
    {
      question: 'Will I receive a certificate?',
      answer: 'Yes. The course includes a certificate reflecting 15 training hours and CPD 15.',
    },
  ],
  corporateNote:
    'Companies registering five or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
};

const AI_SECURITY: CoursePublicContent = {
  briefSlug: 'ai-security-and-safe-use',
  tagline: 'Know the threats. Verify the output. Own the policy.',
  heroImage: null,
  overview: [
    'Organisations across the globe are adopting AI tools faster than they are putting rules around them. Staff are pasting client data into free chatbots, accepting AI output into reports without checking it, and receiving scam messages that AI has made far more convincing. Most organisations have no policy, no training, and no idea what their exposure is.',
    'This course closes that gap. It treats AI security (protecting the organisation from AI-enabled threats) and AI safe use (preventing harm from ordinary, well-intentioned use) as two distinct disciplines, then brings them together in a written policy each participant drafts for their own organisation.',
    'The course is non-technical — no coding, no mathematics, and no prior AI experience required. Across three days, participants move from threats (AI security), to reliability (AI safe use), to governance, and leave with a draft AI acceptable-use policy ready to take to management.',
  ],
  idealFor:
    'Managers, finance and payment-approval staff, HR, compliance and risk officers, and business owners setting AI rules for their teams.',
  primaryAudience: [
    'Managers and team leads whose staff are already using AI tools, with or without permission',
    'Finance, treasury and payment-approval staff exposed to deepfake and email-compromise fraud',
    'Accountants, auditors, and compliance and risk officers accountable for AI-assisted work and disclosures',
    'HR professionals using or reviewing AI in recruitment, performance and disciplinary decisions',
    'Data protection officers, legal and company secretarial staff responsible for Act 843 compliance',
  ],
  alsoSuitableFor: [
    "Executives and directors who will approve the organisation's AI policy",
    'IT managers and administrators who will own the approved-tools list — no technical background needed',
    'Marketing, communications and customer service teams using AI in daily client-facing work',
    'Procurement and vendor-management officers vetting AI features in third-party software',
    'Anyone whose organisation is adopting AI tools, regardless of function',
  ],
  outcomesLabel: 'On completion, participants will be able to',
  outcomes: [
    'Explain in plain language how generative AI systems work and why they fail.',
    'Distinguish AI security threats from AI safe-use risks, and recognise where the two overlap.',
    'Identify the main AI-enabled attack methods targeting organisations, including deepfake and social-engineering fraud.',
    'Classify organisational data and decide what may and may not be entered into an AI tool.',
    'Detect hallucination, fabrication and silent error in AI output, and apply proportionate verification.',
    'Assess the fairness and legality of AI-assisted decisions affecting individuals.',
    "Apply Ghana's data protection framework to AI use in their organisation.",
    'Draft and implement an AI acceptable-use policy.',
  ],
  curriculum: [
    {
      heading: 'Module 1',
      title: "Understanding AI: what it is and what it isn't",
      points: [
        'Generative AI in plain language: prediction, not retrieval',
        'Why AI produces confident, fluent, wrong answers — the structural reason',
        'Types of deployment: consumer chatbots, enterprise/business tiers, embedded AI features, agents that take actions',
        'What "the AI is learning from my data" does and does not mean',
        'Where AI genuinely adds value in business work, and where it is a poor fit',
        'The three terms people confuse: AI security, AI safe use, AI safety (alignment research)',
      ],
      practical:
        'Activity: Tool audit — participants list every AI tool already in use in their organisation, including embedded features they had not counted as AI.\n\nOutcome: Participants can explain to a colleague why an AI tool cannot be trusted the way a calculator can.',
    },
    {
      heading: 'Module 2',
      title: 'The AI threat landscape',
      points: [
        'Prompt injection: hidden instructions in documents, emails and web pages that hijack an AI assistant',
        'Jailbreaking and misuse of company-deployed tools',
        'Data poisoning and model manipulation (overview level)',
        'Credential and API key exposure',
        'AI-enabled fraud: deepfake audio and video, cloned-voice payment instructions, AI-generated phishing and business email compromise, synthetic identity and document forgery, and investment and romance scams at scale',
        "Shadow AI: unapproved tools staff use without IT's knowledge",
        "Third-party and vendor risk: what your software provider's AI feature does with your data",
      ],
      practical:
        'Activity: Live demonstration of prompt injection against a document-reading assistant, followed by a deepfake detection exercise using local case examples.\n\nOutcome: Participants can name the attack methods most likely to target their organisation and describe at least one control for each.',
    },
    {
      heading: 'Module 3',
      title: 'Data, confidentiality and tool selection',
      points: [
        'Where your data actually goes: hosting, retention, training use, sub-processors',
        'Consumer versus business versus enterprise tiers — the differences that matter',
        'Reading the settings that matter: training opt-out, chat history, workspace controls',
        'Data classification for AI purposes: public / internal / confidential / never',
        'Special categories: client financial data, personal data, health data, salary and disciplinary records, legally privileged material, unpublished results',
        'Cross-border data transfer and data sovereignty',
        'Anonymisation and redaction before use — and its limits',
        'Selecting and approving tools: a due-diligence checklist',
      ],
      practical:
        'Activity: Data classification workshop — participants sort a set of realistic documents into permitted and prohibited categories, then defend borderline calls.\n\nOutcome: Participants can produce a data classification list for their own function.',
    },
    {
      heading: 'Module 4',
      title: 'The reliability problem',
      points: [
        'Hallucination: what it is, why it cannot be fully eliminated',
        'Fabricated sources, citations, case law, standards references and statistics',
        'Silent arithmetic and aggregation errors',
        'Plausible-but-wrong summarisation: what gets dropped',
        'Overconfidence and the absence of "I don\'t know"',
        'Context limits, stale knowledge and cut-off dates',
        'Automation bias: why people stop checking, and how quickly',
        'Where errors are cheap and where they are catastrophic',
      ],
      practical:
        'Activity: Error hunt — participants are given AI-generated outputs (a summary, a set of figures, a referenced note) seeded with realistic errors, and must find them under time pressure.\n\nOutcome: Participants have personally experienced being misled by a fluent output.',
    },
    {
      heading: 'Module 5',
      title: 'Verification and human oversight',
      points: [
        'Proportionate verification: matching checking effort to consequence',
        'Verification techniques: source tracing, independent recomputation, requiring working to be shown, adversarial re-prompting, second-tool cross-check',
        'Prompting for verifiability rather than fluency',
        'The human-in-the-loop principle: which tasks may be delegated, which require qualified sign-off',
        "Professional accountability — the output is the professional's, not the tool's",
        'Disclosure: when to tell clients, employers, regulators or readers that AI was used',
        'Record-keeping and audit trail for AI-assisted work',
        'Over-reliance and skill erosion in junior staff',
      ],
      practical:
        'Activity: Participants take a flawed AI output from Module 4 and design a verification procedure for that class of task, sized to its risk.\n\nOutcome: Participants can define a review standard for AI-assisted work in their own team.',
    },
    {
      heading: 'Module 6',
      title: 'Bias, fairness and decisions about people',
      points: [
        'How bias enters AI systems: training data, proxies, feedback loops',
        'High-risk use cases: recruitment screening, promotion and performance review, credit and loan decisions, customer risk scoring, disciplinary matters',
        'Why "the system decided" is not a defence',
        'Explainability: can you tell the affected person why?',
        'The right to human review of automated decisions',
        'Local relevance: bias against African names, languages, contexts and data',
        'Accessibility and inclusion in AI-assisted service delivery',
      ],
      practical:
        'Activity: Case analysis — an AI-assisted recruitment shortlist that has quietly excluded a category of candidates. Participants identify the failure and design the control.\n\nOutcome: Participants can identify which decisions in their organisation must not be automated without human accountability.',
    },
    {
      heading: 'Module 7',
      title: 'The Ghana legal and regulatory position',
      points: [
        'Data Protection Act, 2012 (Act 843) — the operative law today: scope, core obligations, data subject rights, and registration of data controllers',
        'No AI exemption — the Act applies as written, including to processing by AI systems',
        'Cybersecurity Act, 2020 (Act 1038) and the Cyber Security Authority — incident reporting and protected systems',
        'The National AI Strategy, the proposed Responsible AI Office, and what they signal for regulated sectors',
        'What is coming: a new Data Protection Bill covering AI, automated decision-making and cross-border transfers, and a draft Emerging Technologies Bill',
        'Sector overlays: BoG directives for financial institutions, ICAG and professional body expectations, GRA and record-keeping implications',
        'Where cross-border rules bite: using a US-hosted AI tool on Ghanaian personal data',
        'Practical compliance steps: lawful basis, notices, DPIAs for high-risk use, vendor contracts',
      ],
      practical:
        'Activity: Compliance gap check — participants assess one AI use case in their organisation against Act 843.\n\nOutcome: Participants can state, for a given AI use case, whether personal data is being processed and what that requires of them.',
    },
    {
      heading: 'Module 8',
      title: "Building your organisation's AI policy",
      points: [
        'Anatomy of an AI acceptable-use policy',
        'Approved tools list and the approval process for new tools',
        'Data classification rules and the short, absolute list of prohibited uses',
        'Review and sign-off requirements by task risk',
        'Disclosure requirements — internal and client-facing',
        'Incident reporting: what counts as an AI incident and who is told',
        'Training, onboarding and periodic refresh',
        'Roles: who owns AI governance, and where it sits relative to IT, risk and compliance',
        'Monitoring adoption without policing staff into shadow AI',
        'Getting the policy approved: making the business case to leadership',
      ],
      practical:
        'Activity: Guided policy build using a supplied template — participants work on their own organisation, present a two-minute summary, and receive peer and facilitator critique.\n\nOutcome: A completed draft AI acceptable-use policy ready to take to management.',
    },
  ],
  format: [
    { label: 'Delivery', value: 'Live online via Zoom' },
    { label: 'Duration', value: 'Three days, 9:00 AM – 3:00 PM with a 30-minute break' },
    { label: 'Total training', value: '16 contact hours' },
    { label: 'Class size', value: 'Maximum 30 participants' },
    { label: 'Assessment', value: 'Continuous exercises plus a final policy deliverable' },
    { label: 'Support', value: 'Cohort WhatsApp group with the facilitator' },
    { label: 'Learner portal', value: 'Personal portal for meeting links and materials' },
  ],
  prerequisites: [
    'None — the course is non-technical, with no coding, mathematics or prior AI experience required',
    'Participants should have used an AI chatbot at least once',
  ],
  includes: [
    'Live, instructor-led training across three days',
    'Course workbook with all slides and exercise sheets',
    'Editable AI acceptable-use policy template',
    'Data classification worksheet and AI tool due-diligence checklist',
    'Verification procedure templates by task type',
    'Ghana AI regulation reference sheet and a curated further-reading list',
    'Access to a personal learner portal',
    'A cohort WhatsApp support group with the facilitator',
    'A verifiable certificate of completion',
  ],
  facilitator: { name: 'Mr. Stephen Kwame Aikins', credentials: 'CA' },
  faq: [
    {
      question: 'Do I need previous AI experience?',
      answer:
        'No. The course is non-technical — no coding, no mathematics, and no prior AI experience required. You should simply have used an AI chatbot at least once.',
    },
    {
      question: 'How will the training be delivered?',
      answer:
        'Live online via Zoom across three days, 9:00 AM to 3:00 PM with a 30-minute break each day.',
    },
    {
      question: 'How is the course assessed?',
      answer:
        'Through continuous exercises across the modules — including an error-hunt exercise and a compliance gap check — plus a final AI acceptable-use policy that you draft and present.',
    },
    {
      question: 'Will I receive a certificate?',
      answer:
        'Yes. Participants scoring 70% or above receive a verifiable certificate of completion.',
    },
    {
      question: 'What will I take back to my organisation?',
      answer:
        'A completed draft AI acceptable-use policy for your own organisation, plus the templates, worksheets and checklists used to build it.',
    },
    {
      question: 'Will I receive learning support?',
      answer:
        'Yes. Participants receive access to a learner portal and a cohort WhatsApp group with the facilitator.',
    },
    {
      question: 'Is there a shorter version for executives?',
      answer:
        'Yes. A condensed one-day executive version is available for corporate groups — contact us to arrange it.',
    },
  ],
  corporateNote:
    'Companies registering five or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
};

const IFRS_18: CoursePublicContent = {
  briefSlug: 'ifrs-18-presentation-and-disclosure',
  tagline: 'Your 2027 accounts begin with your 2026 numbers.',
  heroImage: null,
  overview: [
    'IFRS 18 is effective for annual reporting periods beginning on or after 1 January 2027, replacing IAS 1 — and it applies retrospectively. For an entity with a 31 December year end, the first IFRS 18 financial statements are FY2027, and the comparative period is FY2026, which is already running. Entities that have not begun categorising income and expenses on an IFRS 18 basis will be reconstructing the comparative year backwards from records built on IAS 1 logic.',
    'IFRS 18 does not change recognition or measurement — profit is the same number. What changes is how performance is structured, subtotalled, disaggregated and explained, and for entities that rely on alternative performance measures, what must now be disclosed and reconciled.',
    'Across two live days, participants move from understanding what changed to restating a real set of accounts in a hands-on implementation workshop — leaving with restated primary statements, a management-defined performance measures note, a documented judgement file, and a dated transition plan for their own entity.',
  ],
  idealFor:
    'Financial accountants and controllers, reporting managers, auditors, CFOs and finance directors — particularly in listed entities, banks and insurers.',
  primaryAudience: [
    'Financial accountants, controllers and reporting managers who will prepare the first IFRS 18 statements and restate the FY2026 comparatives',
    'External and internal auditors who will review classification judgements and MPM disclosures',
    'CFOs and finance directors accountable for adjusted performance measures reported to lenders and investors',
    'Preparers in regulated sectors — listed entities, banks, rural banks and insurers, where main-business-activity classification bites hardest',
    'Audit committee members who must challenge the transition plan and the measures management retains',
  ],
  alsoSuitableFor: [
    'Finance teams of subsidiaries assessing the IFRS 19 reduced-disclosure regime',
    'Consultants and advisers supporting clients through the IAS 1 to IFRS 18 transition',
    'Any entity that reports adjusted performance measures to lenders or investors',
  ],
  outcomesLabel: 'On completion, participants will be able to',
  outcomes: [
    'Explain what IFRS 18 changes and, equally important, what it does not.',
    'Classify income and expenses into the five categories and present the two required subtotals.',
    'Determine whether an entity has a specified main business activity and apply the consequent classification.',
    'Identify management-defined performance measures and prepare the required note.',
    'Apply the aggregation and disaggregation principles to primary statements and notes.',
    'Apply the consequential amendments to IAS 7, IAS 8, IAS 33 and related standards.',
    'Execute retrospective transition, including restatement of comparatives and the required reconciliation.',
    'Produce a transition plan and timetable for their own entity.',
  ],
  curriculum: [
    {
      heading: 'Module 1',
      title: 'Why IFRS 18 exists, and what it does not change',
      points: [
        'The Primary Financial Statements project and the investor concerns behind it: incomparable operating profit, unexplained adjusted measures, unhelpful aggregation',
        'What IFRS 18 replaces and what it retains from IAS 1',
        'The critical framing point: recognition and measurement are unchanged — net profit is identical',
        'The three pillars: defined subtotals, MPM disclosure, enhanced aggregation and disaggregation',
        'The complete set of financial statements, and the third statement of financial position after retrospective adjustment',
        'Effective date, early adoption, and the Ghana position',
        'Why this is urgent now: the comparative-period arithmetic for a 31 December year end, worked through on screen',
      ],
      practical:
        'Activity: Participants map their own year end to the IFRS 18 timeline and identify the date by which comparative-period categorisation must be complete.',
    },
    {
      heading: 'Module 2',
      title: 'The five categories and the two required subtotals',
      points: [
        'The five categories: operating, investing, financing, income taxes, discontinued operations',
        'The two required subtotals: operating profit, and profit before financing and income taxes',
        'Operating as the residual category — operating profit is now a defined figure, not a management choice',
        'What sits in investing and financing, including interest and interest-rate effects on lease and pension liabilities',
        'Operating expenses by nature, by function, or mixed — and the required nature information in the notes where a function presentation is used',
        'Additional subtotals: permitted, but consistent with the category structure and faithfully labelled',
        'Other comprehensive income — what remains unchanged',
      ],
      practical:
        'Activity: Category sort — participants classify 30 income and expense line items from a realistic set of accounts, including deliberately borderline items, then debrief on where the group split.',
    },
    {
      heading: 'Module 3',
      title: 'Main business activity and classification judgement',
      points: [
        'Main business activities — the concept, and why it determines classification',
        'The two specified activities: investing in assets, and providing financing to customers',
        'How classification shifts: income and expenses that would otherwise sit in investing or financing move to operating',
        'Entities with more than one main business activity, and cases where the answer is genuinely arguable',
        'Ghana application: banks and rural banks, insurance companies, investment holding structures, entities with in-house customer credit',
        'Foreign exchange differences and derivatives: classified by reference to the items they relate to',
        'Documenting the judgement — what the auditor will ask for',
      ],
      practical:
        'Activity: One entity scenario with an ambiguous main business activity — participants determine the classification and articulate the reasoning they would put in the file.',
    },
    {
      heading: 'Module 4',
      title: 'Management-defined performance measures',
      points: [
        "The MPM definition — a subtotal used in public communications outside the financial statements, communicating management's view of performance — and the subtotals specifically excluded",
        'What counts as public communications: annual report narrative, investor presentations, press releases, lender reporting, social media',
        'Measures likely to become MPMs: adjusted EBITDA, underlying profit, profit before exceptional items, normalised earnings, adjusted operating profit',
        'The single-note requirement: why the measure is useful, how it is calculated, reconciliation to the most comparable IFRS subtotal, and the tax and non-controlling-interest effect of each reconciling item',
        'The governance consequence: a measure the board has used loosely in investor material now carries audited disclosure obligations',
        'The practical decision: keep the measure and disclose it properly, or stop using it',
      ],
      practical:
        'Activity: MPM identification — participants review an annual report narrative and investor deck for a sample entity and list every measure that would become an MPM. Most groups miss several; that is the lesson.',
    },
    {
      heading: 'Module 5',
      title: 'Aggregation, disaggregation and labelling',
      points: [
        'The principles: aggregate items sharing characteristics; disaggregate items that do not',
        'The distinct roles of the primary financial statements and the notes — useful structured summary versus material detail',
        'Labelling: items must be described in a way that faithfully represents their characteristics',
        'The "other" problem: where a residual line is labelled "other", its composition must be explained — most existing financial statements fail this on first review',
        'Interaction with IFRS 8 segment reporting, and what IAS 34 requires of condensed interim statements',
      ],
      practical:
        'Application is folded into the Day 2 implementation workshop, where participants review and correct the labelling and disaggregation of their own statements.',
    },
    {
      heading: 'Module 6',
      title: 'Consequential amendments',
      points: [
        'IAS 7: the indirect-method reconciliation now begins with operating profit; dividends paid presented as financing, interest paid generally classified within financing',
        'Cash generation is unaffected — but presentation, trend analysis, covenant calculations and historical trend data are',
        'IAS 8 renamed Basis of Preparation of Financial Statements, with paragraphs relocated from IAS 1',
        'IAS 33: additional EPS metrics only where the numerator is an IFRS 18 total or subtotal, or an MPM',
        'IFRS 19 Subsidiaries without Public Accountability — the reduced disclosure regime, also effective 1 January 2027, and who may use it',
      ],
      practical:
        'Activity: Cash flow restatement — participants convert an indirect-method cash flow statement to the new starting point, reclassify interest and dividends, and identify which loan covenants would be affected.',
    },
    {
      heading: 'Module 7',
      title: 'Transition planning',
      points: [
        'Retrospective application under IAS 8, with restatement of comparatives',
        'The relief: the IAS 8 quantitative disclosures are not required; the requirement: a reconciliation between restated comparative amounts and the amounts previously presented under IAS 1',
        'Early adoption, and the disclosure of expected effects that auditors and regulators will look for in FY2026 statements',
        'Building the plan: impact assessment, the main-business-activity judgement, MPM inventory and board decisions, chart-of-accounts tagging, system and reporting-pack changes, consolidation implications, and communication with lenders and the audit committee',
        'Working backwards from 31 December 2027 to a dated task list',
      ],
      practical:
        'Activity: Participants draft a transition timetable for their own entity, with owners and dates.\n\nOutcome: A transition plan they can take to their CFO on Monday.',
    },
    {
      heading: 'Module 8',
      title: 'Implementation workshop (3 hours)',
      points: [
        'Map the chart of accounts to the five IFRS 18 categories, flagging every item requiring judgement',
        'Determine main business activity and apply any consequent reclassification',
        'Build the statement of profit or loss with both required subtotals and an appropriate expense presentation',
        'Restate the cash flow statement on the new basis',
        'Prepare the MPM note, including reconciliation, tax effect and non-controlling-interest effect',
        'Review labelling and disaggregation, correcting non-compliant line items',
        'Prepare the transition reconciliation and compile the judgement memorandum documenting each significant classification decision',
      ],
      practical:
        'Capstone: working from your own trial balance (or the supplied dataset), produce a restated set of primary statements, an MPM note and a documented judgement file — then present one difficult classification judgement and defend it to the room.',
    },
  ],
  format: [
    { label: 'Delivery', value: 'Live online via Zoom' },
    { label: 'Duration', value: 'Two days, 9:00 AM – 3:00 PM with a 30-minute break' },
    { label: 'Total training', value: '12 hours' },
    { label: 'CPD', value: '12' },
    { label: 'Class size', value: 'Maximum 30 participants — required for the Day 2 workshop to function' },
    { label: 'Assessment', value: 'Scored exercises, a submitted transition plan, and the workshop output with judgement defence' },
    { label: 'Certification', value: 'Certificate of Competence' },
    { label: 'Support', value: 'Cohort WhatsApp group with the facilitator' },
    { label: 'Learner portal', value: 'Personal portal for meeting links and materials' },
  ],
  prerequisites: [
    'Working knowledge of IFRS financial statement preparation — familiarity with IAS 1 is assumed',
    'Bring a trial balance or set of financial statements from your own entity for the Day 2 workshop; a supplied dataset is available for those who genuinely cannot',
  ],
  includes: [
    'Two days of live, instructor-led training',
    'Course workbook with worked examples',
    'IFRS 18 category classification decision tree',
    'MPM identification checklist and note template',
    'Transition plan template with dated task list',
    'Cash flow restatement and judgement memorandum templates',
    'Before-and-after model financial statements (IAS 1 to IFRS 18)',
    'Access to a personal learner portal',
    'A cohort WhatsApp support group with the facilitator',
    'A Certificate of Competence recording 12 CPD hours, for participants scoring 70% or above',
  ],
  facilitator: { name: 'Mr. Stephen Kwame Aikins', credentials: 'CA' },
  faq: [
    {
      question: 'Does IFRS 18 change my profit?',
      answer:
        'No. Recognition and measurement are unchanged and net profit is identical. What changes is how performance is structured, subtotalled, disaggregated and explained — and what must be disclosed about alternative performance measures.',
    },
    {
      question: 'Why attend now rather than closer to 2027?',
      answer:
        'IFRS 18 applies retrospectively. For a 31 December year end, the comparative period in your first IFRS 18 accounts is FY2026 — which is already running. Categorisation decisions need to be made before the comparative year closes, not after.',
    },
    {
      question: 'What prior knowledge do I need?',
      answer:
        'A working knowledge of IFRS financial statement preparation. Familiarity with IAS 1 is assumed.',
    },
    {
      question: 'What must I bring?',
      answer:
        'A trial balance or set of financial statements from your own entity, for the Day 2 implementation workshop. This is a firm registration requirement — a supplied dataset is available for those who genuinely cannot bring their own.',
    },
    {
      question: 'How will the training be delivered?',
      answer:
        'Live online via Zoom across two days, 9:00 AM to 3:00 PM with a 30-minute break each day.',
    },
    {
      question: 'How is the course assessed?',
      answer:
        'Scored category-sort and MPM-identification exercises, a submitted transition plan, and the implementation workshop output with a judgement defence. Participants scoring 70% or above receive a Certificate of Competence recording 12 CPD hours.',
    },
    {
      question: 'What will I take back to my organisation?',
      answer:
        'A restated set of primary statements, an MPM note, a documented judgement file, and a dated transition plan for your own entity — built from your own numbers during the Day 2 workshop.',
    },
    {
      question: 'Will I receive learning support?',
      answer:
        'Yes. Participants receive access to a learner portal and a cohort WhatsApp group with the facilitator.',
    },
  ],
  corporateNote:
    'Companies registering five or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
};

export const COURSE_PUBLIC_CONTENT: Record<string, CoursePublicContent> = {
  // AI02 and AI05 used to be near-duplicate finance courses sharing one brief
  // (CLAUDE.md's Open Decisions). The founder resolved that on 2026-08-21 by
  // repurposing AI05 as "AI Security and Safe Use for Business Professionals",
  // so the two codes now carry genuinely different programmes.
  AI02: AI_FINANCE,
  AI05: AI_SECURITY,
  IFRS02: IFRS_18,

  ESG1: {
    briefSlug: 'esg-sustainability-reporting-training',
    tagline:
      'Move from ESG awareness to practical policy, reporting and decision-making.',
    heroImage: null,
    overview: [
      'Build the practical skills required to develop sustainability policies, prepare ESG and sustainability reports, and integrate ESG considerations into finance and investment decisions using recognised global standards and frameworks.',
      'Sustainability and ESG considerations are increasingly shaping corporate strategy, risk management, reporting, finance, and investment decisions.',
      'Across four live weekend sessions, participants progress from foundational concepts to practical policy development, reporting, and sector-based application.',
    ],
    idealFor:
      'Sustainability officers, CSR and ESG leads, finance and investment professionals, compliance and risk professionals, business owners and executives.',
    primaryAudience: [
      'Sustainability officers, CSR managers, and ESG leads responsible for policy and reporting',
      'Finance and investment professionals seeking to integrate ESG into analysis and decision-making',
      'Compliance and risk professionals overseeing sustainability disclosures',
      'Business owners and executives seeking to develop an organisational sustainability strategy',
    ],
    alsoSuitableFor: [
      'Auditors and consultants advising on ESG and sustainability reporting',
      'Professionals pursuing ESG-related certifications or career specialisation',
      'Students and early-career professionals seeking a practical introduction to ESG',
    ],
    outcomesLabel: 'What you will learn',
    outcomes: [
      'Explain core sustainability and ESG concepts',
      'Understand the Sustainable Development Goals and key industry frameworks',
      'Develop a sustainability policy from vision-setting through implementation',
      'Conduct stakeholder engagement and apply a materiality assessment',
      'Prepare a sustainability report using recognised disclosure standards',
      'Integrate ESG considerations into financial analysis and investment decisions',
      'Interpret management, environmental, social, and governance indicators',
      'Evaluate sustainability-reporting practices across different industries',
    ],
    curriculum: [
      {
        heading: 'Session 1 · Module 1',
        title: 'Basics of Sustainability',
        points: [
          'The evolution of sustainability thinking and its relevance to business',
          'Definitions, pillars, drivers, and global sustainability challenges',
          'The UN Sustainable Development Goals',
          'ESG fundamentals and the business case for ESG',
          'ESG integration within capital markets',
          'Industry standards, reporting frameworks, and management-system certifications',
          'Systems thinking, planetary boundaries, stakeholder theory, and life-cycle analysis',
          'Corporate and industry-specific case studies, and emerging sustainability trends',
        ],
      },
      {
        heading: 'Session 2 · Module 2',
        title: 'Sustainability Policy Guide Development',
        points: [
          'The strategic role of sustainability policy',
          'Creating a sustainability vision and mission',
          'Aligning sustainability goals with business objectives',
          'Identifying key areas of organisational impact',
          'Frameworks for developing specific sustainability policies',
          'Stakeholder engagement',
          'Conducting and applying a materiality assessment',
          'Developing action plans and KPIs',
          'Policy implementation and compliance',
          'Case study on effective sustainability policies',
        ],
      },
      {
        heading: 'Session 3 · Modules 3–4',
        title: 'Sustainability Reporting, and ESG in Finance and Investment',
        points: [
          'The evolution and strategic value of sustainability reporting',
          'Securing management commitment and planning the reporting process',
          'Data collection, disclosure, assurance, and continuous improvement',
          'The development of ESG investing and ESG as a driver of long-term value',
          'Trends in investor behaviour, ESG and fiduciary duty',
          'Legal and ethical responsibilities of asset managers, and global policy guidance',
          'ESG in financial analysis and decision-making, and TCFD disclosures',
          'ESG scenario design and portfolio stress testing',
        ],
      },
      {
        heading: 'Session 4 · Modules 5–6',
        title: 'Report Disclosures and Sector-Based Applications',
        points: [
          'Management-system indicators',
          'Environmental indicators',
          'Social indicators',
          'Governance indicators',
          'Industry-specific disclosures',
          'Evaluation of sustainability reports across health, agriculture, manufacturing, construction, mining and education',
        ],
      },
    ],
    format: [
      { label: 'Delivery', value: 'Live, instructor-led via Zoom' },
      { label: 'Duration', value: 'Four sessions across two weekends' },
      { label: 'Total training', value: '16 hours' },
      { label: 'Certification', value: 'Certificate of Completion' },
      {
        label: 'Learner portal',
        value: 'Personal portal for meeting links, resources, and course materials',
      },
    ],
    prerequisites: [
      'No previous ESG or sustainability experience is required.',
      'The course is taught from first principles and is suitable for newcomers as well as professionals seeking to formalise and deepen their existing knowledge.',
    ],
    includes: [
      'Four live, instructor-led sessions',
      'Six structured learning modules',
      'Practical policy and reporting guidance',
      'Sector-based sustainability-report discussions',
      'Course resources and materials',
      'Access to a personal learner portal',
      'Certificate of Completion after finishing the programme',
    ],
    facilitator: {
      name: 'Francis Agyen',
      credentials: 'CA, MCIT, CGMA, ACMA, CGEM, ACIB, MBA — Licensed ESG Manager',
    },
    faq: [
      {
        question: 'Do I need previous ESG or sustainability experience?',
        answer:
          'No. The programme starts with foundational concepts and is suitable for newcomers.',
      },
      {
        question: 'How many sessions are included?',
        answer:
          'The programme contains four live sessions delivered across two weekends, for a total of 16 hours.',
      },
      {
        question: 'How will the programme be delivered?',
        answer: 'All sessions will be delivered live and interactively through Zoom.',
      },
      {
        question: 'Will I receive course materials?',
        answer:
          'Yes. Participants receive access to a learner portal containing meeting links, session resources, and course materials.',
      },
      {
        question: 'Will I receive a certificate?',
        answer: 'Yes. A Certificate of Completion will be issued after finishing the programme.',
      },
    ],
    corporateNote:
      'Companies registering five or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
  },

  // The introductory webinar. No brief was uploaded for this one — the copy
  // below is the founder's catalogue text. Free-vs-paid is NOT asserted here;
  // it comes from batches.is_free at render time.
  ESG2: {
    briefSlug: '',
    tagline:
      'A clear introduction to ESG, sustainability reporting and the changing expectations facing organisations and professionals.',
    heroImage: null,
    overview: [
      'Get a clear introduction to ESG, sustainability reporting and the changing expectations facing organisations and professionals.',
      'This introductory webinar will help you understand why sustainability reporting matters and how to begin preparing for emerging requirements.',
    ],
    idealFor:
      'Professionals, executives, students and organisations seeking an accessible introduction to ESG and sustainability reporting.',
    primaryAudience: [
      'Professionals and executives new to ESG and sustainability reporting',
      'Organisations beginning to prepare for emerging reporting requirements',
    ],
    alsoSuitableFor: [
      'Students and early-career professionals exploring ESG as a specialisation',
      'Anyone considering the full ESG & Sustainability Reporting programme',
    ],
    outcomesLabel: 'What you will understand',
    outcomes: [
      'What ESG and sustainability reporting mean.',
      'Why sustainability information matters to organisations.',
      'The role of accountants, auditors and business leaders.',
      'Key reporting frameworks and emerging requirements.',
      'Practical steps organisations can take to prepare.',
    ],
    curriculum: [],
    format: [
      { label: 'Delivery', value: 'Live, instructor-led via Zoom' },
      { label: 'Duration', value: 'Single introductory session' },
    ],
    prerequisites: ['No previous ESG or sustainability experience is required.'],
    includes: [
      'A live, instructor-led introductory session',
      'Access to a personal learner portal',
    ],
    facilitator: { name: '', credentials: null },
    faq: [],
    corporateNote: null,
  },

  // NOTE: the ERM brief has no course_code in its frontmatter and the founder
  // has not confirmed one. ERM1 is a placeholder — if the real code differs,
  // this key needs updating or the programme renders without its copy.
  ERM1: {
    briefSlug: 'enterprise-risk-management-risk-based-auditing',
    tagline: 'Turn organisational risks into focused, practical audit priorities.',
    heroImage: null,
    overview: [
      'Every organisation faces strategic, operational, financial and compliance risks capable of quietly derailing its objectives. Internal audit is at its most valuable when it is pointed squarely at those risks — and at its least valuable when it works through a plan inherited from last year.',
      'This one-day intensive teaches you to make that connection deliberately. You will learn to identify and categorise the risks that genuinely threaten organisational objectives, apply both qualitative and quantitative assessment techniques, and weigh likelihood against impact well enough to prioritise what management should address first.',
      'From there the programme moves to the practical artefacts: building and maintaining a risk register people actually use, assigning genuine risk ownership, documenting mitigating controls, and tracking residual risk continuously rather than at year-end. The later sessions turn that register into an audit plan — prioritising focus areas by real risk exposure and aligning the plan with what the register says.',
      'The day closes with a group case exercise in which participants assess a set of organisational risks, build a sample risk register and draft a risk-based internal audit plan, so you leave having done the work rather than only having heard it described.',
      'Taught from first principles, the programme suits newcomers and experienced professionals alike — including those looking to formalise an approach they have been running on instinct. No prior risk-management or audit certification is required.',
    ],
    idealFor:
      'Internal and external auditors, risk officers, finance managers and controllers, and compliance professionals.',
    primaryAudience: [
      'Internal and external auditors seeking to strengthen their risk-based audit planning skills',
      'Risk officers and risk management professionals',
      'Finance managers and controllers with responsibility for organisational risk',
      'Compliance officers responsible for enterprise risk frameworks',
    ],
    alsoSuitableFor: [
      'ICAG, ACCA, and CIA students seeking practical audit and risk-management skills',
      'Business owners and executives seeking stronger organisational risk oversight',
      'Consultants advising on internal controls, governance, or risk management',
    ],
    outcomesLabel: 'What you will learn',
    outcomes: [
      'Explain core enterprise risk management concepts',
      'Identify and categorise the risks that may affect organisational objectives',
      'Apply practical risk-assessment techniques',
      'Develop and maintain an effective risk register',
      'Assign risk ownership and document mitigating controls',
      'Assess and track residual risk',
      'Prioritise internal audit areas based on risk exposure',
      'Align a risk-based internal audit plan with the organisation’s risk register',
    ],
    curriculum: [
      {
        heading: 'Session 1',
        title: 'Risk Concepts and Types of Risk',
        points: [
          'Core risk-management terminology and concepts',
          'Strategic, operational, financial, and compliance risks',
          'How different risks affect organisational objectives',
        ],
      },
      {
        heading: 'Session 2',
        title: 'Risk Assessment Techniques',
        points: [
          'Identifying, analysing, and evaluating risks',
          'Qualitative and quantitative assessment methods',
          'Likelihood and impact analysis',
          'Prioritising risks for management attention',
        ],
      },
      {
        heading: 'Session 3',
        title: 'Developing a Risk Register',
        points: [
          'Building and maintaining a risk register',
          'Documenting identified risks',
          'Assigning risk ownership',
          'Recording mitigating controls',
          'Monitoring residual risk over time',
        ],
      },
      {
        heading: 'Session 4',
        title: 'Risk-Based Internal Audit Planning',
        points: [
          'Applying a risk-based approach to internal audit planning',
          'Prioritising audit focus areas according to risk exposure',
          'Aligning the audit plan with the organisation’s risk register',
        ],
      },
      {
        heading: 'Session 5',
        title: 'Practical Group Exercise',
        points: [
          'Assess organisational risks',
          'Develop a sample risk register',
          'Draft a risk-based internal audit plan',
        ],
        practical:
          'Participants work through a practical case study covering all three deliverables above.',
      },
    ],
    format: [
      { label: 'Delivery', value: 'Live, instructor-led session via Zoom' },
      { label: 'Duration', value: 'One-day intensive training' },
      { label: 'Certification', value: 'Verifiable Certificate of Completion' },
      {
        label: 'Learner portal',
        value: 'Personal portal for the meeting link, resources, and course materials',
      },
    ],
    prerequisites: [
      'No prior risk-management or audit certification is required.',
      'A general understanding of business operations will be helpful. The course is taught from first principles and is suitable for newcomers as well as experienced professionals seeking to formalise their approach.',
    ],
    includes: [
      'A live, instructor-led one-day intensive session',
      'Guided teaching across five structured sessions',
      'A practical group case exercise',
      'Course resources and materials',
      'Access to a personal learner portal',
      'A verifiable Certificate of Completion',
    ],
    facilitator: { name: 'Mr. Isaac Adjin Bonney', credentials: 'CA, CPFA, CFIP' },
    faq: [
      {
        question: 'Is prior risk-management experience required?',
        answer:
          'No. The programme begins with foundational concepts and is suitable for both newcomers and experienced professionals.',
      },
      {
        question: 'How will the programme be delivered?',
        answer: 'The training will be delivered live and interactively through Zoom.',
      },
      {
        question: 'Will I receive course materials?',
        answer:
          'Yes. Each participant will receive access to a personal learner portal containing the meeting link, session resources, and course materials.',
      },
      {
        question: 'Will I receive a certificate?',
        answer:
          'Yes. Participants who complete the programme will receive a verifiable Certificate of Completion.',
      },
    ],
    corporateNote:
      'Companies registering four or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
  },

  // TAX1 is confirmed, not a placeholder: verified against courses.course_code
  // in production 2026-08-16 (course_name 'Preparing For Tax Audit').
  TAX1: {
    briefSlug: 'preparing-for-tax-audit',
    tagline:
      'Walk into a tax audit already prepared, with records, reconciliations and responses in order.',
    heroImage: null,
    overview: [
      'A tax audit rarely goes badly because of a single wrong number. It goes badly because the records cannot be produced, the returns do not reconcile to the ledger, and nobody has decided who answers the auditor. All of that is fixable — but only before the notification arrives.',
      'This practical programme equips finance professionals, accountants, tax practitioners, internal auditors, business owners and management teams with the knowledge and skills required to prepare effectively for a tax audit. It focuses on identifying potential tax exposures before an audit begins, maintaining appropriate documentation, responding professionally to tax authority enquiries, managing audit findings, and strengthening internal tax compliance processes.',
      'The course combines tax compliance principles with practical audit-readiness techniques — document reviews, risk assessments, reconciliations and case-based exercises — across twelve modules, each closing with a practical exercise rather than a summary.',
      'The programme ends with a full simulation: a fictional organisation, a real audit notification, and every stage worked end to end, from the health check through to the post-audit improvement plan.',
    ],
    idealFor:
      'Finance professionals, accountants, tax practitioners, internal auditors, business owners and management teams.',
    primaryAudience: [
      'Finance professionals and accountants responsible for tax compliance',
      'Tax practitioners advising organisations on tax matters',
      'Internal auditors reviewing tax processes and exposures',
    ],
    alsoSuitableFor: [
      'Business owners responsible for their organisation’s tax position',
      'Management teams accountable for tax governance and audit outcomes',
    ],
    outcomesLabel: 'What you will be able to do',
    outcomes: [
      'Understand the purpose, scope, and stages of a tax audit',
      'Identify major areas of tax risk within an organisation',
      'Conduct an internal tax health check before a tax audit',
      'Prepare and organise records and supporting documentation required for a tax audit',
      'Reconcile tax returns with accounting records and financial statements',
      'Identify inconsistencies that may attract the attention of tax authorities',
      'Respond appropriately to tax audit queries and information requests',
      'Manage tax audit meetings, correspondence, findings, and assessments',
      'Develop practical controls for improving ongoing tax compliance',
      'Prepare an organisation for future tax audits and regulatory reviews',
    ],
    curriculum: [
      {
        heading: 'Module 1',
        title: 'Understanding the Tax Audit Process',
        points: [
          'Meaning and objectives of a tax audit',
          'Tax audit versus tax investigation',
          'Reasons organisations may be selected for audit',
          'Types of tax audits and reviews',
          'Scope and coverage of a tax audit',
          'Rights and responsibilities of taxpayers',
          'Responsibilities of management during a tax audit',
          'Typical stages of the tax audit process',
          'Understanding tax audit notifications and information requests',
        ],
        practical:
          'Reviewing a sample tax audit notification and developing an initial response plan.',
      },
      {
        heading: 'Module 2',
        title: 'Tax Audit Risk Assessment',
        points: [
          'Understanding tax risk',
          'Identifying high-risk transactions',
          'Common causes of tax exposures',
          'Assessing tax compliance across different tax categories',
          'Reviewing previous tax audit findings',
          'Identifying unusual movements and inconsistencies in tax accounts',
          'Tax risk ranking and prioritisation',
          'Developing a tax risk register',
        ],
        practical:
          'Preparing a tax risk register and classifying identified risks according to likelihood and potential financial impact.',
      },
      {
        heading: 'Module 3',
        title: 'Conducting a Pre-Audit Tax Health Check',
        points: [
          'Purpose of a tax health check',
          'Reviewing tax returns before an audit',
          'Comparing tax returns with financial statements',
          'Reviewing general ledger accounts',
          'Identifying unreported or incorrectly reported transactions',
          'Reviewing tax computations',
          'Identifying outstanding tax obligations',
          'Reviewing prior-year tax adjustments',
          'Assessing penalties and interest exposure',
        ],
        practical:
          'Conducting a simulated tax health check using accounting and tax records.',
      },
      {
        heading: 'Module 4',
        title: 'Preparing Tax Documentation and Records',
        points: [
          'Importance of proper tax documentation',
          'Developing a tax audit document checklist',
          'Organising accounting and tax records',
          'Supporting documentation for income and expenses',
          'Maintaining invoices, receipts, contracts, schedules, and reconciliations',
          'Payroll and employee tax documentation',
          'Asset and capital expenditure documentation',
          'Related-party transaction documentation',
          'Electronic records and document management',
          'Creating a tax audit working file',
        ],
        practical:
          'Preparing a structured tax audit documentation file from a sample company dataset.',
      },
      {
        heading: 'Module 5',
        title: 'Tax Reconciliations',
        points: [
          'Reconciling revenue reported for tax purposes with accounting revenue',
          'Reconciling tax returns with general ledger balances',
          'Payroll reconciliation',
          'Withholding tax reconciliation',
          'VAT or consumption tax reconciliation',
          'Corporate income tax reconciliation',
          'Reconciling tax payments with tax liabilities',
          'Identifying unexplained differences',
          'Documenting and resolving reconciliation items',
        ],
        practical:
          'Participants prepare selected tax reconciliations and investigate identified discrepancies.',
      },
      {
        heading: 'Module 6',
        title: 'Key Areas Commonly Reviewed During Tax Audits',
        points: [
          'Revenue recognition and completeness',
          'Business expenses and deductibility',
          'Payroll and employee-related taxes',
          'Withholding taxes',
          'Indirect taxes',
          'Capital allowances and fixed assets',
          'Related-party transactions',
          'Loans and financing arrangements',
          'Director and shareholder transactions',
          'Foreign transactions',
          'Tax incentives and exemptions',
          'Tax losses and carry-forward positions',
          'Unusual, exceptional, and non-recurring transactions',
        ],
        practical:
          'Identifying potential tax audit issues from a company’s trial balance and financial statements.',
      },
      {
        heading: 'Module 7',
        title: 'Managing the Tax Audit',
        points: [
          'Establishing an internal tax audit response team',
          'Appointing a tax audit coordinator',
          'Managing communication with tax authorities',
          'Responding to information requests',
          'Preparing for tax audit meetings',
          'Managing interviews and explanations',
          'Maintaining an audit query tracker',
          'Reviewing documents before submission',
          'Controlling information provided during the audit',
          'Maintaining professional communication and documentation',
          'Escalating complex tax issues to specialists',
        ],
        practical:
          'Simulation of a tax audit meeting between company representatives and tax auditors.',
      },
      {
        heading: 'Module 8',
        title: 'Responding to Tax Audit Queries',
        points: [
          'Understanding the tax authority’s query',
          'Gathering supporting evidence',
          'Preparing clear and professional responses',
          'Explaining accounting and tax treatments',
          'Managing disputed transactions',
          'Avoiding inconsistent responses',
          'Maintaining records of correspondence',
          'Responding within required timelines',
          'Managing follow-up queries',
        ],
        practical: 'Drafting responses to sample tax audit queries.',
      },
      {
        heading: 'Module 9',
        title: 'Managing Tax Audit Findings and Assessments',
        points: [
          'Understanding preliminary audit findings',
          'Reviewing proposed adjustments',
          'Quantifying potential tax exposure',
          'Challenging incorrect assumptions',
          'Preparing supporting arguments and evidence',
          'Resolving factual disagreements',
          'Managing additional assessments',
          'Understanding penalties and interest',
          'Managing negotiations and settlement discussions',
          'Internal reporting of tax audit findings',
        ],
        practical:
          'Reviewing a simulated tax audit findings report and preparing management’s response.',
      },
      {
        heading: 'Module 10',
        title: 'Objections, Disputes and Post-Audit Actions',
        points: [
          'Understanding tax dispute procedures',
          'Reviewing tax assessments',
          'Preparing objections',
          'Supporting objections with documentation',
          'Managing discussions with tax authorities',
          'Escalating unresolved tax disputes',
          'Implementing agreed audit adjustments',
          'Correcting tax records and returns',
          'Monitoring agreed payment arrangements',
          'Closing the tax audit internally',
        ],
        practical: 'Preparing a structured response to a disputed tax assessment.',
      },
      {
        heading: 'Module 11',
        title: 'Strengthening Tax Governance After the Audit',
        points: [
          'Learning from tax audit findings',
          'Performing root-cause analysis',
          'Strengthening tax controls',
          'Improving tax documentation',
          'Establishing tax compliance calendars',
          'Assigning tax responsibilities',
          'Periodic internal tax reviews',
          'Tax risk reporting to management',
          'Developing tax policies and procedures',
          'Building continuous tax audit readiness',
        ],
        practical: 'Developing a post-audit tax improvement action plan.',
      },
      {
        heading: 'Module 12',
        title: 'Practical Tax Audit Simulation',
        points: [
          'Reviewing the tax audit notification',
          'Conducting a tax health check',
          'Identifying tax risks',
          'Reviewing financial statements and tax returns',
          'Performing key reconciliations',
          'Preparing supporting documentation',
          'Responding to tax audit queries',
          'Reviewing proposed audit adjustments',
          'Preparing management responses',
          'Developing a post-audit improvement plan',
        ],
        practical:
          'A comprehensive case study involving a fictional organisation preparing for a tax audit, covering every stage above end to end.',
      },
    ],
    format: [
      { label: 'Delivery', value: 'Live, instructor-led via Zoom' },
      { label: 'Structure', value: 'Twelve modules, each with a practical exercise' },
      { label: 'Certification', value: 'Verifiable Certificate of Completion' },
      {
        label: 'Learner portal',
        value: 'Personal portal for the meeting link, resources, and course materials',
      },
    ],
    prerequisites: [
      'Participants should be working in a finance, accounting, tax or audit role — for example as an accountant, CFO, finance manager, internal or external auditor, or tax practitioner.',
    ],
    // Only what the platform actually delivers on every live course. The brief's
    // ten templates are deliberately NOT here: it words them as "participants
    // *may* receive" under "*Recommended* Course Deliverables", and this list
    // renders under the heading "What your registration includes", which reads as
    // a promise. Move them across once the founder confirms they ship.
    includes: [
      'Live, instructor-led sessions across twelve structured modules',
      'A practical exercise in every module',
      'A full end-to-end tax audit simulation',
      'Course resources and materials',
      'Access to a personal learner portal',
      'A verifiable Certificate of Completion',
    ],
    // Same facilitator as ESG1. The credential string is deliberately spelled
    // identically to the ESG1 entry — the founder's note and batches
    // .facilitator_name for SEP-2026 both read "CMIT" and "GCMA", which appear
    // to be transpositions: CGMA is the designation that pairs with ACMA, and
    // the Chartered Institute of Taxation grades are MCIT/FCIT. Awaiting
    // confirmation; if the other spelling is right, ESG1 and the batch row
    // need changing too, not just this entry.
    facilitator: { name: 'Mr. Francis Agyen', credentials: 'CA, MCIT, CGMA, ACMA, CGEM, ACIB, MBA' },
    // Empty on purpose: the page falls back to the shared CATALOG_FAQ, which is
    // the documented intent. Add entries here only for questions specific to
    // this programme.
    faq: [],
    // 15% confirmed by the founder. The THRESHOLD was not given and is genuinely
    // per-course (ERM1 four or more, AI/ESG1 five or more) — "five or more" is
    // taken from ESG1, the closest analogue: same facilitator, same GHS 800 fee.
    // Change here if it should be four.
    corporateNote:
      'Companies registering five or more participants receive a 15% discount, plus a Corporate Portal to track attendance, download certificates, and manage employees from one account.',
  },
};

export function contentForCourseCode(courseCode: string): CoursePublicContent | null {
  return COURSE_PUBLIC_CONTENT[courseCode] ?? null;
}

// Shared page furniture (founder-supplied copy). Kept beside the per-course
// content so all public wording lives in one reviewable place.
export const WHY_KNOWSIA = [
  {
    title: 'Practical, Career-Relevant Training',
    body: 'Our programmes focus on skills you can apply in your workplace, business or professional practice.',
  },
  {
    title: 'Experienced Facilitators',
    body: 'Learn from professionals with practical industry knowledge and subject-matter expertise.',
  },
  {
    title: 'Live and Interactive Learning',
    body: 'Ask questions, participate in discussions and learn through practical demonstrations and exercises.',
  },
  {
    title: 'Professional Certificate',
    body: 'Receive a certificate after successfully completing the programme requirements.',
  },
  {
    title: 'Public Certificate Verification',
    body: 'Knowsia certificates can be verified online, helping employers and professional contacts confirm their authenticity.',
  },
  {
    title: 'Continued Learning Support',
    body: 'Participants may receive access to relevant learning resources, discussions and post-training support.',
  },
] as const;

export const HOW_REGISTRATION_WORKS = [
  {
    title: 'Select Your Programme',
    body: 'Choose the training programme that best supports your professional goals.',
  },
  {
    title: 'Complete Your Registration',
    body: 'Provide your details and select your preferred upcoming cohort.',
  },
  {
    title: 'Make Payment',
    body: 'Complete payment using the available payment method. Free programmes do not require payment.',
  },
  {
    title: 'Receive Confirmation',
    body: 'You will receive your registration confirmation and programme participation details.',
  },
] as const;

export const CATALOG_FAQ = [
  {
    question: 'Are the programmes delivered online or in person?',
    answer:
      'The delivery format is displayed on each programme page. Some programmes are delivered live online, while others may be delivered physically or through a hybrid format.',
  },
  {
    question: 'Will I receive a certificate?',
    answer:
      'Yes. Participants who satisfy the relevant programme requirements will receive a professional certificate.',
  },
  {
    question: 'Can the certificate be verified?',
    answer:
      'Yes. Certificates issued by Knowsia can be verified through the public certificate-verification platform.',
  },
  {
    question: 'Can organisations register multiple employees?',
    answer: 'Yes. Organisations may register teams or request customised corporate training.',
  },
  {
    question: 'Can I register for more than one programme?',
    answer: 'Yes. You may register for any number of programmes, subject to schedule availability.',
  },
  {
    question: 'How do I know whether my registration is confirmed?',
    answer:
      'You will receive confirmation after completing the required registration and payment steps.',
  },
  {
    question: 'What happens when a programme is full?',
    answer:
      'When all available places have been taken, you may be added to the waiting list or invited to select another cohort.',
  },
] as const;

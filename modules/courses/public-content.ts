// Public marketing copy for the programme catalogue, keyed by
// courses.course_code.
//
// SOURCE OF TRUTH: the founder's course briefs in `Coding Docs/`:
//   AI02/AI05 → ai-powered-financial-reporting-analysis-modelling-automation.md
//   ESG1      → esg-sustainability-reporting-training.md
//   ERM1      → enterprise-risk-management-risk-based-auditing.md
// Those documents and this file must not drift. When a brief is edited, edit
// the matching entry here in the same change.
//
// WHY THIS IS A CODE FILE, NOT DATABASE COLUMNS
// ---------------------------------------------
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

export const COURSE_PUBLIC_CONTENT: Record<string, CoursePublicContent> = {
  // Both codes map to the same brief on purpose. CLAUDE.md's Open Decisions
  // records AI05 ("...Reporting and Modeling") and AI02 ("...Reporting and
  // Analysis") as near-duplicate courses awaiting a canonical pick, and the
  // brief's own frontmatter says AI02 while the live catalogue has been using
  // AI05. Registering both means the page renders correctly whichever one the
  // database actually holds. Delete the loser once the founder decides.
  AI02: AI_FINANCE,
  AI05: AI_FINANCE,

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

import { z } from 'zod';

import { sendSmsMessage } from '@/lib/arkesel/client';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { generateReceiptPdf } from '@/lib/portal/receipt-pdf';
import * as attendanceService from '@/modules/attendance/service';
import * as campaignsService from '@/modules/campaigns/service';
import * as certificatesService from '@/modules/certificates/service';
import * as communicationsService from '@/modules/communications/service';
import { messageLogFiltersSchema, templateUpsertSchema } from '@/modules/communications/types';
import * as coursesService from '@/modules/courses/service';
import { batchInputSchema, batchUpdateSchema, courseInputSchema } from '@/modules/courses/types';
import * as dashboardService from '@/modules/dashboard/service';
import * as feedbackService from '@/modules/feedback/service';
import * as leadsService from '@/modules/leads/service';
import { LEAD_STATUSES } from '@/modules/leads/types';
import * as liveSessionsService from '@/modules/live-sessions/service';
import * as opportunitiesService from '@/modules/opportunities/service';
import { createOpportunityInputSchema } from '@/modules/opportunities/types';
import * as paymentsService from '@/modules/payments/service';
import { paymentDiscountSchema } from '@/modules/payments/types';
import * as portalService from '@/modules/portal/service';
import * as registrationsService from '@/modules/registrations/service';
import { transferRegistrationSchema } from '@/modules/registrations/types';
import { tool } from '@/modules/agent-tools/types';
import type { AgentTool } from '@/modules/agent-tools/types';
import * as usersService from '@/modules/users/service';
import * as voiceService from '@/modules/voice/service';
import * as waitlistService from '@/modules/waitlist/service';
import type { StaffRole } from '@/lib/domain/types';

const STAFF_ALL: StaffRole[] = ['admin', 'finance', 'marketing', 'management'];

export const AGENT_TOOLS: AgentTool[] = [
  // --- Existing Admin Assistant tools (read / write-direct), behavior unchanged ---
  tool({
    name: 'list_courses',
    description:
      'List all courses with their IDs, codes, and names. Call this before creating a batch when the courseId is unknown.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: STAFF_ALL },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => coursesService.getCourses(),
  }),
  tool({
    name: 'create_course',
    description: 'Create a new course. courseCode is a short unique code (e.g. AI05).',
    inputSchema: z.object({ courseCode: z.string().min(2), courseName: z.string().min(2) }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async (input) => coursesService.createCourse(courseInputSchema.parse(input)),
  }),
  tool({
    name: 'list_batches',
    description: 'List batches (cohorts), optionally filtered by courseId. Returns fees, dates, toggles, and IDs.',
    inputSchema: z.object({ courseId: z.string().optional() }),
    trust: { kind: 'staff', roles: STAFF_ALL },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => coursesService.getBatches(input.courseId),
  }),
  tool({
    name: 'create_batch',
    description:
      'Create a course batch (cohort). Requires an existing courseId. Fee in GHS. Dates YYYY-MM-DD, startTime HH:MM. Optional: zoomLink, zoomMeetingId (numeric ID enabling Zoom attendance), whatsappGroupLink, early-registration discount (discountCutoffDate + discountedFee, set together).',
    inputSchema: z.object({
      courseId: z.string(),
      cohortLabel: z.string(),
      courseFee: z.number().min(0),
      startDate: z.string(),
      startTime: z.string(),
      endDate: z.string(),
      facilitatorName: z.string(),
      zoomLink: z.string().optional(),
      zoomMeetingId: z.string().optional(),
      whatsappGroupLink: z.string().optional(),
      discountCutoffDate: z.string().optional(),
      discountedFee: z.number().optional(),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async (input) => coursesService.createBatch(batchInputSchema.parse(input)),
  }),
  tool({
    name: 'update_batch',
    description:
      'Update fields on an existing batch: cohortLabel, courseFee, dates, links, zoomMeetingId, facilitatorName, automation toggles (welcomeEmailEnabled, paymentReminderEnabled, classReminderEnabled, whatsappEnabled, smsEnabled), isActive, discount fields, capacity. Only include fields being changed.',
    inputSchema: z.object({ batchId: z.string(), changes: z.record(z.string(), z.unknown()) }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async (input) =>
      coursesService.updateBatch(input.batchId, batchUpdateSchema.parse(input.changes)),
  }),
  tool({
    name: 'list_staff_users',
    description: 'List all staff user accounts with their roles and active status.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => usersService.getStaffUsers(),
  }),
  tool({
    name: 'create_staff_user',
    description:
      'Create a staff account. Role is one of: admin, finance, marketing, management. The new user signs in with Google using this email.',
    inputSchema: z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      role: z.enum(['admin', 'finance', 'marketing', 'management']),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async (input) => usersService.createStaffUser(input),
  }),
  tool({
    name: 'update_staff_user',
    description: 'Update a staff account: fullName, role, or isActive (false deactivates the account).',
    inputSchema: z.object({
      staffUserId: z.string(),
      fullName: z.string().optional(),
      role: z.enum(['admin', 'finance', 'marketing', 'management']).optional(),
      isActive: z.boolean().optional(),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async ({ staffUserId, ...changes }) => usersService.updateStaffUser(staffUserId, changes),
  }),
  tool({
    name: 'get_dashboard_summary',
    description: 'Read the management dashboard: per-batch registration/payment counts, revenue, conversion, lead sources.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => dashboardService.getDashboardSummary(),
  }),
  tool({
    name: 'list_email_templates',
    description: 'List the email templates configured for a course.',
    inputSchema: z.object({ courseId: z.string() }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => communicationsService.getTemplatesForCourse(input.courseId),
  }),
  tool({
    name: 'save_email_template',
    description:
      'Create or update one email template for a course. emailType is one of: welcome, payment_instruction, reminder_1, reminder_2, reminder_3, reminder_4, payment_confirmation, class_reminder_24h, class_reminder_2h, zoom_link, whatsapp_invite, post_training_thankyou, upsell, installment_reminder. Body is HTML with {{placeholders}}.',
    inputSchema: z.object({
      courseId: z.string(),
      emailType: z.string(),
      subject: z.string().min(1),
      body: z.string().min(1),
      isActive: z.boolean().default(true),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-direct',
    surfaces: ['assistant'],
    run: async (input) => communicationsService.saveTemplate(templateUpsertSchema.parse(input)),
  }),
  tool({
    name: 'list_leads_due_for_follow_up',
    description:
      'List leads whose next follow-up reminder is due now or overdue, with id, name, status, score, and lead source. Use this to find candidates before drafting follow-up suggestions when the admin has not named a specific lead.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => {
      const leads = await leadsService.listLeadsDueForFollowUp();
      return leads.map((lead) => ({
        id: lead.id,
        fullName: lead.fullName,
        status: lead.status,
        score: lead.score,
        leadSource: lead.leadSource,
        nextFollowUpAt: lead.nextFollowUpAt,
      }));
    },
  }),
  tool({
    name: 'get_lead_follow_up_context',
    description:
      "Get one lead's full details (status, score, job title, company, notes) plus its activity timeline. Use this before drafting a follow-up suggestion for that lead.",
    inputSchema: z.object({ leadId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => leadsService.getLeadWithActivities(input.leadId),
  }),
  tool({
    name: 'propose_create_lead',
    description:
      "Propose creating a new lead from a described inquiry/conversation (name, email, phone, lead source, and optionally job title/company). Only prepares a confirmation card — never creates the lead itself. If a lead with this email already exists, it will be merged into instead of duplicated.",
    inputSchema: z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(10),
      leadSource: z.enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other']),
      jobTitle: z.string().optional(),
      company: z.string().optional(),
    }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => ({
      fullName: input.fullName,
      email: input.email,
      leadSource: input.leadSource,
      jobTitle: input.jobTitle ?? null,
      company: input.company ?? null,
    }),
    run: async (input) =>
      leadsService.createLead({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        leadSource: input.leadSource,
        jobTitle: input.jobTitle,
        company: input.company,
        status: 'New',
      }),
  }),

  // --- Existing write-confirm tools (unchanged behavior, folded in from modules/staff-actions) ---
  tool({
    name: 'discount',
    description:
      'Propose granting a discount (or full waiver) on a registration’s course fee. Only prepares a confirmation card — never applies the discount itself. discountAmount is in GHS; reason is mandatory (3-500 chars).',
    inputSchema: z.object({
      registrationId: z.string(),
      discountAmount: z.number().positive(),
      reason: z.string().min(3).max(500),
    }),
    trust: { kind: 'staff', roles: ['admin', 'finance'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const registration = await registrationsService.getRegistration360(input.registrationId);
      return {
        participantName: registration.participant?.fullName ?? 'Unknown',
        courseName: registration.course?.courseName ?? 'Unknown',
        cohortLabel: registration.course?.cohortLabel ?? 'Unknown',
        currentCourseFee: registration.payment?.courseFee ?? null,
        currentBalance: registration.payment?.balance ?? null,
      };
    },
    run: async (input) =>
      paymentsService.applyDiscount(input.registrationId, paymentDiscountSchema.parse(input)),
  }),
  tool({
    name: 'installment_plan',
    description:
      'Propose setting up a 50/50 two-installment payment plan for a registration that is still Unpaid. Only prepares a confirmation card — never sets up the plan itself.',
    inputSchema: z.object({ registrationId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'finance'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const registration = await registrationsService.getRegistration360(input.registrationId);
      return {
        participantName: registration.participant?.fullName ?? 'Unknown',
        courseName: registration.course?.courseName ?? 'Unknown',
        cohortLabel: registration.course?.cohortLabel ?? 'Unknown',
        courseFee: registration.payment?.courseFee ?? null,
        paymentStatus: registration.payment?.paymentStatus ?? null,
        batchStartDate: registration.course?.startDate ?? null,
      };
    },
    run: async (input) => {
      const registration = await registrationsService.getRegistration360(input.registrationId);
      if (!registration.course || !registration.payment) {
        throw new Error('Registration, course, or payment data not found.');
      }
      await paymentsService.setUpInstallmentPlanForRegistration(input.registrationId, {
        courseFee: registration.payment.courseFee,
        batchStartDate: registration.course.startDate,
      });
      return { registrationId: input.registrationId, status: 'installment_plan_created' };
    },
  }),
  tool({
    name: 'transfer',
    description:
      'Propose transferring a registration to a different batch of the same course (fee stays locked in as originally registered). Only prepares a confirmation card — never transfers the registration itself. reason is mandatory (3-500 chars).',
    inputSchema: z.object({
      registrationId: z.string(),
      newBatchId: z.string(),
      reason: z.string().min(3).max(500),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const [registration, destinationBatch] = await Promise.all([
        registrationsService.getRegistration360(input.registrationId),
        coursesService.getBatchByIdSystem(input.newBatchId),
      ]);
      return {
        participantName: registration.participant?.fullName ?? 'Unknown',
        fromCohortLabel: registration.course?.cohortLabel ?? 'Unknown',
        toCohortLabel: destinationBatch?.cohortLabel ?? 'Unknown',
        toStartDate: destinationBatch?.startDate ?? null,
      };
    },
    run: async (input) =>
      registrationsService.transferRegistration(
        input.registrationId,
        transferRegistrationSchema.parse({ newBatchId: input.newBatchId, reason: input.reason }),
      ),
  }),

  // --- New write-confirm tools (2026-07-26) ---
  tool({
    name: 'propose_cancel_or_reschedule_live_session',
    description:
      'Propose cancelling or rescheduling a scheduled live class session. Only prepares a confirmation card — never changes the session itself. statusReason is mandatory (3-500 chars).',
    inputSchema: z.object({
      liveSessionId: z.string(),
      status: z.enum(['cancelled', 'rescheduled']),
      statusReason: z.string().min(3).max(500),
    }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const sessions = await liveSessionsService.getLiveSessions();
      const session = sessions.find((candidate) => candidate.id === input.liveSessionId);
      return {
        title: session?.title ?? 'Unknown',
        currentStatus: session?.status ?? 'Unknown',
        startsAt: session?.startsAt ?? null,
        newStatus: input.status,
      };
    },
    run: async (input, ctx) =>
      liveSessionsService.updateLiveSession(
        input.liveSessionId,
        { status: input.status, statusReason: input.statusReason },
        ctx.staffUser!.id,
      ),
  }),
  tool({
    name: 'propose_revoke_certificate',
    description:
      'Propose revoking a certificate (it will show as revoked on its public verification page). Only prepares a confirmation card — never revokes it itself. reason is mandatory (3-500 chars).',
    inputSchema: z.object({ certificateId: z.string(), reason: z.string().min(3).max(500) }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const certificates = await certificatesService.listCertificates();
      const certificate = certificates.find((candidate) => candidate.id === input.certificateId);
      return {
        certificateNumber: certificate?.certificateNumber ?? 'Unknown',
        recipientName: certificate?.recipientName ?? 'Unknown',
        courseTitle: certificate?.courseTitle ?? 'Unknown',
      };
    },
    run: async (input) => {
      await certificatesService.revokeCertificate(input.certificateId, input.reason);
      return { certificateId: input.certificateId, status: 'revoked' };
    },
  }),
  tool({
    name: 'propose_queue_and_send_campaign',
    description:
      'Propose queueing (if still a draft) and then sending a campaign to its matched leads. Only prepares a confirmation card — never queues or sends anything itself. The campaign must already exist with its audience filters and message set.',
    inputSchema: z.object({ campaignId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'marketing'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const [campaign, preview] = await Promise.all([
        campaignsService.getCampaignById(input.campaignId),
        campaignsService.previewCampaign(input.campaignId),
      ]);
      return {
        name: campaign.name,
        channel: campaign.channel,
        status: campaign.status,
        matchedLeadCount: preview.matchedLeadCount,
      };
    },
    run: async (input) => {
      const campaign = await campaignsService.getCampaignById(input.campaignId);
      if (campaign.status === 'draft') {
        await campaignsService.queueCampaign(input.campaignId);
      }
      const members = await campaignsService.getCampaignMembers(input.campaignId);
      // The admin's confirm click IS the human gate here — we satisfy
      // sendCampaign's own freshly-computed-count check with a value we just
      // read ourselves, the same self-consistency guard the manual "type
      // SEND <n>" flow relies on, rather than asking for a second retyped
      // confirmation on top of the one this tool already required.
      return campaignsService.sendCampaign(input.campaignId, {
        confirmedRecipientCount: members.length,
        confirmationText: `SEND ${members.length}`,
      });
    },
  }),
  tool({
    name: 'propose_update_lead',
    description:
      "Propose updating a lead's status/stage, assignment, score, notes, or next follow-up date. Only prepares a confirmation card — never writes to the lead itself.",
    inputSchema: z.object({
      leadId: z.string(),
      status: z.enum(LEAD_STATUSES).optional(),
      notes: z.string().nullable().optional(),
      assignedTo: z.string().nullable().optional(),
      score: z.number().optional(),
      nextFollowUpAt: z.string().nullable().optional(),
    }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const lead = await leadsService.getLeadById(input.leadId);
      return {
        fullName: lead?.fullName ?? 'Unknown',
        currentStatus: lead?.status ?? 'Unknown',
        proposedChanges: Object.fromEntries(
          Object.entries(input).filter(([key]) => key !== 'leadId'),
        ),
      };
    },
    run: async ({ leadId, ...changes }, ctx) =>
      leadsService.updateLead(leadId, changes, ctx.staffUser?.id ?? null),
  }),
  tool({
    name: 'propose_create_opportunity',
    description:
      'Propose creating a sales pipeline opportunity (course, estimated value, stage) from a lead or registration. Only prepares a confirmation card — never creates it itself.',
    inputSchema: createOpportunityInputSchema,
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => ({
      courseName: input.courseName,
      batchLabel: input.batchLabel,
      amount: input.amount,
      stage: input.stage,
    }),
    run: async (input) => opportunitiesService.createOpportunity(input),
  }),

  // --- New write-confirm tools (2026-07-27) — student-support tooling ---
  tool({
    name: 'propose_send_sms_to_lead',
    description:
      'Propose sending a one-off free-text SMS to a lead. Only prepares a confirmation card — never sends it itself. Not a campaign; use propose_create_campaign for bulk sends to a filtered audience.',
    inputSchema: z.object({ leadId: z.string(), message: z.string().min(1).max(480) }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const lead = await leadsService.getLeadById(input.leadId);
      return { fullName: lead.fullName, phone: lead.phone, message: input.message };
    },
    run: async (input) => {
      await leadsService.sendSmsToLead(input.leadId, input.message);
      return { leadId: input.leadId, channel: 'sms', sent: true };
    },
  }),
  tool({
    name: 'propose_send_email_to_lead',
    description:
      'Propose sending a one-off free-text email to a lead. Only prepares a confirmation card — never sends it itself. Not a campaign; use propose_create_campaign for bulk sends to a filtered audience.',
    inputSchema: z.object({
      leadId: z.string(),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const lead = await leadsService.getLeadById(input.leadId);
      return { fullName: lead.fullName, email: lead.email, subject: input.subject, body: input.body };
    },
    run: async (input) => {
      await leadsService.sendEmailToLead(input.leadId, input.subject, input.body);
      return { leadId: input.leadId, channel: 'email', sent: true };
    },
  }),
  tool({
    name: 'propose_create_campaign',
    description:
      'Propose creating a new campaign (name, channel, message, audience filters by lead source/status/minimum score) as a draft. Only prepares a confirmation card — never creates it itself. Does not queue or send — use propose_queue_and_send_campaign afterward for that, as a separate confirmation.',
    inputSchema: z.object({
      name: z.string().min(2).max(200),
      channel: z.enum(['email', 'whatsapp', 'sms']),
      messageSubject: z.string().max(200).optional(),
      messageBody: z.string().min(1),
      filterLeadSource: z.enum(['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other']).optional(),
      filterStatus: z.string().optional(),
      filterMinScore: z.number().optional(),
    }),
    trust: { kind: 'staff', roles: ['admin', 'marketing'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const leads = await leadsService.listLeads();
      const matchedLeadCount = leads.filter(
        (lead) =>
          (!input.filterLeadSource || lead.leadSource === input.filterLeadSource) &&
          (!input.filterStatus || lead.status === input.filterStatus) &&
          (input.filterMinScore === undefined || lead.score >= input.filterMinScore),
      ).length;
      return {
        name: input.name,
        channel: input.channel,
        filterLeadSource: input.filterLeadSource ?? null,
        filterStatus: input.filterStatus ?? null,
        filterMinScore: input.filterMinScore ?? null,
        matchedLeadCount,
      };
    },
    run: async (input, ctx) => campaignsService.createCampaign(input, ctx.staffUser!.id),
  }),
  tool({
    name: 'propose_resend_receipt',
    description:
      "Propose emailing a registration's payment receipt (PDF) to the participant again. Only prepares a confirmation card — never sends it itself.",
    inputSchema: z.object({ registrationId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'finance'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const receipt = await portalService.getReceiptDataForStaff(input.registrationId);
      return {
        participantName: receipt.participantName,
        participantEmail: receipt.participantEmail,
        courseName: receipt.courseName,
        balance: receipt.balance,
      };
    },
    run: async (input) => {
      const receipt = await portalService.getReceiptDataForStaff(input.registrationId);
      const bytes = await generateReceiptPdf({
        ...receipt,
        issuedDate: new Date().toISOString().slice(0, 10),
      });
      await sendTransactionalEmail({
        to: receipt.participantEmail,
        subject: `Your Knowsia receipt — ${receipt.courseName}`,
        html: `<p>Dear ${receipt.participantName},</p><p>Attached is your payment receipt for <strong>${receipt.courseName}</strong>.</p>`,
        attachments: [
          {
            filename: `receipt-${input.registrationId.slice(0, 8)}.pdf`,
            content: Buffer.from(bytes).toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      });
      return { registrationId: input.registrationId, sent: true };
    },
  }),
  tool({
    name: 'propose_resend_certificate',
    description:
      'Propose emailing an already-issued certificate (PDF + verification link) to its recipient again. Only prepares a confirmation card — never sends it itself.',
    inputSchema: z.object({ certificateId: z.string() }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const certificates = await certificatesService.listCertificates();
      const certificate = certificates.find((candidate) => candidate.id === input.certificateId);
      return {
        certificateNumber: certificate?.certificateNumber ?? 'Unknown',
        recipientName: certificate?.recipientName ?? 'Unknown',
        recipientEmail: certificate?.recipientEmail ?? null,
        courseTitle: certificate?.courseTitle ?? 'Unknown',
      };
    },
    run: async (input) => {
      const sent = await certificatesService.resendCertificateEmail(input.certificateId);
      return { certificateId: input.certificateId, sent };
    },
  }),
  tool({
    name: 'propose_offer_waitlist_seat',
    description:
      'Propose manually offering the next waitlisted person a seat right now, if one is actually available (does not force an offer when the batch has no free seat). Only prepares a confirmation card — never sends the offer itself.',
    inputSchema: z.object({ batchId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'finance', 'marketing', 'management'] },
    mode: 'write-confirm',
    surfaces: ['assistant'],
    buildPreview: async (input) => {
      const [batch, entries] = await Promise.all([
        coursesService.getBatchByIdSystem(input.batchId),
        waitlistService.getWaitlistForBatch(input.batchId),
      ]);
      const seatsRemaining = await coursesService.getSeatsRemaining(input.batchId);
      const nextPerson = entries.find((entry) => entry.status === 'Waiting');
      return {
        cohortLabel: batch?.cohortLabel ?? 'Unknown',
        seatsRemaining,
        nextPerson: nextPerson ? { fullName: nextPerson.fullName, email: nextPerson.email } : null,
      };
    },
    run: async (input) => coursesService.offerNextWaitlistSeat(input.batchId),
  }),

  // --- New read-only tools (2026-07-26) — every module with no prior AI-surface ---
  tool({
    name: 'list_campaigns',
    description: 'List all campaigns with their status, channel, and audience filters.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => campaignsService.listCampaigns(),
  }),
  tool({
    name: 'get_campaign',
    description: 'Get one campaign by id, including a dry-run preview of who it would reach.',
    inputSchema: z.object({ campaignId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => {
      const [campaign, preview] = await Promise.all([
        campaignsService.getCampaignById(input.campaignId),
        campaignsService.previewCampaign(input.campaignId),
      ]);
      return { campaign, preview };
    },
  }),
  tool({
    name: 'list_live_sessions',
    description: 'List all scheduled/live/completed class sessions with their status and times.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => liveSessionsService.getLiveSessions(),
  }),
  tool({
    name: 'get_waitlist_for_batch',
    description: 'List the waitlist entries for a batch, in order.',
    inputSchema: z.object({ batchId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'finance', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => waitlistService.getWaitlistForBatch(input.batchId),
  }),
  tool({
    name: 'get_attendance_for_batch',
    description: 'Get per-session Zoom attendance for a batch.',
    inputSchema: z.object({ batchId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => attendanceService.getAttendanceForBatch(input.batchId),
  }),
  tool({
    name: 'list_certificates',
    description: 'List issued certificates (most recent first).',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => certificatesService.listCertificates(),
  }),
  tool({
    name: 'verify_certificate',
    description: 'Verify a certificate by its certificate number (valid / revoked / not found).',
    inputSchema: z.object({ certificateNumber: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => certificatesService.verifyCertificate(input.certificateNumber),
  }),
  tool({
    name: 'get_batch_feedback_summary',
    description: 'Get average ratings and testimonials submitted for a batch.',
    inputSchema: z.object({ batchId: z.string() }),
    trust: { kind: 'staff', roles: ['admin', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => feedbackService.getBatchFeedbackSummary(input.batchId),
  }),
  tool({
    name: 'list_opportunities',
    description: 'List all sales pipeline opportunities.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => opportunitiesService.listOpportunities(),
  }),
  tool({
    name: 'get_opportunities_pipeline_summary',
    description: 'Get pipeline totals: open/won value and counts by stage.',
    inputSchema: z.object({}),
    trust: { kind: 'staff', roles: ['admin', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async () => opportunitiesService.getPipelineSummary(),
  }),
  tool({
    name: 'get_message_log',
    description: 'Search the email/WhatsApp/SMS send log, optionally filtered by channel or status.',
    inputSchema: messageLogFiltersSchema,
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => communicationsService.getMessageLog(input),
  }),

  // --- New read-only tools (2026-07-27) — student-support tooling ---
  tool({
    name: 'get_student_status',
    description:
      'Look up a student by email or phone: their registrations, payment status/balance, and certificates. A richer, structured version of the voice-only lookup_customer tool.',
    inputSchema: z.object({ identifier: z.string().min(3) }),
    trust: { kind: 'staff', roles: ['admin', 'finance', 'marketing', 'management'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => portalService.getStudentStatusForStaff(input.identifier),
  }),
  tool({
    name: 'get_certificate_candidates_for_batch',
    description:
      "List a batch's certificate-eligible participants (paid, feedback submitted, attendance percent, already-issued status). Visibility only — issuing still requires the Certificates screen.",
    inputSchema: z.object({ batchId: z.string() }),
    trust: { kind: 'staff', roles: ['admin'] },
    mode: 'read',
    surfaces: ['assistant'],
    run: async (input) => certificatesService.getBatchIssueContext(input.batchId),
  }),

  // --- Vapi voice tools (system trust — no staff identity, gated by the
  // x-vapi-secret header at the route layer instead) ---
  tool({
    name: 'get_course_catalog',
    description: 'Open batches with fees and start dates, for the voice agent to describe.',
    inputSchema: z.object({}),
    trust: { kind: 'system' },
    mode: 'read',
    surfaces: ['voice'],
    run: async () => {
      const batches = await coursesService.getActiveBatchesForPublicForm();
      if (batches.length === 0) return 'No batches are currently open for registration.';
      return batches
        .map(
          (batch) =>
            `${batch.courseName} (${batch.cohortLabel}): starts ${batch.startDate}, fee GHS ${batch.courseFee}` +
            (batch.discountedFee !== null && batch.discountCutoffDate !== null
              ? `, early-bird GHS ${batch.discountedFee} until ${batch.discountCutoffDate}`
              : ''),
        )
        .join('. ');
    },
  }),
  tool({
    name: 'send_registration_link',
    description: 'SMS the registration URL to a phone number.',
    inputSchema: z.object({ phone: z.string() }),
    trust: { kind: 'system' },
    mode: 'write-direct',
    surfaces: ['voice'],
    run: async (input) => {
      if (!input.phone) return 'A phone number is required to send the link.';
      await sendSmsMessage({
        toPhone: input.phone,
        message: 'Register for a Knowsia course here: https://reg.knowsia.com/register - Knowsia',
      });
      return 'Registration link sent by SMS.';
    },
  }),
  tool({
    name: 'lookup_customer',
    description: 'Look up a participant and their registrations/payment status by email or phone.',
    inputSchema: z.object({
      identifier: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }),
    trust: { kind: 'system' },
    mode: 'read',
    surfaces: ['voice'],
    run: async (input) => {
      const identifier = input.identifier || input.phone || input.email || '';
      if (!identifier) return 'An email or phone number is required to look up a customer.';
      return voiceService.lookupCustomerForAgent(identifier);
    },
  }),
  tool({
    name: 'request_human_callback',
    description: 'Flag a call for a human to return, with an optional reason.',
    inputSchema: z.object({ phone: z.string().optional(), reason: z.string().optional() }),
    trust: { kind: 'system' },
    mode: 'write-direct',
    surfaces: ['voice'],
    run: async (input) => {
      await voiceService.recordInboundCall({
        phone: input.phone ?? '',
        summary: input.reason ? `Callback requested: ${input.reason}` : 'Callback requested.',
        needsHumanFollowup: true,
      });
      return 'A member of the team will call back shortly.';
    },
  }),
];

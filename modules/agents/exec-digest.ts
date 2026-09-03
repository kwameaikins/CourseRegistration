// Executive digest agent (Agentic layer, 2026-09-03) — Doc 13 Phase 3's
// "executive analytics agent". Weekly: reads the same numbers the dashboard
// computes (this week vs last week), writes management a short narrative of
// what moved and one recommended action, and emails it. Read-only + one
// email — the zero-risk agent that builds trust in the rest of the program.
import { sendTransactionalEmail } from '@/lib/resend/client';
import * as dashboardService from '@/modules/dashboard/service';
import * as agentsRepository from '@/modules/agents/repository';
import { runJsonAgent } from '@/modules/agents/model';
import type { ExecDigestSummary } from '@/modules/agents/types';

interface DigestOutput {
  subject: string;
  paragraphs: string[];
  recommendation: string;
}

function isoDaysAgo(days: number, from: Date): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function slim(summary: Awaited<ReturnType<typeof dashboardService.computeDashboardSummary>>) {
  return {
    registrations: summary.aggregate.registrationsThisMonth,
    revenueAgainstNewRegistrations: summary.aggregate.revenueReceivedThisMonth,
    revenueCollected: summary.aggregate.revenueCollectedInPeriod,
    outstanding: summary.aggregate.totalOutstandingBalance,
    funnel: summary.funnel,
    leadSources: summary.leadSources.slice(0, 6),
    campaignPerformance: summary.campaignPerformance.slice(0, 6),
    repeatRate: summary.repeatEnrolment.repeatRate,
    leadPipeline: summary.leadPipeline,
    salesPipeline: summary.salesPipeline,
    averageLtv: summary.lifetimeValue.averageLtv,
  };
}

export async function runExecDigestAgent(now = new Date()): Promise<ExecDigestSummary> {
  const [thisWeek, lastWeek] = await Promise.all([
    dashboardService.computeDashboardSummary({
      dateFrom: isoDaysAgo(7, now),
      dateTo: now.toISOString().slice(0, 10),
    }),
    dashboardService.computeDashboardSummary({
      dateFrom: isoDaysAgo(14, now),
      dateTo: isoDaysAgo(8, now),
    }),
  ]);

  const prompt = `You are the executive analytics agent for Knowsia, a Ghanaian professional-training business. Write this week's Monday digest for the founder and management.

Rules:
- Use ONLY the numbers provided. Never invent, extrapolate, or estimate a figure that is not present. Currency is GHS.
- 3 to 5 short paragraphs: what moved vs last week, the most plausible WHY visible in the data (lead sources, funnel stages, campaigns), and anything that deserves attention (rising outstanding balance, a stalling stage, a source that stopped converting).
- End with exactly ONE concrete recommended action for this week.
- Plain business language, no headers, no bullet lists, no flattery.

THIS WEEK:
${JSON.stringify(slim(thisWeek))}

LAST WEEK (comparison):
${JSON.stringify(slim(lastWeek))}

Reply with ONLY JSON:
{"subject": "Weekly digest: ...", "paragraphs": ["...", "..."], "recommendation": "..."}`;

  const digest = await runJsonAgent<DigestOutput>(prompt, { maxTokens: 2500 });

  const recipients = new Set(await agentsRepository.selectDigestRecipientEmails());
  for (const extra of (process.env.DIGEST_EXTRA_RECIPIENTS ?? '').split(',')) {
    const email = extra.trim().toLowerCase();
    if (email) recipients.add(email);
  }
  if (recipients.size === 0) {
    return { sent: 0, recipients: [], error: 'No digest recipients found.' };
  }

  const html =
    digest.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('') +
    `<p><strong>Recommended this week:</strong> ${digest.recommendation}</p>` +
    `<p style="font-size:12px;color:#888">Written by the Knowsia analytics agent from live dashboard data. Full detail: reg.knowsia.com/dashboard</p>`;

  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      await sendTransactionalEmail({ to, subject: digest.subject, html });
      sent += 1;
    } catch (err) {
      errors.push(`${to}: ${String(err).slice(0, 150)}`);
    }
  }
  return {
    sent,
    recipients: [...recipients],
    error: errors.length > 0 ? errors.join(' | ') : null,
  };
}

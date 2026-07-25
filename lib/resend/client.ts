import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// RESEND_FROM_EMAIL is configured as a bare address; without a display name
// Gmail falls back to showing the local part ("reg") as the sender name
// instead of the brand, so it's added here rather than depending on every
// env value being pre-formatted as "Name <address>".
function formatFromAddress(rawFromEmail: string): string {
  return rawFromEmail.includes('<') ? rawFromEmail : `Knowsia <${rawFromEmail}>`;
}

export async function sendTransactionalEmail(params: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  // Additive (system review, 2026-07-24) - content is base64, matching what
  // Resend's API expects. Optional so every existing call site is unchanged.
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}): Promise<void> {
  const { error } = await getResendClient().emails.send({
    from: params.from
      ? formatFromAddress(params.from)
      : formatFromAddress(process.env.RESEND_FROM_EMAIL!),
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      content_type: attachment.contentType,
    })),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { error } = await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

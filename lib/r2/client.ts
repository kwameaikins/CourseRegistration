// Cloudflare R2 client (founder-approved 2026-08-01, payment slip uploads).
// R2 is S3-API-compatible; aws4fetch is a ~5KB request-signer with no other
// dependencies, matching this codebase's plain-fetch integration style
// (Arkesel/WhatsApp/Vapi) far better than the full AWS SDK would.
//
// Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET_NAME. When unset (local dev, pre-setup), isR2Configured() gates
// all slip uploads — a missing slip never blocks the rest of a payment
// submission, same posture as every other optional-integration gate in this
// app (isSmsConfigured, isWhatsappConfigured, isVoiceConfigured).
import { AwsClient } from 'aws4fetch';

function getEndpoint(): string {
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function getBucket(): string {
  return process.env.R2_BUCKET_NAME!;
}

let client: AwsClient | null = null;

function getClient(): AwsClient {
  if (!client) {
    client = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      service: 's3',
      region: 'auto',
    });
  }
  return client;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

export async function uploadObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const url = `${getEndpoint()}/${getBucket()}/${params.key}`;
  const response = await getClient().fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    // Buffer satisfies BodyInit at runtime (it's a Uint8Array); the DOM lib's
    // BodyInit union just doesn't include Node's Buffer type by name.
    body: params.body as unknown as BodyInit,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 upload failed (${response.status}): ${text.slice(0, 500)}`);
  }
}

// Short-lived presigned GET URL — staff view the slip directly from R2, the
// bucket itself stays private and the object bytes never pass through our
// own server.
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  const url = new URL(`${getEndpoint()}/${getBucket()}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await getClient().sign(
    new Request(url, { method: 'GET' }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

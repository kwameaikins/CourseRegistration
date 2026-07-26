// Load test — Document 9, Section 7 (NFR: 10 simultaneous form submissions
// without data corruption). A plain script using the global fetch API, per
// the spec's own "k6 or Playwright's request API" — no external tool
// required.
//
// Usage:
//   BASE_URL=http://localhost:3000 BATCH_ID=<uuid-of-an-active-batch> node scripts/load-test-registrations.mjs
//
// BASE_URL defaults to http://localhost:3000 (a local `next dev`/`next start`).
// BATCH_ID is required — must be a real, currently-Active batch in whatever
// database BASE_URL is pointed at. Never point this at production without
// the founder's explicit sign-off — it creates real registration rows.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BATCH_ID = process.env.BATCH_ID;

if (!BATCH_ID) {
  console.error('BATCH_ID env var is required — set it to an Active batch id to register against.');
  process.exit(1);
}

function registrationPayload(emailSuffix) {
  return {
    firstName: 'Load',
    middleName: null,
    surname: `Test${emailSuffix}`,
    gender: 'Female',
    email: `load-test-${Date.now()}-${emailSuffix}@example.com`,
    phone: `+23320${String(emailSuffix).padStart(7, '0')}`,
    jobTitle: 'N/A',
    company: 'N/A',
    batchId: BATCH_ID,
    leadSource: 'Website',
    consentGiven: true,
  };
}

async function postRegistration(payload) {
  const response = await fetch(`${BASE_URL}/api/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function runConcurrentDistinctRegistrations(count) {
  console.log(`\n--- Phase 1: ${count} concurrent registrations, distinct emails, same batch ---`);
  const payloads = Array.from({ length: count }, (_, i) => registrationPayload(i + 1));

  const results = await Promise.all(payloads.map((payload) => postRegistration(payload)));

  const succeeded = results.filter((r) => r.status === 201 && r.body?.data);
  const failed = results.filter((r) => r.status !== 201);
  const ids = succeeded
    .map((r) => r.body.data.registrationId ?? r.body.data.waitlistId)
    .filter(Boolean);
  const uniqueIds = new Set(ids);

  console.log(`Succeeded: ${succeeded.length}/${count}`);
  if (failed.length > 0) {
    console.log('Failures:', failed.map((r) => ({ status: r.status, error: r.body?.error })));
  }
  console.log(`Distinct registration/waitlist IDs: ${uniqueIds.size} (expected ${succeeded.length})`);

  const pass = succeeded.length === count && uniqueIds.size === succeeded.length;
  console.log(pass ? 'PHASE 1 PASSED' : 'PHASE 1 FAILED');
  return pass;
}

async function runConcurrentDuplicateAttempt() {
  console.log('\n--- Phase 2: 2 concurrent registrations, SAME email + same batch ---');
  const payload = registrationPayload('dup');

  const [first, second] = await Promise.all([
    postRegistration(payload),
    postRegistration(payload),
  ]);

  const results = [first, second];
  const succeeded = results.filter((r) => r.status === 201);
  const duplicateRejections = results.filter((r) => r.body?.error?.code === 'DUPLICATE_REGISTRATION');

  console.log('Result statuses:', results.map((r) => r.status));
  console.log(`Succeeded: ${succeeded.length} (expected exactly 1)`);
  console.log(`Rejected as DUPLICATE_REGISTRATION: ${duplicateRejections.length} (expected 1, unless the second landed on the waitlist instead — also acceptable)`);

  const pass = succeeded.length === 1;
  console.log(pass ? 'PHASE 2 PASSED' : 'PHASE 2 FAILED');
  return pass;
}

async function main() {
  console.log(`Load test against ${BASE_URL}, batch ${BATCH_ID}`);
  const phase1 = await runConcurrentDistinctRegistrations(10);
  const phase2 = await runConcurrentDuplicateAttempt();

  console.log('\n=== Summary ===');
  console.log(`Phase 1 (10 concurrent, distinct emails): ${phase1 ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 2 (2 concurrent, same email — exactly one succeeds): ${phase2 ? 'PASS' : 'FAIL'}`);

  if (!phase1 || !phase2) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Load test crashed:', err);
  process.exitCode = 1;
});

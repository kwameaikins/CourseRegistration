// The KnowsiaApp service door, as this app calls it (Doc 22 §6, 2026-09-18).
//
// `Coding Docs/contracts/service-api.v1.json` is the OpenAPI description of
// every `/api/v1/service/*` route on the Python backend, written by that
// repo's contract test (`UPDATE_CONTRACTS=1 pytest tests/contracts`) and
// copied here. This test asserts the four endpoints
// `modules/knowsia-app/service.ts` calls still exist, with the request
// fields it sends — so a breaking change over there fails a test here, in
// review, rather than a paid cohort transition failing with a 422 in
// production. Nothing is fetched: the artifact is committed in both repos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Schema = { properties?: Record<string, unknown>; required?: string[]; $ref?: string };
type Operation = { requestBody?: { content?: Record<string, { schema?: Schema }> }; responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> };
type Contract = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };

const contract: Contract = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../Coding Docs/contracts/service-api.v1.json'), 'utf8'),
);

function resolve(schema: Schema | undefined): Schema {
  if (!schema) return {};
  if (schema.$ref) return contract.components.schemas[schema.$ref.replace('#/components/schemas/', '')] ?? {};
  return schema;
}

function requestFields(routePath: string, method: 'post' | 'get'): string[] {
  const op = contract.paths[routePath]?.[method];
  expect(op, `${method.toUpperCase()} ${routePath} is missing from the contract`).toBeDefined();
  const body = op?.requestBody?.content?.['application/json']?.schema;
  return Object.keys(resolve(body).properties ?? {});
}

function responseFields(routePath: string, method: 'post' | 'get', status = '200'): string[] {
  const op = contract.paths[routePath]?.[method];
  const body = op?.responses?.[status]?.content?.['application/json']?.schema;
  return Object.keys(resolve(body).properties ?? {});
}

describe('KnowsiaApp service-door contract (what modules/knowsia-app/service.ts sends)', () => {
  it('LMS enrolment grant: POST /api/v1/service/lms/enrolments', () => {
    const fields = requestFields('/api/v1/service/lms/enrolments', 'post');
    for (const f of ['email', 'name', 'phone', 'participant_id', 'course_code', 'access_days']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
  });

  it('question-bank access (retired as a grant, still answers 201): POST …/auth/question-bank-access', () => {
    const fields = requestFields('/api/v1/service/auth/question-bank-access', 'post');
    for (const f of ['email', 'name', 'phone', 'participant_id', 'access_days', 'source']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const reply = responseFields('/api/v1/service/auth/question-bank-access', 'post', '201');
    expect(reply).toContain('user_id');
    expect(reply).toContain('granted');
  });

  it('revoke: POST …/auth/question-bank-access/revoke', () => {
    const fields = requestFields('/api/v1/service/auth/question-bank-access/revoke', 'post');
    expect(fields).toContain('email');
    expect(fields).toContain('participant_id');
  });

  it("a participant's LMS courses: GET …/lms/participants/{participant_id}/enrolments", () => {
    const op = contract.paths['/api/v1/service/lms/participants/{participant_id}/enrolments']?.get;
    expect(op, 'GET participants enrolments is missing').toBeDefined();
    const reply = responseFields('/api/v1/service/lms/participants/{participant_id}/enrolments', 'get');
    expect(reply).toContain('enrolments');
  });

  it('the dual-read shadow check (Doc 22 Phase 2): POST …/identity/check', () => {
    const fields = requestFields('/api/v1/service/identity/check', 'post');
    for (const f of ['path', 'product', 'external_id', 'email', 'app_verdict']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const reply = responseFields('/api/v1/service/identity/check', 'post');
    expect(reply).toContain('recorded');
    expect(reply).toContain('dual_read_on');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  certificateIssuer,
  eraseOnLms,
  getOnLms,
  issueOnLms,
  listByRegistrationsOnLms,
  pdfByNumberOnLms,
  revokeOnLms,
  verifyOnLms,
} from '@/lib/knowsia-lms/certificates';

const fetchMock = vi.fn();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const input = {
  courseCode: 'CA01',
  courseTitle: 'Sage',
  recipientName: 'Ama',
  recipientEmail: 'a@x.com',
  description: '',
  hours: 6,
  cpdCredit: '6',
  facilitatorName: null,
  issuedDate: '2026-10-31',
  registrationRef: 'reg-1',
  issuedByRef: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.KNOWSIA_LMS_API_URL = 'https://lms.test/ ';
  process.env.KNOWSIA_APP_SERVICE_KEY = 'k';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CERTIFICATE_ISSUER;
});

describe('certificateIssuer', () => {
  it('defaults to local and trims', () => {
    expect(certificateIssuer()).toBe('local');
    process.env.CERTIFICATE_ISSUER = ' lms\r\n';
    expect(certificateIssuer()).toBe('lms');
  });
});

describe('LMS certificate client', () => {
  it('posts the issue request with the service key', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'c1', certificateNumber: 'KNS-CA01-2026-0001', issuedDate: '2026-10-31', verifyUrl: 'v', existing: false }));
    const result = await issueOnLms(input);
    expect(result.certificateNumber).toBe('KNS-CA01-2026-0001');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://lms.test/api/v1/service/lms/certificates/issue');
    expect(init.headers['X-Service-Key']).toBe('k');
    expect(JSON.parse(init.body).registrationRef).toBe('reg-1');
  });

  it('maps 409 to DUPLICATE_CERTIFICATE but registry_not_active to LMS_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { detail: 'certificate number X already exists' }));
    await expect(issueOnLms({ ...input, customNumber: 'X' })).rejects.toMatchObject({ code: 'DUPLICATE_CERTIFICATE', httpStatus: 409 });
    fetchMock.mockResolvedValueOnce(json(409, { detail: 'registry_not_active' }));
    await expect(issueOnLms(input)).rejects.toMatchObject({ code: 'LMS_UNAVAILABLE', httpStatus: 503 });
  });

  it('maps 5xx and network errors to LMS_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValueOnce(json(502, {}));
    await expect(verifyOnLms('KNS-1')).rejects.toMatchObject({ code: 'LMS_UNAVAILABLE', httpStatus: 503 });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    await expect(verifyOnLms('KNS-1')).rejects.toMatchObject({ code: 'LMS_UNAVAILABLE' });
  });

  it('URL-encodes the number and maps 404 to not_found / null', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: 'not_found' }));
    await verifyOnLms('kns-a/b');
    expect(fetchMock.mock.calls[0][0]).toContain('/verify/kns-a%2Fb');
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await getOnLms('x')).toBeNull();
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await pdfByNumberOnLms('N')).toBeNull();
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await revokeOnLms('x', 'r')).toBe(false);
  });

  it('lists by registration refs in one call and reads the pdf filename', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [{ id: 'c', registrationId: 'r1' }] }));
    const items = await listByRegistrationsOnLms(['r1', 'r2']);
    expect(items).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain('registrationRefs=r1%2Cr2');
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-disposition': 'inline; filename="KNS-1.pdf"' } }));
    const pdf = await pdfByNumberOnLms('KNS-1');
    expect(pdf?.fileName).toBe('KNS-1.pdf');
    expect(pdf?.bytes.length).toBe(2);
  });

  it('lists by registration refs in chunks of 100 and merges the answers', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `r${i}`);
    fetchMock.mockImplementation(async (url: string) => {
      const refs = new URL(String(url)).searchParams.get('registrationRefs')!.split(',');
      return json(200, { items: refs.map((r) => ({ id: `c-${r}`, registrationId: r })) });
    });
    const items = await listByRegistrationsOnLms(ids);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(([u]) =>
      new URL(String(u)).searchParams.get('registrationRefs')!.split(',').length,
    );
    expect(sizes).toEqual([100, 100, 50]);
    expect(items.map((i) => i.registrationId)).toEqual(ids);
  });

  it('erases by registration refs and throws when the LMS cannot', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { erased: 1 }));
    expect(await eraseOnLms(['r1'])).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://lms.test/api/v1/service/lms/certificates/erase');
    expect(await eraseOnLms([])).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(json(422, {}));
    await expect(eraseOnLms(['r1'])).rejects.toMatchObject({ code: 'LMS_ERROR' });
  });
});

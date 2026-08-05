import { describe, expect, it } from 'vitest';

import {
  R2_PREFIXES,
  assignmentSubmissionKey,
  learningResourceKey,
  paymentSlipKey,
} from '@/lib/r2/keys';

// One bucket holds every upload (its name is a historical artefact — R2 has
// no rename), so the key convention IS the organisation. These tests pin the
// layout down: a drifting prefix silently scatters objects across the bucket
// and nothing else would catch it.

const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

describe('R2 key layout', () => {
  it('files a payment slip under slips/<registrationId>/', () => {
    const key = paymentSlipKey('reg-1', 'pdf');
    expect(key.startsWith('slips/reg-1/')).toBe(true);
    expect(key.split('/')).toHaveLength(3);
  });

  it('files a learning resource under materials/<batchId>/', () => {
    const key = learningResourceKey('batch-1', 'pptx');
    expect(key.startsWith('materials/batch-1/')).toBe(true);
    expect(key.split('/')).toHaveLength(3);
  });

  it('files a submission under submissions/<assignmentId>/<registrationId>/', () => {
    const key = assignmentSubmissionKey('assignment-1', 'reg-1', 'docx');
    expect(key.startsWith('submissions/assignment-1/reg-1/')).toBe(true);
    expect(key.split('/')).toHaveLength(4);
  });

  it('gives every content type its own top-level prefix, so none can collide', () => {
    const prefixes = Object.values(R2_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect([
      paymentSlipKey('x', 'pdf'),
      learningResourceKey('x', 'pdf'),
      assignmentSubmissionKey('x', 'y', 'pdf'),
    ].map((key) => key.split('/')[0])).toEqual(['slips', 'materials', 'submissions']);
  });

  it('names every object with a fresh uuid, never the uploader’s filename', () => {
    const first = paymentSlipKey('reg-1', 'pdf');
    const second = paymentSlipKey('reg-1', 'pdf');
    expect(first.split('/').pop()).toMatch(UUID_FILE);
    expect(first).not.toBe(second);
  });

  it('preserves the (already MIME-validated) extension', () => {
    expect(learningResourceKey('batch-1', 'xlsx').endsWith('.xlsx')).toBe(true);
  });

  it('makes an owning aggregate a single listable prefix', () => {
    // What a DPA erasure request or a batch cleanup actually needs.
    const keys = [
      assignmentSubmissionKey('assignment-1', 'reg-1', 'pdf'),
      assignmentSubmissionKey('assignment-1', 'reg-2', 'pdf'),
    ];
    expect(keys.every((key) => key.startsWith('submissions/assignment-1/'))).toBe(true);
  });

  it('refuses a segment that would escape its prefix', () => {
    expect(() => paymentSlipKey('../../etc', 'pdf')).toThrow(/Unsafe R2 key segment/);
    expect(() => learningResourceKey('a/b', 'pdf')).toThrow(/Unsafe R2 key segment/);
    expect(() => assignmentSubmissionKey('a', '..', 'pdf')).toThrow(/Unsafe R2 key segment/);
    expect(() => paymentSlipKey('reg-1', '../sh')).toThrow(/Unsafe R2 key segment/);
    expect(() => paymentSlipKey('', 'pdf')).toThrow(/Unsafe R2 key segment/);
  });
});

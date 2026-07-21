import { describe, expect, it } from 'vitest';

import { parseCsv } from '@/lib/csv';

describe('parseCsv', () => {
  it('parses a simple comma-separated file into header + data rows', () => {
    const rows = parseCsv('First name,Email\nAma,ama@example.com\nKofi,kofi@example.com');
    expect(rows).toEqual([
      ['First name', 'Email'],
      ['Ama', 'ama@example.com'],
      ['Kofi', 'kofi@example.com'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('Name,Company\n"Mensah, Kofi","Acme, Inc."');
    expect(rows).toEqual([
      ['Name', 'Company'],
      ['Mensah, Kofi', 'Acme, Inc.'],
    ]);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    const rows = parseCsv('Note\n"She said ""hello"" to me"');
    expect(rows).toEqual([['Note'], ['She said "hello" to me']]);
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('A,B\r\n1,2\r\n3,4');
    expect(rows).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('ignores a trailing blank line', () => {
    const rows = parseCsv('A,B\n1,2\n');
    expect(rows).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { parseCsv, stringifyCsv } from '@/lib/csv';

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

describe('stringifyCsv', () => {
  it('joins fields with commas and rows with CRLF', () => {
    const csv = stringifyCsv([
      ['First name', 'Email'],
      ['Ama', 'ama@example.com'],
    ]);
    expect(csv).toBe('First name,Email\r\nAma,ama@example.com');
  });

  it('quotes a field containing a comma', () => {
    const csv = stringifyCsv([['Mensah, Kofi', 'Acme, Inc.']]);
    expect(csv).toBe('"Mensah, Kofi","Acme, Inc."');
  });

  it('quotes and doubles internal quotes for a field containing a quote', () => {
    const csv = stringifyCsv([['She said "hello" to me']]);
    expect(csv).toBe('"She said ""hello"" to me"');
  });

  it('quotes a field containing a newline', () => {
    const csv = stringifyCsv([['line one\nline two']]);
    expect(csv).toBe('"line one\nline two"');
  });

  it('leaves plain fields unquoted', () => {
    const csv = stringifyCsv([['Ama Owusu', '1200.00', '']]);
    expect(csv).toBe('Ama Owusu,1200.00,');
  });

  it('round-trips through parseCsv', () => {
    const original = [
      ['Name', 'Company', 'Note'],
      ['Mensah, Kofi', 'Acme, Inc.', 'She said "hi" — fine'],
      ['Ama Owusu', '', 'no notes'],
    ];
    expect(parseCsv(stringifyCsv(original))).toEqual(original);
  });
});

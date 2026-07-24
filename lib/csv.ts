// Minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines,
// "" as an escaped quote). No external dependency needed for the row counts
// this app deals with (registrations bulk import).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalize CRLF/CR to LF up front so the state machine only handles \n.
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // Flush the final field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty trailing rows (common with a trailing blank line).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Minimal RFC4180 CSV stringifier — the write-side counterpart to parseCsv
// above. A field is quoted only when it contains a comma, quote, or newline
// (the common convention — keeps typical exports readable unquoted), with
// internal quotes doubled per spec. CRLF row endings for Excel compatibility.
function stringifyCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function stringifyCsv(rows: string[][]): string {
  return rows.map((row) => row.map(stringifyCsvField).join(',')).join('\r\n');
}

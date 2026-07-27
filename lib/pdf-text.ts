// Shared word-wrap helper for the pdf-lib generators (certificate, receipt,
// invoice) — pdf-lib draws text as a single unbroken line with no built-in
// wrapping, so any generator that places a value column to the right of a
// free-text field (course name, description) must pre-wrap it or long text
// runs straight through the neighboring column.
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  widthOf: (text: string, size: number) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (widthOf(attempt, size) <= maxWidth || !current) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

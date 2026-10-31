export function extractMain(html: string): string | null;
export function hashMain(html: string): string | null;
export function diffSnapshots(before: Record<string, string | null>, after: Record<string, string | null>): string[];
export function isUnusable(value: unknown): boolean;
export function badEntries(snapshot: Record<string, string | null>): string[];
export function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;

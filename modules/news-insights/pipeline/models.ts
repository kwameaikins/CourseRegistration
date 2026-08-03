// Model tiering (doc Section 8.4) — the first place in this codebase that
// varies the Claude model by task difficulty. app/api/assistant/route.ts is
// the only other call site, and it hardcodes a single literal; this module
// introduces the tiers rather than following an existing convention (there
// wasn't one yet).
export const MODEL_CHEAP = 'claude-haiku-4-5-20251001';
export const MODEL_MID = 'claude-sonnet-5';

// Rough published per-million-token pricing, used only to populate
// agent_run_log.estimated_cost_usd so Section 10's cost model is measurable
// from day one — not billing-accurate, and clearly a planning estimate the
// way the source doc itself frames its cost table.
const PRICING_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  [MODEL_CHEAP]: { input: 1, output: 5 },
  [MODEL_MID]: { input: 3, output: 15 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING_USD_PER_MILLION_TOKENS[model] ?? { input: 3, output: 15 };
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output;
}

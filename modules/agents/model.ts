// Shared model runner for the autonomous agents (Agentic layer, 2026-09-03).
//
// One consolidated completion per agent run, returning strict JSON — the same
// batch-decisions shape the question-bank categorizer proved out, not a
// tool-calling loop: a nightly batch decision over 30 leads needs one cheap
// call, and the /assistant chat already covers the interactive case.
import Anthropic from '@anthropic-ai/sdk';

const AGENT_MODEL = () => process.env.AGENT_MODEL ?? 'claude-sonnet-5';

export class AgentUnavailable extends Error {}

export function isAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Tolerates ```json fences and leading prose; refuses truncation loudly so a
// half-decided batch is retried tomorrow rather than half-applied today.
export function parseAgentJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = Math.min(
    ...[text.indexOf('['), text.indexOf('{')].filter((index) => index !== -1),
  );
  if (!Number.isFinite(start)) {
    throw new Error('Agent did not return JSON.');
  }
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function runJsonAgent<T>(
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<T> {
  if (!isAgentConfigured()) {
    throw new AgentUnavailable('ANTHROPIC_API_KEY is not set — agents cannot run.');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: AGENT_MODEL(),
    max_tokens: options.maxTokens ?? 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Agent output was truncated — raise maxTokens or shrink the batch.');
  }
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return parseAgentJson<T>(text);
}

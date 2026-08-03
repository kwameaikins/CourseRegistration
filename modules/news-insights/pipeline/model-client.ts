import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { AppError } from '@/lib/errors';
import * as newsRepository from '@/modules/news-insights/repository';
import { estimateCostUsd } from '@/modules/news-insights/pipeline/models';
import type { AgentName } from '@/modules/news-insights/types';

function describeAgentError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const candidate = err as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.code].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

// Shared structured-extraction caller for every pipeline agent (doc Section
// 4.1's prompt-injection mitigation lives here, once, rather than being
// re-implemented per agent): a forced single tool call, never open-ended
// "read this and act" generation, so a call can only ever populate the
// typed fields the caller asked for. Every call — success or failure — logs
// to agent_run_log, which is what makes the Section 10 cost model real.
export async function callStructuredAgent<TSchema extends z.ZodTypeAny>(params: {
  agentName: AgentName;
  model: string;
  system: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  schema: TSchema;
  pipelineJobId?: string | null;
  inputRef?: string | null;
  maxTokens?: number;
  // Turns the parsed result into the one-line record kept in
  // agent_run_log.output_summary — the trail used to tune thresholds and to
  // reconstruct why an agent decided what it did.
  summarize?: (result: z.infer<TSchema>) => string;
}): Promise<z.infer<TSchema>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError(
      'NOT_CONFIGURED',
      'ANTHROPIC_API_KEY is not set — the news pipeline cannot run agent calls.',
      503,
    );
  }

  const client = new Anthropic();
  const start = Date.now();

  try {
    const response = await client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages: [{ role: 'user', content: params.userContent }],
      tools: [
        {
          name: params.toolName,
          description: params.toolDescription,
          input_schema: z.toJSONSchema(params.schema) as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: params.toolName },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) throw new Error('Model did not return a structured tool call.');
    const parsed = params.schema.parse(toolUse.input) as z.infer<TSchema>;

    let outputSummary: string | null = null;
    if (params.summarize) {
      // A summariser must never be able to sink an otherwise-successful
      // agent call — it exists for observability only.
      try {
        outputSummary = params.summarize(parsed).slice(0, 500);
      } catch {
        outputSummary = null;
      }
    }

    await newsRepository.insertAgentRunLog({
      agentName: params.agentName,
      model: params.model,
      inputRef: params.inputRef ?? null,
      outputSummary,
      pipelineJobId: params.pipelineJobId ?? null,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      estimatedCostUsd: estimateCostUsd(params.model, response.usage.input_tokens, response.usage.output_tokens),
      durationMs: Date.now() - start,
      success: true,
    });

    return parsed;
  } catch (err) {
    await newsRepository
      .insertAgentRunLog({
        agentName: params.agentName,
        model: params.model,
        inputRef: params.inputRef ?? null,
        pipelineJobId: params.pipelineJobId ?? null,
        durationMs: Date.now() - start,
        success: false,
        // Not all failures here are Error instances — a Supabase/PostgREST
        // rejection is a plain object, and String()-ing one writes
        // "[object Object]" into the audit trail, which defeats the point
        // of having one.
        errorMessage: describeAgentError(err),
      })
      .catch(() => undefined);
    throw err;
  }
}

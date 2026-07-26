import type { ZodType } from 'zod';

import type { StaffRole } from '@/lib/domain/types';
import type { StaffUser } from '@/modules/users/types';

// Two trust tiers, matching the two identities that can call into this
// registry: a real staff session (role-checked here, by the registry
// itself, regardless of whether the wrapped service.ts function also
// checks) and Vapi's shared-secret callers, which have no staff identity
// at all (see app/api/voice/tools/route.ts's x-vapi-secret gate).
export type ToolTrust = { kind: 'staff'; roles: StaffRole[] } | { kind: 'system' };

// 'read' / 'write-direct' execute immediately via runTool. 'write-confirm'
// can only ever be proposed (proposeTool) — the sole path to actually
// calling its run() is confirmAndExecuteTool, reached exclusively through
// a human's own confirm click, never through anything the model itself can
// call.
export type ToolMode = 'read' | 'write-direct' | 'write-confirm';

export type ToolSurface = 'assistant' | 'voice';

export interface ToolContext {
  staffUser: StaffUser | null;
}

export interface AgentTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<TInput>;
  trust: ToolTrust;
  mode: ToolMode;
  surfaces: ToolSurface[];
  // write-confirm only: builds the confirmation-card preview WITHOUT
  // performing any write. Never calls run().
  buildPreview?(input: TInput, ctx: ToolContext): Promise<Record<string, unknown>>;
  run(input: TInput, ctx: ToolContext): Promise<unknown>;
}

// Generic identity helper so each tool definition gets its own inferred
// TInput (from its inputSchema/run signature) instead of every entry in
// AGENT_TOOLS being contextually widened to `unknown` by the array literal.
export function tool<TInput>(def: AgentTool<TInput>): AgentTool {
  return def;
}

// What a propose_* tool call returns to the calling surface — enough for a
// confirmation card, with just what's needed to re-submit at confirm time.
export interface PendingToolAction {
  toolName: string;
  input: unknown;
  preview: Record<string, unknown>;
}

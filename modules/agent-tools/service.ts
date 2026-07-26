// The one place every AI surface (Admin Assistant, Vapi voice calls, and
// anything added later) reads its tool list from and dispatches through.
// Each tool's `trust` is enforced HERE, regardless of whether the wrapped
// service.ts function also checks a role internally — several modules
// (campaigns, live-sessions, opportunities, leads, courses, communications,
// attendance, feedback, voice) only gate at the app/api/**/route.ts layer
// today, so a bare service-function call would otherwise skip authorization.
import { AppError } from '@/lib/errors';
import type { Json } from '@/lib/supabase/database.types';
import * as agentToolsRepository from '@/modules/agent-tools/repository';
import { AGENT_TOOLS } from '@/modules/agent-tools/registry';
import type { AgentTool, PendingToolAction, ToolContext, ToolSurface } from '@/modules/agent-tools/types';
import type { StaffUser } from '@/modules/users/types';

function findTool(toolName: string): AgentTool {
  const found = AGENT_TOOLS.find((candidate) => candidate.name === toolName);
  if (!found) {
    throw new AppError('NOT_FOUND', `Unknown tool: ${toolName}`, 404);
  }
  return found;
}

function isTrusted(tool: AgentTool, staffUser: StaffUser | null): boolean {
  if (tool.trust.kind === 'system') return true; // caller already passed the vapi-secret gate
  return staffUser !== null && tool.trust.roles.includes(staffUser.role);
}

function requireTrust(tool: AgentTool, staffUser: StaffUser | null): void {
  if (!isTrusted(tool, staffUser)) {
    throw new AppError('FORBIDDEN', 'Your role does not permit this action.', 403);
  }
}

export function getToolsForSurface(surface: ToolSurface, staffUser: StaffUser | null): AgentTool[] {
  return AGENT_TOOLS.filter(
    (candidate) => candidate.surfaces.includes(surface) && isTrusted(candidate, staffUser),
  );
}

// 'read' and 'write-direct' tools execute immediately — same posture as
// every tool the Admin Assistant and Vapi already call directly today.
export async function runTool(
  toolName: string,
  rawInput: unknown,
  staffUser: StaffUser | null,
): Promise<unknown> {
  const tool = findTool(toolName);
  if (tool.mode === 'write-confirm') {
    throw new AppError(
      'FORBIDDEN',
      `${toolName} requires confirmation — use proposeTool then confirmAndExecuteTool.`,
      403,
    );
  }
  requireTrust(tool, staffUser);
  const input = tool.inputSchema.parse(rawInput);
  const ctx: ToolContext = { staffUser };
  return tool.run(input, ctx);
}

// write-confirm tools only: validates + trust-checks, builds a preview, and
// NEVER calls run(). This is what the model itself is allowed to trigger.
export async function proposeTool(
  toolName: string,
  rawInput: unknown,
  staffUser: StaffUser | null,
): Promise<PendingToolAction> {
  const tool = findTool(toolName);
  if (tool.mode !== 'write-confirm') {
    throw new AppError('VALIDATION_ERROR', `${toolName} is not a write-confirm tool.`, 400);
  }
  requireTrust(tool, staffUser);
  const input = tool.inputSchema.parse(rawInput);
  const ctx: ToolContext = { staffUser };
  const preview = (await tool.buildPreview?.(input, ctx)) ?? {};
  return { toolName, input, preview };
}

// The ONLY function that ever calls run() for a write-confirm tool. Reached
// exclusively via a human's own confirm click (app/api/assistant/
// execute-action/route.ts) — there is no tool the model can call that
// reaches this directly.
export async function confirmAndExecuteTool(
  toolName: string,
  rawInput: unknown,
  staffUser: StaffUser | null,
): Promise<unknown> {
  const tool = findTool(toolName);
  if (tool.mode !== 'write-confirm') {
    throw new AppError('VALIDATION_ERROR', `${toolName} is not a write-confirm tool.`, 400);
  }
  requireTrust(tool, staffUser);
  if (!staffUser) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  const input = tool.inputSchema.parse(rawInput);
  const ctx: ToolContext = { staffUser };
  const result = await tool.run(input, ctx);

  // The write above has already committed — an audit-log hiccup must never
  // make the admin think the real action failed.
  try {
    await agentToolsRepository.insertStaffActionAuditLog({
      actor_staff_id: staffUser.id,
      action_type: toolName,
      target_registration_id: extractRegistrationId(input),
      reason: extractReason(input),
      details: input as Json,
    });
  } catch (err) {
    console.error('[agent tools audit log]', err);
  }

  return result;
}

function extractRegistrationId(input: unknown): string | null {
  if (input && typeof input === 'object' && 'registrationId' in input) {
    const value = (input as { registrationId?: unknown }).registrationId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function extractReason(input: unknown): string | null {
  if (input && typeof input === 'object') {
    const value =
      (input as { reason?: unknown }).reason ?? (input as { statusReason?: unknown }).statusReason;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

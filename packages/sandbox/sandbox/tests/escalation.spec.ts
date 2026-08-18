/**
 * Tests for the shared escalation vocabulary and choreography: the strictly-
 * wider ladder, the argument-pairing validation, the model-facing markers, and
 * {@link approveEscalation}'s ordered fail-closed sequence. Both enforcing tool
 * families (`dsh-tool-bash`, `dsh-tool-fs`) delegate here, so the ordering and
 * verbatim texts are pinned once, next to the vocabulary that owns them.
 */

import { describe, expect, it } from 'vitest'
import {
  ESCALATION_TARGETS,
  WIDER_MODES,
  approveEscalation,
  escalationHintMarker,
  normalizeEscalationRequest,
  sandboxDenialMarker,
  validateEscalationArgs,
} from '@deepseek-ai/dsh-sandbox'
import type { EscalationApprover, EscalationOutcome } from '@deepseek-ai/dsh-sandbox'

describe('the strictly-wider ladder', () => {
  it('read-only escalates to either wider mode; workspace-write only to full access', () => {
    expect(WIDER_MODES['read-only']).toEqual(['workspace-write', 'danger-full-access'])
    expect(WIDER_MODES['workspace-write']).toEqual(['danger-full-access'])
    expect(WIDER_MODES['danger-full-access']).toBeUndefined()
  })

  it('the target enum is the closed set every session could escalate TO (read-only is the floor)', () => {
    expect(ESCALATION_TARGETS).toEqual(['workspace-write', 'danger-full-access'])
  })
})

describe('validateEscalationArgs', () => {
  it('accepts neither field, or both with a non-empty justification', () => {
    expect(() => { validateEscalationArgs(undefined, undefined) }).not.toThrow()
    expect(() => { validateEscalationArgs('workspace-write', 'because the workspace needs it') }).not.toThrow()
  })

  it('rejects one field without the other, and a blank justification', () => {
    expect(() => { validateEscalationArgs('workspace-write', undefined) }).toThrow(/requires a justification/)
    expect(() => { validateEscalationArgs(undefined, 'orphan reason') }).toThrow(/only valid together with sandbox_permissions/)
    expect(() => { validateEscalationArgs('workspace-write', '   ') }).toThrow(/non-empty sentence/)
  })
})

describe('the model-facing markers', () => {
  it('the denial marker names the mode', () => {
    expect(sandboxDenialMarker('read-only')).toBe('[sandbox: file access denied under read-only mode]')
    expect(sandboxDenialMarker('workspace-write')).toBe('[sandbox: file access denied under workspace-write mode]')
  })

  it('the hint marker names the family subject', () => {
    expect(escalationHintMarker('command')).toContain('retry this exact command once with sandbox_permissions')
    expect(escalationHintMarker('operation')).toContain('retry this exact operation once with sandbox_permissions')
  })
})

describe('normalizeEscalationRequest', () => {
  it('passes a genuine strictly-wider escalation through unchanged', () => {
    expect(normalizeEscalationRequest('workspace-write', 'the command needs the workspace', 'read-only'))
      .toEqual({ sandbox_permissions: 'workspace-write', justification: 'the command needs the workspace' })
    expect(normalizeEscalationRequest('danger-full-access', 'a system path is required', 'read-only'))
      .toEqual({ sandbox_permissions: 'danger-full-access', justification: 'a system path is required' })
  })

  it('degrades a request that is not strictly wider to NO request, dropping the justification too', () => {
    // The exact redundant case: a fully-permissive session and the model repeats
    // a standing or lower target. The call must proceed as if no escalation was
    // sent — no approval prompt, no "not strictly wider" failure.
    expect(normalizeEscalationRequest('workspace-write', 'redundant on a permissive session', 'danger-full-access')).toEqual({})
    expect(normalizeEscalationRequest('danger-full-access', 'redundant too', 'danger-full-access')).toEqual({})
    // Equal to the standing mode is also not wider, and needs no justification
    // either — an incomplete redundant request must not fail validation later.
    expect(normalizeEscalationRequest('workspace-write', undefined, 'workspace-write')).toEqual({})
    expect(normalizeEscalationRequest('read-only', 'the floor is never an escalation', 'read-only')).toEqual({})
  })

  it("keeps a genuine escalation's missing-justification intact for pairing validation to reject", () => {
    // A truly wider request without a reason is a malformed ask, not a
    // redundant one — it must survive normalization so validateEscalationArgs
    // can demand the justification.
    expect(normalizeEscalationRequest('workspace-write', undefined, 'read-only'))
      .toEqual({ sandbox_permissions: 'workspace-write' })
  })

  it('passes everything through when there is no effective mode (no confining backend)', () => {
    expect(normalizeEscalationRequest('workspace-write', 'why not', undefined))
      .toEqual({ sandbox_permissions: 'workspace-write', justification: 'why not' })
    expect(normalizeEscalationRequest(undefined, undefined, undefined)).toEqual({})
  })

  it('passes an unrecognized effective mode through for the fail-closed sequence to rule on', () => {
    // A malformed session mode is a defensive edge, not a redundant request:
    // normalization must not swallow it — approveEscalation still decides.
    expect(normalizeEscalationRequest('workspace-write', 'defensive', 'unknown-mode' as never))
      .toEqual({ sandbox_permissions: 'workspace-write', justification: 'defensive' })
  })
})

describe('approveEscalation', () => {
  const req = (over: Partial<Parameters<typeof approveEscalation>[0]> = {}) => ({
    requestedMode: 'workspace-write',
    justification: 'the user asked to write in the workspace',
    effectiveMode: 'read-only' as const,
    subject: 'command',
    ...over,
  })
  /** An approver that records the request and returns a fixed outcome. */
  const approver = (outcome: EscalationOutcome, sink?: (req: unknown) => void): EscalationApprover => ({
    request: async (request) => { sink?.(request); return outcome },
  })
  const ingredients = (over: Partial<Parameters<typeof approveEscalation>[1]> = {}) => ({
    approver: approver('allowed-once'),
    agent: {},
    callId: 'call-1',
    toolName: 'bash',
    ...over,
  })

  it('grants: returns the requested mode, asking through the approver with the audit reason', async () => {
    const seen: { reason?: string }[] = []
    const granted = await approveEscalation(req(), ingredients({ approver: approver('allowed-once', r => seen.push(r as { reason?: string })) }))
    expect(granted).toBe('workspace-write')
    expect(seen[0]?.reason).toBe('escalate sandbox to workspace-write: the user asked to write in the workspace')
  })

  it('a non-widening request fails closed with its own text and never asks', async () => {
    const seen: unknown[] = []
    const spy = ingredients({ approver: approver('allowed-once', r => seen.push(r)) })
    await expect(approveEscalation(req({ requestedMode: 'read-only' }), spy))
      .rejects.toThrow(/not strictly wider than this call's current "read-only" mode/)
    await expect(approveEscalation(req({ requestedMode: 'workspace-write', effectiveMode: 'danger-full-access' as never }), spy))
      .rejects.toThrow(/not strictly wider/)
    expect(seen).toEqual([])
  })

  it('a missing approval service and an agent-less call each fail closed with distinct text', async () => {
    await expect(approveEscalation(req(), ingredients({ approver: undefined }))).rejects.toThrow(/no approval service is composed/)
    await expect(approveEscalation(req(), ingredients({ agent: undefined }))).rejects.toThrow(/no agent to route it through/)
  })

  it('maps each non-grant outcome to its distinct verbatim text (subject in the rejection)', async () => {
    await expect(approveEscalation(req({ subject: 'operation' }), ingredients({ approver: approver('rejected') })))
      .rejects.toThrow('the user rejected escalating this operation to "workspace-write"')
    await expect(approveEscalation(req(), ingredients({ approver: approver('cancelled') })))
      .rejects.toThrow('approval for escalating to "workspace-write" was cancelled')
    await expect(approveEscalation(req(), ingredients({ approver: approver('unavailable') })))
      .rejects.toThrow('no approval channel is available')
  })

  it('an outcome outside the closed union trips the exhaustiveness guard (defensive)', async () => {
    await expect(approveEscalation(req(), ingredients({ approver: approver('bogus' as never) }))).rejects.toThrow()
  })
})

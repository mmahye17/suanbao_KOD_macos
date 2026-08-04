import { describe, expect, it } from 'vitest'
import {
  suanbaoCommandSchema,
  suanbaoHostRequestSchema,
  suanbaoPlacementSchema,
  suanbaoViewModelSchema,
} from './suanbao'

describe('suanbao IPC schemas', () => {
  it('accepts only allowlisted navigation routes', () => {
    expect(suanbaoCommandSchema.safeParse({ type: 'navigate', route: 'image-generation' }).success).toBe(true)
    expect(suanbaoCommandSchema.safeParse({ type: 'navigate', route: 'https://example.com' }).success).toBe(false)
  })

  it('rejects non-finite placement coordinates and oversized input', () => {
    expect(
      suanbaoPlacementSchema.safeParse({
        mode: 'desktop',
        x: Number.NaN,
        y: 0,
        anchor: 'free',
        locked: false,
      }).success
    ).toBe(false)
    expect(suanbaoCommandSchema.safeParse({ type: 'send-message', input: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('requires UUID operation and request IDs', () => {
    expect(
      suanbaoHostRequestSchema.safeParse({
        kind: 'cancel-operation',
        requestId: 'not-a-uuid',
        operationId: 'not-an-operation-id',
      }).success
    ).toBe(false)
  })

  it('rejects unknown cross-window view-model fields', () => {
    const parsed = suanbaoViewModelSchema.safeParse({
      revision: 1,
      petState: 'idle',
      bubbleOpen: false,
      connection: 'online',
      updatedAt: Date.now(),
      cancel: () => undefined,
    })
    expect(parsed.success).toBe(false)
  })
})

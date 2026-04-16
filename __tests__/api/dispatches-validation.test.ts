import { describe, it, expect } from 'vitest'
import {
  createDispatchSchema,
  updateDispatchSchema,
} from '@/lib/validations/schemas/dispatch'

describe('createDispatchSchema', () => {
  const validComplete = {
    assistanceId: 'clxxxxxxxxxxxxxxx',
    type: 'onsite' as const,
    departureOdo: 12345,
    dispatchTime: '2026-04-16T10:00:00+09:00',
    dispatchGpsLat: 35.6812,
    dispatchGpsLng: 139.7671,
    parentDispatchId: null,
    isSecondaryTransport: false,
  }

  it('accepts valid complete input', () => {
    const result = createDispatchSchema.safeParse(validComplete)
    expect(result.success).toBe(true)
  })

  it('accepts valid minimal input (required fields only)', () => {
    const result = createDispatchSchema.safeParse({
      assistanceId: 'clxxxxxxxxxxxxxxx',
      type: 'transport',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing assistanceId', () => {
    const { assistanceId: _, ...data } = validComplete
    expect(createDispatchSchema.safeParse(data).success).toBe(false)
  })

  it('rejects missing type', () => {
    const { type: _, ...data } = validComplete
    expect(createDispatchSchema.safeParse(data).success).toBe(false)
  })

  it('rejects invalid type enum', () => {
    const result = createDispatchSchema.safeParse({
      ...validComplete,
      type: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty assistanceId', () => {
    const result = createDispatchSchema.safeParse({
      ...validComplete,
      assistanceId: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateDispatchSchema', () => {
  it('accepts valid partial update', () => {
    const result = updateDispatchSchema.safeParse({
      status: 'DISPATCHED',
      arrivalGpsLat: 35.6812,
      arrivalGpsLng: 139.7671,
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (all fields are optional via .partial())', () => {
    const result = updateDispatchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects invalid status enum', () => {
    const result = updateDispatchSchema.safeParse({
      status: 'INVALID_STATUS',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid GPS coordinates', () => {
    const result = updateDispatchSchema.safeParse({
      arrivalGpsLat: 35.6812,
      arrivalGpsLng: 139.7671,
    })
    expect(result.success).toBe(true)
  })

  it('rejects out-of-range GPS latitude', () => {
    const result = updateDispatchSchema.safeParse({
      arrivalGpsLat: 91,
    })
    expect(result.success).toBe(false)
  })

  it('rejects out-of-range GPS longitude', () => {
    const result = updateDispatchSchema.safeParse({
      arrivalGpsLng: 181,
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid statuses', () => {
    const statuses = [
      'STANDBY', 'DISPATCHED', 'ONSITE', 'WORKING',
      'TRANSPORTING', 'COMPLETED', 'STORED', 'RETURNED', 'CANCELLED',
    ]
    for (const status of statuses) {
      const result = updateDispatchSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('accepts valid highwayDirection', () => {
    expect(updateDispatchSchema.safeParse({ highwayDirection: 'UP' }).success).toBe(true)
    expect(updateDispatchSchema.safeParse({ highwayDirection: 'DOWN' }).success).toBe(true)
  })

  it('rejects invalid highwayDirection', () => {
    expect(updateDispatchSchema.safeParse({ highwayDirection: 'LEFT' }).success).toBe(false)
  })
})

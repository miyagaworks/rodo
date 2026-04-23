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

  // Phase B: 新 3 ODO フィールド (optional)
  describe('Phase B ODO fields (arrivalOdo / transportStartOdo / returnOdo)', () => {
    it('accepts arrivalOdo as non-negative integer', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        arrivalOdo: 0,
      })
      expect(result.success).toBe(true)
    })

    it('accepts transportStartOdo at upper boundary 999999', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        transportStartOdo: 999999,
      })
      expect(result.success).toBe(true)
    })

    it('accepts returnOdo as null', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        returnOdo: null,
      })
      expect(result.success).toBe(true)
    })

    it('accepts all three new ODO fields together', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        arrivalOdo: 12346,
        transportStartOdo: 12347,
        returnOdo: 12400,
      })
      expect(result.success).toBe(true)
    })

    it('rejects negative arrivalOdo', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        arrivalOdo: -1,
      })
      expect(result.success).toBe(false)
    })

    it('rejects decimal transportStartOdo', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        transportStartOdo: 1.5,
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-numeric string returnOdo', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        returnOdo: 'abc',
      })
      expect(result.success).toBe(false)
    })

    it('accepts string-numeric arrivalOdo (auto-coerced by helper)', () => {
      const result = createDispatchSchema.safeParse({
        ...validComplete,
        arrivalOdo: '12345',
      })
      expect(result.success).toBe(true)
    })
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

  // Phase B: ODO フィールドの PATCH 受理 (既存バグ修正 + 新規 3 フィールド)
  describe('Phase B ODO fields in PATCH', () => {
    it('accepts departureOdo in PATCH (previously silently ignored - regression fix)', () => {
      const result = updateDispatchSchema.safeParse({ departureOdo: 12345 })
      expect(result.success).toBe(true)
    })

    it('accepts arrivalOdo in PATCH', () => {
      const result = updateDispatchSchema.safeParse({ arrivalOdo: 12346 })
      expect(result.success).toBe(true)
    })

    it('accepts transportStartOdo in PATCH', () => {
      const result = updateDispatchSchema.safeParse({ transportStartOdo: 12347 })
      expect(result.success).toBe(true)
    })

    it('accepts returnOdo in PATCH', () => {
      const result = updateDispatchSchema.safeParse({ returnOdo: 12400 })
      expect(result.success).toBe(true)
    })

    it('accepts all four ODO fields (incl. completionOdo) together', () => {
      const result = updateDispatchSchema.safeParse({
        departureOdo: 10000,
        arrivalOdo: 10010,
        transportStartOdo: 10020,
        completionOdo: 10100,
        returnOdo: 10200,
      })
      expect(result.success).toBe(true)
    })

    it('accepts ODO boundary values (0 and 999999)', () => {
      expect(updateDispatchSchema.safeParse({ departureOdo: 0 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ departureOdo: 999999 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: 0 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: 999999 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: 0 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: 999999 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ returnOdo: 0 }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ returnOdo: 999999 }).success).toBe(true)
    })

    it('rejects negative values for each ODO', () => {
      expect(updateDispatchSchema.safeParse({ departureOdo: -1 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: -1 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: -1 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ returnOdo: -1 }).success).toBe(false)
    })

    it('rejects decimal values for each ODO', () => {
      expect(updateDispatchSchema.safeParse({ departureOdo: 1.5 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: 1.5 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: 1.5 }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ returnOdo: 1.5 }).success).toBe(false)
    })

    it('rejects non-numeric strings for each ODO', () => {
      expect(updateDispatchSchema.safeParse({ departureOdo: 'abc' }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: 'abc' }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: 'abc' }).success).toBe(false)
      expect(updateDispatchSchema.safeParse({ returnOdo: 'abc' }).success).toBe(false)
    })

    it('accepts null for each ODO (explicit reset)', () => {
      expect(updateDispatchSchema.safeParse({ departureOdo: null }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ arrivalOdo: null }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ transportStartOdo: null }).success).toBe(true)
      expect(updateDispatchSchema.safeParse({ returnOdo: null }).success).toBe(true)
    })
  })
})

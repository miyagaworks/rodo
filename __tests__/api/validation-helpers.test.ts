import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import {
  gpsLat,
  gpsLng,
  odometerReading,
  monetaryAmount,
  nonEmptyString,
  parseBody,
} from '@/lib/validations/helpers'

// ヘルパーは nullable().optional() なので、単体テストでは
// z.object でラップして safeParse する
function parse<T extends z.ZodType>(schema: T, value: unknown) {
  const wrapper = z.object({ v: schema })
  return wrapper.safeParse({ v: value })
}

describe('gpsLat', () => {
  it.each([0, -90, 90, 45.123, -45.123])('accepts %s', (v) => {
    expect(parse(gpsLat, v).success).toBe(true)
  })

  it.each([-91, 91, -180, 180])('rejects %s', (v) => {
    expect(parse(gpsLat, v).success).toBe(false)
  })

  it('accepts null', () => {
    expect(parse(gpsLat, null).success).toBe(true)
  })

  it('accepts undefined (optional)', () => {
    const wrapper = z.object({ v: gpsLat })
    expect(wrapper.safeParse({}).success).toBe(true)
  })
})

describe('gpsLng', () => {
  it.each([0, -180, 180, 90.5, -90.5])('accepts %s', (v) => {
    expect(parse(gpsLng, v).success).toBe(true)
  })

  it.each([-181, 181, -200, 200])('rejects %s', (v) => {
    expect(parse(gpsLng, v).success).toBe(false)
  })

  it('accepts null', () => {
    expect(parse(gpsLng, null).success).toBe(true)
  })
})

describe('odometerReading', () => {
  it('accepts 0', () => {
    expect(parse(odometerReading, 0).success).toBe(true)
  })

  it('accepts positive integer', () => {
    expect(parse(odometerReading, 12345).success).toBe(true)
  })

  it('rejects negative number', () => {
    expect(parse(odometerReading, -1).success).toBe(false)
  })

  it('rejects decimal', () => {
    expect(parse(odometerReading, 1.5).success).toBe(false)
  })

  it('accepts null', () => {
    expect(parse(odometerReading, null).success).toBe(true)
  })
})

describe('monetaryAmount', () => {
  it('accepts 0', () => {
    expect(parse(monetaryAmount, 0).success).toBe(true)
  })

  it('accepts positive integer', () => {
    expect(parse(monetaryAmount, 10000).success).toBe(true)
  })

  it('rejects negative number', () => {
    expect(parse(monetaryAmount, -1).success).toBe(false)
  })

  it('accepts null', () => {
    expect(parse(monetaryAmount, null).success).toBe(true)
  })
})

describe('nonEmptyString', () => {
  it('rejects empty string', () => {
    expect(nonEmptyString.safeParse('').success).toBe(false)
  })

  it('accepts non-empty string', () => {
    expect(nonEmptyString.safeParse('hello').success).toBe(true)
  })

  it('accepts single character', () => {
    expect(nonEmptyString.safeParse('a').success).toBe(true)
  })
})

describe('parseBody', () => {
  const schema = z.object({ name: z.string().min(1) })

  it('returns success with valid data', () => {
    const result = parseBody(schema, { name: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'test' })
    }
  })

  it('returns error with invalid data', () => {
    const result = parseBody(schema, { name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError)
    }
  })

  it('returns error with missing fields', () => {
    const result = parseBody(schema, {})
    expect(result.success).toBe(false)
  })
})

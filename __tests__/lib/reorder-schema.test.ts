import { describe, it, expect } from 'vitest'
import { reorderSchema } from '@/lib/validations/schemas/reorder'

describe('reorderSchema', () => {
  it('accepts a valid orderedIds array', () => {
    const result = reorderSchema.safeParse({
      orderedIds: ['a1', 'b2', 'c3'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderedIds).toEqual(['a1', 'b2', 'c3'])
    }
  })

  it('accepts a single id', () => {
    const result = reorderSchema.safeParse({ orderedIds: ['only-one'] })
    expect(result.success).toBe(true)
  })

  it('rejects empty orderedIds array', () => {
    const result = reorderSchema.safeParse({ orderedIds: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => m.includes('並び替え対象が空です'))).toBe(true)
    }
  })

  it('rejects orderedIds with duplicate ids', () => {
    const result = reorderSchema.safeParse({
      orderedIds: ['a1', 'b2', 'a1'],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => m.includes('ID が重複しています'))).toBe(true)
    }
  })

  it('rejects orderedIds containing empty string', () => {
    const result = reorderSchema.safeParse({ orderedIds: ['a1', ''] })
    expect(result.success).toBe(false)
  })

  it('rejects when orderedIds is undefined', () => {
    const result = reorderSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects when orderedIds is not an array', () => {
    const result = reorderSchema.safeParse({ orderedIds: 'a1' })
    expect(result.success).toBe(false)
  })

  it('rejects when an orderedIds entry is not a string', () => {
    const result = reorderSchema.safeParse({ orderedIds: ['a1', 123] })
    expect(result.success).toBe(false)
  })
})

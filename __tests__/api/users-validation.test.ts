import { describe, it, expect } from 'vitest'
import {
  createUserSchema,
  updateUserSchema,
} from '@/lib/validations/schemas/user'

describe('createUserSchema', () => {
  const validComplete = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'ADMIN' as const,
    vehicleNumber: '1234',
    monthlySalary: 300000,
    overtimeRate: 2000,
    transportationAllowance: 10000,
  }

  it('accepts valid complete input', () => {
    const result = createUserSchema.safeParse(validComplete)
    expect(result.success).toBe(true)
  })

  it('accepts minimal input and defaults role to MEMBER', () => {
    const result = createUserSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('MEMBER')
    }
  })

  it('rejects missing name', () => {
    const { name: _, ...data } = validComplete
    expect(createUserSchema.safeParse(data).success).toBe(false)
  })

  it('rejects missing email', () => {
    const { email: _, ...data } = validComplete
    expect(createUserSchema.safeParse(data).success).toBe(false)
  })

  it('rejects missing password', () => {
    const { password: _, ...data } = validComplete
    expect(createUserSchema.safeParse(data).success).toBe(false)
  })

  it('rejects short password (< 8 chars)', () => {
    const result = createUserSchema.safeParse({
      ...validComplete,
      password: '1234567',
    })
    expect(result.success).toBe(false)
  })

  it('accepts password of exactly 8 chars', () => {
    const result = createUserSchema.safeParse({
      ...validComplete,
      password: '12345678',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({
      ...validComplete,
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = createUserSchema.safeParse({
      ...validComplete,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('defaults role to MEMBER when not provided', () => {
    const result = createUserSchema.safeParse({
      name: 'User',
      email: 'user@example.com',
      password: 'password123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('MEMBER')
    }
  })

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({
      ...validComplete,
      role: 'SUPERADMIN',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateUserSchema', () => {
  it('accepts valid input', () => {
    const result = updateUserSchema.safeParse({
      name: 'Updated Name',
      monthlySalary: 350000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative monthlySalary', () => {
    const result = updateUserSchema.safeParse({
      name: 'User',
      monthlySalary: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = updateUserSchema.safeParse({
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts null monthlySalary', () => {
    const result = updateUserSchema.safeParse({
      name: 'User',
      monthlySalary: null,
    })
    expect(result.success).toBe(true)
  })
})

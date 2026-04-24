import { z } from 'zod/v4'
import { monetaryAmount } from '../helpers'

export const createUserSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上必要です'),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  vehicleId: z.string().nullable().optional(),
  monthlySalary: monetaryAmount,
  overtimeRate: monetaryAmount,
  transportationAllowance: monetaryAmount,
})

export const updateUserSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
  vehicleId: z.string().nullable().optional(),
  monthlySalary: monetaryAmount,
  overtimeRate: monetaryAmount,
  transportationAllowance: monetaryAmount,
})

import { z } from 'zod/v4'

export const createAssistanceSchema = z.object({
  name: z.string().min(1, '名称は必須です'),
  displayAbbreviation: z.string().optional().default(''),
  insuranceCompanies: z.array(z.string()).optional(),
})

export const updateAssistanceSchema = z.object({
  name: z.string().min(1, '名称は必須です'),
  displayAbbreviation: z.string().min(1, '略称は必須です'),
  insuranceCompanies: z.array(z.string()).optional(),
})

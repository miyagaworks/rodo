import { describe, it, expect } from 'vitest'
import {
  createAssistanceSchema,
  updateAssistanceSchema,
} from '@/lib/validations/schemas/assistance'
import { deleteTransportDestinationSchema } from '@/lib/validations/schemas/transport'
import {
  upsertConfirmationSchema,
} from '@/lib/validations/schemas/confirmation'
import {
  upsertReportSchema,
  completeReportSchema,
} from '@/lib/validations/schemas/report'

describe('createAssistanceSchema', () => {
  it('accepts valid input', () => {
    const result = createAssistanceSchema.safeParse({
      name: 'JAF',
    })
    expect(result.success).toBe(true)
  })

  it('accepts input with displayAbbreviation', () => {
    const result = createAssistanceSchema.safeParse({
      name: 'JAF',
      displayAbbreviation: 'J',
    })
    expect(result.success).toBe(true)
  })

  it('defaults displayAbbreviation to empty string', () => {
    const result = createAssistanceSchema.safeParse({ name: 'JAF' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.displayAbbreviation).toBe('')
    }
  })

  it('rejects empty name', () => {
    const result = createAssistanceSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })
})

describe('updateAssistanceSchema', () => {
  it('accepts valid input with insuranceCompanies', () => {
    const result = updateAssistanceSchema.safeParse({
      name: 'JAF',
      displayAbbreviation: 'J',
      insuranceCompanies: ['company-a', 'company-b'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts without insuranceCompanies', () => {
    const result = updateAssistanceSchema.safeParse({
      name: 'JAF',
      displayAbbreviation: 'J',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = updateAssistanceSchema.safeParse({
      name: '',
      displayAbbreviation: 'J',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty displayAbbreviation', () => {
    const result = updateAssistanceSchema.safeParse({
      name: 'JAF',
      displayAbbreviation: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('deleteTransportDestinationSchema', () => {
  it('accepts valid input', () => {
    const result = deleteTransportDestinationSchema.safeParse({
      shopName: 'Test Shop',
    })
    expect(result.success).toBe(true)
  })

  it('accepts with optional fields', () => {
    const result = deleteTransportDestinationSchema.safeParse({
      shopName: 'Test Shop',
      phone: '03-1234-5678',
      address: 'Tokyo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty shopName', () => {
    const result = deleteTransportDestinationSchema.safeParse({
      shopName: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('upsertConfirmationSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = upsertConfirmationSchema.safeParse({
      workDate: '2026-04-16',
      preApprovalChecks: [true, false, true],
      customerSignature: 'data:image/png;base64,...',
      customerName: 'Customer',
      customerDate: '2026-04-16',
      vehicleType: 'sedan',
      registrationNumber: '1234',
      workContent: 'Towing',
      shopCompanyName: 'Shop A',
      shopContactName: 'Contact A',
      shopSignature: 'data:image/png;base64,...',
      postApprovalCheck: true,
      postApprovalSignature: 'data:image/png;base64,...',
      postApprovalName: 'Approver',
      batteryDetails: { voltage: 12, condition: 'good' },
      notes: 'Some notes',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid minimal input (all fields nullable/optional)', () => {
    const result = upsertConfirmationSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts null values for nullable fields', () => {
    const result = upsertConfirmationSchema.safeParse({
      customerSignature: null,
      customerName: null,
      notes: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('upsertReportSchema', () => {
  it('accepts valid input', () => {
    const result = upsertReportSchema.safeParse({
      departureOdo: 10000,
      completionOdo: 10050,
      recoveryDistance: 5.5,
      transportDistance: 10.2,
      returnDistance: 15.0,
      recoveryHighway: 500,
      transportHighway: 800,
      returnHighway: 500,
      totalHighway: 1800,
      primaryAmount: 15000,
      secondaryAmount: 5000,
      totalConfirmedAmount: 20000,
      isDraft: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts minimal input (all fields nullable/optional)', () => {
    const result = upsertReportSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects negative monetary amounts', () => {
    const result = upsertReportSchema.safeParse({
      primaryAmount: -1000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative odometer reading', () => {
    const result = upsertReportSchema.safeParse({
      departureOdo: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects decimal odometer reading', () => {
    const result = upsertReportSchema.safeParse({
      departureOdo: 100.5,
    })
    expect(result.success).toBe(false)
  })

  it('accepts completion items record', () => {
    const result = upsertReportSchema.safeParse({
      primaryCompletionItems: { check1: true, check2: false },
    })
    expect(result.success).toBe(true)
  })
})

describe('completeReportSchema', () => {
  it('accepts valid input', () => {
    const result = completeReportSchema.safeParse({
      departureOdo: 10000,
      completionOdo: 10050,
      recoveryDistance: 5.5,
      primaryAmount: 15000,
    })
    expect(result.success).toBe(true)
  })

  it('excludes isDraft field', () => {
    // isDraft should be stripped/ignored (omitted from schema)
    const result = completeReportSchema.safeParse({
      departureOdo: 10000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('isDraft' in result.data).toBe(false)
    }
  })

  it('excludes transport-related fields', () => {
    const result = completeReportSchema.safeParse({
      departureOdo: 10000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('transportDistance' in result.data).toBe(false)
      expect('transportHighway' in result.data).toBe(false)
      expect('transportPlaceName' in result.data).toBe(false)
      expect('transportShopName' in result.data).toBe(false)
      expect('transportPhone' in result.data).toBe(false)
      expect('transportAddress' in result.data).toBe(false)
      expect('transportContact' in result.data).toBe(false)
      expect('transportMemo' in result.data).toBe(false)
      expect('storageType' in result.data).toBe(false)
    }
  })

  it('rejects negative amounts', () => {
    const result = completeReportSchema.safeParse({
      primaryAmount: -500,
    })
    expect(result.success).toBe(false)
  })
})

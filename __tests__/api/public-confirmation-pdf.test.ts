import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/c/[token]/pdf
 *
 * Phase 5: 公開 PDF 生成 API。
 *
 * 注意:
 *   @react-pdf/renderer の renderToBuffer は実行が重いため必ずモックする。
 *   フォント読込もモックして実ファイル I/O を避ける。
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workConfirmation: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/pdf/fonts', () => ({
  registerFonts: vi.fn(),
}))

vi.mock('@/lib/pdf/confirmation-template', () => ({
  ConfirmationPdf: vi.fn(() => ({ __mock_pdf__: true })),
}))

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('mock-pdf-bytes')),
}))

import { GET } from '@/app/api/c/[token]/pdf/route'
import { prisma } from '@/lib/prisma'
import { registerFonts } from '@/lib/pdf/fonts'
import { ConfirmationPdf } from '@/lib/pdf/confirmation-template'
import { renderToBuffer } from '@react-pdf/renderer'

const mockedFindUnique = prisma.workConfirmation
  .findUnique as unknown as ReturnType<typeof vi.fn>
const mockedRegisterFonts = registerFonts as unknown as ReturnType<typeof vi.fn>
const mockedConfirmationPdf = ConfirmationPdf as unknown as ReturnType<
  typeof vi.fn
>
const mockedRenderToBuffer = renderToBuffer as unknown as ReturnType<typeof vi.fn>

function makeRequest(token: string): Request {
  return new Request(`http://localhost/api/c/${token}/pdf`, { method: 'GET' })
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) }
}

const sampleConfirmation = {
  id: 'cfm1',
  dispatchId: 'd1',
  workDate: new Date('2026-04-26T12:00:00Z'),
  preApprovalChecks: [true, true, false, false, false],
  customerSignature: 'data:image/png;base64,sig',
  customerName: null,
  customerDate: null,
  vehicleType: 'トヨタ プリウス',
  registrationNumber: '品川 500 あ 1234',
  workContent: 'バッテリー上がり対応',
  shopCompanyName: null,
  shopContactName: null,
  shopSignature: null,
  postApprovalCheck: true,
  postApprovalSignature: 'data:image/png;base64,sig2',
  postApprovalName: '宮川 清美',
  batteryDetails: null,
  notes: null,
  shareToken: 'tok1',
  sharedAt: new Date('2026-04-26'),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GET /api/c/[token]/pdf - 公開 PDF API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRenderToBuffer.mockResolvedValue(Buffer.from('mock-pdf-bytes'))
    mockedConfirmationPdf.mockReturnValue({ __mock_pdf__: true })
  })

  it('有効なトークンで PDF バイナリを返す', async () => {
    mockedFindUnique.mockResolvedValueOnce(sampleConfirmation)

    const res = await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain(
      'inline; filename="work-confirmation-2026-04-26.pdf"',
    )

    const body = await res.arrayBuffer()
    const text = Buffer.from(body).toString('utf8')
    expect(text).toBe('mock-pdf-bytes')
  })

  it('無効なトークンで 404 を返す (renderToBuffer は呼ばれない)', async () => {
    mockedFindUnique.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('invalid'), makeParams('invalid'))

    expect(res.status).toBe(404)
    expect(mockedRenderToBuffer).not.toHaveBeenCalled()
    expect(mockedRegisterFonts).not.toHaveBeenCalled()

    const body = await res.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('PDF 生成時に registerFonts が呼ばれる', async () => {
    mockedFindUnique.mockResolvedValueOnce(sampleConfirmation)

    await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(mockedRegisterFonts).toHaveBeenCalledTimes(1)
  })

  it('ConfirmationPdf に confirmation のフィールドを正しく渡す', async () => {
    mockedFindUnique.mockResolvedValueOnce(sampleConfirmation)

    await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(mockedConfirmationPdf).toHaveBeenCalledTimes(1)
    const args = mockedConfirmationPdf.mock.calls[0][0]
    expect(args.vehicleType).toBe('トヨタ プリウス')
    expect(args.registrationNumber).toBe('品川 500 あ 1234')
    expect(args.workContent).toBe('バッテリー上がり対応')
    expect(args.postApprovalName).toBe('宮川 清美')
    expect(args.workDate).toEqual(sampleConfirmation.workDate)
  })

  it('workDate が null の場合は filename に "unknown" が入る', async () => {
    mockedFindUnique.mockResolvedValueOnce({
      ...sampleConfirmation,
      workDate: null,
    })

    const res = await GET(makeRequest('tok1'), makeParams('tok1'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain(
      'work-confirmation-unknown.pdf',
    )
  })
})

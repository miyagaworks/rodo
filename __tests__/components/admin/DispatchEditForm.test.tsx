/**
 * DispatchEditForm のテスト
 *
 * - 初期値表示（隊員 select、出動時刻、scheduledSecondaryAt）
 * - 必須フィールド未入力時のバリデーションエラー（userId/assistanceId）
 * - 保存時の PATCH 呼び出し（payload 内容、URL）
 * - scheduledSecondaryAt の JST 入力 → UTC 送信変換
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import DispatchEditForm, {
  type DispatchEditFormInitial,
} from '@/components/admin/DispatchEditForm'

const baseInitial: DispatchEditFormInitial = {
  id: 'd-1',
  dispatchNumber: '20260427-001',
  userId: 'u-yamada',
  assistanceId: 'a-pa',
  status: 'COMPLETED',
  isDraft: false,
  // 2026-04-27 10:23 JST = 2026-04-27 01:23 UTC
  dispatchTime: '2026-04-27T01:23:00.000Z',
  arrivalTime: null,
  completionTime: null,
  returnTime: null,
  departureOdo: 12345,
  arrivalOdo: null,
  completionOdo: null,
  returnOdo: null,
  customerName: '田中',
  vehicleName: 'プリウス',
  plateRegion: '練馬',
  plateClass: '500',
  plateKana: 'あ',
  plateNumber: '1234',
  // 2026-04-29 14:00 JST = 2026-04-29 05:00 UTC
  scheduledSecondaryAt: '2026-04-29T05:00:00.000Z',
}

const users = [
  { id: 'u-yamada', name: '山田' },
  { id: 'u-suzuki', name: '鈴木' },
]
const assistances = [
  { id: 'a-pa', name: 'PA Co', displayAbbreviation: 'PA' },
  { id: 'a-sc', name: 'SC Co', displayAbbreviation: 'SC' },
]

function renderForm(overrides: Partial<DispatchEditFormInitial> = {}) {
  const initial = { ...baseInitial, ...overrides }
  return render(
    <DispatchEditForm
      initial={initial}
      users={users}
      assistances={assistances}
    />,
  )
}

describe('DispatchEditForm', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockPush.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初期値が表示される（select / datetime-local / text）', () => {
    renderForm()

    const userSelect = screen.getByTestId('field-userId') as HTMLSelectElement
    expect(userSelect.value).toBe('u-yamada')

    const asSelect = screen.getByTestId(
      'field-assistanceId',
    ) as HTMLSelectElement
    expect(asSelect.value).toBe('a-pa')

    const dispatchTime = screen.getByTestId(
      'field-dispatchTime',
    ) as HTMLInputElement
    expect(dispatchTime.value).toBe('2026-04-27T10:23')

    const scheduled = screen.getByTestId(
      'field-scheduledSecondaryAt',
    ) as HTMLInputElement
    expect(scheduled.value).toBe('2026-04-29T14:00')

    const customer = screen.getByTestId(
      'field-customerName',
    ) as HTMLInputElement
    expect(customer.value).toBe('田中')

    const heading = screen.getByText('案件編集 20260427-001')
    expect(heading).toBeTruthy()
  })

  it('userId を空にすると保存時にバリデーションエラー（PATCH は呼ばれない）', async () => {
    renderForm()

    // userId に空オプションは無いので、option を追加して空に変更する代わりに、
    // select の DOM 値を直接書き換えて zodResolver を発火させる
    const userSelect = screen.getByTestId('field-userId') as HTMLSelectElement
    fireEvent.change(userSelect, { target: { value: '' } })

    fireEvent.click(screen.getByTestId('form-submit'))

    // Form は submit されない (mockFetch は呼ばれない)
    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  it('保存ボタンで PATCH /api/admin/dispatches/[id] が呼ばれ、payload に JST→UTC 変換された日時が入る', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ id: 'd-1' }),
    })

    renderForm()

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/admin/dispatches/d-1')
    expect(init.method).toBe('PATCH')

    const body = JSON.parse(init.body as string)
    // dispatchTime: 2026-04-27 10:23 JST → 2026-04-27 01:23:00 UTC
    expect(body.dispatchTime).toBe('2026-04-27T01:23:00.000Z')
    // scheduledSecondaryAt: 2026-04-29 14:00 JST → 2026-04-29 05:00:00 UTC
    expect(body.scheduledSecondaryAt).toBe('2026-04-29T05:00:00.000Z')
    // 文字列フィールドはそのまま
    expect(body.customerName).toBe('田中')
    expect(body.plateRegion).toBe('練馬')
    // ODO は数値化される
    expect(body.departureOdo).toBe(12345)
    // 状態
    expect(body.status).toBe('COMPLETED')
    expect(body.userId).toBe('u-yamada')
    expect(body.assistanceId).toBe('a-pa')
    expect(body.isDraft).toBe(false)
  })

  it('scheduledSecondaryAt を別 JST 値に変えると、UTC として送信される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ id: 'd-1' }),
    })

    renderForm()

    const scheduled = screen.getByTestId(
      'field-scheduledSecondaryAt',
    ) as HTMLInputElement
    // 2026-04-30 09:00 JST に変更
    fireEvent.change(scheduled, { target: { value: '2026-04-30T09:00' } })

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    // 2026-04-30 09:00 JST = 2026-04-30 00:00:00 UTC
    expect(body.scheduledSecondaryAt).toBe('2026-04-30T00:00:00.000Z')
  })

  it('scheduledSecondaryAt を空文字にすると null として送信される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ id: 'd-1' }),
    })

    renderForm()

    const scheduled = screen.getByTestId(
      'field-scheduledSecondaryAt',
    ) as HTMLInputElement
    fireEvent.change(scheduled, { target: { value: '' } })

    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.scheduledSecondaryAt).toBeNull()
  })

  it('キャンセルで /admin/dispatches に router.push される', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('form-cancel'))
    expect(mockPush).toHaveBeenCalledWith('/admin/dispatches')
  })

  it('PATCH 失敗時はエラーメッセージが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    })

    renderForm()
    fireEvent.click(screen.getByTestId('form-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeTruthy()
    })
  })
})

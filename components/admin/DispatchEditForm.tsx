'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { FaSave } from 'react-icons/fa'

/**
 * 案件編集フォーム（Phase 4-B）。
 *
 * docs/plans/admin-dashboard.md §6.4 ワイヤーフレーム準拠。
 *
 * - PATCH /api/admin/dispatches/[id] を呼ぶ
 * - 編集対象は adminUpdateDispatchSchema の許可フィールドの中から、業務上重要なものだけを抽出
 *   （schema に存在する全フィールドを UI に出すのは過剰なので、§6.4 の項目に絞る）
 * - 日時系は datetime-local（JST 表示）。送信時に +09:00 を付与して UTC 化
 * - scheduledSecondaryAt は status に関わらず常時表示（Phase 3.5 で追加されたフィールド、
 *   STORED 案件以外でも編集可能にしておく）
 * - 「保存」で PATCH、成功時に短いメッセージ表示
 * - 「キャンセル」で /admin/dispatches へ戻る
 * - 「請求画面へ →」は Phase 5 のため非表示
 *
 * 値の制約: ODO は 0 以上の整数、kiloPost は number として送信、その他は文字列または null。
 */

const ODO_LIMIT = 9_999_999
const ODO_MIN = 0

const dispatchStatusSchema = z.enum([
  'STANDBY',
  'DISPATCHED',
  'ONSITE',
  'WORKING',
  'TRANSPORTING',
  'COMPLETED',
  'STORED',
  'RETURNED',
  'CANCELLED',
  'TRANSFERRED',
])

/** form 上の表現（datetime-local は文字列、ODO は文字列で受けて submit 時に整形）。 */
const formSchema = z.object({
  userId: z.string().min(1, '担当隊員は必須です'),
  assistanceId: z.string().min(1, 'アシスタンスは必須です'),
  status: dispatchStatusSchema,
  isDraft: z.boolean(),
  dispatchTime: z.string(),
  arrivalTime: z.string(),
  completionTime: z.string(),
  returnTime: z.string(),
  departureOdo: z.string(),
  arrivalOdo: z.string(),
  completionOdo: z.string(),
  returnOdo: z.string(),
  customerName: z.string(),
  vehicleName: z.string(),
  plateRegion: z.string(),
  plateClass: z.string(),
  plateKana: z.string(),
  plateNumber: z.string(),
  scheduledSecondaryAt: z.string(),
})

export type DispatchEditFormValues = z.infer<typeof formSchema>

export interface DispatchEditFormUserOption {
  id: string
  name: string
}

export interface DispatchEditFormAssistanceOption {
  id: string
  name: string
  displayAbbreviation: string
}

export interface DispatchEditFormInitial {
  id: string
  dispatchNumber: string
  userId: string
  assistanceId: string
  status: z.infer<typeof dispatchStatusSchema>
  isDraft: boolean
  /** ISO 文字列 (UTC) または null。datetime-local 用に変換する。 */
  dispatchTime: string | null
  arrivalTime: string | null
  completionTime: string | null
  returnTime: string | null
  /** 数値 or null。文字列に変換して input に流す。 */
  departureOdo: number | null
  arrivalOdo: number | null
  completionOdo: number | null
  returnOdo: number | null
  customerName: string | null
  vehicleName: string | null
  plateRegion: string | null
  plateClass: string | null
  plateKana: string | null
  plateNumber: string | null
  scheduledSecondaryAt: string | null
}

interface DispatchEditFormProps {
  initial: DispatchEditFormInitial
  users: DispatchEditFormUserOption[]
  assistances: DispatchEditFormAssistanceOption[]
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** ISO (UTC) → "YYYY-MM-DDTHH:mm" (JST ローカル). 入力が無いときは ''. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

/** "YYYY-MM-DDTHH:mm" (JST 想定) → ISO (UTC). 空文字は null. */
function localInputToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(`${local}:00+09:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function odoToInput(n: number | null): string {
  return n === null || n === undefined ? '' : String(n)
}

function inputToOdo(s: string): number | null {
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function strOrNull(s: string): string | null {
  return s === '' ? null : s
}

export default function DispatchEditForm({
  initial,
  users,
  assistances,
}: DispatchEditFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DispatchEditFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: initial.userId,
      assistanceId: initial.assistanceId,
      status: initial.status,
      isDraft: initial.isDraft,
      dispatchTime: isoToLocalInput(initial.dispatchTime),
      arrivalTime: isoToLocalInput(initial.arrivalTime),
      completionTime: isoToLocalInput(initial.completionTime),
      returnTime: isoToLocalInput(initial.returnTime),
      departureOdo: odoToInput(initial.departureOdo),
      arrivalOdo: odoToInput(initial.arrivalOdo),
      completionOdo: odoToInput(initial.completionOdo),
      returnOdo: odoToInput(initial.returnOdo),
      customerName: initial.customerName ?? '',
      vehicleName: initial.vehicleName ?? '',
      plateRegion: initial.plateRegion ?? '',
      plateClass: initial.plateClass ?? '',
      plateKana: initial.plateKana ?? '',
      plateNumber: initial.plateNumber ?? '',
      scheduledSecondaryAt: isoToLocalInput(initial.scheduledSecondaryAt),
    },
  })

  const onSubmit = async (values: DispatchEditFormValues) => {
    setSubmitting(true)
    setSubmitError(null)
    setSuccess(false)

    // ODO の範囲チェック（form schema は文字列で受けているので、ここで再検証）
    const odoFields: Array<keyof DispatchEditFormValues> = [
      'departureOdo',
      'arrivalOdo',
      'completionOdo',
      'returnOdo',
    ]
    for (const f of odoFields) {
      const v = values[f] as string
      if (v !== '') {
        const n = Number(v)
        if (!Number.isFinite(n) || n < ODO_MIN || n > ODO_LIMIT) {
          setSubmitError(`${f} の値が不正です (0〜${ODO_LIMIT})`)
          setSubmitting(false)
          return
        }
      }
    }

    const payload: Record<string, unknown> = {
      userId: values.userId,
      assistanceId: values.assistanceId,
      status: values.status,
      isDraft: values.isDraft,
      dispatchTime: localInputToIso(values.dispatchTime),
      arrivalTime: localInputToIso(values.arrivalTime),
      completionTime: localInputToIso(values.completionTime),
      returnTime: localInputToIso(values.returnTime),
      departureOdo: inputToOdo(values.departureOdo),
      arrivalOdo: inputToOdo(values.arrivalOdo),
      completionOdo: inputToOdo(values.completionOdo),
      returnOdo: inputToOdo(values.returnOdo),
      customerName: strOrNull(values.customerName),
      vehicleName: strOrNull(values.vehicleName),
      plateRegion: strOrNull(values.plateRegion),
      plateClass: strOrNull(values.plateClass),
      plateKana: strOrNull(values.plateKana),
      plateNumber: strOrNull(values.plateNumber),
      scheduledSecondaryAt: localInputToIso(values.scheduledSecondaryAt),
    }

    try {
      const res = await fetch(`/api/admin/dispatches/${initial.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`PATCH failed: ${res.status} ${text}`)
      }
      setSuccess(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const onCancel = () => {
    router.push('/admin/dispatches')
  }

  // フィールド共通スタイル
  const inputCls =
    'w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm'
  const labelCls = 'text-xs font-medium text-gray-600'
  const errCls = 'text-xs text-red-600 mt-0.5'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      data-testid="dispatch-edit-form"
    >
      {/* ヘッダ: 案件番号 */}
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#1C2948' }}>
          案件編集 {initial.dispatchNumber}
        </h1>
      </div>

      {/* 基本情報 */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold" style={{ color: '#1C2948' }}>
          基本情報
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="userId">
              担当隊員
            </label>
            <select
              id="userId"
              {...register('userId')}
              className={inputCls}
              data-testid="field-userId"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {errors.userId && (
              <p className={errCls}>{errors.userId.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="assistanceId">
              アシスタンス
            </label>
            <select
              id="assistanceId"
              {...register('assistanceId')}
              className={inputCls}
              data-testid="field-assistanceId"
            >
              {assistances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayAbbreviation} ({a.name})
                </option>
              ))}
            </select>
            {errors.assistanceId && (
              <p className={errCls}>{errors.assistanceId.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="status">
              状態
            </label>
            <select
              id="status"
              {...register('status')}
              className={inputCls}
              data-testid="field-status"
            >
              <option value="STANDBY">待機</option>
              <option value="DISPATCHED">出動中</option>
              <option value="ONSITE">作業中</option>
              <option value="TRANSPORTING">搬送中</option>
              <option value="COMPLETED">完了</option>
              <option value="STORED">保管中</option>
              <option value="RETURNED">帰社</option>
              <option value="CANCELLED">キャンセル</option>
              <option value="TRANSFERRED">引継済</option>
            </select>
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="isDraft"
              type="checkbox"
              {...register('isDraft')}
              data-testid="field-isDraft"
            />
            <label htmlFor="isDraft" className="text-sm text-gray-700">
              下書き
            </label>
          </div>
        </div>
      </section>

      {/* 出動情報 */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold" style={{ color: '#1C2948' }}>
          出動情報
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="dispatchTime">
              出動時刻
            </label>
            <input
              id="dispatchTime"
              type="datetime-local"
              {...register('dispatchTime')}
              className={inputCls}
              data-testid="field-dispatchTime"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="arrivalTime">
              現場到着
            </label>
            <input
              id="arrivalTime"
              type="datetime-local"
              {...register('arrivalTime')}
              className={inputCls}
              data-testid="field-arrivalTime"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="completionTime">
              完了時刻
            </label>
            <input
              id="completionTime"
              type="datetime-local"
              {...register('completionTime')}
              className={inputCls}
              data-testid="field-completionTime"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="returnTime">
              帰社時刻
            </label>
            <input
              id="returnTime"
              type="datetime-local"
              {...register('returnTime')}
              className={inputCls}
              data-testid="field-returnTime"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls} htmlFor="departureOdo">
              出動 ODO
            </label>
            <input
              id="departureOdo"
              type="number"
              inputMode="numeric"
              min={ODO_MIN}
              max={ODO_LIMIT}
              {...register('departureOdo')}
              className={inputCls}
              data-testid="field-departureOdo"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="arrivalOdo">
              到着 ODO
            </label>
            <input
              id="arrivalOdo"
              type="number"
              inputMode="numeric"
              min={ODO_MIN}
              max={ODO_LIMIT}
              {...register('arrivalOdo')}
              className={inputCls}
              data-testid="field-arrivalOdo"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="completionOdo">
              完了 ODO
            </label>
            <input
              id="completionOdo"
              type="number"
              inputMode="numeric"
              min={ODO_MIN}
              max={ODO_LIMIT}
              {...register('completionOdo')}
              className={inputCls}
              data-testid="field-completionOdo"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="returnOdo">
              帰社 ODO
            </label>
            <input
              id="returnOdo"
              type="number"
              inputMode="numeric"
              min={ODO_MIN}
              max={ODO_LIMIT}
              {...register('returnOdo')}
              className={inputCls}
              data-testid="field-returnOdo"
            />
          </div>
        </div>
      </section>

      {/* 案件詳細 */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold" style={{ color: '#1C2948' }}>
          案件詳細
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="customerName">
              顧客名
            </label>
            <input
              id="customerName"
              type="text"
              {...register('customerName')}
              className={inputCls}
              data-testid="field-customerName"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="vehicleName">
              車両名
            </label>
            <input
              id="vehicleName"
              type="text"
              {...register('vehicleName')}
              className={inputCls}
              data-testid="field-vehicleName"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls} htmlFor="plateRegion">
              地名
            </label>
            <input
              id="plateRegion"
              type="text"
              {...register('plateRegion')}
              className={inputCls}
              data-testid="field-plateRegion"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="plateClass">
              分類
            </label>
            <input
              id="plateClass"
              type="text"
              {...register('plateClass')}
              className={inputCls}
              data-testid="field-plateClass"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="plateKana">
              かな
            </label>
            <input
              id="plateKana"
              type="text"
              {...register('plateKana')}
              className={inputCls}
              data-testid="field-plateKana"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="plateNumber">
              一連指定番号
            </label>
            <input
              id="plateNumber"
              type="text"
              {...register('plateNumber')}
              className={inputCls}
              data-testid="field-plateNumber"
            />
          </div>
        </div>
      </section>

      {/* 二次搬送予定日時 */}
      <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold" style={{ color: '#1C2948' }}>
          二次搬送予定
        </h2>
        <div>
          <label className={labelCls} htmlFor="scheduledSecondaryAt">
            予定日時 (空欄で「未定」)
          </label>
          <input
            id="scheduledSecondaryAt"
            type="datetime-local"
            {...register('scheduledSecondaryAt')}
            className={inputCls}
            data-testid="field-scheduledSecondaryAt"
          />
        </div>
      </section>

      {/* メッセージ + アクション */}
      {submitError && (
        <div
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="form-error"
        >
          保存に失敗しました: {submitError}
        </div>
      )}
      {success && (
        <div
          className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          data-testid="form-success"
        >
          保存しました
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md py-2 px-4 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          data-testid="form-cancel"
        >
          <span style={{ letterSpacing: '0.15em' }}>キャンセル</span>
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md py-2 px-4 text-sm font-medium flex items-center justify-center gap-2.5 disabled:opacity-50"
          style={{ backgroundColor: '#1C2948', color: 'white' }}
          data-testid="form-submit"
        >
          <FaSave className="w-4 h-4" />
          <span style={{ letterSpacing: '0.15em' }}>
            {submitting ? '保存中…' : '保存'}
          </span>
        </button>
      </div>
    </form>
  )
}

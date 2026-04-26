import type { WorkConfirmation } from '@prisma/client'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface BatteryDetails {
  electricUsage?: string
  timeUnused?: string
  voltageBefore?: string
  voltageGenerated?: string
  gravityMF?: string
  loadInspection?: 'OK' | 'NG' | ''
  restart?: 'OK' | 'NG' | ''
  difference?: 'OK' | 'NG' | ''
}

interface Props {
  token: string
  confirmation: WorkConfirmation
}

// -------------------------------------------------------
// Color constants
// -------------------------------------------------------

const MAIN = '#1C2948'
const SUB = '#71A9F7'
const SUCCESS = '#2FBF71'

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

const preCheckLabels = [
  '不可抗力、経年劣化による作業中の車両の損傷・不具合については、責任を負いかねますのでご了承ください。',
  'バッテリージャンピング作業時における電装系（コンピューター・ナビゲーション・警告灯等）の不具合については、責任を負いかねますのでご了承ください。',
  '貴重品（現金・クレジットカード・ETCカード等）についてはお客様自身にて管理をお願いいたします。紛失・破損については責任を負いかねます。',
  '保管料金が発生する場合がございます。',
  '保管中における、盗難・損傷については責任を負いかねますのでご了承ください。',
]

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatDate(date: Date | null): string {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function hasBatteryData(details: BatteryDetails | null): boolean {
  if (!details) return false
  return Object.values(details).some(
    (v) => v !== '' && v !== null && v !== undefined
  )
}

// -------------------------------------------------------
// Sub Components
// -------------------------------------------------------

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <div
      className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 -mt-px"
      style={{
        borderColor: checked ? SUB : '#ccc',
        backgroundColor: checked ? SUB : '#fff',
      }}
    >
      {checked && (
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path
            d="M5 13l4 4L19 7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}

function StatusBadge({ value }: { value: 'OK' | 'NG' | '' | undefined }) {
  if (!value) return <span className="text-xs" style={{ color: '#999' }}>—</span>
  const isOK = value === 'OK'
  return (
    <span
      className="inline-block px-3 py-1 rounded text-xs font-semibold text-white"
      style={{ backgroundColor: isOK ? SUCCESS : '#D3170A' }}
    >
      {value}
    </span>
  )
}

function SignatureImage({
  src,
  alt,
}: {
  src: string | null
  alt: string
}) {
  if (src) {
    // base64 data URL なので next/image は不要
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        className="w-full max-w-xs h-auto border rounded bg-white"
      />
    )
  }
  return <span className="text-xs text-gray-500">（署名なし）</span>
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------

export function ConfirmationView({ token, confirmation }: Props) {
  const checks =
    (confirmation.preApprovalChecks as boolean[] | null) ??
    [false, false, false, false, false]

  const batteryDetails = confirmation.batteryDetails as BatteryDetails | null
  const showBattery = hasBatteryData(batteryDetails)
  const bd = (batteryDetails ?? {}) as BatteryDetails

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f2f5' }}>
      {/* ─── Header ─── */}
      <header
        className="sticky top-0 z-50 flex items-center px-4 py-3"
        style={{ backgroundColor: MAIN }}
      >
        <h1 className="text-white text-lg font-bold tracking-widest flex-1 text-center">
          作業確認書
        </h1>
      </header>

      <div className="px-4 pt-4 pb-32 space-y-4 max-w-lg mx-auto">
        {/* ─── 作業日 ─── */}
        <div className="text-right text-sm" style={{ color: MAIN }}>
          作業日：{formatDate(confirmation.workDate)}
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業前承認欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>
            作業前承認欄（お客様ご署名欄）
          </h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            専門的な作業もございますので作業をお手伝い頂く事はご遠慮ください。（お客様の安全の為スタッフが指示する事もございます）
          </p>

          <div className="space-y-3">
            {preCheckLabels.map((label, i) => (
              <div key={i} className="flex gap-3">
                <CheckBox checked={!!checks[i]} />
                <span
                  className="text-xs leading-relaxed text-justify flex-1"
                  style={{ color: '#333' }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-xs mb-2" style={{ color: '#555' }}>
              上記、作業前の承認事項に同意いたします。
            </p>
            <SignatureImage
              src={confirmation.customerSignature}
              alt="お客様署名"
            />
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 車両情報 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>
            車両情報
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs" style={{ color: '#666' }}>
                車種名
              </p>
              <p className="text-sm" style={{ color: '#333' }}>
                {confirmation.vehicleType ?? ''}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#666' }}>
                登録番号
              </p>
              <p className="text-sm" style={{ color: '#333' }}>
                {confirmation.registrationNumber ?? ''}
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業内容 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>
            作業内容
          </h2>
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: '#333' }}
          >
            {confirmation.workContent ?? ''}
          </p>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 入庫先ご担当者様記入欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>
            入庫先ご担当者様記入欄
          </h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            本紙の内容を確認の上、車両をお預かりいたしました。
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs" style={{ color: '#666' }}>
                会社名
              </p>
              <p className="text-sm" style={{ color: '#333' }}>
                {confirmation.shopCompanyName ?? ''}
              </p>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: '#666' }}>
                担当者様ご署名
              </p>
              <SignatureImage
                src={confirmation.shopSignature}
                alt="担当者様署名"
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* 作業完了後承認欄 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>
            作業完了後承認欄（お客様ご署名欄）
          </h2>
          <p className="text-xs mb-3 text-justify" style={{ color: '#555' }}>
            今回の作業はあくまで応急処置です。早急に修理工場での点検・整備をお勧めいたします。（点検・整備費用はロードサービス対象外となります）
          </p>

          <div className="flex gap-3 mb-4">
            <CheckBox checked={confirmation.postApprovalCheck} />
            <span
              className="text-xs leading-relaxed text-justify flex-1"
              style={{ color: '#333' }}
            >
              作業が異常なく完了し、外観及び内装に新たな傷がないことを確認いたしました。
            </span>
          </div>

          <p className="text-xs mb-2" style={{ color: '#555' }}>
            上記、作業完了後の承認事項に同意いたします。
          </p>
          <SignatureImage
            src={confirmation.postApprovalSignature}
            alt="お客様署名（作業後）"
          />
        </section>

        {/* ═══════════════════════════════════════════ */}
        {/* バッテリー作業明細 */}
        {/* ═══════════════════════════════════════════ */}
        {showBattery && (
          <section
            className="rounded-lg shadow-sm p-4"
            style={{ backgroundColor: '#fff' }}
          >
            <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>
              バッテリー作業明細
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs" style={{ color: '#666' }}>
                  電装：使用 / 類
                </p>
                <p className="text-sm" style={{ color: '#333' }}>
                  {bd.electricUsage ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#666' }}>
                  時間未乗車 / バッテリー / 年使用
                </p>
                <p className="text-sm" style={{ color: '#333' }}>
                  {bd.timeUnused ?? ''}
                </p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs" style={{ color: '#666' }}>
                    バッテリー電圧：作業前（V）
                  </p>
                  <p className="text-sm" style={{ color: '#333' }}>
                    {bd.voltageBefore ?? ''}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-xs" style={{ color: '#666' }}>
                    発生電圧（V）
                  </p>
                  <p className="text-sm" style={{ color: '#333' }}>
                    {bd.voltageGenerated ?? ''}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#666' }}>
                  バッテリー比重：MF値
                </p>
                <p className="text-sm" style={{ color: '#333' }}>
                  {bd.gravityMF ?? ''}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>
                  負荷点検
                </span>
                <StatusBadge value={bd.loadInspection} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>
                  再始動
                </span>
                <StatusBadge value={bd.restart} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#666' }}>
                  差異
                </span>
                <StatusBadge value={bd.difference} />
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* 注意事項・その他 */}
        {/* ═══════════════════════════════════════════ */}
        {confirmation.notes && (
          <section
            className="rounded-lg shadow-sm p-4"
            style={{ backgroundColor: '#fff' }}
          >
            <h2 className="font-bold text-base mb-3" style={{ color: MAIN }}>
              注意事項・その他
            </h2>
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: '#333' }}
            >
              {confirmation.notes}
            </p>
          </section>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* 担当者氏名 */}
        {/* ═══════════════════════════════════════════ */}
        <section
          className="rounded-lg shadow-sm p-4"
          style={{ backgroundColor: '#fff' }}
        >
          <h2 className="font-bold text-base mb-2" style={{ color: MAIN }}>
            担当者氏名
          </h2>
          <p className="text-sm px-1" style={{ color: '#333' }}>
            {confirmation.postApprovalName ?? ''}
          </p>
        </section>
      </div>

      {/* ─── Fixed Bottom: PDF Download ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4"
        style={{
          backgroundColor: '#f0f2f5',
          borderTop: '1px solid #e0e0e0',
        }}
      >
        <a
          href={`/api/c/${token}/pdf`}
          download
          className="block max-w-lg mx-auto py-3.5 rounded-lg font-bold text-base text-white text-center"
          style={{ backgroundColor: MAIN }}
        >
          PDFを保存
        </a>
      </div>
    </div>
  )
}

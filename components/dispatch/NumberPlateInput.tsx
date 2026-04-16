'use client'

import { useRef, useState } from 'react'
import { ImMinus } from 'react-icons/im'

// -------------------------------------------------------
// 地名マスタ（134地名）
// -------------------------------------------------------

const PLATE_REGIONS = [
  {
    group: '広島県',
    items: ['広島', '福山'],
  },
  {
    group: '中国地方',
    items: ['山口', '下関', '岡山', '倉敷', '島根', '出雲', '鳥取'],
  },
  {
    group: '関西',
    items: ['姫路', '神戸', '大阪', 'なにわ', '和泉', '堺', '京都', '奈良', '飛鳥', '滋賀', '彦根', '和歌山'],
  },
  {
    group: '四国',
    items: ['愛媛', '香川', '高松', '徳島', '高知'],
  },
  {
    group: '九州',
    items: ['北九州', '福岡', '久留米', '筑豊', '佐賀', '長崎', '佐世保', '大分', '熊本', '宮崎', '鹿児島', '奄美', '沖縄'],
  },
  {
    group: 'その他全国',
    items: [
      '会津', '青森', '秋田', '足立', '安曇野', '旭川', 'いわき', '石川', '一宮', '板橋',
      '市川', '市原', '伊豆', '伊勢志摩', '岩手', '宇都宮', '江戸川', '江東', '大宮', '岡崎',
      '春日井', '春日部', '柏', '金沢', '葛飾', '川口', '川越', '川崎', '岐阜', '北見',
      '釧路', '熊谷', '群馬', '郡山', '越谷', '相模', '札幌', '品川', '静岡', '庄内',
      '湘南', '白河', '杉並', '鈴鹿', '諏訪', '世田谷', '仙台', '袖ケ浦', '所沢', '多摩',
      '千葉', 'つくば', '土浦', '十勝', 'とちぎ', '豊田', '豊橋', '富山', '長岡', '長野',
      '名古屋', '那須', '成田', '南信州', '新潟', '日光', '沼津', '練馬', '野田', '八王子',
      '八戸', '浜松', '飛騨', '弘前', '福井', '福島', '富士山', '船橋', '平泉', '前橋',
      '松戸', '松本', '三重', '三河', '水戸', '宮城', '室蘭', '盛岡', '山形', '山梨',
      '横浜', '四日市', '知床', '苫小牧', '函館', '習志野', '尾張小牧',
    ],
  },
]

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface PlateValue {
  region: string
  classNum: string
  kana: string
  serial: string
}

interface Props {
  value: PlateValue
  onChange: (v: PlateValue) => void
  onClose: () => void
}

// -------------------------------------------------------
// Serial format helper
// 1桁「5」→ ・・-・5 / 4桁「1234」→ 12-34
// -------------------------------------------------------

function useSerialDisplay(serial: string) {
  if (serial.length === 4) {
    // 4桁のみハイフンあり: 12-34
    return { showHyphen: true, left: serial.slice(0, 2), right: serial.slice(2) }
  }
  // 1〜3桁はドット埋めでハイフンなし: ・・・1 / ・・22 / ・333
  const padded = serial.padStart(4, '・')
  return { showHyphen: false, left: padded, right: '' }
}

// -------------------------------------------------------
// カラー定数
// -------------------------------------------------------
const PLATE_GREEN = '#1A5C38'
const PLATE_GREEN_LIGHT = '#EAF4EE'
const PLATE_GREEN_MID = '#2E7D52'

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export default function NumberPlateInput({ value, onChange, onClose }: Props) {
  const [local, setLocal] = useState<PlateValue>({ ...value })
  const serialInputRef = useRef<HTMLInputElement>(null)

  const update = <K extends keyof PlateValue>(key: K, val: string) => {
    setLocal((prev) => ({ ...prev, [key]: val }))
  }

  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    update('serial', val)
  }

  const handleConfirm = () => {
    onChange(local)
    onClose()
  }

  const { showHyphen, left: serialLeft, right: serialRight } = useSerialDisplay(local.serial)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: PLATE_GREEN_LIGHT }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── ヘッダー ── */}
        <div className="px-4 pt-4 pb-4" style={{ backgroundColor: PLATE_GREEN }}>
          <p className="text-center text-sm font-bold text-white/80 mb-3">ナンバープレート入力</p>

          {/* プレートプレビュー */}
          <div
            className="w-full rounded-lg border-4 px-3 py-3 flex items-center justify-between font-black tracking-wider whitespace-nowrap"
            style={{ borderColor: '#A0A8B0', backgroundColor: 'white' }}
          >
            <span
              className="text-2xl"
              style={{ color: local.region ? PLATE_GREEN : '#9CA3AF' }}
            >
              {local.region || '地名'}
            </span>
            <span
              className="text-2xl font-bold px-1"
              style={{ color: local.classNum ? PLATE_GREEN : '#9CA3AF' }}
            >
              {local.classNum || '・・・'}
            </span>
            <span
              className="text-2xl"
              style={{ color: local.kana ? PLATE_GREEN : '#9CA3AF' }}
            >
              {local.kana || '・'}
            </span>
            <span
              className="text-2xl font-bold flex items-center gap-0.5"
              style={{ color: local.serial ? PLATE_GREEN : '#9CA3AF' }}
            >
              {showHyphen ? (
                <>
                  <span>{serialLeft}</span>
                  <ImMinus className="text-base mx-0.5" style={{ transform: 'scaleX(0.5)' }} />
                  <span>{serialRight}</span>
                </>
              ) : (
                <span>{serialLeft}</span>
              )}
            </span>
          </div>
        </div>

        {/* ── 入力エリア ── */}
        <div className="p-4 space-y-4">

          {/* Row: 地名 / 分類番号 / ひらがな */}
          <div className="flex gap-2">
            {/* 地名ドロップダウン */}
            <select
              value={local.region}
              onChange={(e) => update('region', e.target.value)}
              className="flex-1 min-w-0 border-2 rounded-lg px-2 py-2.5 text-base font-bold appearance-none text-center"
              style={{ borderColor: PLATE_GREEN, color: PLATE_GREEN, backgroundColor: 'white' }}
            >
              <option value="">地名▼</option>
              {PLATE_REGIONS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* 分類番号 */}
            <input
              type="text"
              inputMode="numeric"
              value={local.classNum}
              onChange={(e) =>
                update('classNum', e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="330"
              className="flex-1 min-w-0 border-2 rounded-lg px-2 py-2.5 text-center text-base font-bold"
              style={{ borderColor: PLATE_GREEN, color: PLATE_GREEN }}
            />

            {/* ひらがな */}
            <input
              type="text"
              value={local.kana}
              onChange={(e) => update('kana', e.target.value.slice(0, 1))}
              placeholder="あ"
              className="w-14 border-2 rounded-lg px-2 py-2.5 text-center text-base font-bold"
              style={{ borderColor: PLATE_GREEN, color: PLATE_GREEN }}
            />
          </div>

          {/* 一連指定番号 */}
          <div>
            <p className="text-xs font-bold mb-1.5" style={{ color: PLATE_GREEN }}>
              一連指定番号
            </p>
            <input
              ref={serialInputRef}
              type="tel"
              inputMode="numeric"
              value={local.serial}
              onChange={handleSerialChange}
              maxLength={4}
              placeholder="1234"
              className="w-full rounded-lg py-4 px-3 text-center text-4xl font-black border-2"
              style={{
                borderColor: PLATE_GREEN,
                color: local.serial ? PLATE_GREEN : '#9CA3AF',
                backgroundColor: 'white',
              }}
            />
          </div>
        </div>

        {/* ── ボタン ── */}
        <div className="flex gap-3 px-4 pb-10 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 border-2 rounded-lg font-bold text-base transition-colors"
            style={{ borderColor: PLATE_GREEN, color: PLATE_GREEN, backgroundColor: 'white' }}
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3.5 rounded-lg font-bold text-white text-base active:opacity-80 transition-opacity"
            style={{ backgroundColor: PLATE_GREEN }}
          >
            確定
          </button>
        </div>
      </div>
    </div>
  )
}

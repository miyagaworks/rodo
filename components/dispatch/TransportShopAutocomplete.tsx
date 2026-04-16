'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TransportShopAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (data: { shopName: string; phone: string; address: string; contact: string }) => void
  borderColor: string
}

interface HistoryItem {
  transportShopName: string
  transportPhone: string | null
  transportAddress: string | null
  transportContact: string | null
}

export default function TransportShopAutocomplete({
  value,
  onChange,
  onSelect,
  borderColor,
}: TransportShopAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<HistoryItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const bizdeliNameRef = useRef<HTMLInputElement>(null)
  const bizdeliAddressRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const prevBizdeliAddr = useRef('')
  const prevBizdeliName = useRef('')

  // 履歴検索（デバウンス300ms）
  const searchHistory = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/transport-destinations?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data: HistoryItem[] = await res.json()
        setSuggestions(data)
        setShowDropdown(data.length > 0)
      }
    } catch {
      // ネットワークエラー時は無視
    } finally {
      setIsSearching(false)
    }
  }, [])

  // 入力変更ハンドラ
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchHistory(val), 300)
  }

  // 候補選択
  const handleSelect = (item: HistoryItem) => {
    onSelect({
      shopName: item.transportShopName,
      phone: item.transportPhone ?? '',
      address: item.transportAddress ?? '',
      contact: item.transportContact ?? '',
    })
    setShowDropdown(false)
  }

  // 履歴削除
  const handleDelete = async (item: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch('/api/transport-destinations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: item.transportShopName,
          phone: item.transportPhone,
          address: item.transportAddress,
        }),
      })
      setSuggestions(prev => prev.filter(s =>
        !(s.transportShopName === item.transportShopName
          && s.transportPhone === item.transportPhone
          && s.transportAddress === item.transportAddress)
      ))
    } catch {
      // エラー時は無視
    }
  }

  // BizDeli隠しinput監視（ポーリング100ms）
  // 店名・住所ともに隠しinputから取得するため、Reactのcontrolled inputとの競合なし
  useEffect(() => {
    const interval = setInterval(() => {
      const addrEl = bizdeliAddressRef.current
      const nameEl = bizdeliNameRef.current
      if (addrEl && addrEl.value && addrEl.value !== prevBizdeliAddr.current) {
        prevBizdeliAddr.current = addrEl.value
        const resolvedName = (nameEl && nameEl.value && nameEl.value !== prevBizdeliName.current)
          ? nameEl.value
          : value
        prevBizdeliName.current = nameEl?.value ?? ''
        onSelect({
          shopName: resolvedName,
          phone: '',
          address: addrEl.value,
          contact: '',
        })
        // リセット
        addrEl.value = ''
        if (nameEl) nameEl.value = ''
        prevBizdeliAddr.current = ''
        prevBizdeliName.current = ''
      }
    }, 100)
    return () => clearInterval(interval)
  }, [value, onSelect])

  // BizDeli 初期化（マウント時のみ）
  // type=lazyload を使わないため、自動初期化は走らない。
  // コンポーネント側で init() を呼び、DOM要素にリスナーを付与する。
  useEffect(() => {
    const w = window as unknown as { BizDeli?: { init: () => void } }
    let cancelled = false

    const tryInit = () => {
      if (cancelled) return
      const el = searchInputRef.current
      if (!el) return
      // 初期化済みフラグを削除して、init() に確実に再スキャンさせる
      delete el.dataset.bizdeliInitialized
      w.BizDeli!.init()
    }

    const waitAndInit = () => {
      if (w.BizDeli) {
        // DOMが確実にブラウザに描画されるのを待つ（double-RAF）
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            tryInit()
          })
        })
      } else {
        // スクリプト未ロード時はポーリングで待機
        const timer = setInterval(() => {
          if (w.BizDeli) {
            clearInterval(timer)
            tryInit()
          }
        }, 300)
        cleanupRef.current = () => clearInterval(timer)
      }
    }

    waitAndInit()

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {/* 検索用入力欄（bizdeli-search-input のみ。結果の書き戻しは隠しinputで受ける） */}
      <input
        ref={searchInputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
        placeholder="店名"
        className="w-full border-2 rounded-lg px-3 py-2 text-sm bizdeli-search-input"
        style={{ borderColor, color: '#1C2948' }}
      />

      {/* BizDeli 店名受け取り用の隠しinput */}
      <input
        ref={bizdeliNameRef}
        type="hidden"
        className="bizdeli-name"
      />

      {/* BizDeli 住所受け取り用の隠しinput */}
      <input
        ref={bizdeliAddressRef}
        type="hidden"
        className="bizdeli-prefecturename bizdeli-city bizdeli-area bizdeli-building"
      />

      {/* 履歴候補ドロップダウン */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            履歴
          </div>
          {suggestions.map((item, i) => (
            <div
              key={`${item.transportShopName}-${i}`}
              className="flex items-center border-b border-gray-50 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="flex-1 text-left px-3 py-2.5 hover:bg-blue-50 active:bg-blue-100 transition-colors"
              >
                <div className="text-sm font-bold" style={{ color: '#1C2948' }}>
                  {item.transportShopName}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#1C2948', opacity: 0.55 }}>
                  {[item.transportPhone, item.transportAddress].filter(Boolean).join(' ／ ')}
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(item, e)}
                className="px-3 py-2.5 text-gray-300 hover:text-red-500 active:text-red-700 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

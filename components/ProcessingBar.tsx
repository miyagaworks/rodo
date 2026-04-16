'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FaPen } from 'react-icons/fa'
import { MdPeopleAlt } from 'react-icons/md'

interface DispatchItem {
  id: string
  dispatchNumber: string
  isDraft: boolean
  status: string
  type: 'ONSITE' | 'TRANSPORT'
  plateRegion: string | null
  plateClass: string | null
  plateKana: string | null
  plateNumber: string | null
}

/** 出動タイプ別バッジ（丸に「現」or「搬」） */
function TypeBadge({ type }: { type: 'ONSITE' | 'TRANSPORT' }) {
  return (
    <span
      className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black flex-shrink-0 border border-white"
      style={{ backgroundColor: type === 'ONSITE' ? '#FF8C00' : '#4A90D9', color: '#fff' }}
    >
      {type === 'ONSITE' ? '現' : '搬'}
    </span>
  )
}

function formatPlate(d: DispatchItem): string {
  const { plateRegion, plateClass, plateKana, plateNumber } = d
  if (!plateRegion && !plateNumber) return ''
  return `${plateRegion ?? ''} ${plateClass ?? ''} ${plateKana ?? ''} ${plateNumber ?? ''}`.trim()
}

export default function ProcessingBar() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DispatchItem[]>([])
  const [storedDispatches, setStoredDispatches] = useState<DispatchItem[]>([])
  const [completedDispatches, setCompletedDispatches] = useState<DispatchItem[]>([])
  const [showDraftMenu, setShowDraftMenu] = useState(false)
  const [showStoredMenu, setShowStoredMenu] = useState(false)
  const [showCompletedMenu, setShowCompletedMenu] = useState(false)
  const draftMenuRef = useRef<HTMLDivElement>(null)
  const storedMenuRef = useRef<HTMLDivElement>(null)
  const completedMenuRef = useRef<HTMLDivElement>(null)
  const draftBtnRef = useRef<HTMLButtonElement>(null)
  const storedBtnRef = useRef<HTMLButtonElement>(null)
  const completedBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch('/api/dispatches?status=draft')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DispatchItem[]) => { if (Array.isArray(data)) setDrafts(data) })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/dispatches?status=stored')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DispatchItem[]) => { if (Array.isArray(data)) setStoredDispatches(data) })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/dispatches?status=completed')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DispatchItem[]) => { if (Array.isArray(data)) setCompletedDispatches(data) })
      .catch(console.error)
  }, [])

  // メニュー外タップで閉じる
  useEffect(() => {
    if (!showDraftMenu && !showStoredMenu && !showCompletedMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (showDraftMenu && draftMenuRef.current && !draftMenuRef.current.contains(target) && !draftBtnRef.current?.contains(target)) {
        setShowDraftMenu(false)
      }
      if (showStoredMenu && storedMenuRef.current && !storedMenuRef.current.contains(target) && !storedBtnRef.current?.contains(target)) {
        setShowStoredMenu(false)
      }
      if (showCompletedMenu && completedMenuRef.current && !completedMenuRef.current.contains(target) && !completedBtnRef.current?.contains(target)) {
        setShowCompletedMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDraftMenu, showStoredMenu, showCompletedMenu])

  // 下書きも保管も完了もなければ最小バーのみ
  if (drafts.length === 0 && storedDispatches.length === 0 && completedDispatches.length === 0) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 min-h-[44px]"
        style={{ backgroundColor: '#1C2948' }}
      />
    )
  }

  // 作業番号順（dispatchNumber昇順）
  const sortByNumber = (a: DispatchItem, b: DispatchItem) => a.dispatchNumber.localeCompare(b.dispatchNumber)
  const orderedDrafts = [...drafts].sort(sortByNumber)
  const orderedStored = [...storedDispatches].sort(sortByNumber)
  const orderedCompleted = [...completedDispatches].sort(sortByNumber)

  const handleDraftTap = () => {
    if (showDraftMenu) { setShowDraftMenu(false); return }
    setShowStoredMenu(false)
    setShowCompletedMenu(false)
    if (drafts.length === 1) {
      router.push(`/dispatch/${orderedDrafts[0].id}/record`)
    } else if (drafts.length > 1) {
      setShowDraftMenu(true)
    }
  }

  const handleStoredTap = () => {
    if (showStoredMenu) { setShowStoredMenu(false); return }
    setShowDraftMenu(false)
    setShowCompletedMenu(false)
    if (storedDispatches.length === 1) {
      router.push(`/dispatch/${orderedStored[0].id}/secondary`)
    } else if (storedDispatches.length > 1) {
      setShowStoredMenu(true)
    }
  }

  const handleCompletedTap = () => {
    if (showCompletedMenu) { setShowCompletedMenu(false); return }
    setShowDraftMenu(false)
    setShowStoredMenu(false)
    if (completedDispatches.length === 1) {
      router.push(`/dispatch/${orderedCompleted[0].id}/record`)
    } else if (completedDispatches.length > 1) {
      setShowCompletedMenu(true)
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 px-3 py-2"
      style={{ backgroundColor: '#1C2948' }}
    >
      {/* 下書きポップアップメニュー */}
      {showDraftMenu && drafts.length > 1 && (
        <div
          ref={draftMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 rounded-xl overflow-hidden shadow-lg"
          style={{ backgroundColor: '#D3170A' }}
        >
          {orderedDrafts.map((draft) => (
            <button
              key={draft.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm font-bold active:brightness-90 transition-colors"
              onClick={() => {
                setShowDraftMenu(false)
                router.push(`/dispatch/${draft.id}/record`)
              }}
            >
              <TypeBadge type={draft.type} />
              <span>{draft.dispatchNumber}{formatPlate(draft) ? `（${formatPlate(draft)}）` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {/* 保管ポップアップメニュー */}
      {showStoredMenu && storedDispatches.length > 1 && (
        <div
          ref={storedMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 rounded-xl overflow-hidden shadow-lg"
          style={{ backgroundColor: '#71A9F7' }}
        >
          {orderedStored.map((stored) => (
            <button
              key={stored.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-white text-sm font-bold active:brightness-90 transition-colors"
              onClick={() => {
                setShowStoredMenu(false)
                router.push(`/dispatch/${stored.id}/secondary`)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/storage.svg" alt="" className="w-5 h-5 brightness-0 invert flex-shrink-0" />
              <span>{stored.dispatchNumber}{formatPlate(stored) ? `（${formatPlate(stored)}）` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {/* 完了ポップアップメニュー */}
      {showCompletedMenu && completedDispatches.length > 1 && (
        <div
          ref={completedMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 rounded-xl overflow-hidden shadow-lg"
          style={{ backgroundColor: '#D7AF70' }}
        >
          {orderedCompleted.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold active:brightness-90 transition-colors"
              style={{ color: '#1C2948' }}
              onClick={() => {
                setShowCompletedMenu(false)
                router.push(`/dispatch/${item.id}/record`)
              }}
            >
              <TypeBadge type={item.type} />
              <span>{item.dispatchNumber}{formatPlate(item) ? `（${formatPlate(item)}）` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {/* 4ボタン: 下書き → 完了 → 保管 → 振替 */}
      <div className="flex items-center gap-2">
        {/* 下書き */}
        <button
          ref={draftBtnRef}
          disabled={drafts.length === 0}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 h-11 rounded-lg text-white text-sm font-bold whitespace-nowrap transition-opacity ${drafts.length === 0 ? 'opacity-35 cursor-not-allowed' : 'active:opacity-80'}`}
          style={{ backgroundColor: '#D3170A' }}
          onClick={handleDraftTap}
        >
          <FaPen className="text-sm flex-shrink-0" />
          <span>下書き</span>
          {drafts.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-xs font-bold flex-shrink-0"
              style={{ color: '#D3170A' }}
            >
              {drafts.length}
            </span>
          )}
        </button>

        {/* 完了 */}
        <button
          ref={completedBtnRef}
          disabled={completedDispatches.length === 0}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-bold whitespace-nowrap transition-opacity ${completedDispatches.length === 0 ? 'opacity-35 cursor-not-allowed' : 'active:opacity-80'}`}
          style={{ backgroundColor: '#D7AF70', color: '#1C2948' }}
          onClick={handleCompletedTap}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/completion.svg"
            alt="完了"
            className="w-5 h-5 flex-shrink-0"
            style={{ filter: 'brightness(0) saturate(100%) invert(12%) sepia(50%) saturate(800%) hue-rotate(200deg) brightness(90%)' }}
          />
          <span>完了</span>
          {completedDispatches.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: '#1C2948', color: '#D7AF70' }}
            >
              {completedDispatches.length}
            </span>
          )}
        </button>

        {/* 保管 */}
        <button
          ref={storedBtnRef}
          disabled={storedDispatches.length === 0}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 h-11 rounded-lg text-white text-sm font-bold whitespace-nowrap transition-opacity ${storedDispatches.length === 0 ? 'opacity-35 cursor-not-allowed' : 'active:opacity-80'}`}
          style={{ backgroundColor: '#71A9F7' }}
          onClick={handleStoredTap}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/storage.svg" alt="保管" className="w-6 h-6 brightness-0 invert flex-shrink-0" />
          <span>保管</span>
          {storedDispatches.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full bg-white text-xs font-bold flex-shrink-0"
              style={{ color: '#71A9F7' }}
            >
              {storedDispatches.length}
            </span>
          )}
        </button>

        {/* 振替（アイコンのみ） */}
        <button
          disabled
          className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-lg text-white opacity-35 cursor-not-allowed"
          style={{ backgroundColor: '#2FBF71' }}
        >
          <MdPeopleAlt className="text-xl scale-x-[-1]" />
        </button>
      </div>
    </div>
  )
}

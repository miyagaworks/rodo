'use client'

import { X, Trash2 } from 'lucide-react'
import type { PhotoItem } from './PhotoThumbnails'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface PhotoModalProps {
  photo: PhotoItem | null
  onClose: () => void
  onDelete: (id: string, isLocal: boolean) => void
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export default function PhotoModal({ photo, onClose, onDelete }: PhotoModalProps) {
  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      {/* 閉じるボタン（右上） */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full active:opacity-60"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* 画像 */}
      <div
        className="flex-1 flex items-center justify-center w-full px-4"
        onClick={onClose}
      >
        <img
          src={photo.url}
          alt=""
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* 削除ボタン（下部） */}
      <div className="flex-shrink-0 w-full px-4 pb-8 pt-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(photo.id, photo.isLocal)
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-md font-bold text-sm text-white active:opacity-80"
          style={{ backgroundColor: '#D3170A' }}
        >
          <Trash2 className="w-4 h-4" />
          <span>削除</span>
        </button>
      </div>
    </div>
  )
}

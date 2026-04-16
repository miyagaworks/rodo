'use client'

import { CloudUpload, Camera, Loader2 } from 'lucide-react'

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface PhotoItem {
  id: string
  url: string
  isLocal: boolean
  isUploading?: boolean
}

interface PhotoThumbnailsProps {
  photos: PhotoItem[]
  onPhotoClick: (photo: PhotoItem) => void
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export default function PhotoThumbnails({ photos, onPhotoClick }: PhotoThumbnailsProps) {
  // 写真がない場合はプレースホルダー3つ表示
  if (photos.length === 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[60px] h-[60px] rounded-md border-2 border-dashed flex items-center justify-center"
            style={{ borderColor: '#C6D8FF' }}
          >
            <Camera className="w-5 h-5" style={{ color: '#C6D8FF' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {photos.map((photo) => (
        <button
          key={photo.id}
          onClick={() => onPhotoClick(photo)}
          className="relative flex-shrink-0 w-[60px] h-[60px] rounded-md overflow-hidden active:opacity-80"
        >
          {/* サムネイル画像 */}
          <img
            src={photo.url}
            alt=""
            className="w-full h-full object-cover"
          />

          {/* アップロード中: スピナーオーバーレイ */}
          {photo.isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}

          {/* 未同期（ローカル）: 右上にクラウドアイコン */}
          {photo.isLocal && !photo.isUploading && (
            <div
              className="absolute top-0.5 right-0.5 rounded-full p-0.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <CloudUpload className="w-3 h-3 text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

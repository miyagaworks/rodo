'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { compressImage } from '@/lib/image-compress'
import { savePhoto, getPhotosByDispatch, deletePhoto as deleteOfflinePhoto } from '@/lib/offline-db'

export interface PhotoItem {
  id: string
  url: string           // objectURL（ローカル）or サーバーURL
  isLocal: boolean      // ローカル保存（未同期）
  isUploading?: boolean // アップロード中
}

export function usePhotoCapture(dispatchId: string | null) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])

  const loadPhotos = useCallback(async () => {
    if (!dispatchId) return

    // 'offline-' プレフィックス付き ID は実ネット断時に
    // DispatchClient が生成した楽観的な仮 ID。サーバーには存在しないため
    // photos エンドポイントを叩くと 404 になる。IndexedDB のみから取得する。
    const isOfflineDraft = dispatchId.startsWith('offline-')

    // サーバーから取得
    const serverPhotos: PhotoItem[] = []
    if (!isOfflineDraft) {
      try {
        const res = await fetch(`/api/dispatches/${dispatchId}/photos`)
        if (res.ok) {
          const data = await res.json()
          for (const p of data.photos) {
            serverPhotos.push({ id: p.id, url: p.url, isLocal: false })
          }
        }
      } catch {
        // オフライン
      }
    }

    // IndexedDBから取得
    const offlinePhotos = await getPhotosByDispatch(dispatchId)
    const localPhotos: PhotoItem[] = offlinePhotos.map(p => ({
      id: p.id,
      url: URL.createObjectURL(p.blob),
      isLocal: true,
    }))

    setPhotos([...serverPhotos, ...localPhotos])
  }, [dispatchId])

  // 初期ロード: サーバーから写真取得 + IndexedDBからオフライン写真取得
  useEffect(() => {
    if (!dispatchId) return
    void loadPhotos()
  }, [dispatchId, loadPhotos])

  // カメラ起動
  const openCamera = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // ファイル選択後のハンドラ
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !dispatchId) return

    // inputをリセット（同じファイルを再選択可能に）
    e.target.value = ''

    // 圧縮（失敗時は元ファイルで送信を継続する。
    // 現場撮影画像の送信失敗は業務影響が大きいため、
    // サーバ側の 20MB 上限チェックに任せてでも送信を試みる）
    let compressed: File
    try {
      compressed = await compressImage(file)
    } catch (err) {
      console.error('Image compression failed, falling back to original:', err)
      compressed = file
    }

    if (navigator.onLine) {
      // オンライン: サーバーにアップロード
      const tempId = `uploading-${Date.now()}`
      const tempUrl = URL.createObjectURL(compressed)
      setPhotos(prev => [...prev, { id: tempId, url: tempUrl, isLocal: false, isUploading: true }])

      try {
        const formData = new FormData()
        formData.append('file', compressed, 'photo.jpg')
        const res = await fetch(`/api/dispatches/${dispatchId}/photos`, {
          method: 'POST',
          body: formData,
        })
        if (res.ok) {
          const data = await res.json()
          URL.revokeObjectURL(tempUrl)
          setPhotos(prev => prev.map(p =>
            p.id === tempId ? { id: data.id, url: data.url, isLocal: false, isUploading: false } : p
          ))
        } else {
          // アップロード失敗 → IndexedDBに保存
          const offlineId = await savePhoto(dispatchId, compressed)
          setPhotos(prev => prev.map(p =>
            p.id === tempId ? { id: offlineId, url: tempUrl, isLocal: true, isUploading: false } : p
          ))
        }
      } catch {
        // ネットワークエラー → IndexedDBに保存
        const offlineId = await savePhoto(dispatchId, compressed)
        const fallbackUrl = URL.createObjectURL(compressed)
        URL.revokeObjectURL(tempUrl)
        setPhotos(prev => prev.map(p =>
          p.id === tempId ? { id: offlineId, url: fallbackUrl, isLocal: true, isUploading: false } : p
        ))
      }
    } else {
      // オフライン: IndexedDBに保存
      const offlineId = await savePhoto(dispatchId, compressed)
      const url = URL.createObjectURL(compressed)
      setPhotos(prev => [...prev, { id: offlineId, url, isLocal: true }])
    }
  }, [dispatchId])

  // 写真削除
  const removePhoto = useCallback(async (photoId: string, isLocal: boolean) => {
    if (isLocal) {
      await deleteOfflinePhoto(photoId)
    } else {
      if (!dispatchId) return
      try {
        await fetch(`/api/dispatches/${dispatchId}/photos/${photoId}`, { method: 'DELETE' })
      } catch {
        // オフライン → 無視（TODO: pendingActionsに追加）
        return
      }
    }
    setPhotos(prev => {
      const removed = prev.find(p => p.id === photoId)
      if (removed?.isLocal) URL.revokeObjectURL(removed.url)
      return prev.filter(p => p.id !== photoId)
    })
  }, [dispatchId])

  // クリーンアップ: unmount時にobjectURLを解放
  useEffect(() => {
    return () => {
      photos.forEach(p => {
        if (p.isLocal) URL.revokeObjectURL(p.url)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // unmount時のみ

  return {
    photos,
    photoCount: photos.length,
    fileInputRef,
    openCamera,
    handleFileChange,
    removePhoto,
    reload: loadPhotos,
  }
}

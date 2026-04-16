import {
  getAllPendingActions,
  deletePendingAction,
  getPendingActionCount,
  setSyncMeta,
  getAllOfflinePhotos,
  deletePhoto,
} from './offline-db'

/**
 * pendingActions を時系列順にサーバーへ送信する。
 * 各アクション成功時に IndexedDB から削除。
 * 失敗時は exponential backoff でリトライ（最大3回）。
 *
 * @returns synced: 成功件数, failed: 失敗件数
 */
export async function syncPendingActions(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  const actions = await getAllPendingActions() // timestamp 昇順
  const total = actions.length
  let synced = 0
  let failed = 0

  for (const action of actions) {
    const success = await sendWithRetry(action.endpoint, action.method, action.data)
    if (success) {
      await deletePendingAction(action.id)
      synced++
    } else {
      failed++
    }
    onProgress?.(synced, total)
  }

  if (synced > 0) {
    await setSyncMeta('lastSync', Date.now())
  }

  return { synced, failed }
}

/**
 * Exponential backoff リトライ（最大3回）
 */
async function sendWithRetry(
  endpoint: string,
  method: 'POST' | 'PATCH',
  data: Record<string, unknown>,
  maxRetries = 3,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) return true
      // 4xx はリトライしても意味がない（409 Conflict 除く）
      if (res.status >= 400 && res.status < 500 && res.status !== 409) {
        console.error(`[sync] ${method} ${endpoint} failed with ${res.status}, skipping`)
        return false
      }
    } catch {
      // ネットワークエラー → リトライ
    }

    if (attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  return false
}

/**
 * オフライン保存された写真をサーバーへアップロードする。
 * 各写真を FormData で POST し、成功したら IndexedDB から削除。
 * Exponential backoff リトライ（最大3回）。
 *
 * @returns synced: 成功件数, failed: 失敗件数
 */
export async function syncOfflinePhotos(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  const photos = await getAllOfflinePhotos()
  const total = photos.length
  let synced = 0
  let failed = 0

  for (const photo of photos) {
    const success = await uploadPhotoWithRetry(
      `/api/dispatches/${photo.dispatchId}/photos`,
      photo.blob,
    )
    if (success) {
      await deletePhoto(photo.id)
      synced++
    } else {
      failed++
    }
    onProgress?.(synced, total)
  }

  if (synced > 0) {
    await setSyncMeta('lastSync', Date.now())
  }

  return { synced, failed }
}

/**
 * FormData で写真をアップロード（exponential backoff リトライ）
 */
async function uploadPhotoWithRetry(
  endpoint: string,
  blob: Blob,
  maxRetries = 3,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const formData = new FormData()
      formData.append('file', blob, `photo-${Date.now()}.jpg`)

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) return true
      // 4xx はリトライしても意味がない（409 Conflict 除く）
      if (res.status >= 400 && res.status < 500 && res.status !== 409) {
        console.error(`[sync] POST ${endpoint} failed with ${res.status}, skipping`)
        return false
      }
    } catch {
      // ネットワークエラー → リトライ
    }

    if (attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  return false
}

/**
 * 現在の pending 件数を取得
 */
export async function getPendingCount(): Promise<number> {
  return getPendingActionCount()
}

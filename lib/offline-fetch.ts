import { addPendingAction, type PendingAction } from './offline-db'

/**
 * fetch のドロップイン代替。
 * オンライン時: 通常の fetch を実行
 * オフライン時 or ネットワークエラー時: IndexedDB にキューイングして楽観的レスポンスを返す
 *
 * GET リクエストはキューイングせず通常の fetch をそのまま実行。
 */
export async function offlineFetch(
  input: string,
  init?: RequestInit & {
    /** IndexedDB に保存するアクションタイプ */
    offlineActionType?: PendingAction['type']
    /** 関連する dispatchId */
    offlineDispatchId?: string | null
    /** キューイング後に返す楽観的レスポンスデータ */
    offlineOptimisticData?: Record<string, unknown>
  },
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()

  // GET はキューイングしない
  if (method === 'GET') {
    return fetch(input, init)
  }

  const isOnline = typeof navigator !== 'undefined' && navigator.onLine

  if (isOnline) {
    try {
      const res = await fetch(input, init)
      if (res.ok) return res

      // SW フォールバックによる 503 のみ実ネット断としてキューイング経路に入る。
      // 通常の 5xx（サーバ側エラー）はそのまま呼び出し元に返し、エラー処理させる。
      // 判定は `X-SW-Offline: 1` カスタムヘッダで行う（body を読むと
      // ストリーム消費の副作用があるため、ヘッダ方式に統一）。
      const isSwOffline = res.headers.get('X-SW-Offline') === '1'
      if (isSwOffline && init?.offlineActionType) {
        await queueFromInit(input, init)
        return createOptimisticResponse(init?.offlineOptimisticData)
      }
      return res
    } catch {
      // ネットワークエラー → キューイング
      if (init?.offlineActionType) {
        await queueFromInit(input, init)
        return createOptimisticResponse(init?.offlineOptimisticData)
      }
      throw new Error('Network error and no offline handler configured')
    }
  }

  // オフライン → キューイング
  if (init?.offlineActionType) {
    await queueFromInit(input, init)
    return createOptimisticResponse(init?.offlineOptimisticData)
  }

  throw new Error('Offline and no offline handler configured')
}

async function queueFromInit(
  endpoint: string,
  init: RequestInit & {
    offlineActionType?: PendingAction['type']
    offlineDispatchId?: string | null
  },
) {
  const body = init.body ? JSON.parse(init.body as string) : {}
  await addPendingAction({
    type: init.offlineActionType!,
    dispatchId: init.offlineDispatchId ?? null,
    timestamp: Date.now(),
    data: body,
    endpoint,
    method: (init.method?.toUpperCase() ?? 'POST') as 'POST' | 'PATCH',
  })
}

function createOptimisticResponse(data?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify(data ?? { ok: true, queued: true }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

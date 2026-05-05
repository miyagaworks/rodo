/// <reference lib="webworker" />

const CACHE_NAME = 'rodo-v7'
const STATIC_CACHE = 'rodo-static-v7'
const IMAGE_CACHE = 'rodo-images-v7'

// 静的アセット（Cache First）
// 注意: '/' は動的ページ（セッション依存）なのでプリキャッシュしない
const STATIC_ASSETS = [
  '/manifest.json',
  '/rodo-logo.svg',
  '/rodo-login-logo.svg',
  '/rodo-square-logo.svg',
]

// install: 静的アセットをプリキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// activate: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== IMAGE_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// fetch: リクエストタイプに応じたキャッシュ戦略
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // http/https 以外（chrome-extension:// 等）はキャッシュ不可なのでスキップ
  if (!url.protocol.startsWith('http')) return

  // 外部ドメインのリクエストはSWで処理しない（CSP競合・キャッシュ汚染の防止）
  if (url.origin !== self.location.origin) return

  // 作業確認書の公開ページ・公開API → SW 介入なし
  // （認証不要・PWAキャッシュ不要）
  if (url.pathname.startsWith('/c/') || url.pathname.startsWith('/api/c/')) return

  // /api/health は SW のフォールバックを通さず素のネットワーク fetch を透過させる。
  // useOnlineStatus.probeHealth が真のネット断を確実に検出できるよう、
  // ネット失敗時はブラウザに reject させる必要がある（503 を返してはいけない）。
  if (url.pathname === '/api/health') return

  // POST/PATCH はキャッシュしない
  if (request.method !== 'GET') return

  // ページナビゲーション（HTML）→ Network Only（キャッシュしない）
  // 動的ページはセッション・DBデータに依存するためキャッシュすると古い状態が表示される
  if (request.mode === 'navigate') {
    event.respondWith(networkOnly(request))
    return
  }

  // API リクエスト → Network Only（動的データはキャッシュしない）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request))
    return
  }

  // 画像 → Cache First
  if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE))
    return
  }

  // 静的アセット（JS/CSS/フォント）→ Network First
  // Next.js のビルドハッシュ付きアセットは URL が変わるため Cache First でも安全だが、
  // 開発中のキャッシュ不整合（Hydration mismatch）を防ぐため Network First にする
  if (isStaticAsset(url)) {
    event.respondWith(networkFirst(request))
    return
  }

  // その他 → Network First
  event.respondWith(networkFirst(request))
})

// --- キャッシュ戦略 ---

async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch {
    // オフライン時のフォールバック。
    // SW 由来のオフライン応答であることを `X-SW-Offline: 1` ヘッダで示し、
    // クライアント側（lib/offline-fetch.ts, hooks/useOnlineStatus.ts）が
    // 実サーバーの 5xx と区別できるようにする。
    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>オフラインです。ネットワーク接続を確認してください。</p></body></html>',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-SW-Offline': '1',
          },
        }
      )
    }
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'offline', message: 'オフラインです' }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-SW-Offline': '1',
          },
        }
      )
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'X-SW-Offline': '1' },
    })
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // API のオフラインフォールバック。
    // SW 由来であることを `X-SW-Offline: 1` ヘッダで示す（networkOnly と一貫させる）。
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'offline', message: 'オフラインです' }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-SW-Offline': '1',
          },
        }
      )
    }
    const fallback = await caches.match('/')
    return (
      fallback ||
      new Response('Offline', {
        status: 503,
        headers: { 'X-SW-Offline': '1' },
      })
    )
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

// --- ヘルパー ---

function isImageRequest(request) {
  const accept = request.headers.get('Accept') || ''
  const url = new URL(request.url)
  return (
    accept.includes('image/') ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname) ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/logos/')
  )
}

function isStaticAsset(url) {
  return (
    /\.(js|css|woff2?|ttf|eot)$/i.test(url.pathname) ||
    url.pathname.startsWith('/_next/static/')
  )
}

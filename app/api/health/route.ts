import { NextResponse } from 'next/server'

/**
 * ヘルスチェック用エンドポイント。
 *
 * 用途:
 *   useOnlineStatus フックのハートビートから 30 秒ごと、
 *   および visibilitychange でタブ復帰時に呼ばれる。
 *   ネット接続性検出のためだけに存在し、DB アクセス等は行わない。
 *
 * レスポンス:
 *   200 OK + JSON `{ ok: true }`
 *
 * 認証:
 *   ルート単体としては認証不要だが、proxy.ts の認証ゲートに従い
 *   未認証アクセスでは 401 が返る。フック側は「fetch が resolve した時点で
 *   ネット接続あり」と判定するため、HTTP ステータスを問わず online 扱いとなる。
 */
export async function GET() {
  return NextResponse.json({ ok: true })
}

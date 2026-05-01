import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// #7 修正: 静的ファイル判定をホワイトリスト方式に厳密化
const PUBLIC_FILE_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|map|json|txt|xml|webmanifest)$/

// #6 修正: 認証不要なAPIルートをホワイトリストで明示
// /api/health: useOnlineStatus.probeHealth から疎通確認用に呼ばれる純粋なヘルスチェック。
// SW フォールバック 503 と区別するため、サーバ側は無条件で 200 を返す必要がある。
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/c', '/api/health']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isLoginPage = pathname === '/login'

  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/logos') ||
    PUBLIC_FILE_EXTENSIONS.test(pathname)

  const isPublicApiRoute = PUBLIC_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )

  if (isPublicAsset || isPublicApiRoute) return NextResponse.next()

  // 作業確認書の公開ページ（認証不要）
  if (pathname.startsWith('/c/')) return NextResponse.next()

  // 認証が必要なAPIルート: 未認証なら401
  if (pathname.startsWith('/api')) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

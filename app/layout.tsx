import type { Metadata } from 'next'
import Script from 'next/script'
import { Metrophobic } from 'next/font/google'
import localFont from 'next/font/local'
import OfflineProvider from '@/components/OfflineProvider'
import './globals.css'

// ODO メーター数字表示用フォント（Google Fonts: Metrophobic）
// CSS 変数 --font-metrophobic として OdoDialInput 等で利用
const metrophobic = Metrophobic({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-metrophobic',
  display: 'swap',
})

// デフォルトフォント: LINE Seed JP
const lineSeedJP = localFont({
  src: [
    { path: '../fonts/LINESeedJP_OTF_Th.woff2', weight: '100' },
    { path: '../fonts/LINESeedJP_OTF_Rg.woff2', weight: '400' },
    { path: '../fonts/LINESeedJP_OTF_Bd.woff2', weight: '700' },
    { path: '../fonts/LINESeedJP_OTF_Eb.woff2', weight: '800' },
  ],
  variable: '--font-line-seed-jp',
  display: 'swap',
  // LINE Seed JP のベースライン位置を補正（テキスト中央配置の上付き対策）
  // 値を 100% より大きくすると文字が下方向に移動する
  // 105% は控えめな初期値、実機確認後に 108 / 110 / 112% で微調整想定
  declarations: [
    { prop: 'ascent-override', value: '125%' },
  ],
})

export const metadata: Metadata = {
  title: 'RODO',
  description: 'ロードサービス専用アプリ',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${lineSeedJP.variable} ${metrophobic.variable}`}>
      <head>
        <meta name="theme-color" content="#1C2948" />
        <link rel="stylesheet" href="https://static.bizdeli.net/style.css" />
      </head>
      <body>
        <OfflineProvider>{children}</OfflineProvider>
        <Script
          src={`https://static.bizdeli.net/bizdeli.umd.js?apikey=${process.env.NEXT_PUBLIC_BIZDELI_API_KEY}`}
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}

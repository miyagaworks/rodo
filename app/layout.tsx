import type { Metadata } from 'next'
import Script from 'next/script'
import { Metrophobic } from 'next/font/google'
import OfflineProvider from '@/components/OfflineProvider'
import './globals.css'

// ODO メーター数字表示用フォント（Google Fonts: Metrophobic）
// CSS 変数 --font-metrophobic として全体で利用可能
const metrophobic = Metrophobic({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-metrophobic',
  display: 'swap',
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
    <html lang="ja" suppressHydrationWarning className={metrophobic.variable}>
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

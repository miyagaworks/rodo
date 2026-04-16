import type { Metadata } from 'next'
import Script from 'next/script'
import OfflineProvider from '@/components/OfflineProvider'
import './globals.css'

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
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1C2948" />
        <link rel="stylesheet" href="https://static.bizdeli.net/style.css" />
      </head>
      <body>
        <OfflineProvider>{children}</OfflineProvider>
        <Script
          src="https://static.bizdeli.net/bizdeli.umd.js?apikey=5cb7f2bb-c8dd-471e-a314-0adb11dbf867"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}

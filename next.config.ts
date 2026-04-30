import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  images: {
    domains: [],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.bizdeli.net`,
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://static.bizdeli.net",
              "connect-src 'self' https://static.bizdeli.net https://app.bizdeli.net https://*.public.blob.vercel-storage.com",
              // P0-15: 署名画像 / 出動写真は Vercel Blob (`*.public.blob.vercel-storage.com`) から配信される。
              // img-src は <img> 表示用、connect-src は ConfirmationClient.tsx:164 の
              // fetch(blobUrl) → DataURL 変換用に必要。
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig

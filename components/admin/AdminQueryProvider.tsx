'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * ADMIN 機能専用の React Query Provider。
 *
 * app/admin/layout.tsx（Server Component）から children をラップする形で使用する。
 * ADMIN でしか React Query を使わないため、ここに閉じ込めてバンドルサイズを抑える。
 */
export default function AdminQueryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // React Query デフォルトのリトライ（3 回）をそのまま使用
            staleTime: 0,
            refetchOnWindowFocus: true,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

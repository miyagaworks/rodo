'use client'

/**
 * 共通フッター
 * ログイン画面から流用。各ページの末尾（出動記録・報告兼請求項目ページを除く）に配置する。
 */
export default function AppFooter() {
  return (
    <p className="text-center pb-4 pt-4 text-xs text-gray-400">
      <span style={{ fontSize: '1.1rem', verticalAlign: '-0.1em' }}>&copy;</span> RODO {new Date().getFullYear()}
    </p>
  )
}

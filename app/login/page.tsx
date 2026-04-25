'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import RodoLogoAnimated from '@/components/RodoLogoAnimated'

export default function LoginPage() {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleGoogleLogin = () => {
    signIn('google', { callbackUrl: '/' })
  }

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between px-6 overflow-x-hidden" style={{ backgroundColor: '#C6D8FF' }}>
      <div />
      <div className="w-full max-w-sm">
        {/* RODOロゴ（アニメーション） */}
        <div className="flex justify-center mb-8">
          <RodoLogoAnimated />
        </div>

        {/* ログインタイトル */}
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: '#1C2948' }}>
          ログイン
        </h1>

        {/* Googleログインボタン */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white rounded-xl py-4 px-6 shadow-md hover:shadow-lg transition-shadow mb-2"
        >
          <img src="/icons/google-logo.svg" alt="Google" className="w-5 h-5" />
          <span className="font-medium text-gray-700">Google でログイン</span>
        </button>
        <p className="text-center text-sm text-gray-500 mb-6">
          推奨：Google アカウントで簡単ログイン
        </p>

        {/* 区切り線 */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-gray-400" />
          <span className="text-gray-500 text-sm">または</span>
          <div className="flex-1 h-px bg-gray-400" />
        </div>

        {/* メール/パスワードログイン（折りたたみ） */}
        <button
          onClick={() => setShowEmailForm(!showEmailForm)}
          className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl mb-2"
          style={{ backgroundColor: '#f1f1f1', border: '1px solid #bdbdbd' }}
        >
          <span className="font-medium" style={{ color: '#1C2948' }}>
            メール / パスワードでログイン
          </span>
          {showEmailForm ? (
            <ChevronUp className="w-5 h-5" style={{ color: '#1C2948' }} />
          ) : (
            <ChevronDown className="w-5 h-5" style={{ color: '#1C2948' }} />
          )}
        </button>

        {showEmailForm && (
          <form onSubmit={handleCredentialsLogin} className="bg-white rounded-xl p-5 mb-4 shadow-md">
            {error && (
              <p className="text-sm mb-3 text-center" style={{ color: '#D3170A' }}>{error}</p>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-medium text-white transition-opacity"
              style={{ backgroundColor: '#1C2948' }}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        )}

      </div>
      <p className="pb-4 text-xs text-gray-400">
        <span style={{ fontSize: '1.5rem', verticalAlign: '-0.2em' }}>&copy;</span> RODO {new Date().getFullYear()}
      </p>
    </div>
  )
}

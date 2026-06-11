import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

const LAST_EMAIL_KEY = 'synctrade_last_email'

export default function Login() {
  const { signIn, signUp, user, loading: authLoading } = useAuth()
  const { t } = useLanguage()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(LAST_EMAIL_KEY)
    if (saved) setEmail(saved)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        localStorage.setItem(LAST_EMAIL_KEY, email)
      } else {
        await signUp(email, password)
        setSuccess(t('login_success'))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  function handleEmailDblClick() {
    const saved = localStorage.getItem(LAST_EMAIL_KEY)
    if (saved) setEmail(saved)
  }

  if (!authLoading && user) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{background:'radial-gradient(circle at 10% 0%,rgba(53,216,194,.18),transparent 46%),radial-gradient(circle at 85% 10%,rgba(109,230,171,.12),transparent 40%),#070b17'}}>
      <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">
        <polyline points="0,400 80,340 160,310 260,270 360,290 460,220 560,160 660,110 760,60 800,40"
          fill="none" stroke="#35d8c2" strokeWidth="3" strokeLinecap="round"/>
        <polyline points="0,450 100,420 200,400 300,370 400,385 500,350 600,310 700,280 800,240"
          fill="none" stroke="#6de6ab" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="/favicon.svg" alt="SyncTrade Pro" className="h-10 w-10 rounded-xl" />
            <h1 className="text-3xl font-bold text-blue-400">SyncTrade Pro</h1>
          </div>
          <p className="text-gray-400">{t('login_subtitle')}</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m === 'login' ? t('login_signin') : t('login_register')}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('login_email')}</label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onDoubleClick={handleEmailDblClick}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('login_password')}</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {loading ? t('login_loading') : mode === 'login' ? t('login_enter') : t('login_create_acc')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          support@synctradepro.io
        </p>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'

type TestStatus = 'idle' | 'sending' | 'ok' | 'error'

interface NotificationSettings {
  webhookToken:    string
  notifyEmail:     string | null
  telegramChatId:  string | null
  notifyOnSignal:  boolean
  notifyOnFill:    boolean
  notifyOnSkip:    boolean
  notifyOnError:   boolean
}

const BOT_USERNAME = 'SyncTrade_Pro_bot'

export default function Settings() {
  const { t } = useLanguage()
  const [form, setForm]   = useState<NotificationSettings>({
    webhookToken: '', notifyEmail: '', telegramChatId: null,
    notifyOnSignal: false, notifyOnFill: true, notifyOnSkip: true, notifyOnError: true,
  })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')
  const [testEmail, setTestEmail] = useState<TestStatus>('idle')
  const [testTg, setTestTg]       = useState<TestStatus>('idle')
  const [testError, setTestError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [notifPerm, setNotifPerm]   = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  )

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => {
    api.get<NotificationSettings>('/api/settings/notifications')
      .then(data => setForm({ ...data, notifyEmail: data.notifyEmail ?? '' }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
    return () => stopPolling()
  }, [])

  function handleConnectTelegram() {
    const deepLink = `https://t.me/${BOT_USERNAME}?start=${form.webhookToken}`
    window.open(deepLink, '_blank')
    setConnecting(true)

    let elapsed = 0
    pollRef.current = setInterval(async () => {
      elapsed += 3
      try {
        const data = await api.get<NotificationSettings>('/api/settings/notifications')
        if (data.telegramChatId) {
          setForm(f => ({ ...f, telegramChatId: data.telegramChatId }))
          setConnecting(false)
          stopPolling()
        }
      } catch { /* ignore network errors in polling */ }
      if (elapsed >= 120) { setConnecting(false); stopPolling() }
    }, 3000)
  }

  async function handleDisconnect() {
    try {
      await api.delete('/api/settings/telegram')
      setForm(f => ({ ...f, telegramChatId: null }))
      setTestTg('idle')
      setTestError('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaved(false); setError('')
    try {
      const updated = await api.patch<NotificationSettings>('/api/settings/notifications', {
        notifyEmail:    form.notifyEmail || null,
        notifyOnSignal: form.notifyOnSignal,
        notifyOnFill:   form.notifyOnFill,
        notifyOnSkip:   form.notifyOnSkip,
        notifyOnError:  form.notifyOnError,
      })
      setForm(f => ({ ...f, ...updated }))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function sendTest(channel: 'email' | 'telegram') {
    const setter = channel === 'email' ? setTestEmail : setTestTg
    setter('sending'); setTestError('')
    try {
      if (channel === 'email') {
        await api.patch('/api/settings/notifications', { notifyEmail: form.notifyEmail || null })
      }
      await api.post('/api/settings/test-notification', { channel })
      setter('ok')
      setTimeout(() => setter('idle'), 3000)
    } catch (e: any) {
      setter('error')
      setTestError(e.message ?? t('error'))
      setTimeout(() => setter('idle'), 5000)
    }
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  function toggle(field: keyof NotificationSettings) {
    setForm(f => ({ ...f, [field]: !f[field] }))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">{t('loading')}</div>
  )

  const tgConnected = Boolean(form.telegramChatId)
  const maskedId    = form.telegramChatId
    ? `···${form.telegramChatId.slice(-4)}`
    : ''

  const EVENTS = [
    { field: 'notifyOnFill'   as keyof NotificationSettings, label: t('set_on_fill'),   desc: t('set_on_fill_desc')   },
    { field: 'notifyOnSkip'   as keyof NotificationSettings, label: t('set_on_skip'),   desc: t('set_on_skip_desc')   },
    { field: 'notifyOnError'  as keyof NotificationSettings, label: t('set_on_error'),  desc: t('set_on_error_desc')  },
    { field: 'notifyOnSignal' as keyof NotificationSettings, label: t('set_on_signal'), desc: t('set_on_signal_desc') },
  ]

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-bold text-gray-100 mb-1">{t('set_title')}</h1>
      <p className="text-sm text-gray-400 mb-6">{t('set_subtitle')}</p>

      <form onSubmit={handleSave} className="space-y-6">

        {/* ── Channels ─────────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{t('set_channels')}</h2>

          {/* Email */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('set_email')}</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={form.notifyEmail ?? ''}
                onChange={e => setForm(f => ({ ...f, notifyEmail: e.target.value }))}
                placeholder="tu@email.com"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                disabled={!form.notifyEmail || testEmail === 'sending'}
                onClick={() => sendTest('email')}
                className="px-3 py-2 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-gray-100 hover:border-gray-500 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {testEmail === 'sending' ? '...' : testEmail === 'ok' ? t('set_sent') : testEmail === 'error' ? t('set_test_error') : t('set_test')}
              </button>
            </div>
          </div>

          {/* Telegram */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('set_telegram')}</label>

            {tgConnected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-green-900/30 border border-green-700 rounded-lg px-3 py-2 flex-1">
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-xs text-green-400 font-medium">{t('set_connected')}</span>
                    <span className="text-xs text-gray-500 ml-1">ID {maskedId}</span>
                  </div>
                  <button
                    type="button"
                    disabled={testTg === 'sending'}
                    onClick={() => sendTest('telegram')}
                    className="px-3 py-2 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-gray-100 hover:border-gray-500 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {testTg === 'sending' ? '...' : testTg === 'ok' ? t('set_sent') : testTg === 'error' ? t('set_test_error') : t('set_test')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3 py-2 text-xs rounded-lg border border-red-800 text-red-400 hover:border-red-600 hover:text-red-300 transition-colors whitespace-nowrap"
                  >
                    {t('set_disconnect')}
                  </button>
                </div>
              </div>
            ) : connecting ? (
              <div className="flex items-center gap-3 bg-yellow-900/20 border border-yellow-700 rounded-lg px-3 py-2.5">
                <svg className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-xs text-yellow-300">
                  {t('set_waiting')} {t('set_tg_waiting')} <strong>@{BOT_USERNAME}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => { setConnecting(false); stopPolling() }}
                  className="ml-auto text-xs text-gray-500 hover:text-gray-300"
                >
                  {t('set_cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectTelegram}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.88 13.47l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.832.95l-.524-.861z"/>
                </svg>
                {t('set_connect_tg')}
              </button>
            )}
          </div>

          {testError && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {testError}
            </p>
          )}
        </div>

        {/* ── Web Notifications ────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{t('set_web_notif')}</h2>
            <p className="text-xs text-gray-500 mt-1">{t('set_web_notif_sub')}</p>
          </div>

          {'Notification' in window ? (
            notifPerm === 'granted' ? (
              <div className="flex items-center gap-2.5 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2.5">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-sm text-green-400 font-medium">{t('set_notif_active')}</span>
                <span className="text-xs text-gray-500 ml-1">{t('set_notif_active_sub')}</span>
              </div>
            ) : notifPerm === 'denied' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2.5">
                  <span className="text-base flex-shrink-0">⛔</span>
                  <span className="text-sm text-red-400 font-medium">{t('set_notif_blocked')}</span>
                </div>
                <p className="text-xs text-gray-500 pl-1">{t('set_notif_blocked_sub')}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={requestNotifPermission}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                <span className="text-base">🔔</span>
                {t('set_activate_notif')}
              </button>
            )
          ) : (
            <p className="text-xs text-gray-500">{t('set_no_support')}</p>
          )}
        </div>

        {/* ── Events ───────────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{t('set_events')}</h2>

          {EVENTS.map(({ field, label, desc }) => (
            <div key={field} className="flex items-start gap-3 cursor-pointer group" onClick={() => toggle(field)}>
              <div className="mt-0.5 flex-shrink-0">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  form[field]
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-600 group-hover:border-gray-400'
                }`}>
                  {form[field] && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-100">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? t('set_saving') : saved ? t('set_saved') : t('set_save_config')}
        </button>
      </form>
    </div>
  )
}

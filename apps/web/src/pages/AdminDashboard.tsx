import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

interface UserAccount {
  id: string
  name: string
  environment: string
  isActive: boolean
}

interface AdminUser {
  id: string
  email: string
  plan: string
  isActive: boolean
  createdAt: string
  accounts?: UserAccount[]
  _count?: { accounts: number }
}

interface AdminMetrics {
  totalUsers: number
  totalSignalsToday: number
  totalOrdersToday: number
  activeAccounts: number
}

const TIMEFRAMES = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', 'Daily', 'Weekly']

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function MetricCard({ label, value, color = 'text-gray-100' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [defaultTF, setDefaultTF] = useState('1h')
  const [savingTF, setSavingTF] = useState(false)
  const [tfSaved, setTfSaved] = useState(false)
  const [manualTTL, setManualTTL] = useState('60')
  const [savingTTL, setSavingTTL] = useState(false)
  const [ttlSaved, setTtlSaved] = useState(false)

  async function fetchAll() {
    setLoading(true)
    setError('')
    try {
      const [m, u, settings] = await Promise.all([
        api.get<AdminMetrics>('/api/admin/metrics'),
        api.get<AdminUser[]>('/api/admin/users'),
        api.get<Record<string, string>>('/api/admin/settings'),
      ])
      setMetrics(m)
      setUsers(u)
      if (settings.defaultTimeframe) setDefaultTF(settings.defaultTimeframe)
      if (settings.manualOrderTTL)   setManualTTL(settings.manualOrderTTL)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function saveDefaultTF() {
    setSavingTF(true)
    try {
      await api.patch('/api/admin/settings', { defaultTimeframe: defaultTF })
      setTfSaved(true)
      setTimeout(() => setTfSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSavingTF(false)
    }
  }

  async function saveManualTTL() {
    const val = Number(manualTTL)
    if (isNaN(val) || val < 10) { setError('TTL mínimo: 10s'); return }
    setSavingTTL(true)
    try {
      await api.patch('/api/admin/settings', { manualOrderTTL: String(val) })
      setTtlSaved(true)
      setTimeout(() => setTtlSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSavingTTL(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  async function toggleUserActive(user: AdminUser) {
    setTogglingId(user.id)
    try {
      const updated = await api.patch<AdminUser>(`/api/admin/users/${user.id}`, {
        isActive: !user.isActive,
      })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: updated.isActive } : u))
      if (drawerUser?.id === user.id) {
        setDrawerUser(d => d ? { ...d, isActive: updated.isActive } : d)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setTogglingId(null)
    }
  }

  async function openDrawer(user: AdminUser) {
    setDrawerUser(user)
    if (!user.accounts) {
      setLoadingDetail(true)
      try {
        const detail = await api.get<AdminUser>(`/api/admin/users/${user.id}`)
        setDrawerUser(detail)
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, accounts: detail.accounts } : u))
      } catch {}
      finally {
        setLoadingDetail(false)
      }
    }
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl p-8 text-center">
        <p className="text-red-300 text-lg font-semibold">{t('admin_access_denied')}</p>
        <p className="text-red-400 text-sm mt-2">{t('admin_access_denied_sub')}</p>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('admin_title')}</h1>
          <p className="text-gray-400 text-sm mt-0.5">{t('admin_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/plans')}
            className="text-sm px-3 py-1.5 rounded-lg border border-purple-700 text-purple-400 hover:bg-purple-900/30 transition-colors"
          >
            {t('admin_plans')}
          </button>
          <button
            onClick={fetchAll}
            className="text-gray-400 hover:text-gray-100 text-sm px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            {t('admin_refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={t('admin_total_users')} value={metrics.totalUsers} />
          <MetricCard label={t('admin_signals_today')} value={metrics.totalSignalsToday} color="text-blue-400" />
          <MetricCard label={t('admin_orders_today')} value={metrics.totalOrdersToday} color="text-purple-400" />
          <MetricCard label={t('admin_active_accounts')} value={metrics.activeAccounts} color="text-green-400" />
        </div>
      )}

      {/* Global settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-100 mb-4">{t('admin_global_config')}</h2>

        {/* Default TimeFrame */}
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm text-gray-400 mb-1.5">{t('admin_default_tf')}</label>
            <select
              value={defaultTF}
              onChange={e => setDefaultTF(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
            >
              {TIMEFRAMES.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('admin_tf_hint')}</p>
          </div>
          <button
            onClick={saveDefaultTF}
            disabled={savingTF}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors mb-5"
          >
            {tfSaved ? t('admin_saved') : savingTF ? t('saving') : t('save')}
          </button>
        </div>

        {/* Manual Order TTL */}
        <div className="flex items-end gap-4 mt-4 pt-4 border-t border-gray-800">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm text-gray-400 mb-1.5">{t('admin_manual_ttl')}</label>
            <input
              type="number"
              value={manualTTL}
              onChange={e => setManualTTL(e.target.value)}
              min="10"
              max="600"
              step="5"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">{t('admin_ttl_hint')}</p>
          </div>
          <button
            onClick={saveManualTTL}
            disabled={savingTTL}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors mb-5"
          >
            {ttlSaved ? t('admin_saved') : savingTTL ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-100">{t('admin_users')} ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-right px-4 py-3 font-medium">{t('accounts')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('admin_registered')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('status')}</th>
                <th className="text-center px-4 py-3 font-medium">{t('active')}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">
                    {t('admin_no_users')}
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr
                    key={user.id}
                    onClick={() => openDrawer(user)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-100">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-indigo-900 text-indigo-300 capitalize">
                        {user.plan ?? 'free'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {user._count?.accounts ?? user.accounts?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {user.isActive ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-300">{t('active')}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-300">{t('admin_suspended')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleUserActive(user)}
                        disabled={togglingId === user.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                          user.isActive ? 'bg-blue-600' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            user.isActive ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User detail drawer */}
      {drawerUser && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setDrawerUser(null)} />
          <div className="w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">{t('admin_user_detail')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{drawerUser.email}</p>
              </div>
              <button
                onClick={() => setDrawerUser(null)}
                className="text-gray-400 hover:text-gray-100 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-6">
              {/* User info */}
              <div className="bg-gray-800 rounded-lg p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">ID:</span>
                  <span className="text-gray-300 font-mono text-xs">{drawerUser.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Email:</span>
                  <span className="text-gray-200">{drawerUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Plan:</span>
                  <span className="text-gray-200 capitalize">{drawerUser.plan ?? 'free'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('admin_registered')}:</span>
                  <span className="text-gray-200">
                    {new Date(drawerUser.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">{t('status')}:</span>
                  <div className="flex items-center gap-2">
                    {drawerUser.isActive ? (
                      <span className="text-green-400 text-xs">{t('active')}</span>
                    ) : (
                      <span className="text-red-400 text-xs">{t('admin_suspended')}</span>
                    )}
                    <button
                      onClick={() => toggleUserActive(drawerUser)}
                      disabled={togglingId === drawerUser.id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                        drawerUser.isActive ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          drawerUser.isActive ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Accounts */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  {t('accounts')} ({drawerUser.accounts?.length ?? drawerUser._count?.accounts ?? 0})
                </h3>
                {loadingDetail ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !drawerUser.accounts || drawerUser.accounts.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    {t('admin_no_accs')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {drawerUser.accounts.map(account => (
                      <div
                        key={account.id}
                        className="bg-gray-800 rounded-lg p-3 flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="text-gray-200 font-medium">{account.name}</p>
                          <p className="text-gray-500 text-xs capitalize">{account.environment}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {account.isActive ? (
                            <span className="text-xs text-green-400">{t('status_active')}</span>
                          ) : (
                            <span className="text-xs text-gray-500">{t('status_inactive')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

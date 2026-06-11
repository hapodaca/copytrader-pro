import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import {
  IcoDashboard, IcoManual, IcoSignals, IcoOrders, IcoReports,
  IcoGroups, IcoAccounts, IcoRules, IcoWebhook, IcoBell,
  IcoPlans, IcoAdmin, IcoKey, IcoLogout,
  IcoChevronLeft, IcoChevronRight,
} from './icons'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const linkBase = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150'
const linkActive = 'bg-blue-600/15 text-blue-300 ring-1 ring-blue-500/20'
const linkInactive = 'text-gray-400 hover:bg-white/5 hover:text-gray-100'

export default function Sidebar({ className = '', onNavigate, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { profile, signOut, user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdOk, setPwdOk] = useState(false)
  const [saving, setSaving] = useState(false)

  const mainItems = useMemo(() => [
    { to: '/',        label: t('nav_dashboard'), Icon: IcoDashboard },
    { to: '/manual',  label: t('nav_manual'),    Icon: IcoManual    },
    { to: '/signals', label: t('nav_signals'),   Icon: IcoSignals   },
    { to: '/orders',  label: t('nav_orders'),    Icon: IcoOrders    },
    { to: '/reports', label: t('nav_reports'),   Icon: IcoReports   },
  ], [t])

  const settingsItems = useMemo(() => [
    { to: '/groups',   label: t('nav_groups'),        Icon: IcoGroups   },
    { to: '/accounts', label: t('nav_accounts'),      Icon: IcoAccounts },
    { to: '/rules',    label: t('nav_rules'),         Icon: IcoRules    },
    { to: '/webhook',  label: t('nav_webhook'),       Icon: IcoWebhook  },
    { to: '/settings', label: t('nav_notifications'), Icon: IcoBell     },
    { to: '/plans',    label: t('nav_plans'),         Icon: IcoPlans    },
  ], [t])

  async function handleSignOut() {
    await signOut()
    onNavigate?.()
    navigate('/login')
  }

  function openPwd() {
    setPwd(''); setPwd2(''); setPwdError(''); setPwdOk(false)
    setShowPwdModal(true)
  }

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault()
    if (pwd.length < 8)  { setPwdError(t('pwd_min_chars')); return }
    if (pwd !== pwd2)    { setPwdError(t('pwd_no_match')); return }
    setSaving(true); setPwdError('')
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)
    if (error) { setPwdError(error.message) }
    else { setPwdOk(true); setTimeout(() => setShowPwdModal(false), 1500) }
  }

  // User initials avatar
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'ST'

  return (
    <>
      <aside
        className={`flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden ${className}`}
        style={{ width: collapsed ? '4rem' : '15rem', transition: 'width 0.2s ease' }}
      >
        {/* Logo */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-0.5 px-0 py-3 border-b border-gray-800">
            <img src="/favicon.svg" alt="SyncTrade Pro" className="h-7 w-7 rounded-md" />
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="mt-0.5 p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                title={t('nav_dashboard')}
              >
                <IcoChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-800">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-md flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight tracking-tight">SyncTrade</p>
              <p className="text-xs font-semibold text-blue-400 leading-tight">Pro</p>
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors flex-shrink-0"
                title="Colapsar menú"
              >
                <IcoChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? 'px-1' : 'px-2'}`}>

          {mainItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } ${isActive ? linkActive : linkInactive}`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}

          {/* Divider */}
          {collapsed ? (
            <div className="my-2 mx-1 border-t border-gray-800" />
          ) : (
            <div className="pt-4 pb-1.5">
              <p className="px-3 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
                {t('nav_config')}
              </p>
            </div>
          )}

          {settingsItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } ${isActive ? linkActive : linkInactive}`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}

          {profile?.role === 'admin' && (
            <NavLink
              to="/admin"
              onClick={onNavigate}
              title={collapsed ? t('nav_admin') : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                } ${isActive
                  ? 'bg-purple-600/15 text-purple-300 ring-1 ring-purple-500/20'
                  : 'text-purple-400 hover:bg-white/5 hover:text-purple-300'
                }`
              }
            >
              <IcoAdmin className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>{t('nav_admin')}</span>}
            </NavLink>
          )}
        </nav>

        {/* User footer */}
        {collapsed ? (
          <div className="py-3 border-t border-gray-800 flex flex-col items-center gap-1">
            <div
              className="h-7 w-7 rounded-full bg-blue-700/50 border border-blue-600/40 flex items-center justify-center"
              title={user?.email}
            >
              <span className="text-[10px] font-bold text-blue-200">{initials}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg text-gray-500 hover:bg-red-900/20 hover:text-red-400 transition-all"
              title={t('nav_logout')}
            >
              <IcoLogout className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="px-2 py-3 border-t border-gray-800 space-y-0.5">
            <div className="flex items-center gap-2.5 px-3 py-2">
              <div className="h-7 w-7 rounded-full bg-blue-700/50 border border-blue-600/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-blue-200">{initials}</span>
              </div>
              <p className="text-xs text-gray-400 truncate min-w-0">{user?.email}</p>
            </div>

            <button
              onClick={openPwd}
              className={`w-full ${linkBase} ${linkInactive}`}
            >
              <IcoKey className="h-4 w-4 flex-shrink-0" />
              <span>{t('nav_change_pwd')}</span>
            </button>

            <button
              onClick={handleSignOut}
              className={`w-full ${linkBase} text-gray-400 hover:bg-red-900/20 hover:text-red-400`}
            >
              <IcoLogout className="h-4 w-4 flex-shrink-0" />
              <span>{t('nav_logout')}</span>
            </button>
          </div>
        )}
      </aside>

      {/* Change Password Modal */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-100">{t('pwd_title')}</h2>
              <button onClick={() => setShowPwdModal(false)}
                className="text-gray-400 hover:text-gray-100 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleChangePwd} className="p-5 space-y-4">
              {pwdOk ? (
                <p className="text-green-400 text-sm text-center py-2">{t('pwd_updated')}</p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{t('pwd_new')}</label>
                    <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
                      required minLength={8} autoFocus
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                      placeholder={t('pwd_new_placeholder')} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{t('pwd_confirm')}</label>
                    <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)}
                      required
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                      placeholder={t('pwd_confirm_placeholder')} />
                  </div>
                  {pwdError && <p className="text-red-400 text-xs">{pwdError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                      {saving ? t('pwd_saving') : t('pwd_update')}
                    </button>
                    <button type="button" onClick={() => setShowPwdModal(false)}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors">
                      {t('cancel')}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}

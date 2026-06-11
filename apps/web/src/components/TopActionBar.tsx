import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import {
  IcoBars, IcoClock,
  IcoDashboard, IcoManual, IcoSignals, IcoOrders, IcoReports,
  IcoBell, IcoGroups, IcoAccounts, IcoRules, IcoWebhook,
  IcoPlans, IcoAdmin,
} from './icons'

type HealthResponse = {
  status: 'ok' | 'degraded'
  db: 'connected' | 'error'
  timestamp: string
}

type SignalsResponse = {
  signals: Array<{ id: string; symbol: string; action: string; createdAt: string }>
}

interface TopActionBarProps {
  onOpenMenu?: () => void
}

type IconComponent = React.ComponentType<{ className?: string }>

interface SectionMeta {
  title: string
  subtitle: string
  Icon: IconComponent
}

function getSectionMeta(
  pathname: string,
  t: (k: string) => string
): SectionMeta {
  if (pathname === '/')                return { title: t('section_dashboard_title'), subtitle: t('section_dashboard_sub'),  Icon: IcoDashboard }
  if (pathname.startsWith('/signals')) return { title: t('section_signals_title'),  subtitle: t('section_signals_sub'),   Icon: IcoSignals   }
  if (pathname.startsWith('/orders'))  return { title: t('section_orders_title'),   subtitle: t('section_orders_sub'),    Icon: IcoOrders    }
  if (pathname.startsWith('/manual'))  return { title: t('section_manual_title'),   subtitle: t('section_manual_sub'),    Icon: IcoManual    }
  if (pathname.startsWith('/reports')) return { title: t('section_reports_title'),  subtitle: t('section_reports_sub'),   Icon: IcoReports   }
  if (pathname.startsWith('/settings'))return { title: t('section_settings_title'), subtitle: t('section_settings_sub'),  Icon: IcoBell      }
  if (pathname.startsWith('/groups'))  return { title: t('section_groups_title'),   subtitle: t('section_groups_sub'),    Icon: IcoGroups    }
  if (pathname.startsWith('/accounts'))return { title: t('section_accounts_title'), subtitle: t('section_accounts_sub'),  Icon: IcoAccounts  }
  if (pathname.startsWith('/rules'))   return { title: t('section_rules_title'),    subtitle: t('section_rules_sub'),     Icon: IcoRules     }
  if (pathname.startsWith('/webhook')) return { title: t('section_webhook_title'),  subtitle: t('section_webhook_sub'),   Icon: IcoWebhook   }
  if (pathname.startsWith('/plans'))   return { title: t('section_plans_title'),    subtitle: t('section_plans_sub'),     Icon: IcoPlans     }
  if (pathname.startsWith('/admin'))   return { title: t('section_admin_title'),    subtitle: t('section_admin_sub'),     Icon: IcoAdmin     }
  return { title: 'SyncTrade Pro', subtitle: t('section_dashboard_sub'), Icon: IcoDashboard }
}

function formatRelative(dateISO: string | null): string {
  if (!dateISO) return 'sin actividad'
  const date = new Date(dateISO)
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSec < 60)        return `hace ${diffSec}s`
  if (diffSec < 3600)      return `hace ${Math.floor(diffSec / 60)}m`
  if (diffSec < 48 * 3600) return `hace ${Math.floor(diffSec / 3600)}h`
  // Más de 48h: "hace 2051h" es ilegible — mostrar la fecha
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function useCTTime() {
  const [ct, setCT] = useState('')
  useEffect(() => {
    const tick = () => setCT(new Date().toLocaleTimeString('es-MX', {
      timeZone: 'America/Chicago',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return ct
}

export default function TopActionBar({ onOpenMenu }: TopActionBarProps) {
  const location = useLocation()
  const ctTime = useCTTime()
  const { lang, setLang, t } = useLanguage()

  const [health, setHealth] = useState<'checking' | 'ok' | 'degraded' | 'down'>('checking')
  const [lastSignal, setLastSignal] = useState<{ symbol: string; action: string; createdAt: string } | null>(null)

  async function probe() {
    try {
      const [healthRes, signalRes] = await Promise.all([
        api.get<HealthResponse>('/api/health'),
        api.get<SignalsResponse>('/api/signals?limit=1'),
      ])
      setHealth(healthRes.status === 'ok' && healthRes.db === 'connected' ? 'ok' : 'degraded')
      const latest = signalRes.signals?.[0]
      setLastSignal(latest ? { symbol: latest.symbol, action: latest.action, createdAt: latest.createdAt } : null)
    } catch {
      setHealth('down')
    }
  }

  useEffect(() => {
    probe()
    const timer = setInterval(probe, 30000)
    return () => clearInterval(timer)
  }, [])

  const meta = useMemo(
    () => getSectionMeta(location.pathname, t as (k: string) => string),
    [location.pathname, t]
  )

  const healthCfg = {
    ok:       { label: t('health_ok'),       cls: 'bg-green-900/40  text-green-300  border-green-700/50'  },
    degraded: { label: t('health_degraded'), cls: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' },
    down:     { label: t('health_down'),     cls: 'bg-red-900/40    text-red-300    border-red-700/50'     },
    checking: { label: t('health_checking'), cls: 'bg-gray-800      text-gray-400   border-gray-700'       },
  }[health]

  return (
    <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-950/80">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">

        {/* Left — hamburger + page title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenMenu}
            className="flex-shrink-0 rounded-lg border border-gray-700 p-1.5 text-gray-400 transition-colors hover:border-gray-500 hover:text-white lg:hidden"
            aria-label="Abrir menú"
          >
            <IcoBars className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-base font-semibold text-white sm:text-lg leading-tight">
              <meta.Icon className="h-5 w-5 flex-shrink-0 text-gray-400" />
              {meta.title}
            </h1>
            <p className="hidden truncate text-xs text-gray-500 sm:block">{meta.subtitle}</p>
          </div>
        </div>

        {/* Right — language toggle + status + last signal + CT time */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">

          {/* CT Clock */}
          <div className="hidden items-center gap-1.5 md:flex">
            <IcoClock className="h-3.5 w-3.5 text-gray-500" />
            <span className="font-mono text-xs text-gray-500" title="Hora CT (Chicago)">{ctTime} CT</span>
          </div>

          {/* Last signal — single clean line */}
          {lastSignal && (
            <div className="hidden items-center gap-1.5 md:flex">
              <div className="h-3.5 w-px bg-gray-700" />
              <span className="text-[11px] text-gray-500 whitespace-nowrap">{t('last_signal_label')}</span>
              <span className={`text-xs font-mono font-semibold whitespace-nowrap ${
                lastSignal.action === 'BUY' || lastSignal.action === 'CLOSE_SHORT'
                  ? 'text-green-400' : 'text-red-400'
              }`}>
                {lastSignal.action.replace('_', ' ')} {lastSignal.symbol}
              </span>
              <span className="text-[11px] text-gray-500 whitespace-nowrap">
                · {formatRelative(lastSignal.createdAt)}
              </span>
            </div>
          )}

          {/* Language toggle */}
          <div className="hidden items-center sm:flex">
            <div className="flex overflow-hidden rounded-lg border border-gray-700">
              {(['es', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                    lang === l
                      ? 'bg-blue-600/30 text-blue-300'
                      : 'bg-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Health badge */}
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${healthCfg.cls}`}>
            <span className="hidden sm:inline">{healthCfg.label}</span>
            <span className="sm:hidden">{health === 'ok' ? '●' : health === 'degraded' ? '●' : '●'}</span>
          </span>
        </div>
      </div>

      {/* Mobile: last signal row */}
      {lastSignal && (
        <div className="flex items-center justify-between border-t border-gray-800/50 px-4 pb-2 pt-1 md:hidden">
          <div className="flex items-center gap-1.5">
            <IcoClock className="h-3 w-3 text-gray-600" />
            <span className="font-mono text-[10px] text-gray-600">{ctTime} CT</span>
          </div>
          <p className="text-[10px] text-gray-500 font-mono">
            {t('last_signal_label')}: {lastSignal.action} {lastSignal.symbol} · {formatRelative(lastSignal.createdAt)}
          </p>
        </div>
      )}
    </header>
  )
}

import { NavLink } from 'react-router-dom'
import { IcoDashboard, IcoSignals, IcoOrders, IcoManual, IcoCog } from './icons'
import { useLanguage } from '../contexts/LanguageContext'

export default function BottomNav() {
  const { t } = useLanguage()

  const items = [
    { to: '/',        label: t('nav_dashboard'), Icon: IcoDashboard, end: true  },
    { to: '/signals', label: t('nav_signals'),   Icon: IcoSignals,   end: false },
    { to: '/manual',  label: t('nav_manual'),    Icon: IcoManual,    end: false },
    { to: '/orders',  label: t('nav_orders'),    Icon: IcoOrders,    end: false },
    { to: '/groups',  label: t('nav_config'),    Icon: IcoCog,       end: false },
  ]

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden border-t border-gray-800 bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-900/90">
      <div className="flex h-14 items-stretch">
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`rounded-lg p-1 transition-colors ${isActive ? 'bg-blue-600/15' : ''}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-bottom bg-gray-900/95" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}

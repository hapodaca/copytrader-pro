import { useLanguage } from '../contexts/LanguageContext'

export default function Plans() {
  const { t } = useLanguage()

  const plans = [
    {
      name: 'Free',
      price: '$0',
      periodKey: 'plans_period_always' as const,
      color: 'border-gray-700',
      badge: 'bg-gray-800 text-gray-300',
      features: [
        '1 cuenta broker',
        '1 copy group',
        'Señales via webhook (TradingView)',
        'Paper trading ilimitado',
        'Notificaciones email',
      ],
      ctaKey: 'plans_current' as const,
      ctaStyle: 'bg-gray-700 text-gray-400 cursor-default',
      disabled: true,
    },
    {
      name: 'Standard',
      price: '$20',
      periodKey: 'plans_period_month' as const,
      color: 'border-teal-600',
      badge: 'bg-teal-700 text-white',
      features: [
        'Señales TradingView',
        '5 cuentas broker',
        '3 copy groups',
        'Tradovate',
        'Reglas de riesgo',
        'Notificaciones email',
      ],
      ctaKey: null as null,
      ctaLabel: 'Standard',
      ctaStyle: 'bg-teal-600 hover:bg-teal-700 text-white',
      disabled: false,
    },
    {
      name: 'Pro',
      price: '$49',
      periodKey: 'plans_period_month' as const,
      color: 'border-blue-600 ring-1 ring-blue-600',
      badge: 'bg-blue-600 text-white',
      highlight: true,
      features: [
        'Señales TradingView',
        '10 cuentas broker',
        'Copy groups ilimitados',
        'Tradovate',
        'Reglas de riesgo avanzadas',
        'Notificaciones email + Telegram',
      ],
      ctaKey: null as null,
      ctaLabel: 'Pro',
      ctaStyle: 'bg-blue-600 hover:bg-blue-700 text-white',
      disabled: false,
    },
    {
      name: 'Pro+',
      price: '$99',
      periodKey: 'plans_period_month' as const,
      color: 'border-purple-600',
      badge: 'bg-purple-700 text-white',
      features: [
        'Todo lo de Pro',
        'Cuentas ilimitadas',
        'Multi-usuario (hasta 5 traders)',
        'API access',
        'Reportes avanzados',
        'Onboarding personalizado',
      ],
      ctaKey: null as null,
      ctaLabel: 'Pro+',
      ctaStyle: 'bg-purple-700 hover:bg-purple-600 text-white',
      disabled: false,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">{t('plans_title')}</h1>
        <p className="text-gray-400 text-sm mt-0.5">{t('plans_subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`bg-gray-900 border-2 rounded-xl p-6 flex flex-col ${plan.color}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-100">{plan.name}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${plan.badge}`}>
                {plan.name}
              </span>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-100">{plan.price}</span>
              <span className="text-gray-400 text-sm ml-1">/ {t(plan.periodKey)}</span>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              disabled={plan.disabled}
              onClick={() => {
                if (!plan.disabled) {
                  window.open('mailto:support@synctradepro.io?subject=Quiero%20el%20plan%20' + plan.name, '_blank')
                }
              }}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${plan.ctaStyle}`}
            >
              {plan.ctaKey != null ? t(plan.ctaKey) : (plan.ctaLabel ?? plan.name)}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
        <p className="text-gray-400 text-sm">
          {t('plans_contact')}{' '}
          <a
            href="mailto:support@synctradepro.io"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {t('plans_contact_us')}
          </a>
        </p>
      </div>
    </div>
  )
}

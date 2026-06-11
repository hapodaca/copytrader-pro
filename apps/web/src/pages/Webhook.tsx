import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

// ── TradingView alert expiry tracker ─────────────────────────────────────────

const TV_ALERTS_KEY = 'stp_tv_alerts'

interface TvAlert {
  id: string
  name: string
  symbol: string
  expiresAt: string    // 'YYYY-MM-DD'
  notifiedAt?: string  // ISO string — set once after notification is sent
}

function getDaysUntil(dateStr: string): number {
  const exp = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((exp.getTime() - today.getTime()) / 86_400_000)
}

function AlertStatusBadge({ expiresAt }: { expiresAt: string }) {
  const days = getDaysUntil(expiresAt)
  if (days < 0)   return <span className="text-xs font-semibold text-red-400">🔴 Expirada hace {-days}d</span>
  if (days === 0) return <span className="text-xs font-semibold text-red-400 animate-pulse">🔴 Expira HOY</span>
  if (days <= 3)  return <span className="text-xs font-semibold text-orange-400">⚠️ En {days} día(s)</span>
  if (days <= 14) return <span className="text-xs text-yellow-400">⚠️ {days} días</span>
  return <span className="text-xs text-green-400">✅ {days} días</span>
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const PUBLIC_BASE = import.meta.env.VITE_WEBHOOK_PUBLIC_URL || API_BASE

// Example payloads — static, not translated (they are code samples)
const EXAMPLE_STRATEGY = (token: string) => `{
  "token": "${token}",
  "symbol": "{{ticker}}",
  "timeframe": "{{interval}}",
  "action": "{{strategy.order.action}}",
  "price": {{close}},
  "SL": {{strategy.order.stop_loss_level}},
  "TP": {{strategy.order.take_profit_level}},
  "contracts": {{strategy.order.contracts}},
  "strategy": "Mi Estrategia",
  "url": "{{screenshot_url}}"
}`

const EXAMPLE_MANUAL = (token: string) => `{
  "token": "${token}",
  "symbol": "MNQ1!",
  "timeframe": "1h",
  "action": "BUY",
  "price": 21000.50,
  "SL": 20950.00,
  "TP": 21100.00
}`

const EXAMPLE_CLOSE = (token: string) => `{
  "token": "${token}",
  "symbol": "{{ticker}}",
  "action": "CLOSE_LONG",
  "price": {{close}}
}`

function CopyButton({ text, copiedLabel, copyLabel }: { text: string; copiedLabel: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 text-xs px-2.5 py-1 rounded border transition-colors"
      style={copied
        ? { borderColor: '#22c55e', color: '#22c55e' }
        : { borderColor: '#374151', color: '#9ca3af' }
      }
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  )
}

function CodeBlock({ code, label, copiedLabel, copyLabel }: { code: string; label: string; copiedLabel: string; copyLabel: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs text-gray-500">{label}</span>
        <CopyButton text={code} copiedLabel={copiedLabel} copyLabel={copyLabel} />
      </div>
      <pre className="p-4 text-xs text-green-300 font-mono overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  )
}

export default function Webhook() {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [showToken, setShowToken] = useState(false)

  // ── Alert expiry tracker ───────────────────────────────────────────────────
  const [tvAlerts, setTvAlerts] = useState<TvAlert[]>(() => {
    try { return JSON.parse(localStorage.getItem(TV_ALERTS_KEY) ?? '[]') }
    catch { return [] }
  })
  const [newAlertName,   setNewAlertName]   = useState('')
  const [newAlertSymbol, setNewAlertSymbol] = useState('')
  const [newAlertDate,   setNewAlertDate]   = useState('')
  const [newAlertError,  setNewAlertError]  = useState('')
  const [expiryPopup,    setExpiryPopup]    = useState<TvAlert[]>([])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(TV_ALERTS_KEY, JSON.stringify(tvAlerts))
  }, [tvAlerts])

  // Check expiry on mount + every 5 minutes
  useEffect(() => {
    function checkExpiry() {
      const stored = JSON.parse(localStorage.getItem(TV_ALERTS_KEY) ?? '[]') as TvAlert[]
      const newly = stored.filter(a => getDaysUntil(a.expiresAt) <= 0 && !a.notifiedAt)
      if (newly.length === 0) return

      // Show popup
      setExpiryPopup(newly)

      // Send email + Telegram (fire and forget, once per alert)
      newly.forEach(a =>
        api.post('/api/settings/notify-alert-expiry', {
          alertName: a.name,
          symbol:    a.symbol,
          expiresAt: a.expiresAt,
        }).catch(() => {})
      )

      // Mark as notified so we don't repeat
      const now = new Date().toISOString()
      const updated = stored.map(a =>
        newly.some(n => n.id === a.id) ? { ...a, notifiedAt: now } : a
      )
      localStorage.setItem(TV_ALERTS_KEY, JSON.stringify(updated))
      setTvAlerts(updated)
    }

    checkExpiry()
    const interval = setInterval(checkExpiry, 5 * 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addTvAlert() {
    if (!newAlertName.trim()) { setNewAlertError('El nombre es requerido'); return }
    if (!newAlertDate)        { setNewAlertError('La fecha de expiración es requerida'); return }
    setNewAlertError('')
    setTvAlerts(prev => [...prev, {
      id:        crypto.randomUUID(),
      name:      newAlertName.trim(),
      symbol:    newAlertSymbol.trim().toUpperCase(),
      expiresAt: newAlertDate,
    }])
    setNewAlertName('')
    setNewAlertSymbol('')
    setNewAlertDate('')
  }

  const token = profile?.webhookToken ?? '...'
  const webhookUrl = `${PUBLIC_BASE}/api/webhook/${token}`
  const isPublic = PUBLIC_BASE !== API_BASE

  const TV_VARIABLES = [
    { variable: '{{ticker}}',                          desc: 'Símbolo del instrumento (ej: MNQZ4, ESH5, NQ1!)' },
    { variable: '{{interval}}',                        desc: 'Temporalidad del chart (ej: 5, 60, D → 5m, 1h, Daily)' },
    { variable: '{{strategy.order.action}}',           desc: 'Dirección de la señal: "buy" o "sell"' },
    { variable: '{{strategy.order.contracts}}',        desc: 'Número de contratos de la estrategia' },
    { variable: '{{strategy.order.stop_loss_level}}',  desc: 'Nivel de Stop Loss calculado por la estrategia' },
    { variable: '{{strategy.order.take_profit_level}}',desc: 'Nivel de Take Profit calculado por la estrategia' },
    { variable: '{{close}}',                           desc: 'Precio de cierre de la barra actual' },
    { variable: '{{time}}',                            desc: 'Timestamp UNIX de la barra' },
    { variable: '{{screenshot_url}}',                  desc: 'URL del screenshot del gráfico generado por TradingView al disparar la alerta' },
    { variable: '{{exchange}}',                        desc: 'Exchange del instrumento (ej: CME, NYMEX)' },
  ]

  const actions = [
    { value: 'BUY',         color: 'text-green-400', desc: 'Abrir posición larga' },
    { value: 'SELL',        color: 'text-red-400',   desc: 'Abrir posición corta' },
    { value: 'CLOSE_LONG',  color: 'text-blue-400',  desc: 'Cerrar posición larga' },
    { value: 'CLOSE_SHORT', color: 'text-orange-400',desc: 'Cerrar posición corta' },
  ]

  const PAYLOAD_FIELDS = [
    { field: 'token',     type: 'string', req: true,  desc: 'Tu token de autenticación (de la URL)' },
    { field: 'symbol',    type: 'string', req: true,  desc: 'Símbolo del instrumento (ej: MNQZ4)' },
    { field: 'action',    type: 'string', req: true,  desc: 'BUY | SELL | CLOSE_LONG | CLOSE_SHORT' },
    { field: 'price',     type: 'number', req: true,  desc: 'Precio de referencia de la señal' },
    { field: 'contracts', type: 'number', req: false, desc: 'Contratos sugeridos (puede ignorarse si se usa riesgo % de la cuenta)' },
    { field: 'strategy',  type: 'string', req: false, desc: 'Nombre de la estrategia (para registros)' },
    { field: 'timeframe', type: 'string', req: false, desc: 'Temporalidad (ej: 5m, 1h) — se guarda en la bitácora' },
    { field: 'SL',        type: 'number', req: false, desc: 'Precio de Stop Loss de la estrategia' },
    { field: 'TP',        type: 'number', req: false, desc: 'Precio de Take Profit de la estrategia' },
    { field: 'url',       type: 'string', req: false, desc: 'URL del screenshot del gráfico al momento de la señal ({{screenshot_url}} en TV)' },
  ]

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">{t('wh_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('wh_subtitle')}</p>
      </div>

      {/* Webhook URL */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">{t('wh_your_url')}</h2>
          {isPublic
            ? <span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400 border border-green-800">{t('wh_public_badge')}</span>
            : <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-800">{t('wh_local_badge')}</span>
          }
        </div>
        <p className="text-xs text-gray-500">{t('wh_paste_hint')}</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 font-mono text-xs text-blue-300 overflow-x-auto whitespace-nowrap">
            {showToken ? webhookUrl : `${PUBLIC_BASE}/api/webhook/${'•'.repeat(20)}`}
          </div>
          <button
            onClick={() => setShowToken(v => !v)}
            className="flex-shrink-0 text-xs px-2.5 py-2 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
            title={showToken ? 'Ocultar token' : 'Mostrar token'}
          >
            {showToken ? '🙈' : '👁️'}
          </button>
          {showToken && <CopyButton text={webhookUrl} copiedLabel={t('wh_copied')} copyLabel={t('wh_copy')} />}
        </div>
        {showToken && (
          <p className="text-xs text-amber-600">{t('wh_token_warning')}</p>
        )}
        {!isPublic && (
          <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-400">
            <p className="font-semibold mb-1">{t('wh_not_public_title')}</p>
            <p>Configura <code className="text-yellow-300">VITE_WEBHOOK_PUBLIC_URL</code> en tu <code>.env</code> con la URL de Cloudflare Tunnel o tu dominio, y reinicia el servidor web.</p>
          </div>
        )}
      </section>

      {/* Expiry banner — shows above everything if there are expired/expiring alerts */}
      {(() => {
        const expiredCount = tvAlerts.filter(a => getDaysUntil(a.expiresAt) <= 0).length
        const soonCount    = tvAlerts.filter(a => { const d = getDaysUntil(a.expiresAt); return d > 0 && d <= 3 }).length
        if (expiredCount > 0) return (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 flex items-center gap-3 text-sm">
            <span className="text-xl flex-shrink-0">🔴</span>
            <span className="text-red-300">
              <strong>{expiredCount}</strong> alerta{expiredCount > 1 ? 's' : ''} de TradingView ha{expiredCount > 1 ? 'n' : ''} expirado — las señales ya <strong>no se enviarán</strong> hasta que las recrees.
            </span>
          </div>
        )
        if (soonCount > 0) return (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-3 flex items-center gap-3 text-sm">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <span className="text-yellow-300">
              <strong>{soonCount}</strong> alerta{soonCount > 1 ? 's' : ''} de TradingView expira{soonCount > 1 ? 'n' : ''} en menos de 3 días.
            </span>
          </div>
        )
        return null
      })()}

      {/* Alert Expiry Tracker */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              ⏰ Fechas de Expiración de Alertas
              {tvAlerts.filter(a => getDaysUntil(a.expiresAt) <= 0).length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/60 text-red-400 border border-red-800">
                  {tvAlerts.filter(a => getDaysUntil(a.expiresAt) <= 0).length} expirada(s)
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Registra cuándo vencen tus alertas en TradingView. Recibirás popup + email/Telegram el día que expiren.
            </p>
          </div>
        </div>

        {/* Add form */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Registrar alerta</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_160px_auto] gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre / descripción *</label>
              <input
                type="text"
                value={newAlertName}
                onChange={e => { setNewAlertName(e.target.value); setNewAlertError('') }}
                onKeyDown={e => e.key === 'Enter' && addTvAlert()}
                placeholder="Ej: Estrategia MNQ 1h"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Símbolo</label>
              <input
                type="text"
                value={newAlertSymbol}
                onChange={e => setNewAlertSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addTvAlert()}
                placeholder="MNQ1!"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha de expiración *</label>
              <input
                type="date"
                value={newAlertDate}
                onChange={e => { setNewAlertDate(e.target.value); setNewAlertError('') }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={addTvAlert}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              + Guardar
            </button>
          </div>
          {newAlertError && <p className="text-red-400 text-xs">{newAlertError}</p>}
        </div>

        {/* Alerts table */}
        {tvAlerts.length === 0 ? (
          <p className="text-center text-gray-600 text-xs py-3">
            Sin alertas registradas. Agrega una para recibir avisos cuando expiren.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left pb-2 font-medium">Nombre / Descripción</th>
                  <th className="text-left pb-2 font-medium">Símbolo</th>
                  <th className="text-left pb-2 font-medium">Vence</th>
                  <th className="text-left pb-2 font-medium">Estado</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {[...tvAlerts]
                  .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
                  .map(alert => (
                    <tr
                      key={alert.id}
                      className={`border-b border-gray-800/40 ${getDaysUntil(alert.expiresAt) <= 0 ? 'bg-red-900/5' : ''}`}
                    >
                      <td className="py-2 pr-3 text-gray-200 font-medium">{alert.name}</td>
                      <td className="py-2 pr-3 font-mono text-blue-300">
                        {alert.symbol || <span className="text-gray-700">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-400 font-mono whitespace-nowrap">
                        {new Date(alert.expiresAt + 'T00:00:00').toLocaleDateString('es-MX', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        <AlertStatusBadge expiresAt={alert.expiresAt} />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => setTvAlerts(prev => prev.filter(a => a.id !== alert.id))}
                          title="Eliminar"
                          className="text-gray-700 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-600">
          💡 TradingView Essential permite alertas hasta ~2 meses. Premium+ hasta 1 año. Recuerda renovarlas antes de que expiren.
        </p>
      </section>

      {/* How to create alert in TradingView */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_steps_title')}</h2>

        {/* Step 1 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">1</span>
            <span className="text-xs font-semibold text-gray-200">Abre "Create Alert" → pestaña <span className="text-blue-300">Settings</span></span>
          </div>
          <div className="ml-7 bg-gray-950/60 border border-gray-800 rounded-lg p-3 space-y-2 text-xs text-gray-400">
            <div className="flex gap-2">
              <span className="text-gray-600 w-24 flex-shrink-0">Condition</span>
              <span>Selecciona tu indicador <span className="text-gray-200 font-mono">MFB 3EMASTC</span> (o el que uses) → <span className="text-gray-200">Any alert() function call</span></span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-600 w-24 flex-shrink-0">Interval</span>
              <span><span className="text-gray-200">Same as chart</span> — hereda la temporalidad del chart (ej: 1 minute para M1)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-600 w-24 flex-shrink-0">Expiration</span>
              <span>Elige la fecha límite de la alerta (Essential permite hasta ~2 meses)</span>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">2</span>
            <span className="text-xs font-semibold text-gray-200">Pestaña <span className="text-blue-300">Message</span></span>
          </div>
          <div className="ml-7 bg-gray-950/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-400">
            Borra el texto por defecto y pega el <span className="text-gray-200">payload JSON</span> de la sección de abajo. Asegúrate de incluir tu <code className="text-blue-300">token</code>.
          </div>
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">3</span>
            <span className="text-xs font-semibold text-gray-200">Pestaña <span className="text-blue-300">Notifications</span></span>
          </div>
          <div className="ml-7 bg-gray-950/60 border border-gray-800 rounded-lg p-3 space-y-2 text-xs text-gray-400">
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold flex-shrink-0">✓</span>
              <span><span className="text-gray-200 font-semibold">Webhook URL</span> — actívalo y pega tu URL de webhook de arriba <span className="text-red-400">(obligatorio)</span></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600 flex-shrink-0">○</span>
              <span><span className="text-gray-300">Notify in app</span> — push notification en la app móvil (opcional)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600 flex-shrink-0">○</span>
              <span><span className="text-gray-300">Show toast notification</span> — aviso en pantalla (opcional)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600 flex-shrink-0">○</span>
              <span><span className="text-gray-300">Send email</span> — correo por cada señal, puede saturar (opcional)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-600 flex-shrink-0">○</span>
              <span><span className="text-gray-300">Play sound</span> — sonido local en el navegador (opcional)</span>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-900 text-green-300 flex items-center justify-center text-xs font-bold">4</span>
          <span className="text-xs text-gray-400">Clic en <span className="text-white font-semibold">Create</span> — la alerta queda activa y disparará el webhook automáticamente.</span>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_how_title')}</h2>
        <ol className="space-y-2 text-xs text-gray-400">
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">1</span>
            <span>TradingView dispara una alerta y envía el payload JSON a tu webhook URL.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">2</span>
            <span>El sistema valida el <code className="text-blue-300">token</code>, registra la señal y busca todos tus grupos activos.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">3</span>
            <span>Para cada grupo, aplica el modo de distribución y envía la orden a las cuentas follower seleccionadas.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold">4</span>
            <span>Cada follower tiene sus propias reglas de riesgo, horarios y filtros — el sistema las respeta antes de colocar la orden.</span>
          </li>
        </ol>
      </section>

      {/* Payload JSON */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_payload_title')}</h2>
        <p className="text-xs text-gray-500">
          El cuerpo de la alerta debe ser JSON. TradingView reemplaza automáticamente las variables
          <code className="mx-1 text-green-400">{'{{variable}}'}</code> con los valores reales al momento de disparar.
        </p>

        <CodeBlock
          label="Con estrategia automatizada (recomendado)"
          code={EXAMPLE_STRATEGY(showToken ? token : '<tu-token>')}
          copiedLabel={t('wh_copied')}
          copyLabel={t('wh_copy')}
        />
        <CodeBlock
          label="Señal manual / alert simple"
          code={EXAMPLE_MANUAL(showToken ? token : '<tu-token>')}
          copiedLabel={t('wh_copied')}
          copyLabel={t('wh_copy')}
        />
        <CodeBlock
          label="Cerrar posición larga"
          code={EXAMPLE_CLOSE(showToken ? token : '<tu-token>')}
          copiedLabel={t('wh_copied')}
          copyLabel={t('wh_copy')}
        />

        {/* Payload fields */}
        <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-300 mb-3">Campos del payload</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-1.5 font-medium">{t('wh_field')}</th>
                <th className="text-left pb-1.5 font-medium">{t('wh_type')}</th>
                <th className="text-left pb-1.5 font-medium">{t('wh_description')}</th>
              </tr>
            </thead>
            <tbody>
              {PAYLOAD_FIELDS.map(row => (
                <tr key={row.field} className="border-b border-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-blue-300">
                    {row.field}
                    {row.req && <span className="ml-1 text-red-400 text-xs">*</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500 font-mono">{row.type}</td>
                  <td className="py-1.5 text-gray-400">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-600 mt-2">{t('wh_required')}</p>
        </div>
      </section>

      {/* Available actions */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_actions_title')} (<code className="text-blue-300">action</code>)</h2>
        <div className="grid grid-cols-2 gap-2">
          {actions.map(a => (
            <div key={a.value} className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2">
              <p className={`font-mono text-sm font-semibold ${a.color}`}>{a.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          Los valores son case-insensitive: "buy", "BUY" y "Buy" son equivalentes.
        </p>
      </section>

      {/* TradingView dynamic variables */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_tv_vars_title')}</h2>
        <p className="text-xs text-gray-500">
          TradingView reemplaza estas variables en el payload justo antes de enviar la alerta.
          Úsalas dentro del JSON con dobles llaves.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-1.5 font-medium">{t('wh_variable')}</th>
                <th className="text-left pb-1.5 font-medium">{t('wh_description')}</th>
              </tr>
            </thead>
            <tbody>
              {TV_VARIABLES.map(v => (
                <tr key={v.variable} className="border-b border-gray-800/40">
                  <td className="py-1.5 pr-4 font-mono text-green-400 whitespace-nowrap">{v.variable}</td>
                  <td className="py-1.5 text-gray-400">{v.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Setup guide */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">{t('wh_setup_title')}</h2>
        <ol className="space-y-3 text-xs text-gray-400">
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-gray-600 font-mono">01.</span>
            <span>En tu estrategia o indicador, ve a <span className="text-gray-200">Alert</span> (icono de campana) o crea una alerta desde el chart.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-gray-600 font-mono">02.</span>
            <span>En la pestaña <span className="text-gray-200">Notifications</span>, activa <span className="text-gray-200">Webhook URL</span> y pega tu URL de webhook.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-gray-600 font-mono">03.</span>
            <span>En el campo <span className="text-gray-200">Message</span>, pega el payload JSON de arriba.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-gray-600 font-mono">04.</span>
            <span>
              Asegúrate de que el campo <code className="text-green-300">"symbol"</code> use{' '}
              <code className="text-green-300">{'{{ticker}}'}</code> para que TradingView lo reemplace automáticamente
              con el símbolo correcto del chart.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 text-gray-600 font-mono">05.</span>
            <span>Guarda la alerta. Cada vez que se dispare, llegará automáticamente a tus grupos de copiado activos.</span>
          </li>
        </ol>
        <div className="bg-blue-950/40 border border-blue-900 rounded-lg p-3 mt-2">
          <p className="text-xs text-blue-300">
            <span className="font-semibold">Tip para filtrar por ticker:</span>{' '}
            Si quieres que un grupo solo opere MNQ y otro solo ES, crea un grupo por producto y activa el
            filtro de ticker en la configuración del grupo (campo "Filtro de Ticker").
          </p>
        </div>
      </section>

      {/* Alert expiry popup modal */}
      {expiryPopup.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-800 flex items-start gap-3">
              <span className="text-3xl flex-shrink-0">⏰</span>
              <div>
                <h2 className="text-base font-semibold text-red-400">
                  Alerta{expiryPopup.length > 1 ? 's' : ''} de TradingView Expirada{expiryPopup.length > 1 ? 's' : ''}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Se ha enviado un aviso por email y/o Telegram.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300">
                Las siguientes alertas han expirado. Las señales de TradingView{' '}
                <strong className="text-red-400">ya no se están enviando</strong>:
              </p>
              <ul className="space-y-2">
                {expiryPopup.map(a => (
                  <li key={a.id} className="flex items-start gap-3 bg-gray-800/60 rounded-lg px-3 py-2.5">
                    <span className="text-red-400 flex-shrink-0 mt-0.5">🔴</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-100">{a.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {a.symbol && <span className="font-mono text-blue-300 mr-2">{a.symbol}</span>}
                        Venció el{' '}
                        {new Date(a.expiresAt + 'T00:00:00').toLocaleDateString('es-MX', {
                          day: '2-digit', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-400">
                <strong>Acción requerida:</strong> Ve a TradingView → Alerts y recrea la alerta con tu webhook URL para continuar recibiendo señales.
              </div>
              <button
                onClick={() => setExpiryPopup([])}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

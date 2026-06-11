import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { IcoRefresh, IcoWarning, IcoNoSymbol } from '../components/icons'

interface Account {
  id: string
  name: string
}

interface Rules {
  accountStage: string
  company: string
  riskMode: string
  fixedRiskAmount: number | null
  allowedDays: string[]
  allowedSessions: string[]
  blockedSessions: string[]
  maxEntriesPerDay: number | null
  maxDrawdownPct: number | null
  reduceRiskAfterLosses: boolean
  reduceRiskFactor: number
  maxConsecutiveLosses: number | null
  pauseAfterMaxLosses: boolean
}

const defaultRules: Rules = {
  accountStage: 'challenge',
  company: '',
  riskMode: 'fixed_usd',
  fixedRiskAmount: null,
  allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  allowedSessions: ['08:30-15:00'],
  blockedSessions: [],
  maxEntriesPerDay: null,
  maxDrawdownPct: null,
  reduceRiskAfterLosses: false,
  reduceRiskFactor: 0.5,
  maxConsecutiveLosses: null,
  pauseAfterMaxLosses: false,
}

const KNOWN_COMPANIES = ['apex']

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

const SESSION_PRESETS = [
  { label: 'New York',    code: 'US', value: '08:30-15:00', desc: 'CME regular hours' },
  { label: 'Londres',     code: 'GB', value: '02:00-11:00', desc: 'London session (CT)' },
  { label: 'Tokio',       code: 'JP', value: '19:00-03:00', desc: 'Tokyo session — cruza medianoche' },
  { label: 'Globex',      code: '--', value: '17:00-16:00', desc: 'Casi 24h (pausa 16:00-17:00 CT)' },
  { label: 'Apertura NY', code: 'NY', value: '08:30-10:30', desc: 'Solo las primeras 2h de NY' },
]

const BLOCKED_PRESETS = [
  { label: 'NY→Tokio',  value: '15:00-19:00', desc: 'Cierre NY hasta apertura Tokio' },
  { label: 'NY→London', value: '15:00-02:00', desc: 'Cierre NY hasta apertura London — cruza medianoche' },
  { label: 'Mediodía',  value: '11:30-13:00', desc: 'Lunch hour NY' },
  { label: 'Roll CME',  value: '15:00-17:00', desc: 'Transición CME / Globex' },
]

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-gray-800 pb-2 mb-4">
      <h2 className="text-base font-semibold text-gray-200">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function isCrossMidnight(session: string): boolean {
  const [start, end] = session.split('-')
  return !!start && !!end && start > end
}

function parseSession(session: string): { start: string; end: string } {
  const [start = '08:00', end = '15:00'] = session.split('-')
  return { start, end }
}

function SessionRow({
  session,
  color = 'blue',
  crossMidnightLabel,
  onChangeStart,
  onChangeEnd,
  onRemove,
}: {
  session: string
  color?: 'blue' | 'red'
  crossMidnightLabel: string
  onChangeStart: (v: string) => void
  onChangeEnd: (v: string) => void
  onRemove: () => void
}) {
  const { start, end } = parseSession(session)
  const crossesMidnight = isCrossMidnight(session)
  const border = color === 'red' ? 'border-red-900/60' : 'border-gray-700'

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 flex-1 bg-gray-800 border ${border} rounded-lg px-3 py-2`}>
        <input
          type="time"
          value={start}
          onChange={e => onChangeStart(e.target.value)}
          className="bg-transparent text-gray-100 text-sm focus:outline-none w-24"
        />
        <span className="text-gray-500 text-sm">→</span>
        <input
          type="time"
          value={end}
          onChange={e => onChangeEnd(e.target.value)}
          className="bg-transparent text-gray-100 text-sm focus:outline-none w-24"
        />
        {crossesMidnight && (
          <span className="ml-1 text-xs text-amber-400 font-medium whitespace-nowrap">{crossMidnightLabel}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}

function PresetBadges({
  presets,
  existing,
  onAdd,
  blocked = false,
}: {
  presets: Array<{ label: string; code?: string; value: string; desc: string }>
  existing: string[]
  onAdd: (v: string) => void
  blocked?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {presets.map(p => {
        const active = existing.includes(p.value)
        return (
          <button
            key={p.value}
            type="button"
            title={`${p.desc} (${p.value})`}
            onClick={() => onAdd(p.value)}
            disabled={active}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              active
                ? blocked
                  ? 'bg-red-900/30 border-red-800 text-red-400 opacity-60 cursor-default'
                  : 'bg-blue-900/40 border-blue-700 text-blue-400 opacity-60 cursor-default'
                : blocked
                  ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-red-600 hover:text-red-400'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400'
            }`}
          >
            {blocked && <IcoNoSymbol className="h-3 w-3 flex-shrink-0" />}
            {p.code && !blocked && (
              <span className="font-mono text-[10px] text-gray-500 leading-none">{p.code}</span>
            )}
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Rules() {
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [rules, setRules] = useState<Rules>(defaultRules)
  const [loading, setLoading] = useState(true)
  const [loadingRules, setLoadingRules] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [isOtraMode, setIsOtraMode] = useState(false)
  const [customCompany, setCustomCompany] = useState('')

  const companySelectValue = isOtraMode ? '__otra__' : rules.company

  const DAY_LABELS: Record<string, string> = {
    MON: t('day_mon'), TUE: t('day_tue'), WED: t('day_wed'),
    THU: t('day_thu'), FRI: t('day_fri'), SAT: t('day_sat'), SUN: t('day_sun'),
  }

  useEffect(() => {
    api.get<Account[]>('/api/accounts')
      .then(data => {
        setAccounts(data)
        if (data.length > 0) setSelectedAccountId(data[0].id)
      })
      .catch(err => setError(err instanceof Error ? err.message : t('error')))
      .finally(() => setLoading(false))
  }, [])

  const loadRules = (accountId: string) => {
    setLoadingRules(true)
    setError('')
    api.get<(Rules & { startTime?: string; endTime?: string }) | null>(`/api/accounts/${accountId}/rules`)
      .then(data => {
        if (!data) {
          setRules(defaultRules)
          setIsOtraMode(false)
          setCustomCompany('')
          return
        }
        const merged: Rules = {
          ...defaultRules,
          ...data,
          blockedSessions: data.blockedSessions ?? [],
        }
        if ((!data.allowedSessions || data.allowedSessions.length === 0) && data.startTime && data.endTime) {
          merged.allowedSessions = [`${data.startTime}-${data.endTime}`]
        }
        setRules(merged)
        if (merged.company && !KNOWN_COMPANIES.includes(merged.company)) {
          setIsOtraMode(true)
          setCustomCompany(merged.company)
        } else {
          setIsOtraMode(false)
          setCustomCompany('')
        }
      })
      .catch(() => {
        setRules(defaultRules)
        setIsOtraMode(false)
        setCustomCompany('')
      })
      .finally(() => setLoadingRules(false))
  }

  useEffect(() => {
    if (!selectedAccountId) return
    loadRules(selectedAccountId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId])

  function handleCompanyChange(val: string) {
    if (val === '__otra__') {
      setIsOtraMode(true)
      setRules(r => ({ ...r, company: customCompany }))
    } else {
      setIsOtraMode(false)
      setCustomCompany('')
      setRules(r => ({ ...r, company: val }))
    }
  }

  function toggleDay(day: string) {
    setRules(r => ({
      ...r,
      allowedDays: r.allowedDays.includes(day)
        ? r.allowedDays.filter(d => d !== day)
        : [...r.allowedDays, day],
    }))
  }

  function addAllowedPreset(v: string) {
    setRules(r => r.allowedSessions.includes(v) ? r : { ...r, allowedSessions: [...r.allowedSessions, v] })
  }
  function addEmptyAllowed() {
    setRules(r => ({ ...r, allowedSessions: [...r.allowedSessions, '08:30-15:00'] }))
  }
  function removeAllowed(idx: number) {
    setRules(r => ({ ...r, allowedSessions: r.allowedSessions.filter((_, i) => i !== idx) }))
  }
  function updateAllowedStart(idx: number, v: string) {
    setRules(r => {
      const s = [...r.allowedSessions]
      s[idx] = `${v}-${parseSession(s[idx]).end}`
      return { ...r, allowedSessions: s }
    })
  }
  function updateAllowedEnd(idx: number, v: string) {
    setRules(r => {
      const s = [...r.allowedSessions]
      s[idx] = `${parseSession(s[idx]).start}-${v}`
      return { ...r, allowedSessions: s }
    })
  }

  function addBlockedPreset(v: string) {
    setRules(r => r.blockedSessions.includes(v) ? r : { ...r, blockedSessions: [...r.blockedSessions, v] })
  }
  function addEmptyBlocked() {
    setRules(r => ({ ...r, blockedSessions: [...r.blockedSessions, '17:00-19:00'] }))
  }
  function removeBlocked(idx: number) {
    setRules(r => ({ ...r, blockedSessions: r.blockedSessions.filter((_, i) => i !== idx) }))
  }
  function updateBlockedStart(idx: number, v: string) {
    setRules(r => {
      const s = [...r.blockedSessions]
      s[idx] = `${v}-${parseSession(s[idx]).end}`
      return { ...r, blockedSessions: s }
    })
  }
  function updateBlockedEnd(idx: number, v: string) {
    setRules(r => {
      const s = [...r.blockedSessions]
      s[idx] = `${parseSession(s[idx]).start}-${v}`
      return { ...r, blockedSessions: s }
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAccountId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.put(`/api/accounts/${selectedAccountId}/rules`, rules)
      setSuccess(t('rules_saved_ok'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-100">{t('rules_title')}</h1>

      {/* Account selector */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">{t('rules_account_label')}</label>
        {accounts.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('rules_no_accounts')}</p>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm min-w-[220px]"
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { if (selectedAccountId) loadRules(selectedAccountId) }}
              disabled={loadingRules || !selectedAccountId}
              className="p-2 text-gray-400 hover:text-blue-400 disabled:opacity-40 transition-colors rounded-lg hover:bg-gray-800"
            >
              {loadingRules ? (
                <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <IcoRefresh className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {loadingRules ? <Spinner /> : (
        <form onSubmit={handleSave} className="space-y-8">

          {/* ── Risk ──────────────────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <SectionTitle title={t('rules_risk_section')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Company */}
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">{t('rules_company')}</label>
                <select
                  value={companySelectValue}
                  onChange={e => handleCompanyChange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="">{t('rules_select')}</option>
                  <option value="apex">APEX</option>
                  <option value="__otra__">{t('rules_other')}</option>
                </select>
                {isOtraMode && (
                  <input
                    type="text"
                    value={customCompany}
                    onChange={e => {
                      setCustomCompany(e.target.value)
                      setRules(r => ({ ...r, company: e.target.value }))
                    }}
                    placeholder="Ej: TopStep, FTMO, Bulenox…"
                    autoFocus
                    className="mt-2 w-full bg-gray-800 border border-blue-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-400 text-sm"
                  />
                )}
              </div>

              {/* Stage */}
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">{t('rules_stage')}</label>
                <select
                  value={rules.accountStage}
                  onChange={e => setRules(r => ({ ...r, accountStage: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="challenge">Challenge</option>
                  <option value="funded_to_withdrawal">Funded — To Withdrawal</option>
                  <option value="funded_active">Funded — Active</option>
                  <option value="recurso_propio">Recurso Propio</option>
                </select>
              </div>

              {/* Risk mode */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('rules_risk_mode')}</label>
                <select
                  value={rules.riskMode}
                  onChange={e => setRules(r => ({ ...r, riskMode: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="fixed_usd">{t('rules_fixed_usd')}</option>
                  <option value="pct_balance">{t('rules_pct_balance')}</option>
                </select>
              </div>

              {/* Risk amount */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {rules.riskMode === 'fixed_usd' ? t('rules_risk_amount') : t('rules_risk_pct')}
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={rules.fixedRiskAmount ?? ''}
                  onChange={e => setRules(r => ({ ...r, fixedRiskAmount: e.target.value ? parseFloat(e.target.value) : null }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  placeholder={rules.riskMode === 'fixed_usd' ? '200' : '1.5'}
                />
              </div>
            </div>
          </div>

          {/* ── Schedule ──────────────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
            <SectionTitle title={t('rules_schedule')} />

            {/* Days */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('rules_allowed_days')}</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      rules.allowedDays.includes(day)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}>
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            {/* Allowed sessions */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('rules_allowed_sess')}
              </label>
              <PresetBadges presets={SESSION_PRESETS} existing={rules.allowedSessions} onAdd={addAllowedPreset} />
              <div className="space-y-2">
                {rules.allowedSessions.length === 0 && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-3 py-2">
                    <IcoWarning className="h-3.5 w-3.5 flex-shrink-0" />
                    {t('rules_no_sessions')}
                  </p>
                )}
                {rules.allowedSessions.map((session, idx) => (
                  <SessionRow key={idx} session={session}
                    crossMidnightLabel={t('rules_crosses_midnight')}
                    onChangeStart={v => updateAllowedStart(idx, v)}
                    onChangeEnd={v => updateAllowedEnd(idx, v)}
                    onRemove={() => removeAllowed(idx)}
                  />
                ))}
              </div>
              <button type="button" onClick={addEmptyAllowed}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                {t('rules_add_session')}
              </button>
            </div>

            {/* Blocked sessions */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('rules_blocked_sess')}
                <span className="ml-2 text-xs text-gray-600">{t('rules_blocked_hint')}</span>
              </label>
              <PresetBadges presets={BLOCKED_PRESETS} existing={rules.blockedSessions} onAdd={addBlockedPreset} blocked />
              <div className="space-y-2">
                {rules.blockedSessions.length === 0 && (
                  <p className="text-xs text-gray-600 italic">{t('rules_no_blocked')}</p>
                )}
                {rules.blockedSessions.map((session, idx) => (
                  <SessionRow key={idx} session={session} color="red"
                    crossMidnightLabel={t('rules_crosses_midnight')}
                    onChangeStart={v => updateBlockedStart(idx, v)}
                    onChangeEnd={v => updateBlockedEnd(idx, v)}
                    onRemove={() => removeBlocked(idx)}
                  />
                ))}
              </div>
              <button type="button" onClick={addEmptyBlocked}
                className="mt-2 text-sm text-red-400 hover:text-red-300 transition-colors">
                {t('rules_add_blocked')}
              </button>
            </div>
          </div>

          {/* ── Protection ────────────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <SectionTitle title={t('rules_protection')} />
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('rules_max_entries')}</label>
                  <input type="number" min="0"
                    value={rules.maxEntriesPerDay ?? ''}
                    onChange={e => setRules(r => ({ ...r, maxEntriesPerDay: e.target.value ? parseInt(e.target.value, 10) : null }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    placeholder={t('rules_no_limit')} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('rules_max_drawdown')}</label>
                  <input type="number" min="0" max="100" step="0.1"
                    value={rules.maxDrawdownPct ?? ''}
                    onChange={e => setRules(r => ({ ...r, maxDrawdownPct: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    placeholder={t('rules_no_limit')} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('rules_max_losses')}
                    <span className="ml-1 text-gray-600 font-normal">{t('rules_max_losses_sub')}</span>
                  </label>
                  <input type="number" min="1"
                    value={rules.maxConsecutiveLosses ?? ''}
                    onChange={e => setRules(r => ({ ...r, maxConsecutiveLosses: e.target.value ? parseInt(e.target.value, 10) : null }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    placeholder={t('rules_no_limit')} />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between py-2 border-b border-gray-800">
                  <div>
                    <p className="text-sm text-gray-200">{t('rules_reduce_risk')}</p>
                    <p className="text-xs text-gray-500">{t('rules_reduce_sub')}</p>
                  </div>
                  <button type="button"
                    onClick={() => setRules(r => ({ ...r, reduceRiskAfterLosses: !r.reduceRiskAfterLosses }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${rules.reduceRiskAfterLosses ? 'bg-blue-600' : 'bg-gray-700'}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rules.reduceRiskAfterLosses ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </label>

                {rules.reduceRiskAfterLosses && (
                  <div className="pl-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      {t('rules_reduce_factor')}: {rules.reduceRiskFactor.toFixed(2)}x
                    </label>
                    <input type="range" min="0.1" max="1.0" step="0.05"
                      value={rules.reduceRiskFactor}
                      onChange={e => setRules(r => ({ ...r, reduceRiskFactor: parseFloat(e.target.value) }))}
                      className="w-full accent-blue-500" />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.10x</span><span>1.00x</span>
                    </div>
                  </div>
                )}

                <label className="flex items-start justify-between py-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-200">{t('rules_pause_losses')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('rules_pause_sub')}</p>
                    {rules.pauseAfterMaxLosses && rules.maxConsecutiveLosses && (
                      <p className="inline-flex items-center gap-1 text-xs text-orange-400 mt-1">
                        <IcoWarning className="h-3 w-3 flex-shrink-0" />
                        {t('rules_pause_warning')} {rules.maxConsecutiveLosses} {t('rules_pause_warn2')}
                      </p>
                    )}
                  </div>
                  <button type="button"
                    onClick={() => setRules(r => ({ ...r, pauseAfterMaxLosses: !r.pauseAfterMaxLosses }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${rules.pauseAfterMaxLosses ? 'bg-blue-600' : 'bg-gray-700'}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rules.pauseAfterMaxLosses ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
          )}
          {success && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-300 text-sm">{success}</div>
          )}

          <button type="submit" disabled={saving || !selectedAccountId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors">
            {saving ? t('rules_saving') : t('rules_save')}
          </button>
        </form>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'

interface Account {
  id: string
  name: string
  tradovateId: string | null
  tradovateSpec: string | null
  tradovateUsername: string | null
  environment: 'demo' | 'live'
  brokerType: string
  balance: number
  accountStage: string | null
  hasToken: boolean
  isActive: boolean
}

interface AccountFormData {
  name: string
  brokerType: 'paper' | 'tradovate'
  tradovateUsername: string
  tradovateId: string
  tradovateSpec: string
  environment: 'demo' | 'live'
  accountStage: string
  balance: number
}

const emptyForm: AccountFormData = {
  name: '',
  brokerType: 'paper',
  tradovateUsername: '',
  tradovateId: '',
  tradovateSpec: '',
  environment: 'demo',
  accountStage: '',
  balance: 50000,
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function Accounts() {
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()

  function statusBadge(account: Account) {
    if (!account.isActive) {
      return <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400">{t('status_inactive')}</span>
    }
    if (account.brokerType === 'paper') {
      return <span className="px-2 py-0.5 rounded text-xs bg-purple-900 text-purple-300">Paper ✓</span>
    }
    if (!account.hasToken) {
      return <span className="px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">{t('status_no_token')}</span>
    }
    return <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-300">{t('status_connected')}</span>
  }

  useEffect(() => {
    const success = searchParams.get('success')
    const err = searchParams.get('error')
    if (success === 'connected') setNotice(t('acc_tv_connected'))
    if (err) setError(`Error al conectar Tradovate: ${err}`)
  }, [searchParams, t])

  async function fetchAccounts() {
    try {
      const data = await api.get<Account[]>('/api/accounts')
      setAccounts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setFormError('')
    setShowModal(true)
  }

  function openEdit(account: Account) {
    setForm({
      name: account.name,
      brokerType: (account.brokerType as 'paper' | 'tradovate') ?? 'tradovate',
      tradovateUsername: account.tradovateUsername ?? '',
      tradovateId: account.tradovateId ?? '',
      tradovateSpec: account.tradovateSpec ?? '',
      environment: account.environment,
      accountStage: account.accountStage ?? '',
      balance: account.balance ?? 50000,
    })
    setEditingId(account.id)
    setFormError('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError(t('acc_name_label').replace(' *', '') + ' ' + t('error').toLowerCase())
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload =
        form.brokerType === 'paper'
          ? { name: form.name, brokerType: 'paper', balance: form.balance }
          : {
              name: form.name,
              brokerType: 'tradovate',
              tradovateUsername: form.tradovateUsername,
              tradovateId: form.tradovateId,
              tradovateSpec: form.tradovateSpec,
              environment: form.environment,
              accountStage: form.accountStage || null,
            }

      if (editingId) {
        await api.put(`/api/accounts/${editingId}`, payload)
      } else {
        await api.post('/api/accounts', payload)
      }
      setShowModal(false)
      await fetchAccounts()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/accounts/${id}`)
      setDeleteId(null)
      await fetchAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    }
  }

  function handleConnect(accountId: string) {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
    window.location.href = `${apiUrl}/api/auth/tradovate/connect?accountId=${accountId}`
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">{t('acc_title')}</h1>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {t('acc_new')}
        </button>
      </div>

      {notice && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-300 text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">{t('name')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('type')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('environment')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('acc_tv_user')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('balance')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('acc_stage')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('status')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500">
                    {t('acc_no_accounts')}
                  </td>
                </tr>
              ) : (
                accounts.map(account => (
                  <tr key={account.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-100 font-medium">{account.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          account.brokerType === 'paper'
                            ? 'bg-purple-900/50 text-purple-300'
                            : 'bg-blue-900/50 text-blue-300'
                        }`}
                      >
                        {account.brokerType === 'paper' ? 'Paper' : 'Tradovate'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          account.environment === 'live'
                            ? 'bg-orange-900 text-orange-300'
                            : 'bg-blue-900 text-blue-300'
                        }`}
                      >
                        {account.environment === 'live' ? 'Live' : 'Demo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      {account.tradovateUsername
                        ? <span className="text-cyan-400">{account.tradovateUsername}</span>
                        : <span className="text-gray-600">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">
                      ${account.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 capitalize">
                      {account.accountStage?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(account)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openEdit(account)}
                          className="text-gray-400 hover:text-gray-100 text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                        >
                          {t('edit')}
                        </button>
                        {account.brokerType !== 'paper' && (
                          <button
                            onClick={() => handleConnect(account.id)}
                            className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded border border-blue-800 hover:border-blue-600 transition-colors"
                          >
                            {t('acc_connect_tv')}
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteId(account.id)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded border border-red-900 hover:border-red-700 transition-colors"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl my-4">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">
                {editingId ? t('acc_edit_title') : t('acc_new_title')}
              </h2>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">

              {/* Nombre */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('acc_name_label')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="Mi cuenta Apex"
                />
              </div>

              {/* Tipo de broker — sólo al crear */}
              {!editingId && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('acc_type_label')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, brokerType: 'paper' }))}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        form.brokerType === 'paper'
                          ? 'border-purple-500 bg-purple-900/30 text-purple-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-semibold">{t('acc_paper_title')}</div>
                      <div className="text-xs opacity-70 mt-0.5">{t('acc_paper_sub')}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, brokerType: 'tradovate' }))}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        form.brokerType === 'tradovate'
                          ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-semibold">Tradovate</div>
                      <div className="text-xs opacity-70 mt-0.5">{t('acc_tv_requires')}</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Campos Paper */}
              {form.brokerType === 'paper' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('acc_balance_label')}</label>
                  <input
                    type="number"
                    value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: Number(e.target.value) }))}
                    min={1000}
                    step={1000}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('acc_paper_note')}
                  </p>
                </div>
              )}

              {/* Campos Tradovate */}
              {form.brokerType === 'tradovate' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      {t('acc_tv_username')}
                    </label>
                    <input
                      type="text"
                      value={form.tradovateUsername}
                      onChange={e => setForm(f => ({ ...f, tradovateUsername: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                      placeholder="usuario@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      {t('acc_account_number')}
                      <span className="ml-2 text-xs text-gray-500">{t('acc_account_number_hint')}</span>
                    </label>
                    <input
                      type="text"
                      value={form.tradovateId}
                      onChange={e => setForm(f => ({ ...f, tradovateId: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-mono"
                      placeholder="123456"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      {t('acc_account_spec')}
                      <span className="ml-2 text-xs text-gray-500">ej: demo/APEX123456</span>
                    </label>
                    <input
                      type="text"
                      value={form.tradovateSpec}
                      onChange={e => setForm(f => ({ ...f, tradovateSpec: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-mono"
                      placeholder="demo/APEX123456"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      {t('acc_apex_stage')}
                      <span className="ml-2 text-xs text-gray-500">{t('acc_apex_stage_hint')}</span>
                    </label>
                    <select
                      value={form.accountStage}
                      onChange={e => setForm(f => ({ ...f, accountStage: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    >
                      <option value="">{t('acc_no_stage')}</option>
                      <option value="eval_1">{t('acc_eval_1')}</option>
                      <option value="eval_2">{t('acc_eval_2')}</option>
                      <option value="funded">{t('acc_funded')}</option>
                      <option value="performance">{t('acc_performance')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">{t('acc_environment')}</label>
                    <select
                      value={form.environment}
                      onChange={e => setForm(f => ({ ...f, environment: e.target.value as 'demo' | 'live' }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    >
                      <option value="demo">{t('acc_demo_env')}</option>
                      <option value="live">{t('acc_live_env')}</option>
                    </select>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3 text-xs text-blue-400">
                    <p className="font-semibold mb-1">{t('acc_oauth_note_title')}</p>
                    <p>{t('acc_oauth_note_body')}</p>
                  </div>
                </>
              )}

              {formError && <p className="text-red-400 text-sm">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? t('saving') : editingId ? t('update') : t('acc_creating')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-100">{t('confirm_delete')}</h2>
            <p className="text-gray-400 text-sm">
              {t('acc_confirm_delete')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {t('delete')}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

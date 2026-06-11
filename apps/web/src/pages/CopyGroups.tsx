import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useLanguage } from '../contexts/LanguageContext'
import { IcoGroups, IcoEye, IcoSignals, IcoManual, IcoInfo } from '../components/icons'

interface Account {
  id: string
  name: string
}

interface Follower {
  id: string
  accountId: string
  account?: { name: string }
  riskPct: number
  rotateOrder: number
  isActive: boolean
}

type DistributionMode = 'all' | 'rotate' | 'rotate_group' | 'batch_rotate'
type TipoGrupo = 'copy_group' | 'master'

interface CopyGroup {
  id: string
  name: string
  masterAccountId?: string | null
  masterAccount?: { name: string } | null
  distributionMode: DistributionMode
  batchSize: number | null
  symbol?: string | null
  tipoGrupo: TipoGrupo
  orderMode: 'auto' | 'manual'
  isActive: boolean
  followers?: Follower[]
}

interface GroupFormData {
  name: string
  tipoGrupo: TipoGrupo
  masterAccountId: string
  distributionMode: DistributionMode
  batchSize: string
  symbol: string
  orderMode: 'auto' | 'manual'
}

interface FollowerFormData {
  accountId: string
  riskPct: string
  rotateOrder: string
}

const emptyGroupForm: GroupFormData = {
  name: '',
  tipoGrupo: 'copy_group',
  masterAccountId: '',
  distributionMode: 'all',
  batchSize: '4',
  symbol: '',
  orderMode: 'auto',
}

const emptyFollowerForm: FollowerFormData = {
  accountId: '',
  riskPct: '100',
  rotateOrder: '1',
}

type IconComponent = React.ComponentType<{ className?: string }>

// Static metadata — labels are injected via t() at render time
const TIPO_GRUPO_KEYS: {
  value: TipoGrupo
  labelKey: string
  badge: string
  Icon: IconComponent
  descKey: string
  routerNoteKey: string
  routerOk: boolean
}[] = [
  {
    value: 'copy_group',
    labelKey: 'grp_tipo_standard',
    badge: 'bg-blue-900/60 text-blue-300',
    Icon: IcoGroups,
    descKey: 'grp_tipo_standard_desc',
    routerNoteKey: 'grp_tipo_standard_note',
    routerOk: true,
  },
  {
    value: 'master',
    labelKey: 'grp_tipo_readonly',
    badge: 'bg-amber-900/60 text-amber-300',
    Icon: IcoEye,
    descKey: 'grp_tipo_readonly_desc',
    routerNoteKey: 'grp_tipo_readonly_note',
    routerOk: false,
  },
]

const DIST_MODE_KEYS: {
  value: DistributionMode
  label: string
  badge: string
  descKey: string
  exampleKey: string
  usesBatch: boolean
}[] = [
  {
    value: 'all',
    label: 'Todos (all)',
    badge: 'bg-purple-900 text-purple-300',
    descKey: 'grp_dist_all_desc',
    exampleKey: 'grp_dist_all_ex',
    usesBatch: false,
  },
  {
    value: 'rotate',
    label: 'Rotar (rotate)',
    badge: 'bg-teal-900 text-teal-300',
    descKey: 'grp_dist_rotate_desc',
    exampleKey: 'grp_dist_rotate_ex',
    usesBatch: false,
  },
  {
    value: 'rotate_group',
    label: 'Rotar Grupo (rotate_group)',
    badge: 'bg-sky-900 text-sky-300',
    descKey: 'grp_dist_rgroup_desc',
    exampleKey: 'grp_dist_rgroup_ex',
    usesBatch: true,
  },
  {
    value: 'batch_rotate',
    label: 'Batch Rotar (batch_rotate)',
    badge: 'bg-indigo-900 text-indigo-300',
    descKey: 'grp_dist_batch_desc',
    exampleKey: 'grp_dist_batch_ex',
    usesBatch: true,
  },
]

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function TipoBadge({ tipo, t }: { tipo: string; t: (k: string) => string }) {
  const meta = TIPO_GRUPO_KEYS.find(item => item.value === tipo)
  if (!meta) return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">{tipo}</span>
  )
  const Icon = meta.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.badge}`}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      {t(meta.labelKey)}
    </span>
  )
}

function DistBadge({ mode }: { mode: string }) {
  const meta = DIST_MODE_KEYS.find(m => m.value === mode)
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta?.badge ?? 'bg-gray-700 text-gray-300'}`}>
      {meta?.label ?? mode}
    </span>
  )
}

export default function CopyGroups() {
  const { t } = useLanguage()
  const [groups, setGroups] = useState<CopyGroup[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Group modal
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormData>(emptyGroupForm)
  const [savingGroup, setSavingGroup] = useState(false)
  const [groupFormError, setGroupFormError] = useState('')

  // Follower panel
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [showFollowerModal, setShowFollowerModal] = useState(false)
  const [followerGroupId, setFollowerGroupId] = useState<string | null>(null)
  const [followerForm, setFollowerForm] = useState<FollowerFormData>(emptyFollowerForm)
  const [savingFollower, setSavingFollower] = useState(false)
  const [followerFormError, setFollowerFormError] = useState('')

  async function fetchAll() {
    try {
      const [grps, accs] = await Promise.all([
        api.get<CopyGroup[]>('/api/groups'),
        api.get<Account[]>('/api/accounts'),
      ])
      setGroups(grps)
      setAccounts(accs)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // ── Group modal ──────────────────────────────────────────────────────────────
  function openCreateGroup() {
    setGroupForm({ ...emptyGroupForm })
    setEditingGroupId(null)
    setGroupFormError('')
    setShowGroupModal(true)
  }

  function openEditGroup(group: CopyGroup) {
    setGroupForm({
      name: group.name,
      tipoGrupo: group.tipoGrupo ?? 'copy_group',
      masterAccountId: group.masterAccountId ?? '',
      distributionMode: group.distributionMode,
      batchSize: group.batchSize?.toString() ?? '4',
      symbol: group.symbol ?? '',
      orderMode: group.orderMode ?? 'auto',
    })
    setEditingGroupId(group.id)
    setGroupFormError('')
    setShowGroupModal(true)
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!groupForm.name.trim()) { setGroupFormError(t('grp_name_required')); return }
    if (groupForm.tipoGrupo === 'master' && !groupForm.masterAccountId) {
      setGroupFormError(t('grp_master_required')); return
    }
    setSavingGroup(true)
    setGroupFormError('')
    const isMaster = groupForm.tipoGrupo === 'master'
    const usesBatch = !isMaster && DIST_MODE_KEYS.find(m => m.value === groupForm.distributionMode)?.usesBatch
    const payload: Record<string, unknown> = {
      name: groupForm.name,
      tipoGrupo: groupForm.tipoGrupo,
      distributionMode: groupForm.distributionMode,
      batchSize: usesBatch && groupForm.batchSize ? parseInt(groupForm.batchSize, 10) : 4,
      orderMode: groupForm.orderMode,
    }
    if (isMaster && groupForm.masterAccountId) payload.masterAccountId = groupForm.masterAccountId
    if (groupForm.symbol.trim()) payload.symbol = groupForm.symbol.trim().toUpperCase()
    try {
      if (editingGroupId) {
        await api.put(`/api/groups/${editingGroupId}`, payload)
      } else {
        await api.post('/api/groups', payload)
      }
      setShowGroupModal(false)
      await fetchAll()
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSavingGroup(false)
    }
  }

  async function toggleGroupActive(group: CopyGroup) {
    try {
      await api.put(`/api/groups/${group.id}`, { isActive: !group.isActive })
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    }
  }

  // ── Follower modal ───────────────────────────────────────────────────────────
  function openAddFollower(groupId: string) {
    setFollowerGroupId(groupId)
    setFollowerForm(emptyFollowerForm)
    setFollowerFormError('')
    setShowFollowerModal(true)
  }

  async function handleSaveFollower(e: React.FormEvent) {
    e.preventDefault()
    if (!followerForm.accountId) { setFollowerFormError(t('grp_select_acc')); return }
    if (!followerGroupId) return
    setSavingFollower(true)
    setFollowerFormError('')
    try {
      await api.post(`/api/groups/${followerGroupId}/followers`, {
        accountId: followerForm.accountId,
        riskPct: parseFloat(followerForm.riskPct),
        rotateOrder: parseInt(followerForm.rotateOrder, 10),
      })
      setShowFollowerModal(false)
      await fetchAll()
    } catch (err) {
      setFollowerFormError(err instanceof Error ? err.message : t('error'))
    } finally {
      setSavingFollower(false)
    }
  }

  // Info panel
  const [showTipoGrupo, setShowTipoGrupo] = useState(false)

  async function removeFollower(groupId: string, followerId: string) {
    if (!confirm(t('grp_confirm_remove'))) return
    try {
      await api.delete(`/api/groups/${groupId}/followers/${followerId}`)
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    }
  }

  async function toggleFollowerActive(groupId: string, follower: Follower) {
    try {
      await api.put(`/api/groups/${groupId}/followers/${follower.id}`, {
        isActive: !follower.isActive,
      })
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    }
  }

  const selectedTipoMeta = TIPO_GRUPO_KEYS.find(item => item.value === groupForm.tipoGrupo)
  const selectedModeMeta = DIST_MODE_KEYS.find(m => m.value === groupForm.distributionMode)
  const isMasterType = groupForm.tipoGrupo === 'master'

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t('grp_title')}</h1>
          <p className="text-xs text-gray-500 mt-1">{t('grp_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTipoGrupo(v => !v)}
            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            <IcoInfo className="h-3.5 w-3.5" />
            {t('grp_tipo_info')}
          </button>
          <button
            onClick={openCreateGroup}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t('grp_new')}
          </button>
        </div>
      </div>

      {/* Tipo de Grupo info panel */}
      {showTipoGrupo && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">

          {/* Tipos */}
          <div>
            <h3 className="text-sm font-semibold text-gray-100 mb-3">{t('grp_tipo_title')}</h3>
            <div className="space-y-2">
              {TIPO_GRUPO_KEYS.map(row => {
                const Icon = row.Icon
                return (
                  <div key={row.value} className="flex gap-3 items-start bg-gray-800/40 rounded-lg px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold mt-0.5 ${row.badge}`}>
                      <Icon className="h-3 w-3" />
                      {t(row.labelKey)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 leading-snug">{t(row.descKey)}</p>
                      <p className={`text-xs mt-0.5 font-medium ${row.routerOk ? 'text-green-500' : 'text-amber-500'}`}>
                        → {t(row.routerNoteKey)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Modos de distribución */}
          <div>
            <h3 className="text-sm font-semibold text-gray-100 mb-3">{t('grp_dist_title')}</h3>
            <div className="space-y-2">
              {DIST_MODE_KEYS.map(m => (
                <div key={m.value} className="flex gap-3 items-start bg-gray-800/40 rounded-lg px-3 py-2.5">
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold mt-0.5 ${m.badge}`}>
                    {m.value}
                  </span>
                  <div>
                    <p className="text-sm text-gray-200 leading-snug">{t(m.descKey)}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{t(m.exampleKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
          {t('grp_no_groups')}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isExpanded = expandedGroupId === group.id
            const followers = group.followers ?? []
            const modeMeta = DIST_MODE_KEYS.find(m => m.value === group.distributionMode)

            return (
              <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Group header row */}
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-100 truncate">{group.name}</p>
                      {group.symbol && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t('grp_ticker')}: <span className="text-amber-400 font-mono">{group.symbol}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <TipoBadge tipo={group.tipoGrupo ?? 'copy_group'} t={t} />
                      {group.tipoGrupo !== 'master' && (
                        <DistBadge mode={group.distributionMode} />
                      )}
                      {group.tipoGrupo !== 'master' && modeMeta?.usesBatch && group.batchSize && (
                        <span className="text-xs text-gray-500">N={group.batchSize}</span>
                      )}
                      {group.tipoGrupo !== 'master' && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          group.orderMode === 'manual'
                            ? 'bg-orange-900/60 text-orange-300'
                            : 'bg-green-900/50 text-green-400'
                        }`}>
                          {group.orderMode === 'manual'
                            ? <><IcoManual className="h-3 w-3" /> {t('grp_manual_mode')}</>
                            : <><IcoSignals className="h-3 w-3" /> {t('grp_auto_mode')}</>
                          }
                        </span>
                      )}
                      {group.tipoGrupo !== 'master' && (
                        <span className="text-xs text-gray-500">{followers.length} {t('grp_linked')}</span>
                      )}
                      {group.tipoGrupo === 'master' && (
                        <span className="text-xs text-amber-600">
                          {group.masterAccount?.name
                            ? `${t('grp_account')}: ${group.masterAccount.name}`
                            : `${t('grp_no_dist')}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleGroupActive(group)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        group.isActive ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                      title={group.isActive ? t('grp_active_tooltip') : t('grp_paused_tooltip')}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        group.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                    <button
                      onClick={() => openEditGroup(group)}
                      className="text-gray-400 hover:text-gray-100 text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                    >
                      {t('edit')}
                    </button>
                    {group.tipoGrupo !== 'master' && (
                      <button
                        onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                        className="text-gray-400 hover:text-gray-100 text-xs px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                      >
                        {isExpanded ? t('grp_hide') : `${t('grp_linked_accs')} (${followers.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Followers panel */}
                {isExpanded && group.tipoGrupo !== 'master' && (
                  <div className="border-t border-gray-800 p-4 bg-gray-950/40">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-300">{t('grp_copy_accs')}</h3>
                      <button
                        onClick={() => openAddFollower(group.id)}
                        className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded border border-blue-800 hover:border-blue-600 transition-colors"
                      >
                        {t('grp_add_acc')}
                      </button>
                    </div>

                    {followers.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4">{t('grp_no_linked')}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-800 text-xs">
                              <th className="text-left pb-2 font-medium">{t('grp_account')}</th>
                              <th className="text-right pb-2 font-medium">{t('grp_risk_pct')}</th>
                              <th className="text-right pb-2 font-medium">{t('grp_order')}</th>
                              <th className="text-center pb-2 font-medium">{t('active')}</th>
                              <th className="text-right pb-2 font-medium"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {followers.map(follower => (
                              <tr key={follower.id} className="border-b border-gray-800/30 hover:bg-gray-900/30">
                                <td className="py-2 text-gray-200">
                                  {follower.account?.name ?? follower.accountId}
                                </td>
                                <td className="py-2 text-right text-gray-300">{follower.riskPct}%</td>
                                <td className="py-2 text-right text-gray-500">{follower.rotateOrder}</td>
                                <td className="py-2 text-center">
                                  <button
                                    onClick={() => toggleFollowerActive(group.id, follower)}
                                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                                      follower.isActive ? 'bg-blue-600' : 'bg-gray-700'
                                    }`}
                                  >
                                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                                      follower.isActive ? 'translate-x-4' : 'translate-x-0.5'
                                    }`} />
                                  </button>
                                </td>
                                <td className="py-2 text-right">
                                  <button
                                    onClick={() => removeFollower(group.id, follower.id)}
                                    className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                                  >
                                    {t('grp_remove')}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Group Modal ──────────────────────────────────────────────────────── */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl my-4">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">
                {editingGroupId ? t('grp_edit_title') : t('grp_new_title')}
              </h2>
              <p className="text-xs text-gray-500 mt-1">{t('grp_modal_sub')}</p>
            </div>
            <form onSubmit={handleSaveGroup} className="p-6 space-y-4">

              {/* Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('grp_name_label')}</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="Ej: APEX Grupo MNQ"
                />
              </div>

              {/* Tipo de Grupo */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('grp_tipo_label')}</label>
                <select
                  value={groupForm.tipoGrupo}
                  onChange={e => setGroupForm(f => ({ ...f, tipoGrupo: e.target.value as TipoGrupo }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  {TIPO_GRUPO_KEYS.map(item => (
                    <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
                  ))}
                </select>

                {selectedTipoMeta && (
                  <div className={`mt-2 rounded-lg px-3 py-2 border text-xs ${
                    isMasterType
                      ? 'bg-amber-950/30 border-amber-900/50'
                      : 'bg-gray-800/50 border-gray-700'
                  }`}>
                    <p className="text-gray-300">{t(selectedTipoMeta.descKey)}</p>
                    <p className={`mt-1 font-medium ${selectedTipoMeta.routerOk ? 'text-green-500' : 'text-amber-500'}`}>
                      → {t(selectedTipoMeta.routerNoteKey)}
                    </p>
                  </div>
                )}
              </div>

              {/* Master account selector */}
              {isMasterType && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('grp_master_acc')}
                    <span className="ml-2 text-xs text-gray-600">{t('grp_master_acc_hint')}</span>
                  </label>
                  <select
                    value={groupForm.masterAccountId}
                    onChange={e => setGroupForm(f => ({ ...f, masterAccountId: e.target.value }))}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-amber-500 text-sm"
                  >
                    <option value="">{t('grp_select_acc')}</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Symbol filter */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {t('grp_ticker_filter')}
                  <span className="ml-2 text-xs text-gray-600">{t('grp_ticker_hint')}</span>
                </label>
                <input
                  type="text"
                  value={groupForm.symbol}
                  onChange={e => setGroupForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  placeholder="Ej: MNQZ4, ES, NQ (vacío = todos)"
                  maxLength={20}
                />
                {groupForm.symbol && (
                  <p className="text-xs text-amber-500 mt-1">
                    {t('grp_ticker_only')} <span className="font-mono">{groupForm.symbol}</span>
                  </p>
                )}
              </div>

              {/* Distribution mode */}
              {!isMasterType && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('grp_dist_label')}</label>
                  <select
                    value={groupForm.distributionMode}
                    onChange={e => setGroupForm(f => ({ ...f, distributionMode: e.target.value as DistributionMode }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                  >
                    {DIST_MODE_KEYS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>

                  {selectedModeMeta && (
                    <div className="mt-2 bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-300">{t(selectedModeMeta.descKey)}</p>
                      <p className="text-xs text-gray-500 mt-1 font-mono">{t(selectedModeMeta.exampleKey)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Order mode */}
              {!isMasterType && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('grp_order_gen')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupForm(f => ({ ...f, orderMode: 'auto' }))}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        groupForm.orderMode === 'auto'
                          ? 'border-green-500 bg-green-900/30 text-green-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <IcoSignals className="h-3.5 w-3.5" />
                        {t('grp_auto_mode')}
                      </div>
                      <div className="text-xs opacity-70 mt-0.5">{t('grp_auto_sub')}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupForm(f => ({ ...f, orderMode: 'manual' }))}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        groupForm.orderMode === 'manual'
                          ? 'border-orange-500 bg-orange-900/30 text-orange-300'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <IcoManual className="h-3.5 w-3.5" />
                        {t('grp_manual_mode')}
                      </div>
                      <div className="text-xs opacity-70 mt-0.5">{t('grp_manual_sub')}</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Batch size */}
              {!isMasterType && selectedModeMeta?.usesBatch && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {t('grp_batch_label')}
                    <span className="ml-2 text-xs text-gray-600">{t('grp_batch_hint')}</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={groupForm.batchSize}
                    onChange={e => setGroupForm(f => ({ ...f, batchSize: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="4"
                  />
                </div>
              )}

              {groupFormError && <p className="text-red-400 text-sm">{groupFormError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingGroup}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {savingGroup ? t('saving') : editingGroupId ? t('update') : t('grp_create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Follower Modal ───────────────────────────────────────────────────── */}
      {showFollowerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">{t('grp_follower_title')}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('grp_follower_sub')}</p>
            </div>
            <form onSubmit={handleSaveFollower} className="p-6 space-y-4">

              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('grp_account')} *</label>
                <select
                  value={followerForm.accountId}
                  onChange={e => setFollowerForm(f => ({ ...f, accountId: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="">{t('grp_select_acc')}</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {t('grp_risk_pct')}
                  <span className="ml-2 text-xs text-gray-600">{t('grp_risk_hint')}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={followerForm.riskPct}
                  onChange={e => setFollowerForm(f => ({ ...f, riskPct: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {t('grp_rotate_order')}
                  <span className="ml-2 text-xs text-gray-600">{t('grp_rotate_hint')}</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={followerForm.rotateOrder}
                  onChange={e => setFollowerForm(f => ({ ...f, rotateOrder: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>

              {followerFormError && <p className="text-red-400 text-sm">{followerFormError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingFollower}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {savingFollower ? t('grp_adding') : t('add')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFollowerModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

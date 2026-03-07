import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function CopyGroups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showFollowerModal, setShowFollowerModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [form, setForm] = useState({ name: '', masterAccountId: '', distributionMode: 'all', batchSize: 4 });
  const [followerForm, setFollowerForm] = useState({ followerAccountId: '', riskPct: 1.0 });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [gRes, aRes] = await Promise.all([api.get('/groups'), api.get('/accounts')]);
    if (gRes.success) setGroups(gRes.data || []);
    if (aRes.success) setAccounts(aRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateGroup = async () => {
    await api.post('/groups', form);
    setShowModal(false);
    fetchData();
  };

  const handleAddFollower = async () => {
    if (!selectedGroup) return;
    await api.post(`/groups/${selectedGroup.id}/followers`, followerForm);
    setShowFollowerModal(false);
    fetchData();
  };

  const handleToggleFollower = async (groupId: string, fid: string, isActive: boolean) => {
    await api.put(`/groups/${groupId}/followers/${fid}`, { isActive: !isActive });
    fetchData();
  };

  const handleRemoveFollower = async (groupId: string, fid: string) => {
    if (!confirm('Eliminar follower?')) return;
    await api.delete(`/groups/${groupId}/followers/${fid}`);
    fetchData();
  };

  if (loading) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Copy Groups</h2>
        <button onClick={() => { setForm({ name: '', masterAccountId: '', distributionMode: 'all', batchSize: 4 }); setShowModal(true); }}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded">
          + Nuevo Grupo
        </button>
      </div>

      {groups.map((group) => (
        <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-200">{group.name}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Master: {group.master?.name} | Mode: {group.distributionMode}
                {group.distributionMode === 'batch_rotate' && ` | Batch: ${group.batchSize}`}
                {group.distributionMode === 'rotate' && ` | Turno: ${group.rotateIndex}`}
              </p>
            </div>
            <button onClick={() => { setSelectedGroup(group); setFollowerForm({ followerAccountId: '', riskPct: 1.0 }); setShowFollowerModal(true); }}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">
              + Follower
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-800/30">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 text-xs">Cuenta</th>
                <th className="text-right px-4 py-2 text-gray-500 text-xs">Risk %</th>
                <th className="text-center px-4 py-2 text-gray-500 text-xs">Activo</th>
                <th className="text-center px-4 py-2 text-gray-500 text-xs">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {group.followers?.map((f: any) => (
                <tr key={f.id} className="hover:bg-gray-800/20">
                  <td className="px-4 py-2 text-gray-300">{f.follower?.name}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{(f.riskPct * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => handleToggleFollower(group.id, f.id, f.isActive)}
                      className={`text-xs px-2 py-0.5 rounded ${f.isActive ? 'bg-emerald-900/30 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
                      {f.isActive ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => handleRemoveFollower(group.id, f.id)} className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
                  </td>
                </tr>
              ))}
              {(!group.followers || group.followers.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-600 text-xs">Sin followers</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="text-center text-gray-600 py-12">No hay grupos configurados</div>
      )}

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Nuevo Copy Group</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Cuenta Master</label>
                <select value={form.masterAccountId} onChange={(e) => setForm({ ...form, masterAccountId: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
                  <option value="">Seleccionar...</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Modo de Distribucion</label>
                <select value={form.distributionMode} onChange={(e) => setForm({ ...form, distributionMode: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
                  <option value="all">Todas las cuentas</option>
                  <option value="rotate">Rotacion individual</option>
                  <option value="batch_rotate">Rotacion por lotes</option>
                </select>
              </div>
              {form.distributionMode === 'batch_rotate' && (
                <div>
                  <label className="text-xs text-gray-500">Tamano del lote</label>
                  <input type="number" value={form.batchSize} onChange={(e) => setForm({ ...form, batchSize: parseInt(e.target.value) || 4 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400">Cancelar</button>
              <button onClick={handleCreateGroup} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Follower Modal */}
      {showFollowerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowFollowerModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Agregar Follower a {selectedGroup?.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Cuenta</label>
                <select value={followerForm.followerAccountId} onChange={(e) => setFollowerForm({ ...followerForm, followerAccountId: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
                  <option value="">Seleccionar...</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Risk % (ej: 1.0 = 1%)</label>
                <input type="number" step="0.1" value={followerForm.riskPct}
                  onChange={(e) => setFollowerForm({ ...followerForm, riskPct: parseFloat(e.target.value) || 1.0 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowFollowerModal(false)} className="px-4 py-2 text-sm text-gray-400">Cancelar</button>
              <button onClick={handleAddFollower} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded">Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

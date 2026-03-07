import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Account {
  id: string;
  name: string;
  tradovateId: string;
  tradovateSpec: string;
  environment: string;
  isActive: boolean;
  balance: number;
  accessToken: string | null;
  tradingRules: { accountStage: string } | null;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: '', tradovateId: '', tradovateSpec: '', environment: 'demo' });
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    const res = await api.get('/accounts');
    if (res.success) setAccounts(res.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', tradovateId: '', tradovateSpec: '', environment: 'demo' });
    setShowModal(true);
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    setForm({ name: acc.name, tradovateId: acc.tradovateId, tradovateSpec: acc.tradovateSpec, environment: acc.environment });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editing) {
      await api.put(`/accounts/${editing.id}`, form);
    } else {
      await api.post('/accounts', form);
    }
    setShowModal(false);
    fetchAccounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Desactivar esta cuenta?')) return;
    await api.delete(`/accounts/${id}`);
    fetchAccounts();
  };

  const connectTradovate = () => {
    window.location.href = '/api/auth/tradovate/connect';
  };

  if (loading) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Cuentas</h2>
        <div className="flex gap-2">
          <button onClick={connectTradovate} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded">
            Conectar Tradovate
          </button>
          <button onClick={openCreate} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded">
            + Nueva Cuenta
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Nombre</th>
              <th className="text-left px-4 py-2 text-gray-500">Tradovate ID</th>
              <th className="text-center px-4 py-2 text-gray-500">Ambiente</th>
              <th className="text-right px-4 py-2 text-gray-500">Balance</th>
              <th className="text-center px-4 py-2 text-gray-500">Etapa</th>
              <th className="text-center px-4 py-2 text-gray-500">Estado</th>
              <th className="text-center px-4 py-2 text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-3 text-gray-200">{acc.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{acc.tradovateId}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${acc.environment === 'live' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'}`}>
                    {acc.environment}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-300">${acc.balance.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">
                  {acc.tradingRules?.accountStage || 'challenge'}
                </td>
                <td className="px-4 py-3 text-center">
                  {!acc.isActive ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">Inactiva</span>
                  ) : acc.accessToken ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400">Conectada</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400">Sin token</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center space-x-2">
                  <button onClick={() => openEdit(acc)} className="text-xs text-blue-400 hover:text-blue-300">Editar</button>
                  <button onClick={() => handleDelete(acc.id)} className="text-xs text-red-400 hover:text-red-300">Desactivar</button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">No hay cuentas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">{editing ? 'Editar Cuenta' : 'Nueva Cuenta'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Nombre</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Tradovate Account ID</label>
                <input value={form.tradovateId} onChange={(e) => setForm({ ...form, tradovateId: e.target.value })}
                  disabled={!!editing}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1 disabled:opacity-50" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Tradovate Spec</label>
                <input value={form.tradovateSpec} onChange={(e) => setForm({ ...form, tradovateSpec: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Ambiente</label>
                <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
                  <option value="demo">Demo</option>
                  <option value="live">Live</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/users'),
      api.get('/admin/metrics'),
    ]).then(([uRes, mRes]) => {
      if (uRes.success) setUsers(uRes.data || []);
      if (mRes.success) setMetrics(mRes.data);
      setLoading(false);
    });
  }, []);

  const loadUserDetail = async (id: string) => {
    const res = await api.get(`/admin/users/${id}`);
    if (res.success) setSelectedUser(res.data);
  };

  const toggleUser = async (id: string, isActive: boolean) => {
    await api.patch(`/admin/users/${id}`, { isActive: !isActive });
    const res = await api.get('/admin/users');
    if (res.success) setUsers(res.data || []);
  };

  if (loading) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Admin Dashboard</h2>

      {/* Global Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Usuarios</p>
            <p className="text-2xl font-bold text-emerald-400">{metrics.totalUsers}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Activos</p>
            <p className="text-2xl font-bold text-blue-400">{metrics.activeUsers}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Cuentas</p>
            <p className="text-2xl font-bold text-purple-400">{metrics.totalAccounts}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Signals Hoy</p>
            <p className="text-2xl font-bold text-amber-400">{metrics.signalsToday}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Ordenes Hoy</p>
            <p className="text-2xl font-bold text-cyan-400">{metrics.ordersToday}</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">Usuarios</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Nombre</th>
              <th className="text-left px-4 py-2 text-gray-500">Email</th>
              <th className="text-center px-4 py-2 text-gray-500">Plan</th>
              <th className="text-right px-4 py-2 text-gray-500">Cuentas</th>
              <th className="text-center px-4 py-2 text-gray-500">Rol</th>
              <th className="text-center px-4 py-2 text-gray-500">Estado</th>
              <th className="text-center px-4 py-2 text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => loadUserDetail(user.id)}>
                <td className="px-4 py-3 text-gray-200">{user.name || '-'}</td>
                <td className="px-4 py-3 text-gray-400">{user.email}</td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">{user.subscription?.plan || 'sin plan'}</td>
                <td className="px-4 py-3 text-right text-gray-300">{user._count?.accounts || 0}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-700 text-gray-400'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${user.isActive ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggleUser(user.id, user.isActive)}
                    className={`text-xs ${user.isActive ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                    {user.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Detail Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-gray-900 border-l border-gray-700 w-full max-w-lg p-6 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">{selectedUser.name || selectedUser.email}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-300">X</button>
            </div>
            <div className="space-y-2 text-sm mb-6">
              <p><span className="text-gray-500">Email:</span> <span className="text-gray-300">{selectedUser.email}</span></p>
              <p><span className="text-gray-500">Rol:</span> <span className="text-gray-300">{selectedUser.role}</span></p>
              <p><span className="text-gray-500">Webhook:</span> <span className="text-gray-300 font-mono text-xs">{selectedUser.webhookToken}</span></p>
            </div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Cuentas ({selectedUser.accounts?.length || 0})</h4>
            <div className="space-y-2">
              {selectedUser.accounts?.map((acc: any) => (
                <div key={acc.id} className="bg-gray-800 rounded p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-300">{acc.name}</span>
                    <span className="text-gray-400">${acc.balance.toFixed(2)}</span>
                  </div>
                  <div className="text-gray-500 mt-1">{acc.tradovateId} | {acc.environment}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Dashboard() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [accRes, sigRes] = await Promise.all([
      api.get('/accounts'),
      api.get('/signals?limit=10'),
    ]);
    if (accRes.success) setAccounts(accRes.data || []);
    if (sigRes.success) setSignals(sigRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const pausedAccounts = accounts.filter(
    (a) => a.dailyStats?.[0]?.isPaused
  );
  const totalPnL = accounts.reduce(
    (sum, a) => sum + (a.dailyStats?.[0]?.pnl || 0),
    0
  );

  if (loading) {
    return <div className="text-gray-500">Cargando dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard</h2>

      {pausedAccounts.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">
            {pausedAccounts.length} cuenta(s) pausada(s) por max losses consecutivos
          </p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Cuentas Activas</p>
          <p className="text-2xl font-bold text-emerald-400">{activeAccounts.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Signals Hoy</p>
          <p className="text-2xl font-bold text-blue-400">{signals.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Ordenes Hoy</p>
          <p className="text-2xl font-bold text-purple-400">
            {accounts.reduce((sum, a) => sum + (a.dailyStats?.[0]?.entriesCount || 0), 0)}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">P&L Total</p>
          <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${totalPnL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Accounts table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">Cuentas</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Ambiente</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Balance</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Entradas Hoy</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">P&L</th>
              <th className="text-center px-4 py-2 text-gray-500 font-medium">Etapa</th>
              <th className="text-center px-4 py-2 text-gray-500 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {accounts.map((acc) => {
              const stat = acc.dailyStats?.[0];
              const stage = acc.tradingRules?.accountStage || 'challenge';
              const hasToken = !!acc.accessToken;

              return (
                <tr key={acc.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-200">{acc.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${acc.environment === 'live' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      {acc.environment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">${acc.balance.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{stat?.entriesCount || 0}</td>
                  <td className={`px-4 py-3 text-right ${(stat?.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${(stat?.pnl || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-gray-400">{stage}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!acc.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">Inactiva</span>
                    ) : !hasToken ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400">Sin token</span>
                    ) : stat?.isPaused ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-400">Pausada</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400">Activa</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600">
                  No hay cuentas configuradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent signals */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">Ultimas Signals</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Hora</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Simbolo</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Accion</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Precio</th>
              <th className="text-center px-4 py-2 text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {signals.map((sig) => (
              <tr key={sig.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {new Date(sig.createdAt).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2 text-gray-200 font-mono">{sig.symbol}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${
                    sig.action === 'BUY' ? 'text-emerald-400' :
                    sig.action === 'SELL' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {sig.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-gray-300">{sig.price}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    sig.status === 'processed' ? 'bg-emerald-900/30 text-emerald-400' :
                    sig.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
                    'bg-blue-900/30 text-blue-400'
                  }`}>
                    {sig.status}
                  </span>
                </td>
              </tr>
            ))}
            {signals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                  No hay signals recientes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

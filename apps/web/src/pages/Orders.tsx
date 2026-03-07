import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const fetchOrders = async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (accountId) params.set('accountId', accountId);
    if (status) params.set('status', status);

    const res = await api.get(`/orders?${params}`);
    if (res.success) {
      setOrders(res.data || []);
      setTotal(res.total || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    api.get('/accounts').then((res) => {
      if (res.success) setAccounts(res.data || []);
    });
  }, []);

  useEffect(() => { fetchOrders(); }, [offset, accountId, status]);

  if (loading) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Orders</h2>
        <div className="flex gap-2">
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setOffset(0); }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100">
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100">
            <option value="">Todos los status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="filled">Filled</option>
            <option value="skipped">Skipped</option>
            <option value="rejected">Rejected</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Fecha</th>
              <th className="text-left px-4 py-2 text-gray-500">Cuenta</th>
              <th className="text-left px-4 py-2 text-gray-500">Simbolo</th>
              <th className="text-left px-4 py-2 text-gray-500">Lado</th>
              <th className="text-right px-4 py-2 text-gray-500">Qty</th>
              <th className="text-right px-4 py-2 text-gray-500">Fill Price</th>
              <th className="text-center px-4 py-2 text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-gray-500">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(order.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-300">{order.account?.name}</td>
                <td className="px-4 py-2 text-gray-200 font-mono">{order.symbol}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${order.side === 'Buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {order.side}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-gray-300">{order.qty}</td>
                <td className="px-4 py-2 text-right text-gray-300">
                  {order.fillPrice ? `$${order.fillPrice.toFixed(2)}` : '-'}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    order.status === 'filled' ? 'bg-emerald-900/30 text-emerald-400' :
                    order.status === 'sent' ? 'bg-blue-900/30 text-blue-400' :
                    order.status === 'error' ? 'bg-red-900/30 text-red-400' :
                    order.status === 'skipped' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>{order.status}</span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 max-w-48 truncate">
                  {order.skipReason || order.errorMsg || '-'}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-600">No hay ordenes</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="px-3 py-1 text-sm bg-gray-800 text-gray-400 rounded disabled:opacity-30">Anterior</button>
          <span className="px-3 py-1 text-sm text-gray-500">{offset + 1}-{Math.min(offset + limit, total)} de {total}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="px-3 py-1 text-sm bg-gray-800 text-gray-400 rounded disabled:opacity-30">Siguiente</button>
        </div>
      )}
    </div>
  );
}

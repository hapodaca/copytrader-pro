import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Signals() {
  const [signals, setSignals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [symbol, setSymbol] = useState('');
  const [selectedSignal, setSelectedSignal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const fetchSignals = async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set('status', status);
    if (symbol) params.set('symbol', symbol);

    const res = await api.get(`/signals?${params}`);
    if (res.success) {
      setSignals(res.data || []);
      setTotal(res.total || 0);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSignals(); }, [offset, status]);

  const loadSignalDetail = async (id: string) => {
    const res = await api.get(`/signals/${id}`);
    if (res.success) setSelectedSignal(res.data);
  };

  if (loading) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Signals</h2>
        <div className="flex gap-2">
          <input placeholder="Simbolo..." value={symbol} onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchSignals()}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 w-32" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100">
            <option value="">Todos</option>
            <option value="received">Received</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-500">Fecha</th>
              <th className="text-left px-4 py-2 text-gray-500">Simbolo</th>
              <th className="text-left px-4 py-2 text-gray-500">Accion</th>
              <th className="text-right px-4 py-2 text-gray-500">Precio</th>
              <th className="text-left px-4 py-2 text-gray-500">Estrategia</th>
              <th className="text-center px-4 py-2 text-gray-500">Ordenes</th>
              <th className="text-center px-4 py-2 text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {signals.map((sig) => (
              <tr key={sig.id} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => loadSignalDetail(sig.id)}>
                <td className="px-4 py-2 text-gray-400 text-xs">{new Date(sig.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-200 font-mono">{sig.symbol}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${sig.action === 'BUY' ? 'text-emerald-400' : sig.action === 'SELL' ? 'text-red-400' : 'text-blue-400'}`}>
                    {sig.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-gray-300">{sig.price}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{sig.strategy || '-'}</td>
                <td className="px-4 py-2 text-center text-gray-300">{sig._count?.orders || 0}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    sig.status === 'processed' ? 'bg-emerald-900/30 text-emerald-400' :
                    sig.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
                    'bg-blue-900/30 text-blue-400'
                  }`}>{sig.status}</span>
                </td>
              </tr>
            ))}
            {signals.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">No hay signals</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="px-3 py-1 text-sm bg-gray-800 text-gray-400 rounded disabled:opacity-30">Anterior</button>
          <span className="px-3 py-1 text-sm text-gray-500">{offset + 1}-{Math.min(offset + limit, total)} de {total}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="px-3 py-1 text-sm bg-gray-800 text-gray-400 rounded disabled:opacity-30">Siguiente</button>
        </div>
      )}

      {/* Signal Detail Drawer */}
      {selectedSignal && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-50" onClick={() => setSelectedSignal(null)}>
          <div className="bg-gray-900 border-l border-gray-700 w-full max-w-lg p-6 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Detalle Signal</h3>
              <button onClick={() => setSelectedSignal(null)} className="text-gray-500 hover:text-gray-300">X</button>
            </div>
            <div className="space-y-2 text-sm mb-6">
              <p><span className="text-gray-500">ID:</span> <span className="text-gray-300 font-mono text-xs">{selectedSignal.id}</span></p>
              <p><span className="text-gray-500">Simbolo:</span> <span className="text-gray-200">{selectedSignal.symbol}</span></p>
              <p><span className="text-gray-500">Accion:</span> <span className="text-gray-200">{selectedSignal.action}</span></p>
              <p><span className="text-gray-500">Precio:</span> <span className="text-gray-200">{selectedSignal.price}</span></p>
              <p><span className="text-gray-500">Source:</span> <span className="text-gray-200">{selectedSignal.source}</span></p>
              <p><span className="text-gray-500">Status:</span> <span className="text-gray-200">{selectedSignal.status}</span></p>
              {selectedSignal.rejectReason && <p><span className="text-gray-500">Razon:</span> <span className="text-red-400">{selectedSignal.rejectReason}</span></p>}
            </div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Ordenes generadas</h4>
            <div className="space-y-2">
              {selectedSignal.orders?.map((o: any) => (
                <div key={o.id} className="bg-gray-800 rounded p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-300">{o.account?.name}</span>
                    <span className={`${o.status === 'filled' ? 'text-emerald-400' : o.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{o.status}</span>
                  </div>
                  <div className="text-gray-500 mt-1">
                    {o.side} x{o.qty} {o.skipReason && `— ${o.skipReason}`} {o.errorMsg && `— ${o.errorMsg}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

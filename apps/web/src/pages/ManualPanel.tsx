import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface LogEntry {
  id: string;
  time: string;
  symbol: string;
  action: string;
  groupName: string;
  status: string;
}

export default function ManualPanel() {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get('/groups').then((res) => {
      if (res.success && res.data) {
        setGroups(res.data);
        if (res.data.length > 0) setSelectedGroupId(res.data[0].id);
      }
    });
  }, []);

  const handleAction = (action: string) => {
    if (!selectedGroupId || !symbol.trim()) return;
    setPendingAction(action);
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    setSending(true);
    setShowConfirm(false);

    const res = await api.post('/manual/signal', {
      groupId: selectedGroupId,
      symbol: symbol.trim().toUpperCase(),
      action: pendingAction,
    });

    const group = groups.find((g) => g.id === selectedGroupId);
    const entry: LogEntry = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString(),
      symbol: symbol.trim().toUpperCase(),
      action: pendingAction,
      groupName: group?.name || '',
      status: res.success ? 'enviada' : `error: ${res.error}`,
    };

    setLog((prev) => [entry, ...prev].slice(0, 20));
    setSending(false);
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const followerCount = selectedGroup?.followers?.filter((f: any) => f.isActive).length || 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold">Panel Manual</h2>

      {/* Group + Symbol */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500">Copy Group destino</label>
          <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.followers?.filter((f: any) => f.isActive).length || 0} cuentas)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Simbolo (ej: MNQU25)</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="MNQU25"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1 font-mono" />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => handleAction('BUY')} disabled={!symbol || !selectedGroupId || sending}
          className="py-4 rounded-lg text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-30 transition-colors">
          BUY
        </button>
        <button onClick={() => handleAction('SELL')} disabled={!symbol || !selectedGroupId || sending}
          className="py-4 rounded-lg text-lg font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-30 transition-colors">
          SELL
        </button>
        <button onClick={() => handleAction('CLOSE_LONG')} disabled={!symbol || !selectedGroupId || sending}
          className="py-4 rounded-lg text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 transition-colors">
          CLOSE LONG
        </button>
        <button onClick={() => handleAction('CLOSE_SHORT')} disabled={!symbol || !selectedGroupId || sending}
          className="py-4 rounded-lg text-lg font-bold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30 transition-colors">
          CLOSE SHORT
        </button>
      </div>

      {/* Log */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400">Ultimas ordenes manuales</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-800/30">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500">Hora</th>
              <th className="text-left px-3 py-2 text-gray-500">Simbolo</th>
              <th className="text-left px-3 py-2 text-gray-500">Accion</th>
              <th className="text-left px-3 py-2 text-gray-500">Grupo</th>
              <th className="text-left px-3 py-2 text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {log.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2 text-gray-400">{entry.time}</td>
                <td className="px-3 py-2 text-gray-200 font-mono">{entry.symbol}</td>
                <td className={`px-3 py-2 font-medium ${
                  entry.action === 'BUY' ? 'text-emerald-400' :
                  entry.action === 'SELL' ? 'text-red-400' :
                  'text-blue-400'
                }`}>{entry.action}</td>
                <td className="px-3 py-2 text-gray-400">{entry.groupName}</td>
                <td className="px-3 py-2 text-gray-300">{entry.status}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-600">Sin ordenes en esta sesion</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Confirmar Orden Manual</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Grupo:</span> <span className="text-gray-200">{selectedGroup?.name}</span></p>
              <p><span className="text-gray-500">Simbolo:</span> <span className="text-gray-200 font-mono">{symbol}</span></p>
              <p><span className="text-gray-500">Accion:</span>
                <span className={`ml-1 font-medium ${pendingAction === 'BUY' ? 'text-emerald-400' : pendingAction === 'SELL' ? 'text-red-400' : 'text-blue-400'}`}>
                  {pendingAction}
                </span>
              </p>
              <p><span className="text-gray-500">Cuentas destino:</span> <span className="text-gray-200">{followerCount}</span></p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm text-gray-400">Cancelar</button>
              <button onClick={confirmSend}
                className={`px-4 py-2 text-sm text-white rounded ${pendingAction === 'BUY' ? 'bg-emerald-600' : pendingAction === 'SELL' ? 'bg-red-600' : 'bg-blue-600'}`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

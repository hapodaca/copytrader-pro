import { useState, useEffect } from 'react';
import { api } from '../api/client';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS: Record<string, string> = { MON: 'Lun', TUE: 'Mar', WED: 'Mie', THU: 'Jue', FRI: 'Vie', SAT: 'Sab', SUN: 'Dom' };

export default function Rules() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [rules, setRules] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/accounts').then((res) => {
      if (res.success && res.data?.length > 0) {
        setAccounts(res.data);
        setSelectedAccountId(res.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    api.get(`/rules/${selectedAccountId}`).then((res) => {
      if (res.success) {
        setRules(res.data || {
          accountStage: 'challenge', riskMode: 'fixed_usd', fixedRiskAmount: 650,
          maxEntriesPerDay: 3, allowedDays: ['MON','TUE','WED','THU','FRI'],
          startTime: '08:00', endTime: '15:30', maxDrawdownPct: 5.0,
          reduceRiskAfterLosses: true, reduceRiskFactor: 0.5,
          maxConsecutiveLosses: 3, pauseAfterMaxLosses: true,
        });
      }
    });
  }, [selectedAccountId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const res = await api.put(`/rules/${selectedAccountId}`, rules);
    if (res.success) setMessage('Reglas guardadas');
    else setMessage(`Error: ${res.error}`);
    setSaving(false);
  };

  const toggleDay = (day: string) => {
    if (!rules) return;
    const days = rules.allowedDays.includes(day)
      ? rules.allowedDays.filter((d: string) => d !== day)
      : [...rules.allowedDays, day];
    setRules({ ...rules, allowedDays: days });
  };

  if (!rules) return <div className="text-gray-500">Selecciona una cuenta...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Reglas de Trading</h2>
        <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Etapa Apex */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-emerald-400">Etapa Apex</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Etapa</label>
            <select value={rules.accountStage} onChange={(e) => setRules({ ...rules, accountStage: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
              <option value="challenge">Challenge</option>
              <option value="funded_to_withdrawal">Funded (pre-retiro)</option>
              <option value="funded_active">Funded (activo)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Modo de Riesgo</label>
            <select value={rules.riskMode} onChange={(e) => setRules({ ...rules, riskMode: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1">
              <option value="fixed_usd">Monto fijo (USD)</option>
              <option value="pct_balance">% del balance</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Monto fijo USD</label>
            <input type="number" value={rules.fixedRiskAmount}
              onChange={(e) => setRules({ ...rules, fixedRiskAmount: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
        </div>
      </div>

      {/* Horario */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-blue-400">Horario (CT)</h3>
        <div className="flex gap-1">
          {DAYS.map((day) => (
            <button key={day} onClick={() => toggleDay(day)}
              className={`px-2.5 py-1.5 text-xs rounded ${rules.allowedDays.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Hora inicio</label>
            <input type="time" value={rules.startTime} onChange={(e) => setRules({ ...rules, startTime: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Hora fin</label>
            <input type="time" value={rules.endTime} onChange={(e) => setRules({ ...rules, endTime: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
        </div>
      </div>

      {/* Proteccion */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-amber-400">Proteccion</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Max entradas/dia</label>
            <input type="number" value={rules.maxEntriesPerDay}
              onChange={(e) => setRules({ ...rules, maxEntriesPerDay: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Max Drawdown %</label>
            <input type="number" step="0.5" value={rules.maxDrawdownPct}
              onChange={(e) => setRules({ ...rules, maxDrawdownPct: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Max losses consecutivos</label>
            <input type="number" value={rules.maxConsecutiveLosses}
              onChange={(e) => setRules({ ...rules, maxConsecutiveLosses: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Factor reduccion</label>
            <input type="range" min="0.1" max="1" step="0.1" value={rules.reduceRiskFactor}
              onChange={(e) => setRules({ ...rules, reduceRiskFactor: parseFloat(e.target.value) })}
              className="w-full mt-3" />
            <p className="text-xs text-gray-500 text-right">{rules.reduceRiskFactor}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={rules.reduceRiskAfterLosses}
              onChange={(e) => setRules({ ...rules, reduceRiskAfterLosses: e.target.checked })}
              className="rounded" />
            Reducir riesgo despues de losses
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={rules.pauseAfterMaxLosses}
              onChange={(e) => setRules({ ...rules, pauseAfterMaxLosses: e.target.checked })}
              className="rounded" />
            Pausar despues de max losses
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar Reglas'}
        </button>
        {message && <span className="text-sm text-emerald-400">{message}</span>}
      </div>
    </div>
  );
}

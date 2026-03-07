export default function Reports() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Reports</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
        <p className="text-gray-400 text-lg mb-4">Bitacora disponible en v1.2</p>
        <div className="text-sm text-gray-600 space-y-1">
          <p>Funcionalidades planificadas:</p>
          <ul className="list-disc list-inside mt-2 text-left max-w-md mx-auto">
            <li>Estadisticas de rendimiento por cuenta</li>
            <li>Equity curve interactiva</li>
            <li>Analisis temporal (mejor hora, mejor dia)</li>
            <li>Lista detallada de trades con P&L</li>
            <li>Exportar a CSV</li>
            <li>Comparativa entre cuentas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

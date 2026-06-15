import { useState } from "react";

export default function Historial({ historial = [], canViewFinancials, totalRecaudado = 0, verDetalleVenta }) {
  const [busquedaFecha, setBusquedaFecha] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const hist = Array.isArray(historial) ? historial : [];
  const totalRec = parseFloat(totalRecaudado) || 0;

  const historialFiltrado = hist.filter(v => {
    if (!busquedaFecha) return true;
    try {
      const fechaVenta = new Date(v.fecha).toISOString().split('T')[0];
      return fechaVenta === busquedaFecha;
    } catch {
      return false;
    }
  });

  const totalPages = Math.ceil(historialFiltrado.length / itemsPerPage) || 1;
  const paginatedHistorial = historialFiltrado.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Historial de Ventas</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Revisa las ventas recientes y accede al detalle de cada ticket.</p>
          </div>
          <div className={`min-w-[240px] rounded-2xl border px-5 py-4 shadow-sm ${canViewFinancials ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'}`}>
            {canViewFinancials ? (
              <>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Cierre de Caja Virtual</p>
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">${totalRec.toFixed(2)}</p>
              </>
            ) : (
              <>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Resumen Económico</p>
                <p className="text-sm font-semibold italic opacity-80">Acceso restringido</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Registro de Operaciones</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Filtrar por fecha:</span>
            <input
              type="date"
              value={busquedaFecha}
              onChange={(e) => { setBusquedaFecha(e.target.value); setCurrentPage(1); }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900"
            />
            {busquedaFecha && (
              <button onClick={() => { setBusquedaFecha(''); setCurrentPage(1); }} className="text-xs text-rose-500 dark:text-rose-400 font-bold hover:underline">Limpiar</button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-5 py-3">ID Venta</th>
                <th className="px-5 py-3">Fecha y Hora</th>
                <th className="px-5 py-3">Vendedor</th>
                <th className="px-5 py-3">Monto Total</th>
                <th className="px-5 py-3 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {historialFiltrado.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <span className="mb-2 block text-4xl opacity-50">🧾</span>
                    {busquedaFecha ? 'No se encontraron ventas para esa fecha.' : 'No hay ventas registradas todavía.'}
                  </td>
                </tr>
              ) : (
                paginatedHistorial.map((venta) => (
                  <tr key={venta.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">#{venta.id}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{new Date(venta.fecha).toLocaleString()}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{venta.vendedor || 'Desconocido'}</td>
                    <td className="px-5 py-3 font-black text-emerald-600 dark:text-emerald-400">${parseFloat(venta.total).toFixed(2)}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => verDetalleVenta(venta.id)}
                        className="mx-auto flex items-center justify-center gap-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 transition-all hover:bg-indigo-600 hover:text-white"
                      >
                        <span>👁️</span> Ver Ticket
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 px-5 py-3">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >Anterior</button>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Página {currentPage} de {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >Siguiente</button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

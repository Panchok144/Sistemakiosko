import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import * as xlsx from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Reportes() {
  const [tab, setTab] = useState('ventas'); // ventas | inventario | margenes | rotacion | rubros
  const [loading, setLoading] = useState(false);

  // Filters
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

  // Data states
  const [reporteVentas, setReporteVentas] = useState(null);
  const [reporteInventario, setReporteInventario] = useState(null);
  const [reporteMargenes, setReporteMargenes] = useState([]);
  const [reporteRotacion, setReporteRotacion] = useState([]);
  const [reporteRubros, setReporteRubros] = useState([]);

  useEffect(() => {
    cargarReporte();
  }, [tab, desde, hasta]);

  const cargarReporte = async () => {
    setLoading(true);
    try {
      if (tab === 'ventas') {
        const res = await apiClient.get(`/api/reportes/ventas?desde=${desde}&hasta=${hasta}`);
        setReporteVentas(res.data);
      } else if (tab === 'inventario') {
        const res = await apiClient.get('/api/reportes/inventario');
        setReporteInventario(res.data);
      } else if (tab === 'margenes') {
        const res = await apiClient.get('/api/reportes/margenes');
        setReporteMargenes(res.data || []);
      } else if (tab === 'rotacion') {
        const res = await apiClient.get('/api/reportes/rotacion?dias=30');
        setReporteRotacion(res.data || []);
      } else if (tab === 'rubros') {
        const res = await apiClient.get(`/api/reportes/rubros?desde=${desde}&hasta=${hasta}`);
        setReporteRubros(res.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = (data, filename) => {
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Reporte');
    xlsx.writeFile(wb, `${filename}_${desde}_al_${hasta}.xlsx`);
  };

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Reportes y Analytics de Negocio</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Valorización de stock, rentabilidad, rotación y métricas de ventas.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none"
          />
          <span className="text-xs text-slate-500 font-bold">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {[
          { id: 'ventas', label: '📊 Ventas' },
          { id: 'inventario', label: '📦 Valorización Stock' },
          { id: 'margenes', label: '💰 Márgenes & Ganancia' },
          { id: 'rotacion', label: '🔄 Rotación (30 días)' },
          { id: 'rubros', label: '🏷️ Por Categoría' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab === t.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-bold">Cargando reporte...</div>
      ) : (
        <>
          {/* TAB 1: VENTAS */}
          {tab === 'ventas' && reporteVentas && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Facturado</p>
                  <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">${reporteVentas.summary.ingresos_totales.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ventas Realizadas</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{reporteVentas.summary.total_ventas}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ticket Promedio</p>
                  <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">${reporteVentas.summary.ticket_promedio.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descuentos Otorgados</p>
                  <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">${reporteVentas.summary.descuentos_totales.toFixed(2)}</p>
                </div>
              </div>

              {/* Botón Exportar */}
              <div className="flex justify-end">
                <button
                  onClick={() => exportarExcel(reporteVentas.ventas, 'Reporte_Ventas')}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition"
                >
                  📥 Exportar a Excel
                </button>
              </div>

              {/* Tabla Ventas */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3"># Ticket</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Comprobante</th>
                      <th className="px-4 py-3">Pago</th>
                      <th className="px-4 py-3">Unidades</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reporteVentas.ventas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">#{v.id}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{new Date(v.fecha).toLocaleString()}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{v.vendedor}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{v.tipo_comprobante}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 capitalize">{v.metodo_pago}</td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-semibold">{v.unidades_vendidas}</td>
                        <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400">${parseFloat(v.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: INVENTARIO VALORIZADO */}
          {tab === 'inventario' && reporteInventario && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor de Costo del Stock</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">${reporteInventario.totals.valor_costo_total.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor de Venta Potencial</p>
                  <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">${reporteInventario.totals.valor_venta_total.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unidades Totales en Stock</p>
                  <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">{reporteInventario.totals.unidades_total}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => exportarExcel(reporteInventario.productos, 'Valorizacion_Inventario')}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition"
                >
                  📥 Exportar a Excel
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-4 py-3">Costo U.</th>
                      <th className="px-4 py-3">Precio Venta</th>
                      <th className="px-4 py-3">Margen %</th>
                      <th className="px-4 py-3">Valor Total Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reporteInventario.productos.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{p.nombre}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{p.rubro || 'Sin categoría'}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{p.stock}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-semibold">${parseFloat(p.costo).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-semibold">${parseFloat(p.precio_venta).toFixed(2)}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">{p.margen_porcentaje}%</td>
                        <td className="px-4 py-3 font-black text-slate-900 dark:text-slate-100">${parseFloat(p.valor_costo).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: MÁRGENES */}
          {tab === 'margenes' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm overflow-x-auto">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Rentabilidad y Ganancia Bruta por Producto (Mes Actual)</h2>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Costo</th>
                    <th className="px-4 py-3">P. Venta</th>
                    <th className="px-4 py-3">Margen $</th>
                    <th className="px-4 py-3">Margen %</th>
                    <th className="px-4 py-3">Vendidos Mes</th>
                    <th className="px-4 py-3">Ganancia Bruta Mes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {reporteMargenes.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{m.nombre}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">${parseFloat(m.costo).toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">${parseFloat(m.precio_venta).toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">${parseFloat(m.margen_unitario).toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{m.margen_porcentaje}%</td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-semibold">{m.unidades_vendidas_mes} u.</td>
                      <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400">${parseFloat(m.ganancia_mes).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ROTACIÓN */}
          {tab === 'rotacion' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm overflow-x-auto">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Rotación y Días de Stock Estimados (Últimos 30 Días)</h2>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Stock Actual</th>
                    <th className="px-4 py-3">Vendidos (30d)</th>
                    <th className="px-4 py-3">Recaudación (30d)</th>
                    <th className="px-4 py-3">Días de Stock Restantes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {reporteRotacion.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{r.nombre}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{r.stock}</td>
                      <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">{r.vendidos_periodo} u.</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">${parseFloat(r.revenue_periodo).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {r.dias_stock_restante != null ? (
                          <span className={`font-bold ${parseFloat(r.dias_stock_restante) <= 7 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                            ~{r.dias_stock_restante} días
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Sin movimiento</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: CATEGORÍAS */}
          {tab === 'rubros' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ventas por Categoría</h2>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reporteRubros}
                        dataKey="ingresos"
                        nameKey="rubro"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ rubro, percent }) => `${rubro} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {reporteRubros.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => `$${parseFloat(val).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm overflow-x-auto">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">Desglose de Ingresos por Categoría</h3>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Ventas</th>
                      <th className="px-4 py-3">Unidades</th>
                      <th className="px-4 py-3">Ingresos Totales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reporteRubros.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{r.rubro}</td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{r.total_ventas}</td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{r.unidades}</td>
                        <td className="px-4 py-3 font-black text-indigo-600 dark:text-indigo-400">${parseFloat(r.ingresos).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

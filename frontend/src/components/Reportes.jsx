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
  const [reporteAbc, setReporteAbc] = useState(null);
  const [filtroClaseAbc, setFiltroClaseAbc] = useState('todas');
  const [reporteFranja, setReporteFranja] = useState(null);

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
      } else if (tab === 'abc') {
        const res = await apiClient.get('/api/reportes/analisis-abc?dias=90');
        setReporteAbc(res.data);
      } else if (tab === 'franja') {
        const res = await apiClient.get(`/api/reportes/franja-horaria?desde=${desde}&hasta=${hasta}`);
        setReporteFranja(res.data);
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
          { id: 'abc', label: '🎯 Clasificación ABC (80/20)' },
          { id: 'franja', label: '⏰ Franja Horaria (Heatmap)' },
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

          {/* TAB 6: CLASIFICACIÓN ABC PARETO */}
          {tab === 'abc' && reporteAbc && (
            <div className="space-y-6">
              {/* Header & Description */}
              <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-indigo-950 dark:text-indigo-100">Principio de Pareto (Regla 80/20) para Minimarkets</h3>
                    <p className="mt-1 text-xs text-indigo-800/80 dark:text-indigo-300 max-w-2xl">
                      El 20% de tus productos genera el 80% de tus ventas. Clasificá tu catálogo para priorizar la reposición de productos estrella y reducir capital inmovilizado en productos de baja rotación.
                    </p>
                  </div>
                  <button
                    onClick={() => exportarExcel(
                      [...(reporteAbc.categoria_a || []), ...(reporteAbc.categoria_b || []), ...(reporteAbc.categoria_c || [])],
                      'Analisis_ABC_Inventario'
                    )}
                    className="flex items-center gap-2 rounded-xl bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition shadow-sm"
                  >
                    📥 Exportar Clasificación
                  </button>
                </div>
              </div>

              {/* 3 ABC Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/30 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">CLASE A</span>
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">~80% Ventas</span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    ${(reporteAbc.resumen?.categoria_a?.ingresos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {reporteAbc.resumen?.categoria_a?.cantidad || 0} productos ({reporteAbc.resumen?.categoria_a?.porcentaje_catalogo || 0}% del catálogo)
                  </p>
                  <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    ★ Productos estrella. Nunca deben quebrar stock.
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/30 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-black text-white">CLASE B</span>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">~15% Ventas</span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-amber-600 dark:text-amber-400">
                    ${(reporteAbc.resumen?.categoria_b?.ingresos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {reporteAbc.resumen?.categoria_b?.cantidad || 0} productos ({reporteAbc.resumen?.categoria_b?.porcentaje_catalogo || 0}% del catálogo)
                  </p>
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    ● Rotación intermedia. Reposición semanal estándar.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-slate-600 px-2.5 py-1 text-xs font-black text-white">CLASE C</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">~5% Ventas</span>
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-700 dark:text-slate-300">
                    ${(reporteAbc.resumen?.categoria_c?.ingresos || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-medium">
                    {reporteAbc.resumen?.categoria_c?.cantidad || 0} productos ({reporteAbc.resumen?.categoria_c?.porcentaje_catalogo || 0}% del catálogo)
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    ▼ Baja rotación. Evaluar promociones o reducir compra.
                  </p>
                </div>
              </div>

              {/* Table with Filter */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">Listado de Artículos Clasificados</h4>
                  <div className="flex gap-1.5">
                    {['todas', 'A', 'B', 'C'].map((cl) => (
                      <button
                        key={cl}
                        type="button"
                        onClick={() => setFiltroClaseAbc(cl)}
                        className={`rounded-lg px-3 py-1 text-xs font-bold transition ${filtroClaseAbc === cl ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}
                      >
                        {cl === 'todas' ? 'Todos' : `Clase ${cl}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Clase</th>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3">Rubro</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        <th className="px-4 py-3 text-right">Unidades Vendidas</th>
                        <th className="px-4 py-3 text-right">Ingresos</th>
                        <th className="px-4 py-3 text-right">% Facturación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {[...(reporteAbc.categoria_a || []), ...(reporteAbc.categoria_b || []), ...(reporteAbc.categoria_c || [])]
                        .filter(p => filtroClaseAbc === 'todas' || p.clase === filtroClaseAbc)
                        .map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${
                                p.clase === 'A' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' :
                                p.clase === 'B' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                              }`}>
                                Clase {p.clase}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{p.nombre}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.rubro || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">{p.stock}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{p.unidades_vendidas}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600 dark:text-indigo-400">
                              ${p.ingresos_totales.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">{p.pct_ingresos}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: FRANJA HORARIA (M10) */}
          {tab === 'franja' && reporteFranja && (() => {
            const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const datos = reporteFranja.datos || [];

            // Totales por hora (0..23)
            const porHora = Array.from({ length: 24 }, (_, h) => ({
              hora: `${h.toString().padStart(2, '0')}:00`,
              horaNum: h,
              ventas: 0,
              comprobantes: 0,
            }));

            // Matriz día x hora
            const matriz = {};
            let maxTotalCelda = 0;
            let totalGeneral = 0;
            let totalComprobantes = 0;

            for (const d of datos) {
              const h = d.hora;
              const dia = d.dia_semana;
              const tv = d.total_ventas || 0;
              const cv = d.cantidad_ventas || 0;

              if (porHora[h]) {
                porHora[h].ventas += tv;
                porHora[h].comprobantes += cv;
              }

              const key = `${dia}-${h}`;
              matriz[key] = { ventas: tv, comprobantes: cv };
              if (tv > maxTotalCelda) maxTotalCelda = tv;
              totalGeneral += tv;
              totalComprobantes += cv;
            }

            // Horas pico y mejor día
            const horaPico = [...porHora].sort((a, b) => b.ventas - a.ventas)[0] || { hora: '--', ventas: 0 };
            const horasConVentas = porHora.filter(h => h.horaNum >= 7 && h.horaNum <= 23);

            return (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Analizado</p>
                    <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      ${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{totalComprobantes} transacciones en el período</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hora Pico de Facturación</p>
                    <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">{horaPico.hora}</p>
                    <p className="text-xs text-slate-500 mt-1">${horaPico.ventas.toLocaleString('es-AR', { minimumFractionDigits: 2 })} acumulados</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Planificación de Turnos</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Horarios de mayor afluencia para reforzar cajeros y reposición.
                    </p>
                  </div>
                </div>

                {/* Gráfico Recharts de Ventas por Hora */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">Ventas por Hora del Día (7:00 a 23:00)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={horasConVentas}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                        <Tooltip
                          formatter={(value) => [`$${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 'Facturación']}
                          labelFormatter={(l) => `Hora: ${l}`}
                        />
                        <Bar dataKey="ventas" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Heatmap Día de Semana x Hora */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Mapa de Calor: Ventas por Día y Hora</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    La intensidad del color azul indica mayor volumen de facturación en esa franja horaria.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-center border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-left font-bold text-slate-600 dark:text-slate-400 w-16">Día</th>
                          {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => (
                            <th key={h} className="p-2 font-bold text-slate-500 dark:text-slate-400 text-[11px]">
                              {h}:00
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4, 5, 6, 0].map((diaNum) => (
                          <tr key={diaNum} className="border-t border-slate-100 dark:border-slate-700/60">
                            <td className="p-2 text-left font-bold text-slate-800 dark:text-slate-200">
                              {diasNombres[diaNum]}
                            </td>
                            {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => {
                              const celda = matriz[`${diaNum}-${h}`] || { ventas: 0, comprobantes: 0 };
                              const pct = maxTotalCelda > 0 ? celda.ventas / maxTotalCelda : 0;
                              const bg = pct > 0
                                ? `rgba(79, 70, 229, ${Math.max(0.12, Math.min(0.92, pct * 0.95))})`
                                : 'transparent';
                              const textoBlanco = pct > 0.45;

                              return (
                                <td
                                  key={h}
                                  className="p-1.5 transition hover:ring-2 hover:ring-indigo-500 rounded"
                                  style={{ backgroundColor: bg }}
                                  title={`${diasNombres[diaNum]} ${h}:00 hs — $${celda.ventas.toLocaleString('es-AR')} (${celda.comprobantes} ventas)`}
                                >
                                  {celda.ventas > 0 ? (
                                    <span className={`block font-bold text-[10px] ${textoBlanco ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                                      ${celda.ventas >= 1000 ? `${Math.round(celda.ventas / 1000)}k` : Math.round(celda.ventas)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700 text-[10px]">·</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

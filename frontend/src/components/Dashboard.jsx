import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, Package, Users, DollarSign, Calendar, FileSpreadsheet, Loader2,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ShoppingCart, Box, Truck, ShieldCheck,
  ArrowRight, CheckCircle2, Clock, CreditCard, ShoppingBag, TrendingDown, BarChart3,
  Tag, Settings, Zap, RefreshCw, Award, Star, Bell,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { formatCurrency, formatDate } from '../utils/formatters';

const generarOpcionesMeses = () => {
  const opciones = [];
  const hoy = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    opciones.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    });
  }
  return opciones;
};

const MESES = generarOpcionesMeses();

const MODULOS_RAPIDOS = [
  { name: 'Punto de Venta', desc: 'Cobrar y emitir tickets', path: '/ventas', icon: ShoppingCart, color: 'bg-indigo-600', lightBg: 'bg-indigo-50/70 dark:bg-indigo-950/30', border: 'border-indigo-100 dark:border-indigo-900/50', textColor: 'text-indigo-600 dark:text-indigo-400' },
  { name: 'Gestión de Caja', desc: 'Arqueo, apertura y cierre', path: '/caja', icon: Box, color: 'bg-amber-500', lightBg: 'bg-amber-50/70 dark:bg-amber-950/30', border: 'border-amber-100 dark:border-amber-900/50', textColor: 'text-amber-600 dark:text-amber-400' },
  { name: 'Inventario & Stock', desc: 'Catálogo, stock y precios', path: '/inventario', icon: Package, color: 'bg-blue-600', lightBg: 'bg-blue-50/70 dark:bg-blue-950/30', border: 'border-blue-100 dark:border-blue-900/50', textColor: 'text-blue-600 dark:text-blue-400' },
  { name: 'Clientes', desc: 'Cartera y cuentas corrientes', path: '/clientes', icon: Users, color: 'bg-teal-600', lightBg: 'bg-teal-50/70 dark:bg-teal-950/30', border: 'border-teal-100 dark:border-teal-900/50', textColor: 'text-teal-600 dark:text-teal-400' },
  { name: 'Cuenta Corriente', desc: 'Saldos pendientes y cobros', path: '/cuenta-corriente', icon: CreditCard, color: 'bg-violet-600', lightBg: 'bg-violet-50/70 dark:bg-violet-950/30', border: 'border-violet-100 dark:border-violet-900/50', textColor: 'text-violet-600 dark:text-violet-400' },
  { name: 'Facturas de Compra', desc: 'Ingreso de mercadería', path: '/facturas-compra', icon: ShoppingBag, color: 'bg-sky-600', lightBg: 'bg-sky-50/70 dark:bg-sky-950/30', border: 'border-sky-100 dark:border-sky-900/50', textColor: 'text-sky-600 dark:text-sky-400' },
  { name: 'Gastos Operativos', desc: 'Control y registro de egresos', path: '/gastos', icon: TrendingDown, color: 'bg-rose-600', lightBg: 'bg-rose-50/70 dark:bg-rose-950/30', border: 'border-rose-100 dark:border-rose-900/50', textColor: 'text-rose-600 dark:text-rose-400' },
  { name: 'Reportes & Analytics', desc: 'Rentabilidad y métricas', path: '/reportes', icon: BarChart3, color: 'bg-emerald-600', lightBg: 'bg-emerald-50/70 dark:bg-emerald-950/30', border: 'border-emerald-100 dark:border-emerald-900/50', textColor: 'text-emerald-600 dark:text-emerald-400' },
  { name: 'Presupuestos', desc: 'Cotizaciones comerciales', path: '/presupuestos', icon: FileSpreadsheet, color: 'bg-cyan-600', lightBg: 'bg-cyan-50/70 dark:bg-cyan-950/30', border: 'border-cyan-100 dark:border-cyan-900/50', textColor: 'text-cyan-600 dark:text-cyan-400' },
  { name: 'Órdenes de Compra', desc: 'Pedidos a proveedores', path: '/ordenes-compra', icon: Truck, color: 'bg-orange-600', lightBg: 'bg-orange-50/70 dark:bg-orange-950/30', border: 'border-orange-100 dark:border-orange-900/50', textColor: 'text-orange-600 dark:text-orange-400' },
  { name: 'Listas & Volumen', desc: 'Precios mayoristas y descuentos', path: '/listas-precios', icon: Tag, color: 'bg-fuchsia-600', lightBg: 'bg-fuchsia-50/70 dark:bg-fuchsia-950/30', border: 'border-fuchsia-100 dark:border-fuchsia-900/50', textColor: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { name: 'Configuración', desc: 'Comercio, tickets y AFIP', path: '/configuracion', icon: Settings, color: 'bg-slate-600', lightBg: 'bg-slate-100/70 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700', textColor: 'text-slate-600 dark:text-slate-300' },
];

const COLORES_PIE = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

function KpiCard({ label, value, subtext, icon: Icon, color, trend, loading }) {
  return (
    <div
      className="rounded-2xl p-5 shadow-sm overflow-hidden relative"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}>
          <Icon size={20} />
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</p>
      )}
      {trend !== undefined && trend !== null && !loading && (
        <div
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: trend >= 0 ? '#10b981' : '#ef4444' }}
        >
          {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}% vs ayer</span>
        </div>
      )}
      {subtext && !trend && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
      )}
    </div>
  );
}

export default function Dashboard({ historial = [], productos = [], clientes = [], onNavigate }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [loadingMes, setLoadingMes] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[0].value);
  const [resumenMes, setResumenMes] = useState(null);

  // ── NUEVO: KPIs en tiempo real del día ────────────────────────────────────
  const [kpisHoy, setKpisHoy] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);

  // ── NUEVO: Alertas de stock ───────────────────────────────────────────────
  const [alertasResumen, setAlertasResumen] = useState(null);
  const [productosReponer, setProductosReponer] = useState([]);

  const prods = Array.isArray(productos) ? productos : [];
  const clis = Array.isArray(clientes) ? clientes : [];

  // Cargar KPIs del día en tiempo real
  const cargarKpisHoy = useCallback(async () => {
    setLoadingKpis(true);
    try {
      const res = await apiClient.get('/api/reportes/dashboard-hoy');
      setKpisHoy(res.data);
    } catch {
      setKpisHoy(null);
    } finally {
      setLoadingKpis(false);
    }
  }, []);

  // Cargar alertas en tiempo real
  const cargarAlertas = useCallback(async () => {
    try {
      const [alertasRes, reposicionRes] = await Promise.all([
        apiClient.get('/api/alertas'),
        apiClient.get('/api/alertas/reposicion').catch(() => ({ data: { productos: [] } })),
      ]);
      setAlertasResumen(alertasRes.data);
      setProductosReponer(reposicionRes.data?.productos || []);
    } catch {
      setAlertasResumen(null);
    }
  }, []);

  useEffect(() => {
    cargarKpisHoy();
    cargarAlertas();
  }, [cargarKpisHoy, cargarAlertas]);

  // Gráfico — últimos 7 días desde historial prop (para compatibilidad)
  const hist = Array.isArray(historial) ? historial : [];
  const chartData = (() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString('en-CA');
      const total = hist
        .filter((v) => v.fecha && new Date(v.fecha).toLocaleDateString('en-CA') === ds)
        .reduce((a, v) => a + parseFloat(v.total || 0), 0);
      data.push({ name: d.toLocaleDateString('es-AR', { weekday: 'short' }), ventas: total });
    }
    return data;
  })();

  // Pie chart por método de pago del día
  const pieData = kpisHoy?.ventas_hoy
    ? [
        { name: 'Efectivo', value: kpisHoy.ventas_hoy.efectivo },
        { name: 'Tarjeta', value: kpisHoy.ventas_hoy.tarjeta },
        { name: 'Transferencia', value: kpisHoy.ventas_hoy.transferencia },
      ].filter(d => d.value > 0)
    : [];

  const cargarResumenMes = useCallback(async (mesVal) => {
    setLoadingMes(true);
    try {
      const [year, month] = mesVal.split('-').map(Number);
      const primerDia = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const ultimoDia = new Date(year, month, 0).toISOString().slice(0, 10);
      const res = await apiClient
        .get(`/api/reportes/ventas?desde=${primerDia}&hasta=${ultimoDia}`)
        .catch(() => ({ data: { ventas: [], summary: {} } }));
      const data = res.data || { ventas: [], summary: {} };
      setResumenMes({ ...data.summary, primerDia, ultimoDia });
    } catch {
      setResumenMes(null);
    } finally {
      setLoadingMes(false);
    }
  }, []);

  useEffect(() => { cargarResumenMes(mesSeleccionado); }, [mesSeleccionado, cargarResumenMes]);

  const exportarReporteMensualXLS = async () => {
    setExporting(true);
    try {
      const [year, month] = mesSeleccionado.split('-').map(Number);
      const primerDia = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const ultimoDia = new Date(year, month, 0).toISOString().slice(0, 10);
      const mesLabel = MESES.find((m) => m.value === mesSeleccionado)?.label || mesSeleccionado;
      const generadoEn = new Date().toLocaleString('es-AR');

      const res = await apiClient
        .get(`/api/reportes/mensual-completo?desde=${primerDia}&hasta=${ultimoDia}`)
        .catch(() => null);

      if (!res || !res.data) {
        Swal.fire('Error', 'No se pudieron obtener los datos del mes.', 'error');
        return;
      }

      const { summary, ventas } = res.data;
      const wb = XLSX.utils.book_new();

      const resData = [
        ['REPORTE CONSOLIDADO MENSUAL — KIOSKOPRO'],
        [`Período: ${mesLabel}`],
        [`Generado: ${generadoEn}`],
        [],
        ['MÉTRICA', 'VALOR'],
        ['Total Ventas (facturadas)', formatCurrency(summary.ingresos_totales || 0)],
        ['Cantidad de Comprobantes', summary.total_ventas || 0],
        ['Ticket Promedio', formatCurrency(summary.ticket_promedio || 0)],
        ['Total Devoluciones', formatCurrency(summary.total_devoluciones || 0)],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resData), 'Resumen Gerencial');

      const vData = (ventas || []).map((v) => ({
        '# Venta': v.id,
        'Fecha y Hora': formatDate(v.fecha),
        'Comprobante': v.tipo_comprobante || 'interno',
        'Método Pago': v.metodo_pago,
        'Total ($)': parseFloat(v.total || 0),
        'Estado': v.estado || 'aprobada',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vData), 'Detalle Ventas');

      XLSX.writeFile(wb, `KioskoPro_Reporte_${mesSeleccionado}.xlsx`);
      Swal.fire('Éxito', `Reporte de ${mesLabel} exportado correctamente.`, 'success');
    } catch (err) {
      Swal.fire('Error', err.message || 'Error al exportar reporte', 'error');
    } finally {
      setExporting(false);
    }
  };

  const nav = (path) => navigate(path);

  // Métricas derivadas
  const ventasHoy = kpisHoy?.ventas_hoy;
  const comparacion = kpisHoy?.comparacion_ayer;
  const alertasStockCount = kpisHoy?.alertas_stock || 0;
  const topProductos = kpisHoy?.top_productos || [];
  const cajaAbierta = kpisHoy?.caja_abierta;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Panel Principal</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Resumen operativo en tiempo real —{' '}
            <span className="font-semibold">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={cargarKpisHoy}
            title="Actualizar KPIs"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)' }}
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
          >
            <Calendar size={15} className="text-violet-500" />
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              className="bg-transparent font-medium outline-none text-slate-800 dark:text-slate-200 capitalize"
            >
              {MESES.map((m) => (
                <option key={m.value} value={m.value} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={exportarReporteMensualXLS}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 14px rgba(5,150,105,0.30)' }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            <span>Exportar XLS</span>
          </button>
        </div>
      </div>

      {/* ── PRIMERO: Accesos rápidos a todos los módulos ────────────────────── */}
      <div
        className="rounded-2xl p-6 shadow-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
      >
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Todos los Módulos del Sistema</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Accesos directos a todas las áreas de gestión.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {MODULOS_RAPIDOS.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.path}
                onClick={() => nav(mod.path)}
                className="flex flex-col items-center gap-2.5 rounded-xl p-4 transition-all text-center group"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.09)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,58,237,0.15)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--surface-border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${mod.color} text-white shadow-sm transition-transform group-hover:scale-110`}>
                  <Icon size={22} />
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-xs leading-tight">{mod.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight line-clamp-2">{mod.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KPIs Tiempo Real del Día ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas Hoy"
          value={formatCurrency(ventasHoy?.ingresos || 0)}
          trend={comparacion?.variacion_pct}
          icon={DollarSign}
          color="#7c3aed"
          loading={loadingKpis}
        />
        <KpiCard
          label="Comprobantes Hoy"
          value={ventasHoy?.cantidad || 0}
          subtext={`Ticket prom. ${formatCurrency(ventasHoy?.ticket_promedio || 0)}`}
          icon={TrendingUp}
          color="#f59e0b"
          loading={loadingKpis}
        />
        <KpiCard
          label="Productos en Catálogo"
          value={prods.length}
          subtext="Artículos activos"
          icon={Package}
          color="#3b82f6"
          loading={false}
        />
        <KpiCard
          label="Alertas de Stock"
          value={alertasStockCount}
          subtext={alertasStockCount > 0 ? 'Productos a reponer urgente' : 'Stock en niveles óptimos'}
          icon={AlertTriangle}
          color={alertasStockCount > 0 ? '#ef4444' : '#10b981'}
          loading={loadingKpis}
        />
      </div>

      {/* ── Fila: Estado de caja + Breakdown de pagos ────────────────────── */}
      {(cajaAbierta || pieData.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Estado de caja */}
          {cajaAbierta && (
            <div
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderLeft: '4px solid #f59e0b' }}
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                <Box size={22} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Caja Abierta</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Desde {formatDate(cajaAbierta.fecha_apertura)}
                </p>
                <p className="text-xs text-slate-500">{cajaAbierta.nombre_usuario}</p>
              </div>
              <button
                onClick={() => nav('/caja')}
                className="ml-auto text-amber-500 hover:text-amber-600 transition"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Pie chart métodos de pago */}
          {pieData.length > 0 && (
            <div
              className={`rounded-2xl p-5 ${cajaAbierta ? 'lg:col-span-2' : 'sm:col-span-2 lg:col-span-3'}`}
              style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
            >
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Métodos de Pago — Hoy</p>
              <div className="flex items-center gap-6">
                <div className="h-32 w-32 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {pieData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORES_PIE[i % COLORES_PIE.length] }} />
                        <span className="text-slate-600 dark:text-slate-300 font-medium">{item.name}</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Gráfico ventas 7 días + Top productos del día ────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-2 rounded-2xl p-6 shadow-sm"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Ventas — últimos 7 días</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Comportamiento diario de facturación</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(124,58,237,0.15)" opacity={1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94A3B8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(val) => [formatCurrency(val), 'Ventas']}
                  contentStyle={{ backgroundColor: '#160b30', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.35)', color: '#e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="ventas" fill="url(#barGrad)" radius={[6, 6, 0, 0]}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#5b21b6" stopOpacity={0.70} />
                    </linearGradient>
                  </defs>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top productos del día */}
        <div
          className="rounded-2xl p-6 shadow-sm flex flex-col"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Top Productos — Hoy</h2>
            <Award size={18} className="text-amber-400" />
          </div>
          {loadingKpis ? (
            <div className="space-y-3 flex-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          ) : topProductos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <ShoppingCart size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">Sin ventas registradas hoy</p>
              <button
                onClick={() => nav('/ventas')}
                className="mt-3 text-xs font-semibold text-violet-500 hover:text-violet-400 transition"
              >
                Ir al Punto de Venta →
              </button>
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {topProductos.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                    style={{ background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#7c3aed' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-slate-500">{p.unidades} u. vendidas</p>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    {formatCurrency(p.facturacion)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {topProductos.length > 0 && (
            <button
              onClick={() => nav('/reportes')}
              className="mt-4 flex items-center gap-1 text-xs font-semibold text-violet-500 hover:text-violet-400 transition"
            >
              Ver reporte completo <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>


      {/* ── Alertas de stock con lista de reposición ─────────────────────── */}

      {productosReponer.length > 0 && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-950 dark:text-rose-100">
                  Productos a Reponer ({productosReponer.length})
                </h3>
                <p className="text-xs text-rose-800 dark:text-rose-200 font-medium">
                  Artículos por debajo del stock mínimo configurado.
                </p>
              </div>
            </div>
            <button
              onClick={() => nav('/ordenes-compra')}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-all shadow-sm"
            >
              <Truck size={14} />
              <span>Generar Orden de Compra</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {productosReponer.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-rose-200/80 dark:border-rose-900/40 shadow-sm text-xs">
                <div className="truncate pr-2">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.nombre}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    {p.rubro || 'Sin categoría'}
                    {p.stock_minimo > 0 && ` · mín. ${p.stock_minimo}`}
                  </p>
                  {p.proveedor_nombre && (
                    <p className="text-[10px] text-slate-400 truncate">{p.proveedor_nombre}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="rounded-full bg-rose-100 dark:bg-rose-900/60 px-2.5 py-1 font-black text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-800">
                    {p.stock} u.
                  </span>
                  {p.cantidad_sugerida_comprar > 0 && (
                    <p className="text-[9px] text-rose-600 mt-0.5">Pedir ~{p.cantidad_sugerida_comprar}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {productosReponer.length > 8 && (
            <button
              onClick={() => nav('/inventario')}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition"
            >
              Ver los {productosReponer.length - 8} restantes en Inventario →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

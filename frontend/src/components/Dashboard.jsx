import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, Package, Users, DollarSign, Calendar, FileSpreadsheet, Loader2,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ShoppingCart, Box, Truck,
  ArrowRight, CreditCard, ShoppingBag, TrendingDown, BarChart3,
  Tag, Settings, RefreshCw, Award, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { formatCurrency, formatTime, formatRelative } from '../utils/formatters';

// ── Opciones de meses ────────────────────────────────────────────────────────
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

// ── Definición de módulos ─────────────────────────────────────────────────────
const MODULOS_RAPIDOS = [
  { name: 'Punto de Venta',     desc: 'Cobrar y emitir tickets',        path: '/ventas',          icon: ShoppingCart, color: 'bg-indigo-600',  accentHex: '#4f46e5', badgeKey: null },
  { name: 'Gestión de Caja',    desc: 'Arqueo, apertura y cierre',      path: '/caja',            icon: Box,          color: 'bg-amber-500',   accentHex: '#f59e0b', badgeKey: 'caja' },
  { name: 'Inventario & Stock', desc: 'Catálogo, stock y precios',      path: '/inventario',      icon: Package,      color: 'bg-blue-600',    accentHex: '#2563eb', badgeKey: 'stock_bajo' },
  { name: 'Clientes',           desc: 'Cartera y cuentas corrientes',   path: '/clientes',        icon: Users,        color: 'bg-teal-600',    accentHex: '#0d9488', badgeKey: null },
  { name: 'Cuenta Corriente',   desc: 'Saldos pendientes y cobros',     path: '/cuenta-corriente',icon: CreditCard,   color: 'bg-violet-600',  accentHex: '#7c3aed', badgeKey: 'deuda_cc' },
  { name: 'Facturas de Compra', desc: 'Ingreso de mercadería',          path: '/facturas-compra', icon: ShoppingBag,  color: 'bg-sky-600',     accentHex: '#0284c7', badgeKey: null },
  { name: 'Gastos Operativos',  desc: 'Control y registro de egresos',  path: '/gastos',          icon: TrendingDown, color: 'bg-rose-600',    accentHex: '#e11d48', badgeKey: null },
  { name: 'Reportes & Analytics',desc:'Rentabilidad y métricas',         path: '/reportes',        icon: BarChart3,    color: 'bg-emerald-600', accentHex: '#059669', badgeKey: null },
  { name: 'Presupuestos',       desc: 'Cotizaciones comerciales',       path: '/presupuestos',    icon: FileSpreadsheet, color: 'bg-cyan-600', accentHex: '#0891b2', badgeKey: null },
  { name: 'Órdenes de Compra',  desc: 'Pedidos a proveedores',          path: '/ordenes-compra',  icon: Truck,        color: 'bg-orange-600',  accentHex: '#ea580c', badgeKey: null },
  { name: 'Listas & Volumen',   desc: 'Precios mayoristas y descuentos',path: '/listas-precios',  icon: Tag,          color: 'bg-fuchsia-600', accentHex: '#c026d3', badgeKey: null },
  { name: 'Configuración',      desc: 'Comercio, tickets y AFIP',       path: '/configuracion',   icon: Settings,     color: 'bg-slate-600',   accentHex: '#475569', badgeKey: null },
];

const COLORES_PIE = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

// ── Sparkline miniatura (mini BarChart 7 puntos) ──────────────────────────────
function Sparkline({ data = [], color = '#7c3aed', height = 32 }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <svg width="100%" height={height} viewBox={`0 0 56 ${height}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = max > 0 ? Math.max((d.v / max) * (height - 4), 2) : 2;
        const x = i * 8;
        const y = height - barH;
        return (
          <rect
            key={i}
            x={x} y={y}
            width={6} height={barH}
            rx={1.5}
            fill={color}
            opacity={d.v > 0 ? 0.85 : 0.18}
          />
        );
      })}
    </svg>
  );
}

// ── KPI Card con sparkline y delta ────────────────────────────────────────────
function KpiCard({ label, value, subtext, icon: Icon, color, trend, sparkData = [], loading }) {
  return (
    <div
      className="rounded-2xl p-5 shadow-sm overflow-hidden relative"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}>
          <Icon size={20} />
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</p>
      )}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          {trend !== undefined && trend !== null && !loading && (
            <div
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: trend >= 0 ? '#10b981' : '#ef4444' }}
            >
              {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              <span>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}% vs ayer</span>
            </div>
          )}
          {subtext && (trend === undefined || trend === null) && !loading && (
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{subtext}</p>
          )}
        </div>
        {sparkData.length > 0 && !loading && (
          <div className="w-14 opacity-70 flex-shrink-0">
            <Sparkline data={sparkData} color={color} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Badge de módulo ───────────────────────────────────────────────────────────
function ModuleBadge({ badgeKey, badges, accentHex }) {
  if (!badgeKey || !badges) return null;

  if (badgeKey === 'stock_bajo') {
    const count = badges.stock_bajo || 0;
    if (count === 0) return null;
    return (
      <span
        className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[9px] font-black text-white shadow-md"
        style={{ background: '#ef4444', border: '2px solid var(--surface-card)' }}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  if (badgeKey === 'caja') {
    const { abierta, desde } = badges.caja_abierta || {};
    if (!abierta) return (
      <span
        className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-md"
        style={{ background: '#ef444420', border: `1px solid #ef4444`, color: '#ef4444' }}
      >
        ✗ Cerrada
      </span>
    );
    const hora = desde ? formatTime(desde) : '--:--';
    return (
      <span
        className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-md whitespace-nowrap"
        style={{ background: '#10b98120', border: `1px solid #10b981`, color: '#10b981' }}
      >
        ● {hora}
      </span>
    );
  }

  if (badgeKey === 'deuda_cc') {
    const deuda = badges.deuda_total_cc || 0;
    if (deuda <= 0) return null;
    const k = deuda >= 1000000
      ? `$${(deuda / 1000000).toFixed(1)}M`
      : deuda >= 1000
      ? `$${Math.round(deuda / 1000)}K`
      : `$${Math.round(deuda)}`;
    return (
      <span
        className="absolute -top-1.5 -right-1.5 flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-md"
        style={{ background: `${accentHex}22`, border: `1px solid ${accentHex}`, color: accentHex }}
      >
        {k}
      </span>
    );
  }

  return null;
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard({ historial = [], productos = [], clientes = [], onNavigate }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [loadingMes, setLoadingMes] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[0].value);
  const [resumenMes, setResumenMes] = useState(null);

  const [kpisHoy, setKpisHoy] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [alertasResumen, setAlertasResumen] = useState(null);
  const [productosReponer, setProductosReponer] = useState([]);

  const prods = Array.isArray(productos) ? productos : [];

  // ── Cargar KPIs del día ──────────────────────────────────────────────────
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

  // ── Gráfico 7 días — desde el historial prop O desde sparklines ──────────
  const hist = Array.isArray(historial) ? historial : [];
  const sparklines = kpisHoy?.sparklines_7dias || [];

  // Si tenemos sparklines del backend, usarlos. Si no, calcular desde historial prop.
  const chartData = (() => {
    if (sparklines.length === 7) {
      return sparklines.map(s => ({
        name: new Date(s.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short' }),
        ventas: s.ventas,
      }));
    }
    // fallback desde prop historial
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString('en-CA');
      const total = hist
        .filter(v => v.fecha && new Date(v.fecha).toLocaleDateString('en-CA') === ds)
        .reduce((a, v) => a + parseFloat(v.total || 0), 0);
      data.push({ name: d.toLocaleDateString('es-AR', { weekday: 'short' }), ventas: total });
    }
    return data;
  })();

  const hayDatosGrafico = chartData.some(d => d.ventas > 0);
  const maxVentas = Math.max(...chartData.map(d => d.ventas), 0);

  // ── Sparklines para KPI cards (7 puntos normalizados) ────────────────────
  const sparkVentas     = sparklines.map(s => ({ v: s.ventas }));
  const sparkComprob    = sparklines.map(s => ({ v: s.comprobantes }));

  // ── Pie chart por método de pago del día ─────────────────────────────────
  const pieData = kpisHoy?.ventas_hoy
    ? [
        { name: 'Efectivo',       value: kpisHoy.ventas_hoy.efectivo },
        { name: 'Tarjeta',        value: kpisHoy.ventas_hoy.tarjeta },
        { name: 'Transferencia',  value: kpisHoy.ventas_hoy.transferencia },
        { name: 'QR',             value: kpisHoy.ventas_hoy.qr },
        { name: 'Cuenta Cte.',    value: kpisHoy.ventas_hoy.cuenta_corriente },
      ].filter(d => d.value > 0)
    : [];

  // ── Resumen del mes ──────────────────────────────────────────────────────
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

  // ── Exportar XLS ─────────────────────────────────────────────────────────
  const exportarReporteMensualXLS = async () => {
    setExporting(true);
    try {
      const [year, month] = mesSeleccionado.split('-').map(Number);
      const primerDia = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const ultimoDia = new Date(year, month, 0).toISOString().slice(0, 10);
      const mesLabel = MESES.find(m => m.value === mesSeleccionado)?.label || mesSeleccionado;
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

      const vData = (ventas || []).map(v => ({
        '# Venta': v.id,
        'Fecha y Hora': v.fecha ? new Date(v.fecha).toLocaleString('es-AR') : '-',
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

  // ── Métricas derivadas ───────────────────────────────────────────────────
  const ventasHoy       = kpisHoy?.ventas_hoy;
  const comparacion     = kpisHoy?.comparacion_ayer;
  const alertasStockCount = kpisHoy?.alertas_stock || 0;
  const topProductos    = kpisHoy?.top_productos || [];
  const cajaAbierta     = kpisHoy?.caja_abierta;
  const badges          = kpisHoy?.badges_modulos || null;

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Panel Principal</h1>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            Resumen operativo en tiempo real —{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={cargarKpisHoy}
            title="Actualizar KPIs"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:opacity-80"
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
              onChange={e => setMesSeleccionado(e.target.value)}
              className="bg-transparent font-medium outline-none text-slate-800 dark:text-slate-200 capitalize"
            >
              {MESES.map(m => (
                <option key={m.value} value={m.value} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={exportarReporteMensualXLS}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 14px rgba(5,150,105,0.30)' }}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            <span>Exportar XLS</span>
          </button>
        </div>
      </div>

      {/* ── Todos los Módulos ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6 shadow-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
      >
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Todos los Módulos del Sistema</h2>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Accesos directos a todas las áreas de gestión.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {MODULOS_RAPIDOS.map(mod => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.path}
                onClick={() => nav(mod.path)}
                className="relative flex flex-col items-center gap-2.5 rounded-xl p-4 transition-all text-center group min-h-[80px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${mod.accentHex}12`;
                  e.currentTarget.style.borderColor = `${mod.accentHex}40`;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 8px 24px ${mod.accentHex}20`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'var(--surface-border)';
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Badge vivo */}
                <ModuleBadge badgeKey={mod.badgeKey} badges={badges} accentHex={mod.accentHex} />

                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${mod.color} text-white shadow-sm transition-transform group-hover:scale-110`}>
                  <Icon size={22} />
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-xs leading-tight">{mod.name}</p>
                  <p className="text-[10px] mt-0.5 leading-tight line-clamp-2 font-medium" style={{ color: 'var(--text-muted)' }}>{mod.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KPIs Tiempo Real ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas Hoy"
          value={formatCurrency(ventasHoy?.ingresos || 0)}
          trend={comparacion?.variacion_pct}
          icon={DollarSign}
          color="#7c3aed"
          sparkData={sparkVentas}
          loading={loadingKpis}
        />
        <KpiCard
          label="Comprobantes Hoy"
          value={ventasHoy?.cantidad || 0}
          subtext={`Ticket prom. ${formatCurrency(ventasHoy?.ticket_promedio || 0)}`}
          trend={comparacion?.variacion_cant_pct}
          icon={TrendingUp}
          color="#f59e0b"
          sparkData={sparkComprob}
          loading={loadingKpis}
        />
        <KpiCard
          label="Productos en Catálogo"
          value={prods.length}
          subtext="Artículos activos"
          icon={Package}
          color="#3b82f6"
          sparkData={[]}
          loading={false}
        />
        <KpiCard
          label="Alertas de Stock"
          value={alertasStockCount}
          subtext={alertasStockCount > 0 ? 'Productos a reponer urgente' : 'Stock en niveles óptimos'}
          icon={AlertTriangle}
          color={alertasStockCount > 0 ? '#ef4444' : '#10b981'}
          sparkData={[]}
          loading={loadingKpis}
        />
      </div>

      {/* ── Resumen del mes ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6 shadow-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Resumen del Mes — <span className="capitalize text-violet-500">{MESES.find(m => m.value === mesSeleccionado)?.label}</span>
            </h2>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Métricas consolidadas del período seleccionado</p>
          </div>
          {loadingMes && <Loader2 size={16} className="animate-spin text-violet-400" />}
        </div>
        {loadingMes ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
        ) : resumenMes ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Ingresos Totales',  value: formatCurrency(resumenMes.ingresos_totales || 0), bg: 'rgba(124,58,237,0.07)', border: 'rgba(124,58,237,0.18)' },
              { label: 'Comprobantes',      value: resumenMes.total_ventas || 0,                       bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.18)' },
              { label: 'Ticket Promedio',   value: formatCurrency(resumenMes.ticket_promedio || 0),    bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.18)' },
              { label: 'Devoluciones',      value: formatCurrency(resumenMes.total_devoluciones || 0), bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.18)' },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-4" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="mt-2 text-xl font-black tabular-nums text-slate-900 dark:text-slate-50">{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar size={32} className="mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Sin datos para el período seleccionado</p>
          </div>
        )}
      </div>

      {/* ── Estado de caja + Pie de pagos ─────────────────────────────── */}
      {(cajaAbierta || pieData.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cajaAbierta && (
            <div
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', borderLeft: '4px solid #f59e0b' }}
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                <Box size={22} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Caja Abierta</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {cajaAbierta.fecha_apertura ? formatRelative(cajaAbierta.fecha_apertura) : '--'}
                </p>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{cajaAbierta.nombre_usuario}</p>
              </div>
              <button onClick={() => nav('/caja')} className="ml-auto text-amber-500 hover:text-amber-600 transition">
                <ArrowRight size={18} />
              </button>
            </div>
          )}

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
                      <Tooltip formatter={val => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {pieData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: COLORES_PIE[i % COLORES_PIE.length] }} />
                        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
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

      {/* ── Gráfico ventas 7 días + Top productos ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-2 rounded-2xl p-6 shadow-sm"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Ventas — últimos 7 días</h2>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Comportamiento diario de facturación</p>
            </div>
          </div>

          {/* ── P0-1: Si no hay datos, mostrar empty state coherente ── */}
          {!hayDatosGrafico ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
                <BarChart3 size={26} style={{ color: 'rgba(124,58,237,0.50)' }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Sin ventas en los últimos 7 días</p>
                <p className="text-xs font-medium mt-1" style={{ color: 'var(--text-muted)' }}>El gráfico aparecerá cuando registres tu primera venta</p>
              </div>
              <button
                onClick={() => nav('/ventas')}
                className="mt-1 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.30)' }}
              >
                <ShoppingCart size={13} />
                Registrar primera venta
              </button>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#5b21b6" stopOpacity={0.70} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(124,58,237,0.12)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#94A3B8', fontWeight: 600 }}
                  />
                  {/* P0-1: escala dinámica max*1.15 */}
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                    domain={[0, Math.ceil(maxVentas * 1.15)]}
                    width={50}
                  />
                  <Tooltip
                    formatter={val => [formatCurrency(val), 'Ventas']}
                    contentStyle={{
                      backgroundColor: '#160b30',
                      borderRadius: '12px',
                      border: '1px solid rgba(124,58,237,0.35)',
                      color: '#e2e8f0',
                      fontSize: '12px',
                    }}
                    cursor={{ fill: 'rgba(124,58,237,0.06)' }}
                  />
                  <Bar dataKey="ventas" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          ) : topProductos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <ShoppingCart size={32} className="mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Sin ventas registradas hoy</p>
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
                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{p.unidades} u. vendidas</p>
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

      {/* ── Alertas de stock con lista de reposición ──────────────────── */}
      {productosReponer.length > 0 && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-950 dark:text-rose-100">
                  Productos a Reponer ({productosReponer.length})
                </h3>
                <p className="text-xs font-medium text-rose-800 dark:text-rose-200">
                  Artículos por debajo del stock mínimo configurado.
                </p>
              </div>
            </div>
            <button
              onClick={() => nav('/ordenes-compra')}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-all shadow-sm min-h-[44px]"
            >
              <Truck size={14} />
              <span>Generar Orden de Compra</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {productosReponer.slice(0, 8).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-rose-200/80 dark:border-rose-900/40 shadow-sm text-xs">
                <div className="truncate pr-2">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.nombre}</p>
                  <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {p.rubro || 'Sin categoría'}
                    {p.stock_minimo > 0 && ` · mín. ${p.stock_minimo}`}
                  </p>
                  {p.proveedor_nombre && (
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{p.proveedor_nombre}</p>
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

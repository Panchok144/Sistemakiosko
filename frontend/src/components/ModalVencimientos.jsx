import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../apiClient';
import { Calendar, AlertTriangle, Plus, Trash2, X, Clock, CheckCircle2, Search } from 'lucide-react';
import { formatDate } from '../utils/formatters';

export default function ModalVencimientos({ isOpen, onClose, productos = [] }) {
  const [lotes, setLotes] = useState([]);
  const [resumen, setResumen] = useState({ vencidos: 0, dias_30: 0, dias_60: 0, dias_90: 0 });
  const [loading, setLoading] = useState(false);
  const [filtroRubro, setFiltroRubro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [showNuevoLote, setShowNuevoLote] = useState(false);

  // Form state
  const [productoId, setProductoId] = useState('');
  const [numeroLote, setNumeroLote] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [alertaDias, setAlertaDias] = useState('30');
  const [guardando, setGuardando] = useState(false);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resReporte, resLotes] = await Promise.all([
        apiClient.get('/api/reportes/vencimientos').catch(() => ({ data: { resumen: {} } })),
        apiClient.get('/api/vencimientos').catch(() => ({ data: { lotes: [] } })),
      ]);

      if (resReporte.data?.resumen) {
        setResumen(resReporte.data.resumen);
      }
      if (resLotes.data?.lotes) {
        setLotes(resLotes.data.lotes);
      }
    } catch (err) {
      console.error('Error al cargar vencimientos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      cargarDatos();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const lotesFiltrados = lotes.filter((l) => {
    const matchBusqueda =
      !busqueda ||
      l.producto_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.codigo_barras?.includes(busqueda) ||
      l.numero_lote?.toLowerCase().includes(busqueda.toLowerCase());
    const matchRubro = !filtroRubro || l.rubro === filtroRubro;
    return matchBusqueda && matchRubro;
  });

  const rubrosUnicos = Array.from(new Set(lotes.map((l) => l.rubro).filter(Boolean)));

  const handleCrearLote = async (e) => {
    e.preventDefault();
    if (!productoId || !cantidad || !fechaVencimiento) {
      Swal.fire('Campos requeridos', 'Completá producto, cantidad y fecha de vencimiento', 'warning');
      return;
    }
    setGuardando(true);
    try {
      await apiClient.post('/api/vencimientos', {
        producto_id: parseInt(productoId, 10),
        numero_lote: numeroLote.trim() || null,
        cantidad: parseInt(cantidad, 10),
        fecha_vencimiento: fechaVencimiento,
        alerta_dias: parseInt(alertaDias, 10) || 30,
      });
      Swal.fire('✅ Lote registrado', 'El lote y vencimiento se guardaron con éxito', 'success');
      setShowNuevoLote(false);
      setProductoId('');
      setNumeroLote('');
      setCantidad('');
      setFechaVencimiento('');
      cargarDatos();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarLote = async (id) => {
    const conf = await Swal.fire({
      title: '¿Eliminar lote?',
      text: 'Se eliminará el registro de vencimiento de este lote.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    });
    if (!conf.isConfirmed) return;

    try {
      await apiClient.delete(`/api/vencimientos/${id}`);
      cargarDatos();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const badgeEstado = (estado, dias) => {
    if (estado === 'vencido' || dias < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/40 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
          <AlertTriangle size={12} /> Vencido ({Math.abs(dias)}d atrás)
        </span>
      );
    }
    if (estado === 'critico' || dias <= 15) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse">
          <Clock size={12} /> Crítico ({dias}d)
        </span>
      );
    }
    if (estado === 'alerta' || dias <= 30) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-950/40 px-2.5 py-0.5 text-xs font-bold text-yellow-800 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
          <Clock size={12} /> Alerta ({dias}d)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 size={12} /> En fecha ({dias}d)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[2rem] bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800">
              <Calendar className="text-amber-600 dark:text-amber-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                Control de Vencimientos y Lotes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Seguimiento de fechas de caducidad para prevenir pérdidas por descarte
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNuevoLote(true)}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 text-xs font-bold transition shadow-md shadow-amber-600/20"
            >
              <Plus size={15} /> Nuevo Lote
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Resumen Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-3.5 text-center">
            <span className="text-xs font-bold text-red-600 uppercase">Vencidos</span>
            <p className="text-2xl font-black text-red-700 dark:text-red-400 mt-0.5">
              {resumen.vencidos || 0}
            </p>
          </div>
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-3.5 text-center">
            <span className="text-xs font-bold text-amber-600 uppercase">Próx. 30 días</span>
            <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-0.5">
              {resumen.dias_30 || 0}
            </p>
          </div>
          <div className="rounded-2xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/40 p-3.5 text-center">
            <span className="text-xs font-bold text-yellow-600 uppercase">31 - 60 días</span>
            <p className="text-2xl font-black text-yellow-700 dark:text-yellow-400 mt-0.5">
              {resumen.dias_60 || 0}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-3.5 text-center">
            <span className="text-xs font-bold text-emerald-600 uppercase">61 - 90 días</span>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
              {resumen.dias_90 || 0}
            </p>
          </div>
        </div>

        {/* Modal interno para nuevo lote */}
        {showNuevoLote && (
          <div className="mb-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-900/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Plus size={16} className="text-amber-600" /> Registrar Lote con Vencimiento
              </h3>
              <button
                type="button"
                onClick={() => setShowNuevoLote(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
            </div>
            <form onSubmit={handleCrearLote} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div className="md:col-span-2">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Producto *
                </label>
                <select
                  required
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="">Seleccionar producto...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.codigo_barras || 'S/C'}) - Stock: {p.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  N° de Lote
                </label>
                <input
                  type="text"
                  placeholder="Ej: L-2026A"
                  value={numeroLote}
                  onChange={(e) => setNumeroLote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Cantidad *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Ej: 24"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Vencimiento *
                </label>
                <input
                  type="date"
                  required
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>

              <div className="md:col-span-5 flex justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowNuevoLote(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shadow transition"
                >
                  {guardando ? 'Guardando...' : 'Guardar Lote'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar por producto, código o número de lote..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs outline-none text-slate-900 dark:text-slate-100"
            />
          </div>
          {rubrosUnicos.length > 0 && (
            <select
              value={filtroRubro}
              onChange={(e) => setFiltroRubro(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs outline-none text-slate-900 dark:text-slate-100"
            >
              <option value="">Todos los rubros</option>
              {rubrosUnicos.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tabla con scroll */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 dark:border-slate-700">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="sticky top-0 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 font-bold uppercase tracking-wider text-[10px] text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Producto</th>
                <th className="py-2.5 px-3">Rubro</th>
                <th className="py-2.5 px-3">Lote</th>
                <th className="py-2.5 px-3 text-center">Cantidad</th>
                <th className="py-2.5 px-3">Vencimiento</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400">
                    Cargando vencimientos...
                  </td>
                </tr>
              ) : lotesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400">
                    No se encontraron lotes registrados con vencimiento.
                  </td>
                </tr>
              ) : (
                lotesFiltrados.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      <div>{l.producto_nombre}</div>
                      {l.codigo_barras && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {l.codigo_barras}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500">{l.rubro || '—'}</td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {l.numero_lote || 'S/N'}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800 dark:text-slate-200">
                      {l.cantidad}
                    </td>
                    <td className="py-3 px-3 font-medium">
                      {formatDate(l.fecha_vencimiento)}
                    </td>
                    <td className="py-3 px-3">
                      {badgeEstado(l.estado_vencimiento, l.dias_restantes)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleEliminarLote(l.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                        title="Eliminar lote"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

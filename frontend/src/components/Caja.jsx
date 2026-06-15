import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../apiClient.js';
import { Box, Lock, Unlock, ArrowUpRight, ArrowDownRight, History, DollarSign, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';


export default function Caja({ usuario }) {
  const [caja, setCaja] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [historialCajas, setHistorialCajas] = useState([]);
  const [montoInicial, setMontoInicial] = useState('');
  const [montoFinal, setMontoFinal] = useState('');
  const [tipoMovimiento, setTipoMovimiento] = useState('ingreso');
  const [montoMovimiento, setMontoMovimiento] = useState('');
  const [descripcionMovimiento, setDescripcionMovimiento] = useState('');
  const { authReady, token } = useAuth();


  const cargarCaja = async () => {
    try {
      const { data } = await apiClient.get('/api/caja/estado');
      setCaja(data.caja);
      if (data.caja) {
        cargarMovimientos(data.caja.id);
      } else {
        cargarHistorialCajas();
      }
    } catch (error) {
      console.error('Error al cargar caja', error);
    }
  };


  const cargarMovimientos = async (idCaja) => {
    try {
      const { data } = await apiClient.get(`/api/caja/${idCaja}/movimientos`);
      setMovimientos(data);
    } catch (error) {
      console.error('Error al cargar movimientos', error);
    }
  };


  const cargarHistorialCajas = async () => {
    try {
      const { data } = await apiClient.get('/api/caja/historial');
      setHistorialCajas(data);
    } catch (error) {
      console.error('Error al cargar historial de cajas', error);
    }
  };


  useEffect(() => {
    if (authReady && token) {
      cargarCaja();
    }
  }, [authReady, token]);

  const abrirCaja = async (e) => {
    e.preventDefault();
    if (!montoInicial || parseFloat(montoInicial) < 0) {
      return Swal.fire('Error', 'Ingresá un monto inicial válido', 'warning');
    }

    try {
      await apiClient.post('/api/caja/abrir', { monto_inicial: parseFloat(montoInicial) });
      Swal.fire('Éxito', 'Turno de caja abierto correctamente', 'success');
      setMontoInicial('');
      cargarCaja();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'Error al abrir caja', 'error');
    }
  };


  const cerrarCaja = async (e) => {
    e.preventDefault();
    if (montoFinal === '' || parseFloat(montoFinal) < 0) {
      return Swal.fire('Error', 'Ingresá el monto final contado en caja', 'warning');
    }
    if (!caja?.id) {
      return Swal.fire('Error', 'No hay caja abierta para cerrar', 'warning');
    }

    try {
      // FIX 404: ruta correcta es /api/caja/:id_caja/cerrar
      const res = await apiClient.post(`/api/caja/${caja.id}/cerrar`, { monto_final: parseFloat(montoFinal) });

      const { diferencia } = res.data;
      let msg = 'Turno de caja cerrado correctamente.';
      if (diferencia !== undefined && diferencia !== 0) {
        const difFmt = formatCurrency(Math.abs(diferencia));
        msg += diferencia > 0 ? ` Sobrante de ${difFmt}.` : ` Faltante de ${difFmt}.`;
      }

      Swal.fire('Caja Cerrada', msg, diferencia === 0 ? 'success' : 'warning');
      setMontoFinal('');
      cargarCaja();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'Error al cerrar caja', 'error');
    }
  };


  const registrarMovimiento = async (e) => {
    e.preventDefault();
    if (!montoMovimiento || parseFloat(montoMovimiento) <= 0 || !descripcionMovimiento) {
      return Swal.fire('Error', 'Completá todos los campos correctamente', 'warning');
    }

    try {
      // FIX 404: ruta correcta es /api/caja/:id_caja/movimiento
      await apiClient.post(`/api/caja/${caja.id}/movimiento`, {
        tipo: tipoMovimiento,
        monto: parseFloat(montoMovimiento),
        descripcion: descripcionMovimiento,
      });

      Swal.fire('Registrado', 'Movimiento de caja guardado', 'success');
      setMontoMovimiento('');
      setDescripcionMovimiento('');
      cargarCaja();
    } catch (error) {
      Swal.fire('Error', error.response?.data?.error || 'Error al registrar movimiento', 'error');
    }
  };


  // Cálculos de resumen
  const totalIngresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((acc, m) => acc + parseFloat(m.monto), 0);

  const totalEgresos = movimientos
    .filter((m) => m.tipo === 'egreso')
    .reduce((acc, m) => acc + parseFloat(m.monto), 0);

  const saldoTeoricoCalculado = caja
    ? parseFloat(caja.monto_inicial) + totalIngresos - totalEgresos
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <Box size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Control de Caja</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Arqueos, cierres de turno y movimientos de efectivo</p>
          </div>
        </div>
        <button
          onClick={cargarCaja}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {!caja ? (
        /* Estado: Caja Cerrada -> Formulario Abrir Turno */
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-8 text-center max-w-xl mx-auto shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300 mb-4">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Caja Cerrada</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 max-w-md mx-auto">
              Ingresá el saldo inicial en efectivo para abrir la caja y comenzar a registrar ventas del turno.
            </p>

            <form onSubmit={abrirCaja} className="space-y-4 text-left max-w-sm mx-auto">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Fondo de Caja Inicial ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 shadow-sm"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-3 text-sm font-bold text-white transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Unlock size={16} /> Abrir Turno de Caja
              </button>
            </form>
          </div>

          {/* Historial de Cierres Anteriores */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <History size={18} className="text-indigo-600 dark:text-indigo-400" /> Historial de Turnos Anteriores
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3"># Turno</th>
                    <th className="px-4 py-3">Apertura</th>
                    <th className="px-4 py-3">Cierre</th>
                    <th className="px-4 py-3">Inicial</th>
                    <th className="px-4 py-3">Esperado</th>
                    <th className="px-4 py-3">Contado</th>
                    <th className="px-4 py-3">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {historialCajas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">Sin cierres anteriores registrados.</td>
                    </tr>
                  ) : (
                    historialCajas.map((h) => {
                      const dif = parseFloat(h.diferencia || 0);
                      return (
                        <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">#{h.id}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(h.fecha_apertura)}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(h.fecha_cierre)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(h.monto_inicial)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(h.monto_teorico || h.monto_inicial)}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(h.monto_final)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              dif === 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                              dif > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                              'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}>
                              {dif === 0 ? 'Exacto ($0)' : dif > 0 ? `+${formatCurrency(dif)}` : formatCurrency(dif)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Estado: Caja Abierta */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Panel Resumen de Turno */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-base font-bold text-emerald-950 dark:text-emerald-100">Caja Abierta — Turno #{caja.id}</h2>
                </div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Apertura: {formatDate(caja.fecha_apertura)}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-emerald-100 dark:border-emerald-900/40 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monto Inicial</span>
                  <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">{formatCurrency(caja.monto_inicial)}</p>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-emerald-100 dark:border-emerald-900/40 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ingresos</span>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">+{formatCurrency(totalIngresos)}</p>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-800 p-3.5 border border-emerald-100 dark:border-emerald-900/40 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Egresos</span>
                  <p className="text-lg font-black text-rose-600 dark:text-rose-400 mt-1">-{formatCurrency(totalEgresos)}</p>
                </div>

                <div className="rounded-xl bg-indigo-600 text-white p-3.5 shadow-md">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Efectivo Esperado</span>
                  <p className="text-lg font-black mt-1">{formatCurrency(saldoTeoricoCalculado)}</p>
                </div>
              </div>
            </div>

            {/* Movimientos de Caja del Turno */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Movimientos del Turno Actual</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Hora</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Descripción</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {movimientos.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-slate-400">Sin movimientos registrados en este turno.</td>
                      </tr>
                    ) : (
                      movimientos.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{formatDate(m.fecha)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              m.tipo === 'ingreso' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            }`}>
                              {m.tipo === 'ingreso' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                              {m.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{m.descripcion}</td>
                          <td className={`px-4 py-3 text-right font-black ${m.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {m.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(m.monto)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Formulario Cierre y Registrar Movimiento */}
          <div className="space-y-6">
            {/* Form Arqueo / Cierre */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Lock size={18} className="text-rose-600" /> Cerrar Turno y Arqueo
              </h3>
              <form onSubmit={cerrarCaja} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Efectivo Real en Caja ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={montoFinal}
                    onChange={(e) => setMontoFinal(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-base font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-rose-500"
                    required
                  />
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">Saldo esperado: <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(saldoTeoricoCalculado)}</strong></p>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Lock size={16} /> Cerrar Caja y Finalizar Turno
                </button>
              </form>
            </div>

            {/* Registrar Ingreso / Egreso */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Registrar Movimiento Manual</h3>
              <form onSubmit={registrarMovimiento} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tipo de Movimiento</label>
                  <select
                    value={tipoMovimiento}
                    onChange={(e) => setTipoMovimiento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 outline-none font-semibold text-slate-900 dark:text-slate-100"
                  >
                    <option value="ingreso">Ingreso de Efectivo</option>
                    <option value="egreso">Egreso de Efectivo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Monto ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={montoMovimiento}
                    onChange={(e) => setMontoMovimiento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 outline-none font-bold text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Descripción / Motivo</label>
                  <input
                    type="text"
                    placeholder="Ej: Cambio inicial o Pago limpieza"
                    value={descripcionMovimiento}
                    onChange={(e) => setDescripcionMovimiento(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-sm"
                >
                  Guardar Movimiento
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

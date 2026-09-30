import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { CreditCard, DollarSign, ArrowDownLeft, ArrowUpRight, Search, CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { generarEstadoCuentaPDF, generarLinkWhatsAppDeuda } from '../utils/ticketPDF';

export default function CuentaCorriente() {
  const [clientes, setClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [resumenMora, setResumenMora] = useState(null);
  const [filtroRiesgo, setFiltroRiesgo] = useState('todos');

  // Forms
  const [montoPago, setMontoPago] = useState('');
  const [descripcionPago, setDescripcionPago] = useState('');
  const [nuevoLimite, setNuevoLimite] = useState('');

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = () => {
    apiClient.get('/api/cuenta-corriente')
      .then(res => setClientes(res.data || []))
      .catch(err => console.error(err));
    apiClient.get('/api/cuenta-corriente/resumen-mora')
      .then(res => setResumenMora(res.data || null))
      .catch(err => console.error(err));
  };

  const seleccionarCliente = async (cliente) => {
    setClienteSeleccionado(cliente);
    setNuevoLimite(cliente.credito_limite || 0);
    try {
      const res = await apiClient.get(`/api/cuenta-corriente/${cliente.id}`);
      setMovimientos(res.data.movimientos || []);
    } catch (err) {
      console.error(err);
    }
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (!clienteSeleccionado) return;
    const monto = parseFloat(montoPago);
    if (isNaN(monto) || monto <= 0) {
      Swal.fire('Error', 'Ingresá un monto válido mayor a 0', 'error');
      return;
    }

    try {
      await apiClient.post(`/api/cuenta-corriente/${clienteSeleccionado.id}/pago`, {
        monto,
        descripcion: descripcionPago || 'Pago de deuda'
      });
      Swal.fire('¡Éxito!', 'Pago registrado correctamente', 'success');
      setMontoPago('');
      setDescripcionPago('');
      cargarClientes();
      seleccionarCliente(clienteSeleccionado);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al registrar el pago', 'error');
    }
  };

  const guardarLimite = async () => {
    if (!clienteSeleccionado) return;
    try {
      await apiClient.put(`/api/cuenta-corriente/${clienteSeleccionado.id}/limite`, {
        credito_limite: parseFloat(nuevoLimite) || 0
      });
      Swal.fire('Éxito', 'Límite de crédito actualizado', 'success');
      cargarClientes();
      setClienteSeleccionado({ ...clienteSeleccionado, credito_limite: nuevoLimite });
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al actualizar el límite', 'error');
    }
  };

  const handleDescargarEstadoCuenta = async () => {
    if (!clienteSeleccionado) return;
    try {
      const res = await apiClient.get(`/api/cuenta-corriente/${clienteSeleccionado.id}/estado-cuenta`);
      generarEstadoCuentaPDF(res.data);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo generar el estado de cuenta', 'error');
    }
  };

  const handleEnviarWhatsApp = () => {
    if (!clienteSeleccionado) return;
    const info = getRiesgoInfo(clienteSeleccionado.id);
    const link = generarLinkWhatsAppDeuda({
      cliente: clienteSeleccionado,
      monto: clienteSeleccionado.saldo_deuda || 0,
      diasMora: info?.dias_mora || 0,
    });
    window.open(link, '_blank');
  };

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.documento && c.documento.includes(busqueda))
  );

  const getRiesgoInfo = (clienteId) => {
    if (!resumenMora?.clientes) return null;
    return resumenMora.clientes.find(c => c.id === clienteId);
  };

  const clientesConRiesgo = clientesFiltrados.filter(c => {
    if (filtroRiesgo === 'todos') return true;
    const info = getRiesgoInfo(c.id);
    if (!info) return filtroRiesgo === 'al_dia';
    if (filtroRiesgo === 'morosos') return info.riesgo === 'rojo';
    if (filtroRiesgo === 'alerta') return info.riesgo === 'amarillo';
    if (filtroRiesgo === 'al_dia') return info.riesgo === 'verde';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Cuenta Corriente de Clientes</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Gestión de créditos, semáforo de riesgo y cobranza de deudas.</p>
        </div>
      </div>

      {/* KPI Cards de Riesgo y Cartera */}
      {resumenMora?.resumen && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Deuda Total a Cobrar</span>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">
              ${(resumenMora.resumen.total_deuda_cobrar || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] text-slate-500">{resumenMora.resumen.clientes_con_deuda} clientes con saldo</span>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Al Día (&lt;30 días)</span>
            <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">
              {resumenMora.resumen.clientes_al_dia} clientes
            </p>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">Riesgo bajo</span>
          </div>

          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">En Alerta (30-60d)</span>
            <p className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400">
              {resumenMora.resumen.clientes_alerta} clientes
            </p>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">Monitorear pagos</span>
          </div>

          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">Morosos Críticos (&gt;60d)</span>
            <p className="mt-1 text-xl font-black text-rose-600 dark:text-rose-400">
              {resumenMora.resumen.clientes_morosos} clientes
            </p>
            <span className="text-[11px] text-rose-700 dark:text-rose-300">Pausar crédito</span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Lista de Clientes */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm space-y-4">
          <input
            type="text"
            placeholder="Buscar por cliente o CUIT/DNI..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'morosos', label: '🔴 Morosos' },
              { id: 'alerta', label: '🟡 En Alerta' },
              { id: 'al_dia', label: '🟢 Al Día' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroRiesgo(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  filtroRiesgo === f.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="max-h-[34rem] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700">
            {clientesConRiesgo.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">No se encontraron clientes para este filtro.</p>
            ) : (
              clientesConRiesgo.map((c) => {
                const deuda = parseFloat(c.saldo_deuda || 0);
                const limite = parseFloat(c.credito_limite || 0);
                const esSeleccionado = clienteSeleccionado?.id === c.id;
                const infoRiesgo = getRiesgoInfo(c.id);

                return (
                  <div
                    key={c.id}
                    onClick={() => seleccionarCliente(c)}
                    className={`cursor-pointer p-4 transition-colors border-b border-slate-100 dark:border-slate-700/60 ${esSeleccionado ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-l-4 border-indigo-600' : 'hover:bg-slate-50 dark:hover:bg-slate-750/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{c.nombre}</p>
                          {infoRiesgo && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${
                              infoRiesgo.riesgo === 'rojo'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : infoRiesgo.riesgo === 'amarillo'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            }`}>
                              {infoRiesgo.riesgo === 'rojo' ? `Moroso (${infoRiesgo.dias_mora}d)` :
                               infoRiesgo.riesgo === 'amarillo' ? `Alerta (${infoRiesgo.dias_mora}d)` : 'Al día'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.documento ? `DNI/CUIT: ${c.documento}` : 'Sin documento'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-base font-black tabular-nums ${deuda > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatCurrency(deuda)}
                        </span>
                        {limite > 0 && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Límite: {formatCurrency(limite)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detalle y Registrar Pago */}
        <div className="space-y-6">
          {clienteSeleccionado ? (
            <>
              {/* Header Cliente */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{clienteSeleccionado.nombre}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{clienteSeleccionado.telefono || 'Sin teléfono'} | {clienteSeleccionado.email || 'Sin email'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-right border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deuda Actual</span>
                      <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(clienteSeleccionado.saldo_deuda || 0)}</p>
                    </div>
                    {/* Botones M9: PDF y WhatsApp */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDescargarEstadoCuenta}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition"
                        title="Descargar estado de cuenta con aging en PDF"
                      >
                        <FileText size={14} className="text-indigo-600 dark:text-indigo-400" /> Estado de Cuenta (PDF)
                      </button>
                      {clienteSeleccionado.saldo_deuda > 0 && (
                        <button
                          type="button"
                          onClick={handleEnviarWhatsApp}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-sm transition"
                          title="Enviar recordatorio de cobro por WhatsApp"
                        >
                          <MessageCircle size={14} /> Recordar por WhatsApp
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Registrar Pago */}
                <form onSubmit={registrarPago} className="grid gap-3 sm:grid-cols-3 items-end bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/60">
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-200 mb-1">Monto a Cobrar ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={montoPago}
                      onChange={(e) => setMontoPago(e.target.value)}
                      className="w-full rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-bold text-emerald-950 dark:text-emerald-100 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-200 mb-1">Concepto / Nota</label>
                    <input
                      type="text"
                      placeholder="Ej: Pago efectivo..."
                      value={descripcionPago}
                      onChange={(e) => setDescripcionPago(e.target.value)}
                      className="w-full rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-700"
                  >
                    Registrar Pago
                  </button>
                </form>

                {/* Ajustar Límite */}
                <div className="flex items-center gap-3 pt-2 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Límite de crédito autorizado:</span>
                  <input
                    type="number"
                    value={nuevoLimite}
                    onChange={(e) => setNuevoLimite(e.target.value)}
                    className="w-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-center font-bold text-slate-900 dark:text-slate-100 outline-none"
                  />
                  <button
                    onClick={guardarLimite}
                    className="rounded-xl bg-slate-800 dark:bg-slate-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-900 dark:hover:bg-slate-600 transition"
                  >
                    Guardar Límite
                  </button>
                </div>
              </div>

              {/* Historial de Movimientos */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">Historial de Movimientos de Cuenta</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Descripción</th>
                        <th className="px-4 py-3">Operador</th>
                        <th className="px-4 py-3">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {movimientos.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-500 dark:text-slate-400">Sin movimientos registrados.</td>
                        </tr>
                      ) : (
                        movimientos.map((m) => {
                          const esPago = m.tipo === 'pago';
                          return (
                            <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{new Date(m.fecha).toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${esPago ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'}`}>
                                  {esPago ? 'Pago (-)' : 'Venta (+)'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{m.descripcion}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{m.operador || 'Sistema'}</td>
                              <td className={`px-4 py-3 font-bold ${esPago ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {esPago ? `-` : `+`}${parseFloat(m.monto).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center text-slate-400">
              <span className="mb-2 text-4xl">👤</span>
              <p className="font-bold text-slate-700 dark:text-slate-200">Seleccioná un cliente de la lista</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Podrás ver su saldo, historial de compras fiadas y registrar pagos.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

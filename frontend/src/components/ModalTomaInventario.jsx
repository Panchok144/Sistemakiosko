import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../apiClient';
import { ClipboardList, CheckCircle, AlertCircle, X, Search, Play, CheckCheck, Trash2, ArrowRight } from 'lucide-react';

export default function ModalTomaInventario({ isOpen, onClose, rubrosLista = [], onFinalizar }) {
  const [conteoActivo, setConteoActivo] = useState(null);
  const [items, setItems] = useState([]);
  const [estadisticas, setEstadisticas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [guardandoItem, setGuardandoItem] = useState(null);

  // Form nuevo conteo
  const [nombreConteo, setNombreConteo] = useState(`Conteo ${new Date().toLocaleDateString('es-AR')}`);
  const [rubroSeleccionado, setRubroSeleccionado] = useState('');
  const [iniciando, setIniciando] = useState(false);

  // Filtro de búsqueda
  const [busqueda, setBusqueda] = useState('');

  const verificarConteoActivo = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/conteos');
      const conteos = Array.isArray(res.data) ? res.data : [];
      const enProgreso = conteos.find((c) => c.estado === 'en_progreso');
      if (enProgreso) {
        cargarDetalleConteo(enProgreso.id);
      } else {
        setConteoActivo(null);
        setItems([]);
        setEstadisticas(null);
      }
    } catch (err) {
      console.error('Error al verificar conteos:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarDetalleConteo = async (id) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/conteos/${id}`);
      setConteoActivo(res.data);
      setItems(res.data.items || []);
      setEstadisticas(res.data.estadisticas || null);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      verificarConteoActivo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleIniciarConteo = async (e) => {
    e.preventDefault();
    setIniciando(true);
    try {
      const res = await apiClient.post('/api/conteos', {
        nombre: nombreConteo.trim() || `Conteo ${new Date().toLocaleDateString('es-AR')}`,
        rubro: rubroSeleccionado || undefined,
      });
      Swal.fire({
        icon: 'success',
        title: '¡Conteo iniciado!',
        text: 'Se tomó el snapshot del stock actual. Ahora podés ingresar las cantidades físicas contadas.',
        timer: 2000,
        showConfirmButton: false,
      });
      cargarDetalleConteo(res.data.id);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setIniciando(false);
    }
  };

  const handleCambioCantidad = async (prodId, valor) => {
    if (valor === '' || isNaN(valor)) return;
    const cantNum = parseInt(valor, 10);
    if (cantNum < 0) return;

    setGuardandoItem(prodId);
    try {
      const res = await apiClient.put(`/api/conteos/${conteoActivo.id}/item/${prodId}`, {
        cantidad_fisica: cantNum,
      });

      // Actualizar estado local
      setItems((prev) =>
        prev.map((it) => {
          if (it.producto_id === prodId) {
            const dif = cantNum - it.cantidad_sistema;
            return { ...it, cantidad_fisica: cantNum, diferencia: dif };
          }
          return it;
        })
      );
    } catch (err) {
      console.error('Error al guardar cantidad contada:', err);
    } finally {
      setGuardandoItem(null);
    }
  };

  const handleCerrarConteo = async () => {
    const itemsContados = items.filter((i) => i.cantidad_fisica !== null);
    const conDiferencia = items.filter((i) => i.cantidad_fisica !== null && i.diferencia !== 0);

    const conf = await Swal.fire({
      title: '¿Cerrar conteo físico?',
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Se finalizará el conteo <b>"${conteoActivo.nombre}"</b>.</p>
          <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
            <p>• Total ítems contados: <b>${itemsContados.length}</b> de ${items.length}</p>
            <p>• Ítems con diferencia a ajustar: <b>${conDiferencia.length}</b></p>
          </div>
          <p class="text-xs text-gray-500">El stock del sistema se actualizará automáticamente y se registrará en el historial de movimientos de inventario con motivo 'inventario'.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aplicar ajustes y cerrar',
      cancelButtonText: 'Seguir contando',
      confirmButtonColor: '#10b981',
    });

    if (!conf.isConfirmed) return;

    try {
      const res = await apiClient.put(`/api/conteos/${conteoActivo.id}/cerrar`, {
        aplicar_diferencias: true,
      });

      await Swal.fire('✅ Conteo cerrado', res.data?.mensaje || 'Ajustes aplicados al stock con éxito', 'success');
      setConteoActivo(null);
      if (onFinalizar) onFinalizar();
      onClose();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const handleCancelarConteo = async () => {
    const conf = await Swal.fire({
      title: '¿Cancelar conteo en progreso?',
      text: 'Se descartarán los valores contados sin modificar el stock.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No, continuar',
      confirmButtonColor: '#ef4444',
    });
    if (!conf.isConfirmed) return;

    try {
      await apiClient.delete(`/api/conteos/${conteoActivo.id}`);
      setConteoActivo(null);
      setItems([]);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const itemsFiltrados = items.filter((it) => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      it.producto_nombre?.toLowerCase().includes(b) ||
      it.codigo_barras?.includes(b) ||
      it.rubro?.toLowerCase().includes(b)
    );
  });

  const totalContados = items.filter((i) => i.cantidad_fisica !== null).length;
  const progresoPct = items.length > 0 ? Math.round((totalContados / items.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[2rem] bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800">
              <ClipboardList className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                Toma de Inventario Físico
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Recuento ciego o guiado para corregir diferencias y auditar existencias
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Caso 1: No hay conteo activo -> Iniciar uno nuevo */}
        {!conteoActivo ? (
          <div className="py-8 px-4 max-w-xl mx-auto text-center space-y-6">
            <div className="inline-flex p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <ClipboardList size={40} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Iniciar un Nuevo Conteo de Inventario
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Al iniciar, se congelará una fotografía del stock actual de los productos para que puedas comparar con el recuento real en góndola o depósito.
              </p>
            </div>

            <form onSubmit={handleIniciarConteo} className="space-y-4 text-left bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre del Conteo
                </label>
                <input
                  type="text"
                  required
                  value={nombreConteo}
                  onChange={(e) => setNombreConteo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none"
                  placeholder="Ej: Conteo Bebidas y Snacks"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Alcance (Rubro)
                </label>
                <select
                  value={rubroSeleccionado}
                  onChange={(e) => setRubroSeleccionado(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none"
                >
                  <option value="">Todos los rubros (Inventario completo)</option>
                  {rubrosLista.map((r) => (
                    <option key={r.id} value={r.nombre}>
                      Solo rubro: {r.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Podés contar todo el local o focalizarte en una sola categoría.
                </p>
              </div>

              <button
                type="submit"
                disabled={iniciando}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 text-xs transition shadow-lg shadow-indigo-600/20"
              >
                <Play size={15} /> {iniciando ? 'Iniciando snapshot...' : 'Comenzar Conteo Ahora'}
              </button>
            </form>
          </div>
        ) : (
          /* Caso 2: Conteo en progreso -> Planilla de recuento */
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Barra de progreso y datos del conteo */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {conteoActivo.nombre}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200">
                    En progreso
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Progreso: <b>{totalContados}</b> de <b>{items.length}</b> productos contados ({progresoPct}%)
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handleCancelarConteo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50"
                >
                  <Trash2 size={13} /> Cancelar
                </button>
                <button
                  onClick={handleCerrarConteo}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                >
                  <CheckCheck size={14} /> Finalizar y Aplicar Stock
                </button>
              </div>
            </div>

            {/* Barra de búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar producto por nombre, código de barras o rubro..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs outline-none text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Tabla de ítems a contar */}
            <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 dark:border-slate-700">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="sticky top-0 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 font-bold uppercase tracking-wider text-[10px] text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Producto</th>
                    <th className="py-2.5 px-3">Rubro</th>
                    <th className="py-2.5 px-3 text-center">Stock Sistema</th>
                    <th className="py-2.5 px-3 text-center w-36">Stock Físico (Contado)</th>
                    <th className="py-2.5 px-3 text-center">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {itemsFiltrados.map((it) => {
                    const dif = it.diferencia;
                    const haSidoContado = it.cantidad_fisica !== null && it.cantidad_fisica !== undefined;

                    return (
                      <tr
                        key={it.id}
                        className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition ${
                          haSidoContado ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          <div>{it.producto_nombre}</div>
                          {it.codigo_barras && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {it.codigo_barras}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-500">{it.rubro || '—'}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                          {it.cantidad_sistema}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="Pendiente..."
                            defaultValue={it.cantidad_fisica !== null ? it.cantidad_fisica : ''}
                            onBlur={(e) => handleCambioCantidad(it.producto_id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleCambioCantidad(it.producto_id, e.target.value);
                                e.target.blur();
                              }
                            }}
                            className={`w-28 text-center py-1 px-2 text-xs font-bold rounded-lg border outline-none transition ${
                              haSidoContado
                                ? 'border-indigo-400 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/10'
                                : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400'
                            }`}
                          />
                        </td>
                        <td className="py-3 px-3 text-center">
                          {!haSidoContado ? (
                            <span className="text-[11px] text-slate-400">—</span>
                          ) : dif === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                              Exacto (0)
                            </span>
                          ) : dif > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200">
                              +{dif} (Sobra)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400 border border-red-200">
                              {dif} (Falta)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

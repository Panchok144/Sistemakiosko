import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { Truck, Plus, Trash2, Sparkles, CheckCircle2, Clock, PackageCheck } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function OrdenesCompra({ proveedores = [], productos = [] }) {
  const [ordenes, setOrdenes] = useState([]);
  const [modalNueva, setModalNueva] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);

  // Form nueva OC
  const [proveedorId, setProveedorId] = useState('');
  const [fechaEsperada, setFechaEsperada] = useState('');
  const [notas, setNotas] = useState('');
  const [itemsOC, setItemsOC] = useState([]);

  // Form agregar producto a la OC
  const [productoSel, setProductoSel] = useState('');
  const [cantidadPedida, setCantidadPedida] = useState('1');
  const [precioCosto, setPrecioCosto] = useState('');

  useEffect(() => {
    cargarOrdenes();
  }, []);

  const cargarOrdenes = () => {
    apiClient.get('/api/ordenes-compra')
      .then(res => setOrdenes(res.data || []))
      .catch(err => console.error(err));
  };

  const agregarItem = () => {
    const prod = productos.find(p => p.id === parseInt(productoSel));
    if (!prod) return;
    const cant = parseInt(cantidadPedida) || 1;
    const costo = parseFloat(precioCosto) || parseFloat(prod.costo || 0);

    const existe = itemsOC.find(i => i.producto_id === prod.id);
    if (existe) {
      setItemsOC(itemsOC.map(i => i.producto_id === prod.id ? { ...i, cantidad_pedida: i.cantidad_pedida + cant } : i));
    } else {
      setItemsOC([...itemsOC, {
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        cantidad_pedida: cant,
        precio_unitario: costo
      }]);
    }
    setProductoSel('');
    setCantidadPedida('1');
    setPrecioCosto('');
  };

  // Motor de Reposición Sugerida Automática (stock <= 5 -> pedir para llegar a 15)
  const autoSugerirReposicion = () => {
    const prodsBajos = productos.filter(p => p.stock <= 5);
    if (prodsBajos.length === 0) {
      return Swal.fire('Información', 'No hay productos con stock crítico (≤ 5 u.) para sugerir reposición.', 'info');
    }
    const nuevosItems = prodsBajos.map(p => ({
      producto_id: p.id,
      nombre_producto: p.nombre,
      cantidad_pedida: Math.max(10, 15 - p.stock),
      precio_unitario: parseFloat(p.costo || 0)
    }));
    setItemsOC(nuevosItems);
    Swal.fire('Sugerencia Creada', `Se agregaron ${nuevosItems.length} productos con stock crítico a la orden.`, 'success');
  };

  const guardarOrden = async (e) => {
    e.preventDefault();
    if (itemsOC.length === 0) {
      Swal.fire('Atención', 'Agregá al menos un producto a la orden de compra', 'warning');
      return;
    }

    try {
      await apiClient.post('/api/ordenes-compra', {
        proveedor_id: proveedorId || null,
        fecha_esperada: fechaEsperada || null,
        notas,
        items: itemsOC
      });
      Swal.fire('¡Éxito!', 'Orden de Compra generada', 'success');
      setModalNueva(false);
      setItemsOC([]);
      setNotas('');
      cargarOrdenes();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al crear orden de compra', 'error');
    }
  };

  const verDetalle = async (id) => {
    try {
      const res = await apiClient.get(`/api/ordenes-compra/${id}`);
      setOrdenSeleccionada(res.data);
    } catch (err) {
      Swal.fire('Error', 'No se pudo cargar el detalle', 'error');
    }
  };

  const marcarRecibida = async (orden) => {
    const result = await Swal.fire({
      title: '¿Confirmar recepción de mercadería?',
      text: `Se marcará la OC #${orden.numero} como RECIBIDA y el stock de los productos ingresará automáticamente.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, ingresar al stock',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    // Build received quantities list
    const res = await apiClient.get(`/api/ordenes-compra/${orden.id}`);
    const ocData = res.data;

    const itemsRecibidos = (ocData.items || []).map(item => ({
      item_id: item.id,
      producto_id: item.producto_id,
      cantidad_recibida: item.cantidad_pedida
    }));

    try {
      await apiClient.put(`/api/ordenes-compra/${orden.id}/estado`, {
        estado: 'recibida',
        items_recibidos: itemsRecibidos
      });
      Swal.fire('¡Éxito!', 'Mercadería ingresada al stock correctamente', 'success');
      cargarOrdenes();
      setOrdenSeleccionada(null);
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al recibir la orden', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Órdenes de Compra a Proveedores</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Planificá pedidos a proveedores e ingresá stock automáticamente al recibirlos.</p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
        >
          + Nueva Orden de Compra
        </button>
      </div>

      {/* Lista de Órdenes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3"># N°</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Emisión</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {ordenes.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">Sin órdenes de compra registradas.</td>
                </tr>
              ) : (
                ordenes.map((oc) => {
                  const estadoColors = {
                    borrador: 'bg-slate-100 text-slate-600',
                    enviada: 'bg-blue-50 text-blue-700',
                    recibida: 'bg-emerald-50 text-emerald-700',
                    cancelada: 'bg-rose-50 text-rose-700',
                  }[oc.estado] || 'bg-slate-100 text-slate-600';

                  return (
                    <tr key={oc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">#{oc.numero}</td>
                      <td className="px-4 py-3 font-medium">{oc.proveedor_nombre || 'Varios'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(oc.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoColors}`}>
                          {oc.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(oc.total)}</td>
                      <td className="px-4 py-3 space-x-2">
                        <button
                          onClick={() => verDetalle(oc.id)}
                          className="rounded bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                        >
                          Ver Detalle
                        </button>
                        {oc.estado !== 'recibida' && (
                          <button
                            onClick={() => marcarRecibida(oc)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <PackageCheck size={13} /> Ingresar Stock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle */}
      {ordenSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h2 className="text-xl font-bold text-slate-900">Orden de Compra #{ordenSeleccionada.numero}</h2>
              <button onClick={() => setOrdenSeleccionada(null)} className="text-xl font-bold text-slate-400">&times;</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Proveedor: <strong>{ordenSeleccionada.proveedor_nombre || 'No especificado'}</strong></p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Cant. Pedida</th>
                    <th className="px-3 py-2">Costo Unit.</th>
                    <th className="px-3 py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {(ordenSeleccionada.items || []).map(i => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{i.nombre_producto}</td>
                      <td className="px-3 py-2">{i.cantidad_pedida}</td>
                      <td className="px-3 py-2">${parseFloat(i.precio_unitario).toFixed(2)}</td>
                      <td className="px-3 py-2 font-bold">${parseFloat(i.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400">Total OC: <strong className="text-base text-slate-900">${parseFloat(ordenSeleccionada.total).toFixed(2)}</strong></span>
              <button onClick={() => setOrdenSeleccionada(null)} className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva Orden de Compra */}
      {modalNueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nueva Orden de Compra</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={autoSugerirReposicion}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 px-3 py-1.5 text-xs font-bold hover:bg-amber-100 transition-all"
                  title="Sugerir productos con stock ≤ 5 u."
                >
                  <Sparkles size={14} /> Auto-Sugerir Reposición
                </button>
                <button onClick={() => setModalNueva(false)} className="text-xl font-bold text-slate-400 hover:text-slate-600">&times;</button>
              </div>
            </div>

            <form onSubmit={guardarOrden} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Proveedor</label>
                  <select
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="">-- Seleccionar Proveedor --</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Fecha Esperada de Entrega</label>
                  <input
                    type="date"
                    value={fechaEsperada}
                    onChange={(e) => setFechaEsperada(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>

              {/* Agregar productos */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Agregar Productos a la Orden</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_80px_100px_40px]">
                  <select
                    value={productoSel}
                    onChange={(e) => {
                      setProductoSel(e.target.value);
                      const p = productos.find(prod => prod.id === parseInt(e.target.value));
                      if (p) setPrecioCosto(p.costo || '');
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none"
                  >
                    <option value="">-- Seleccionar producto --</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Cant"
                    value={cantidadPedida}
                    onChange={(e) => setCantidadPedida(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-2 py-2 text-center text-sm font-semibold outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Costo U."
                    value={precioCosto}
                    onChange={(e) => setPrecioCosto(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-2 py-2 text-center text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={agregarItem}
                    className="rounded-lg bg-indigo-600 font-bold text-white hover:bg-indigo-700"
                  >
                    +
                  </button>
                </div>

                <div className="space-y-1.5 pt-2">
                  {itemsOC.map(item => (
                    <div key={item.producto_id} className="flex items-center justify-between rounded-lg bg-white p-2 text-xs border border-slate-200">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.nombre_producto}</span>
                      <span>{item.cantidad_pedida} u. x ${item.precio_unitario}</span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-400">${(item.cantidad_pedida * item.precio_unitario).toFixed(2)}</span>
                      <button type="button" onClick={() => setItemsOC(itemsOC.filter(i => i.producto_id !== item.producto_id))} className="text-rose-500 font-bold">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <textarea
                  placeholder="Notas adicionales..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none"
                  rows="2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalNueva(false)} className="rounded-xl bg-slate-100 dark:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">Cancelar</button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">Crear Orden de Compra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';

export default function Devoluciones() {
  const [devoluciones, setDevoluciones] = useState([]);
  const [ventaIdBusqueda, setVentaIdBusqueda] = useState('');
  const [ventaEncontrada, setVentaEncontrada] = useState(null);
  const [itemsVenta, setItemsVenta] = useState([]);
  const [itemsADevolver, setItemsADevolver] = useState({});
  const [motivo, setMotivo] = useState('');
  const [devolverACaja, setDevolverACaja] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cargarDevoluciones();
  }, []);

  const cargarDevoluciones = () => {
    apiClient.get('/api/devoluciones')
      .then(res => setDevoluciones(res.data || []))
      .catch(err => console.error(err));
  };

  const buscarVenta = async (e) => {
    e.preventDefault();
    if (!ventaIdBusqueda.trim()) return;
    setLoading(true);
    setVentaEncontrada(null);
    setItemsVenta([]);
    setItemsADevolver({});

    try {
      const resVentas = await apiClient.get('/api/ventas');
      const venta = (resVentas.data || []).find(v => v.id === parseInt(ventaIdBusqueda));
      if (!venta) {
        Swal.fire('Error', 'No se encontró la venta con ese número', 'error');
        setLoading(false);
        return;
      }

      const resItems = await apiClient.get(`/api/ventas/${venta.id}/productos`);
      setVentaEncontrada(venta);
      setItemsVenta(resItems.data || []);
    } catch (err) {
      Swal.fire('Error', 'Error al buscar la venta', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCantidadDevolverChange = (productoId, maxCantidad, val) => {
    const qty = parseInt(val) || 0;
    if (qty < 0 || qty > maxCantidad) return;
    setItemsADevolver(prev => ({
      ...prev,
      [productoId]: qty
    }));
  };

  const procesarDevolucion = async () => {
    const itemsList = Object.entries(itemsADevolver)
      .filter(([_, cant]) => cant > 0)
      .map(([prodId, cant]) => {
        const itemOriginal = itemsVenta.find(i => i.id_producto === parseInt(prodId));
        return {
          producto_id: parseInt(prodId),
          nombre_producto: itemOriginal ? itemOriginal.nombre : 'Producto',
          cantidad: cant,
          precio_unitario: itemOriginal ? parseFloat(itemOriginal.precio_unitario) : 0
        };
      });

    if (itemsList.length === 0) {
      Swal.fire('Atención', 'Seleccioná al menos un producto a devolver', 'warning');
      return;
    }

    const totalCalculado = itemsList.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);

    const result = await Swal.fire({
      title: '¿Confirmar Devolución?',
      text: `Se devolverán ${itemsList.length} ítems por un total de $${totalCalculado.toFixed(2)}. El stock será restaurado automáticamente.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, registrar devolución',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      await apiClient.post('/api/devoluciones', {
        venta_id: ventaEncontrada.id,
        items: itemsList,
        motivo,
        devolver_a_caja: devolverACaja
      });

      Swal.fire('¡Éxito!', 'Devolución procesada y stock restaurado', 'success');
      setVentaEncontrada(null);
      setVentaIdBusqueda('');
      setItemsVenta([]);
      setItemsADevolver({});
      setMotivo('');
      cargarDevoluciones();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al procesar devolución', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Devoluciones / Notas de Crédito</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Buscá una venta realizada para restaurar stock y registrar la devolución.</p>
        </div>
      </div>

      {/* Buscar Venta */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <form onSubmit={buscarVenta} className="flex gap-3">
          <input
            type="number"
            placeholder="Ingresá el número de ticket/venta (ej: 104)..."
            value={ventaIdBusqueda}
            onChange={(e) => setVentaIdBusqueda(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            {loading ? 'Buscando...' : 'Buscar Venta'}
          </button>
        </form>

        {/* Venta encontrada y selección de ítems */}
        {ventaEncontrada && (
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between rounded-xl bg-indigo-50/60 p-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">Venta #{ventaEncontrada.id}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fecha: {new Date(ventaEncontrada.fecha).toLocaleString()} | Vendedor: {ventaEncontrada.vendedor}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500">Total original</span>
                <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400">${parseFloat(ventaEncontrada.total).toFixed(2)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Cant. Comprada</th>
                    <th className="px-4 py-3">Precio Unitario</th>
                    <th className="px-4 py-3">Cant. a Devolver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {itemsVenta.map((item) => (
                    <tr key={item.id_producto} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.nombre}</td>
                      <td className="px-4 py-3">{item.cantidad}</td>
                      <td className="px-4 py-3">${parseFloat(item.precio_unitario).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max={item.cantidad}
                          value={itemsADevolver[item.id_producto] || 0}
                          onChange={(e) => handleCantidadDevolverChange(item.id_producto, item.cantidad, e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-semibold outline-none focus:border-indigo-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Motivo de la devolución</label>
                <input
                  type="text"
                  placeholder="Ej: Producto fallado / Error en cobro..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 mt-5">
                  <input
                    type="checkbox"
                    checked={devolverACaja}
                    onChange={(e) => setDevolverACaja(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Registrar egreso de dinero en la caja abierta
                </label>
              </div>
            </div>

            <button
              onClick={procesarDevolucion}
              className="w-full rounded-xl bg-rose-600 px-6 py-3 font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-700"
            >
              Confirmar Devolución y Restaurar Stock
            </button>
          </div>
        )}
      </div>

      {/* Historial de Devoluciones */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Historial de Devoluciones</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3"># Dev</th>
                <th className="px-4 py-3">Venta Origen</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Devuelto a Caja</th>
                <th className="px-4 py-3">Total Devuelto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {devoluciones.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">No hay devoluciones registradas.</td>
                </tr>
              ) : (
                devoluciones.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">#{d.id}</td>
                    <td className="px-4 py-3">{d.venta_id ? `#${d.venta_id}` : 'Manual'}</td>
                    <td className="px-4 py-3">{new Date(d.fecha).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{d.motivo || 'Sin motivo'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.devuelto_caja ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                        {d.devuelto_caja ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-rose-600">${parseFloat(d.total_devuelto).toFixed(2)}</td>
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

import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';

export default function ListasPrecios({ productos = [] }) {
  const [listas, setListas] = useState([]);
  const [preciosVolumen, setPreciosVolumen] = useState([]);

  // Form Listas
  const [nombreLista, setNombreLista] = useState('');
  const [descripcionLista, setDescripcionLista] = useState('');
  const [porcentajeAjuste, setPorcentajeAjuste] = useState('0');
  const [esMayorista, setEsMayorista] = useState(false);

  // Form Volumen
  const [productoIdVolumen, setProductoIdVolumen] = useState('');
  const [cantidadMinima, setCantidadMinima] = useState('');
  const [precioVolumenInput, setPrecioVolumenInput] = useState('');

  useEffect(() => {
    cargarListas();
    cargarPreciosVolumen();
  }, []);

  const cargarListas = () => {
    apiClient.get('/api/listas-precios')
      .then(res => setListas(res.data || []))
      .catch(err => console.error(err));
  };

  const cargarPreciosVolumen = () => {
    apiClient.get('/api/listas-precios/precios-volumen')
      .then(res => setPreciosVolumen(res.data || []))
      .catch(err => console.error(err));
  };

  const crearLista = async (e) => {
    e.preventDefault();
    if (!nombreLista.trim()) return;

    try {
      await apiClient.post('/api/listas-precios', {
        nombre: nombreLista,
        descripcion: descripcionLista,
        porcentaje_ajuste: parseFloat(porcentajeAjuste) || 0,
        es_mayorista: esMayorista
      });
      Swal.fire('¡Éxito!', 'Lista de precios creada', 'success');
      setNombreLista('');
      setDescripcionLista('');
      setPorcentajeAjuste('0');
      setEsMayorista(false);
      cargarListas();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al crear la lista', 'error');
    }
  };

  const eliminarLista = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta lista de precios?')) return;
    try {
      await apiClient.delete(`/api/listas-precios/${id}`);
      cargarListas();
    } catch (err) {
      Swal.fire('Error', 'No se pudo eliminar la lista', 'error');
    }
  };

  const crearPrecioVolumen = async (e) => {
    e.preventDefault();
    if (!productoIdVolumen || !cantidadMinima || !precioVolumenInput) return;

    try {
      await apiClient.post('/api/listas-precios/precios-volumen', {
        producto_id: parseInt(productoIdVolumen),
        cantidad_minima: parseInt(cantidadMinima),
        precio: parseFloat(precioVolumenInput)
      });
      Swal.fire('¡Éxito!', 'Precio por volumen guardado', 'success');
      setCantidadMinima('');
      setPrecioVolumenInput('');
      cargarPreciosVolumen();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al guardar precio por volumen', 'error');
    }
  };

  const eliminarPrecioVolumen = async (id) => {
    try {
      await apiClient.delete(`/api/listas-precios/precios-volumen/${id}`);
      cargarPreciosVolumen();
    } catch (err) {
      Swal.fire('Error', 'No se pudo eliminar', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Listas de Precios & Venta Mayorista</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configurá múltiples listas de precios y descuentos escalonados por cantidad.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Listas de Precios */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Crear Lista de Precios</h2>
            <form onSubmit={crearLista} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre de la lista</label>
                <input
                  type="text"
                  placeholder="Ej: Mayorista 10%, Gremio, Especial..."
                  value={nombreLista}
                  onChange={(e) => setNombreLista(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ajuste de precio (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Ej: 15 o -5"
                    value={porcentajeAjuste}
                    onChange={(e) => setPorcentajeAjuste(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Positivo = recargo, Negativo = descuento</p>
                </div>
                <div className="flex items-center pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={esMayorista}
                      onChange={(e) => setEsMayorista(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                    Es lista mayorista
                  </label>
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
              >
                Guardar Lista
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">Listas Vigentes</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Ajuste</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {listas.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-4 text-center text-slate-400">Sin listas personalizadas. Se usa Lista Estándar.</td>
                    </tr>
                  ) : (
                    listas.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{l.nombre}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600">
                          {parseFloat(l.porcentaje_ajuste) >= 0 ? `+${l.porcentaje_ajuste}%` : `${l.porcentaje_ajuste}%`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${l.es_mayorista ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {l.es_mayorista ? 'Mayorista' : 'Minorista'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => eliminarLista(l.id)}
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Eliminar
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

        {/* Precios Escalonados por Volumen */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Precios por Volumen (Mayorista por Cantidad)</h2>
            <form onSubmit={crearPrecioVolumen} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Producto</label>
                <select
                  value={productoIdVolumen}
                  onChange={(e) => setProductoIdVolumen(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">-- Seleccionar Producto --</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} (Precio Base: ${p.precio_venta})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">A partir de (unidades)</label>
                  <input
                    type="number"
                    min="2"
                    placeholder="Ej: 6, 12, 50..."
                    value={cantidadMinima}
                    onChange={(e) => setCantidadMinima(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Precio Unitario ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 85.00"
                    value={precioVolumenInput}
                    onChange={(e) => setPrecioVolumenInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700"
              >
                Guardar Precio por Volumen
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">Reglas de Volumen Configuradas</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Cant. Mínima</th>
                    <th className="px-4 py-3">Precio Especial</th>
                    <th className="px-4 py-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {preciosVolumen.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-4 text-center text-slate-400">Sin reglas por volumen.</td>
                    </tr>
                  ) : (
                    preciosVolumen.map((pv) => (
                      <tr key={pv.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{pv.producto_nombre}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">≥ {pv.cantidad_minima} u.</td>
                        <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">${parseFloat(pv.precio).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => eliminarPrecioVolumen(pv.id)}
                            className="text-xs text-rose-600 hover:underline"
                          >
                            Eliminar
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
      </div>
    </div>
  );
}

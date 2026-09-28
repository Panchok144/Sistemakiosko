import { useState, useMemo } from 'react'
import Swal from 'sweetalert2'

export default function Remitos({ remitos = [], productos = [], proveedores = [], crearRemito }) {
  const [tipo, setTipo] = useState('ingreso')
  const [proveedorId, setProveedorId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState([])
  const [busqueda, setBusqueda] = useState('')

  const prods = Array.isArray(productos) ? productos : []
  const provs = Array.isArray(proveedores) ? proveedores : []
  const rems = Array.isArray(remitos) ? remitos : []

  const productosFiltrados = useMemo(() => {
    if (!busqueda) return []
    return prods.filter(p =>
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo_barras?.toString().includes(busqueda)
    ).slice(0, 5)
  }, [busqueda, prods])

  const agregarItem = (producto) => {
    if (items.find(i => i.producto_id === producto.id)) {
      Swal.fire('Advertencia', 'El producto ya está en el remito, ajusta la cantidad.', 'warning')
      return
    }
    setItems([...items, { producto_id: producto.id, nombre: producto.nombre, cantidad: 1, precio_unitario: producto.costo }])
    setBusqueda('')
  }

  const eliminarItem = (id) => setItems(items.filter(i => i.producto_id !== id))

  const actualizarItem = (id, campo, valor) => {
    setItems(items.map(i => {
      if (i.producto_id !== id) return i;
      // BUG-13 FIX: Sanitizar valores numéricos para evitar NaN que se omiten silenciosamente en el servidor
      if (campo === 'cantidad') {
        const n = parseInt(valor);
        return { ...i, [campo]: isNaN(n) || n < 1 ? 1 : n };
      }
      if (campo === 'precio_unitario') {
        const n = parseFloat(valor);
        return { ...i, [campo]: isNaN(n) ? 0 : n };
      }
      return { ...i, [campo]: valor };
    }))
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (items.length === 0) return Swal.fire('Error', 'Debes agregar al menos un producto al remito.', 'error')

    crearRemito({ tipo, proveedor_id: proveedorId || null, observaciones, items }, () => {
      setItems([])
      setObservaciones('')
      setBusqueda('')
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="text-3xl">📦</span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Nuevo Remito</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registra ingreso de mercadería de proveedor o egresos por devoluciones.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Tipo de Remito</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
              >
                <option value="ingreso">Ingreso (Suma stock)</option>
                <option value="egreso">Egreso (Resta stock)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Proveedor</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
              >
                <option value="">-- Seleccionar --</option>
                {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Observaciones</label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                placeholder="Ej. Remito Nº 1234-A"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Productos del Remito</h3>
            <div className="mb-4 relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto para agregar..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {busqueda && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-lg">
                  {productosFiltrados.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarItem(p)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 last:border-0"
                    >
                      {p.nombre} ({p.codigo_barras}) - Stock act: {p.stock}
                    </button>
                  ))}
                  {productosFiltrados.length === 0 && <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No se encontraron productos</div>}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 uppercase">
                  <tr>
                    <th className="p-2">Producto</th>
                    <th className="p-2 w-24">Cantidad</th>
                    <th className="p-2 w-32">Costo Un.</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.producto_id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{item.nombre}</td>
                      <td className="p-2">
                        <input type="number" min="1" className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100" value={item.cantidad} onChange={e => actualizarItem(item.producto_id, 'cantidad', parseInt(e.target.value))} />
                      </td>
                      <td className="p-2">
                        <input type="number" step="0.01" className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100" value={item.precio_unitario} onChange={e => actualizarItem(item.producto_id, 'precio_unitario', parseFloat(e.target.value))} />
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => eliminarItem(item.producto_id)} className="text-rose-500 font-bold hover:text-rose-700">X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end">
            <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Guardar Remito</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <h2 className="mb-6 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Historial de Remitos</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-left text-sm text-slate-500 dark:text-slate-400">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Proveedor</th>
                <th className="px-5 py-3">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {rems.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="px-5 py-3">{new Date(r.fecha).toLocaleDateString()} {new Date(r.fecha).toLocaleTimeString()}</td>
                  <td className="px-5 py-3 font-semibold uppercase text-xs">
                    <span className={r.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{r.tipo}</span>
                  </td>
                  <td className="px-5 py-3">{r.proveedor_nombre || '-'}</td>
                  <td className="px-5 py-3">{r.observaciones || '-'}</td>
                </tr>
              ))}
              {rems.length === 0 && (
                <tr><td colSpan="4" className="p-6 text-center text-slate-500 dark:text-slate-400">No hay remitos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { ShoppingBag, Plus, PackageCheck, Trash2 } from 'lucide-react';

const ESTADOS = ['pendiente', 'pagada', 'vencida', 'anulada'];

export default function FacturasCompra({ productos = [], proveedores = [] }) {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [items, setItems] = useState([]);

  const [form, setForm] = useState({
    numero: '', proveedor_id: '', fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '', metodo_pago: 'efectivo', notas: '',
  });
  const [formItems, setFormItems] = useState([
    { producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: '', iva_porcentaje: 21 }
  ]);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/facturas-compra');
      setFacturas(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const verItems = async (id) => {
    setDetalleId(id);
    try {
      const res = await apiClient.get(`/api/facturas-compra/${id}/items`);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (_) { setItems([]); }
  };

  const addItemRow = () => setFormItems(prev => [...prev, { producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: '', iva_porcentaje: 21 }]);
  const removeItemRow = (i) => setFormItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setFormItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const onProductoSelect = (i, prodId) => {
    const prod = productos.find(p => p.id === parseInt(prodId));
    if (prod) {
      updateItem(i, 'producto_id', prodId);
      updateItem(i, 'nombre_producto', prod.nombre);
      updateItem(i, 'precio_unitario', prod.costo || '');
      updateItem(i, 'iva_porcentaje', prod.iva_porcentaje || 21);
    } else {
      updateItem(i, 'producto_id', prodId);
    }
  };

  const subtotal = formItems.reduce((acc, it) => acc + (parseFloat(it.precio_unitario || 0) * parseInt(it.cantidad || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = formItems.filter(it => it.nombre_producto && it.cantidad > 0 && parseFloat(it.precio_unitario) >= 0);
    if (validItems.length === 0) return Swal.fire('❌', 'Agregá al menos un ítem válido.', 'warning');
    try {
      await apiClient.post('/api/facturas-compra', { ...form, proveedor_id: form.proveedor_id || null, items: validItems });
      Swal.fire('✅', 'Factura de compra creada.', 'success');
      setShowForm(false);
      setForm({ numero: '', proveedor_id: '', fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: '', metodo_pago: 'efectivo', notas: '' });
      setFormItems([{ producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: '', iva_porcentaje: 21 }]);
      cargar();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const recibirFactura = async (id) => {
    const conf = await Swal.fire({
      title: '¿Confirmar recepción?',
      html: 'Se sumará el stock de todos los ítems y se actualizarán los costos.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, recibir',
      confirmButtonColor: '#16a34a',
    });
    if (!conf.isConfirmed) return;
    try {
      await apiClient.post(`/api/facturas-compra/${id}/recibir`);
      Swal.fire('✅ Recibido', 'Stock y costos actualizados.', 'success');
      cargar();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const eliminarFactura = async (id) => {
    if (!window.confirm('¿Eliminar esta factura? (Solo si no fue recibida)')) return;
    try {
      await apiClient.delete(`/api/facturas-compra/${id}`);
      cargar();
    } catch (err) {
      Swal.fire('❌', err.response?.data?.error || err.message, 'error');
    }
  };

  const inp = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500';
  const lbl = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';

  const estadoBadge = (estado) => {
    const map = {
      pendiente: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
      pagada: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
      vencida: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
      anulada: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
    };
    return map[estado] || 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"><ShoppingBag size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Facturas de Compra</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Al recibir una factura, el stock se actualiza automáticamente</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all">
          <Plus size={16} /> Nueva Factura
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Nueva Factura de Compra</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Cabecera */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={lbl}>Nro. Factura del Proveedor</label>
                <input className={inp} type="text" placeholder="A-0001-00001234"
                  value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Proveedor</label>
                <select className={inp} value={form.proveedor_id} onChange={e => setForm({ ...form, proveedor_id: e.target.value })}>
                  <option value="">-- Sin proveedor --</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Fecha Emisión</label>
                <input className={inp} type="date" value={form.fecha_emision}
                  onChange={e => setForm({ ...form, fecha_emision: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Vencimiento</label>
                <input className={inp} type="date" value={form.fecha_vencimiento}
                  onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Método de Pago</label>
                <select className={inp} value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })}>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="tarjeta">💳 Tarjeta</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="cheque">📝 Cheque</option>
                  <option value="cuenta_corriente">📋 Cta. Corriente</option>
                </select>
              </div>
              <div className="xl:col-span-3">
                <label className={lbl}>Notas</label>
                <input className={inp} type="text" placeholder="Observaciones..."
                  value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Ítems de la factura</h3>
                <button type="button" onClick={addItemRow}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100">
                  <Plus size={13} /> Agregar línea
                </button>
              </div>
              <div className="space-y-2">
                {formItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-2 items-end">
                    <div>
                      <label className={`${lbl} ${i > 0 ? 'sr-only' : ''}`}>Producto (opcional)</label>
                      <select className={inp} value={it.producto_id} onChange={e => onProductoSelect(i, e.target.value)}>
                        <option value="">-- Seleccionar --</option>
                        {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={`${lbl} ${i > 0 ? 'sr-only' : ''}`}>Descripción *</label>
                      <input className={inp} type="text" placeholder="Nombre del producto"
                        value={it.nombre_producto} onChange={e => updateItem(i, 'nombre_producto', e.target.value)} required />
                    </div>
                    <div>
                      <label className={`${lbl} ${i > 0 ? 'sr-only' : ''}`}>Cant.</label>
                      <input className={`${inp} w-20`} type="number" min="1" value={it.cantidad}
                        onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value) || 1)} />
                    </div>
                    <div>
                      <label className={`${lbl} ${i > 0 ? 'sr-only' : ''}`}>P. Unitario</label>
                      <input className={`${inp} w-28`} type="number" min="0" step="0.01" placeholder="0.00"
                        value={it.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', e.target.value)} />
                    </div>
                    <div>
                      <label className={`${lbl} ${i > 0 ? 'sr-only' : ''}`}>IVA %</label>
                      <select className={`${inp} w-20`} value={it.iva_porcentaje} onChange={e => updateItem(i, 'iva_porcentaje', e.target.value)}>
                        <option value="0">0%</option>
                        <option value="10.5">10.5%</option>
                        <option value="21">21%</option>
                        <option value="27">27%</option>
                      </select>
                    </div>
                    {formItems.length > 1 && (
                      <button type="button" onClick={() => removeItemRow(i)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-6 rounded-xl bg-slate-50 dark:bg-slate-900 px-5 py-3 border border-slate-100 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Subtotal</span>
                <span className="font-black text-slate-900 dark:text-slate-100">${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancelar</button>
              <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-600/20">Guardar Factura</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-slate-500 dark:text-slate-400">Cargando facturas...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-5 py-3 text-left">Nro. Factura</th>
                <th className="px-5 py-3 text-left">Proveedor</th>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-left">Recibida</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {facturas.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-500 dark:text-slate-400">No hay facturas de compra registradas.</td></tr>
              ) : facturas.map(f => (
                <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="px-5 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">{f.numero || `#${f.id}`}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{f.proveedor_nombre || f.proveedor_real || '-'}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{new Date(f.fecha_emision).toLocaleDateString('es-AR')}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${estadoBadge(f.estado)}`}>{f.estado}</span>
                  </td>
                  <td className="px-5 py-3">
                    {f.recibida ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ Sí</span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">Pendiente</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-black text-slate-900 dark:text-slate-100">
                    ${parseFloat(f.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <button onClick={() => verItems(f.id === detalleId ? null : f.id)}
                        className="rounded-xl bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">
                        👁 Ver ítems
                      </button>
                      {!f.recibida && (
                        <button onClick={() => recibirFactura(f.id)}
                          className="flex items-center gap-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all">
                          <PackageCheck size={12} /> Recibir
                        </button>
                      )}
                      {!f.recibida && (
                        <button onClick={() => eliminarFactura(f.id)}
                          className="rounded-xl bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-all">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal items */}
      {detalleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[80vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ítems de la Factura #{detalleId}</h3>
              <button onClick={() => { setDetalleId(null); setItems([]); }}
                className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-lg">×</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-center">Cant.</th>
                  <th className="px-4 py-2 text-right">P. Unit.</th>
                  <th className="px-4 py-2 text-right">IVA</th>
                  <th className="px-4 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map(it => (
                  <tr key={it.id}>
                    <td className="px-4 py-2 font-bold text-slate-900 dark:text-slate-100">{it.nombre_producto}</td>
                    <td className="px-4 py-2 text-center text-slate-800 dark:text-slate-200 font-semibold">{it.cantidad}</td>
                    <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">${parseFloat(it.precio_unitario).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{it.iva_porcentaje}%</td>
                    <td className="px-4 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400">${parseFloat(it.subtotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

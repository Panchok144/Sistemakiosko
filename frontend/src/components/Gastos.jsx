import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { TrendingDown, Plus, Filter, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    concepto: '', monto: '', categoria_gasto_id: '',
    proveedor_id: '', metodo_pago: 'efectivo',
    nro_comprobante: '', afecta_caja: true,
  });

  // Filtros
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.append('desde', desde);
      if (hasta) params.append('hasta', hasta);
      if (categoriaFiltro) params.append('categoria_id', categoriaFiltro);
      const [gRes, cRes, pRes] = await Promise.all([
        apiClient.get(`/api/gastos?${params}`),
        apiClient.get('/api/gastos/categorias'),
        apiClient.get('/api/proveedores'),
      ]);
      setGastos(Array.isArray(gRes.data) ? gRes.data : []);
      setCategorias(Array.isArray(cRes.data) ? cRes.data : []);
      setProveedores(Array.isArray(pRes.data) ? pRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.concepto || !form.monto) return Swal.fire('❌', 'Concepto y monto son obligatorios.', 'warning');
    try {
      await apiClient.post('/api/gastos', {
        ...form,
        monto: parseFloat(form.monto),
        categoria_gasto_id: form.categoria_gasto_id || null,
        proveedor_id: form.proveedor_id || null,
        afecta_caja: form.afecta_caja,
      });
      Swal.fire('✅', 'Gasto registrado con éxito', 'success');
      setForm({ concepto: '', monto: '', categoria_gasto_id: '', proveedor_id: '', metodo_pago: 'efectivo', nro_comprobante: '', afecta_caja: true });
      setShowForm(false);
      cargar();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    try {
      await apiClient.delete(`/api/gastos/${id}`);
      cargar();
    } catch (err) {
      Swal.fire('❌', err.response?.data?.error || err.message, 'error');
    }
  };

  const totalGastos = gastos.reduce((acc, g) => acc + parseFloat(g.monto || 0), 0);
  const inp = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500';
  const lbl = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"><TrendingDown size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gastos Operativos</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Registro de egresos que NO afectan el stock</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 transition-all shadow-md shadow-rose-600/20">
          <Plus size={16} /> Registrar Gasto
        </button>
      </div>

      {/* KPI */}
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Total gastos del período</p>
        <p className="text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums mt-1">{formatCurrency(totalGastos)}</p>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">Nuevo Gasto</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <label className={lbl}>Concepto *</label>
              <input className={inp} type="text" placeholder="Ej: Alquiler mensual" value={form.concepto}
                onChange={e => setForm({ ...form, concepto: e.target.value })} required />
            </div>
            <div>
              <label className={lbl}>Monto ($) *</label>
              <input className={inp} type="number" min="0.01" step="0.01" placeholder="0.00" value={form.monto}
                onChange={e => setForm({ ...form, monto: e.target.value })} required />
            </div>
            <div>
              <label className={lbl}>Categoría</label>
              <select className={inp} value={form.categoria_gasto_id} onChange={e => setForm({ ...form, categoria_gasto_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Proveedor (opcional)</label>
              <select className={inp} value={form.proveedor_id} onChange={e => setForm({ ...form, proveedor_id: e.target.value })}>
                <option value="">-- Sin proveedor --</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Método de Pago</label>
              <select className={inp} value={form.metodo_pago} onChange={e => setForm({ ...form, metodo_pago: e.target.value })}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="tarjeta">💳 Tarjeta</option>
                <option value="transferencia">🏦 Transferencia</option>
                <option value="cheque">📝 Cheque</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Nro. Comprobante (opcional)</label>
              <input className={inp} type="text" placeholder="A-0001-00001234" value={form.nro_comprobante}
                onChange={e => setForm({ ...form, nro_comprobante: e.target.value })} />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3">
              <input type="checkbox" id="afecta_caja" checked={form.afecta_caja}
                onChange={e => setForm({ ...form, afecta_caja: e.target.checked })}
                className="h-4 w-4 accent-amber-600" />
              <label htmlFor="afecta_caja" className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Registrar como egreso en caja (efectivo)
              </label>
            </div>
            <div className="col-span-full flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancelar</button>
              <button type="submit" className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 transition shadow-md shadow-rose-600/20">Guardar Gasto</button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-5 py-4 shadow-sm">
        <Filter size={16} className="text-slate-500 dark:text-slate-400" />
        <input type="date" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none" value={desde}
          onChange={e => setDesde(e.target.value)} />
        <span className="text-slate-400">→</span>
        <input type="date" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none" value={hasta}
          onChange={e => setHasta(e.target.value)} />
        <select className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 outline-none" value={categoriaFiltro}
          onChange={e => setCategoriaFiltro(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={cargar} className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-sm">Filtrar</button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-slate-500 dark:text-slate-400">Cargando gastos...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Concepto</th>
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-left">Método</th>
                <th className="px-5 py-3 text-right">Monto</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {gastos.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">No hay gastos registrados.</td></tr>
              ) : gastos.map(g => (
                <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{formatDate(g.fecha)}</td>
                  <td className="px-5 py-3">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{g.concepto}</p>
                    {g.nro_comprobante && <p className="text-xs text-slate-500 dark:text-slate-400">Comp: {g.nro_comprobante}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {g.categoria_nombre && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">{g.categoria_nombre}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300 capitalize font-medium">{g.metodo_pago}</td>
                  <td className="px-5 py-3 text-right font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatCurrency(g.monto)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => eliminar(g.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-rose-600 hover:text-white transition-all">
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

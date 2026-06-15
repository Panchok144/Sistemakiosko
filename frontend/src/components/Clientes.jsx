import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle, Users, Plus, X } from 'lucide-react';
import Swal from 'sweetalert2';
import apiClient from '../apiClient';
import { formatCurrency } from '../utils/formatters';

// Validador CUIT argentino
function validarCuit(cuit) {
  if (!cuit) return true;
  const limpio = cuit.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(limpio)) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = mult.reduce((acc, m, i) => acc + parseInt(limpio[i]) * m, 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return dv === parseInt(limpio[10]);
}

const COND_FISCAL = [
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto (RI)' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
];

const TIPO_NEGOCIO = ['Kiosco', 'Maxikiosco', 'Drugstore', 'Supermercado', 'Almacén', 'Otro'];

const emptyForm = {
  nombre: '', documento: '', email: '', telefono: '', direccion: '',
  domicilio: '', codigo_fiscal: '',
  cuit: '', condicion_fiscal: 'consumidor_final',
  tiene_cuenta_corriente: false, credito_limite: '', tipo_negocio: '',
};

export default function Clientes({ clientes = [], canManageCatalog, manejarEnvioCliente, eliminarCliente, editarCliente, cargarClientes }) {
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [modalAgregar, setModalAgregar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [editDatos, setEditDatos] = useState({});

  const upd = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
  const updE = (field, val) => setEditDatos(prev => ({ ...prev, [field]: val }));

  const cuitInvalid = (c) => c && !validarCuit(c);

  const onSubmit = (e) => {
    e.preventDefault();
    if (cuitInvalid(form.cuit)) {
      return Swal.fire('❌ CUIT inválido', 'Verificá el dígito verificador.', 'warning');
    }
    manejarEnvioCliente({ ...form, credito_limite: parseFloat(form.credito_limite) || 0 }, () => {
      setForm(emptyForm);
      setModalAgregar(false);
    });
  };

  const guardarEdicion = (e) => {
    e.preventDefault();
    if (cuitInvalid(editDatos.cuit)) {
      return Swal.fire('❌ CUIT inválido', 'Verificá el dígito verificador.', 'warning');
    }
    editarCliente(editDatos.id, { ...editDatos, credito_limite: parseFloat(editDatos.credito_limite) || 0 });
    setModalEditar(false);
  };

  const toggleBloqueo = async (cliente) => {
    const nuevoEstado = !cliente.bloqueado;
    const conf = await Swal.fire({
      title: nuevoEstado ? `¿Bloquear a "${cliente.nombre}"?` : `¿Desbloquear a "${cliente.nombre}"?`,
      text: nuevoEstado ? 'No podrá realizar compras mientras esté bloqueado.' : 'Podrá volver a comprar.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Bloquear' : 'Desbloquear',
      confirmButtonColor: nuevoEstado ? '#dc2626' : '#16a34a',
      cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    try {
      await apiClient.put(`/api/clientes/${cliente.id}/bloquear`, { bloqueado: nuevoEstado });
      Swal.fire('✅', nuevoEstado ? 'Cliente bloqueado' : 'Cliente desbloqueado', 'success');
      if (cargarClientes) cargarClientes();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const input = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500';
  const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';

  const clis = Array.isArray(clientes) ? clientes : [];
  const filtrados = clis.filter(c =>
    (c.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.documento && c.documento.toLowerCase().includes(busqueda.toLowerCase())) ||
    (c.cuit && c.cuit.includes(busqueda))
  );

  const condFiscalLabel = (val) => COND_FISCAL.find(f => f.value === val)?.label || val || '-';

  const FormularioCliente = ({ datos, setDatos, onSubmitForm, isEdit }) => (
    <form onSubmit={onSubmitForm} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={label}>Nombre / Razón Social *</label>
        <input className={input} type="text" placeholder="Juan Pérez" value={datos.nombre || ''}
          onChange={e => setDatos('nombre', e.target.value)} required />
      </div>
      <div>
        <label className={label}>Tipo de Negocio</label>
        <select className={input} value={datos.tipo_negocio || ''} onChange={e => setDatos('tipo_negocio', e.target.value)}>
          <option value="">-- Seleccionar --</option>
          {TIPO_NEGOCIO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>DNI / Documento</label>
        <input className={input} type="text" placeholder="35123456" value={datos.documento || ''}
          onChange={e => setDatos('documento', e.target.value)} />
      </div>
      <div>
        <label className={label}>CUIT</label>
        <input
          className={`${input} ${cuitInvalid(datos.cuit) ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40' : ''}`}
          type="text" placeholder="20-12345678-3" value={datos.cuit || ''}
          onChange={e => setDatos('cuit', e.target.value)} />
        {cuitInvalid(datos.cuit) && (
          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400"><AlertTriangle size={11} /> CUIT inválido</p>
        )}
      </div>
      <div>
        <label className={label}>Condición fiscal</label>
        <select className={input} value={datos.condicion_fiscal || 'consumidor_final'} onChange={e => setDatos('condicion_fiscal', e.target.value)}>
          {COND_FISCAL.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>Email</label>
        <input className={input} type="email" placeholder="juan@email.com" value={datos.email || ''}
          onChange={e => setDatos('email', e.target.value)} />
      </div>
      <div>
        <label className={label}>Teléfono</label>
        <input className={input} type="text" placeholder="11 2345-6789" value={datos.telefono || ''}
          onChange={e => setDatos('telefono', e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <label className={label}>Domicilio Fiscal</label>
        <input className={input} type="text" placeholder="Av. Corrientes 1234, CABA" value={datos.domicilio || ''}
          onChange={e => setDatos('domicilio', e.target.value)} />
      </div>
      <div>
        <label className={label}>Código Fiscal (ARCA/AFIP)</label>
        <input className={input} type="text" placeholder="001-00123456" value={datos.codigo_fiscal || ''}
          onChange={e => setDatos('codigo_fiscal', e.target.value)} />
      </div>
      <div>
        <label className={label}>Dirección de Entrega</label>
        <input className={input} type="text" placeholder="Av. Falsa 123" value={datos.direccion || ''}
          onChange={e => setDatos('direccion', e.target.value)} />
      </div>
      {/* Cuenta corriente */}
      <div className="md:col-span-2 flex flex-col gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/40 p-4">
        <div className="flex items-center gap-3">
          <input type="checkbox" id={isEdit ? "edit_cta_cte" : "cta_cte"} checked={!!datos.tiene_cuenta_corriente}
            onChange={e => setDatos('tiene_cuenta_corriente', e.target.checked)}
            className="h-4 w-4 rounded border-indigo-300 accent-indigo-600" />
          <label htmlFor={isEdit ? "edit_cta_cte" : "cta_cte"} className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Habilitar cuenta corriente</label>
        </div>
        {datos.tiene_cuenta_corriente && (
          <div>
            <label className="mb-1 block text-xs font-bold text-indigo-800 dark:text-indigo-300">Límite de crédito ($)</label>
            <input className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
              type="number" min="0" step="100" placeholder="50000"
              value={datos.credito_limite || ''} onChange={e => setDatos('credito_limite', e.target.value)} />
          </div>
        )}
      </div>
      <div className="md:col-span-2 flex justify-end gap-3">
        <button type="button"
          onClick={() => isEdit ? setModalEditar(false) : setModalAgregar(false)}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
          Cancelar
        </button>
        <button type="submit"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-700">
          {isEdit ? 'Guardar Cambios' : 'Guardar Cliente'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {canManageCatalog && (
          <button
            onClick={() => { setForm(emptyForm); setModalAgregar(true); }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-700"
          >
            <Plus size={16} /> Ingresar Cliente
          </button>
        )}
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Directorio de Clientes</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">Gestión de datos de contacto, condición fiscal y cuenta corriente.</p>
          </div>
          <input type="text" placeholder="Buscar por nombre, DNI o CUIT..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">CUIT / DNI</th>
                <th className="px-4 py-3">Condición fiscal</th>
                <th className="px-4 py-3">Cta. Cte.</th>
                <th className="px-4 py-3">Deuda</th>
                <th className="px-4 py-3">Estado</th>
                {canManageCatalog && <th className="px-4 py-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={canManageCatalog ? 7 : 6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <span className="mb-2 block text-4xl opacity-50">📂</span>
                    {busqueda ? 'No se encontraron clientes.' : 'No hay clientes registrados.'}
                  </td>
                </tr>
              ) : filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{c.nombre}</p>
                    {c.tipo_negocio && <p className="text-xs text-slate-500 dark:text-slate-400">{c.tipo_negocio}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {c.cuit && <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">CUIT: {c.cuit}</div>}
                    {c.documento && <div className="text-xs text-slate-500 dark:text-slate-400">DNI: {c.documento}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      c.condicion_fiscal === 'responsable_inscripto' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' :
                      c.condicion_fiscal === 'monotributista' ? 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300' :
                      c.condicion_fiscal === 'exento' ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {condFiscalLabel(c.condicion_fiscal)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.tiene_cuenta_corriente ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={14} /> Sí {c.credito_limite > 0 ? `(${formatCurrency(c.credito_limite)})` : ''}
                      </span>
                    ) : <span className="text-xs font-semibold text-slate-400">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {parseFloat(c.saldo_deuda || 0) > 0 ? (
                      <span className="font-black text-rose-600 dark:text-rose-400">{formatCurrency(c.saldo_deuda)}</span>
                    ) : <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">$ 0,00</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.bloqueado ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/60 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                        <Ban size={12} /> Bloqueado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle size={12} /> Activo
                      </span>
                    )}
                  </td>
                  {canManageCatalog && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <button onClick={() => { setEditDatos(c); setModalEditar(true); }}
                          className="rounded-lg bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-all">
                          ✏️ Editar
                        </button>
                        <button onClick={() => toggleBloqueo(c)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${c.bloqueado
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white'
                            }`}>
                          {c.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear'}
                        </button>
                        <button onClick={() => eliminarCliente(c.id)}
                          className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-rose-600 hover:text-white transition-all">
                          🗑️
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Agregar Cliente */}
      {modalAgregar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"><Users size={20} /></div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ingresar Cliente</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Agregá un nuevo cliente al sistema.</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalAgregar(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
                <X size={18} />
              </button>
            </div>
            <FormularioCliente datos={form} setDatos={upd} onSubmitForm={onSubmit} isEdit={false} />
          </div>
        </div>
      )}

      {/* Modal Editar Cliente */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar Cliente</h3>
              <button type="button" onClick={() => setModalEditar(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
                <X size={18} />
              </button>
            </div>
            <FormularioCliente datos={editDatos} setDatos={updE} onSubmitForm={guardarEdicion} isEdit={true} />
          </div>
        </div>
      )}
    </div>
  );
}

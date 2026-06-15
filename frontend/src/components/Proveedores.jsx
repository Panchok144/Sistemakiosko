import { useState } from 'react'
import Swal from 'sweetalert2'

// Validador CUIT argentino (igual que en Clientes)
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
  { value: '', label: '-- Sin especificar --' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto (RI)' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
];

export default function Proveedores({
  proveedores = [], canManageCatalog,
  provNombre, setProvNombre,
  provTelefono, setProvTelefono,
  provEmail, setProvEmail,
  provDescripcion, setProvDescripcion,
  provCuit, setProvCuit,
  provDireccion, setProvDireccion,
  manejarEnvioProveedor, eliminarProveedor, editarProveedor
}) {
  const [busqueda, setBusqueda] = useState('')
  const [modalEditar, setModalEditar] = useState(false)
  const [editDatos, setEditDatos] = useState({})

  // Campos nuevos para el formulario de creación
  const [provCondicionFiscal, setProvCondicionFiscal] = useState('')
  const [provCodigoFiscal, setProvCodigoFiscal] = useState('')

  const cuitInvalid = (c) => c && !validarCuit(c);

  const provs = Array.isArray(proveedores) ? proveedores : [];
  const filtrados = provs.filter(p =>
    (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.cuit && p.cuit.includes(busqueda))
  );

  const onSubmit = (e) => {
    e.preventDefault();
    if (cuitInvalid(provCuit)) {
      return Swal.fire('❌ CUIT inválido', 'Verificá el dígito verificador.', 'warning');
    }
    manejarEnvioProveedor(e);
  };

  const guardarEdicion = (e) => {
    e.preventDefault();
    if (cuitInvalid(editDatos.cuit)) {
      return Swal.fire('❌ CUIT inválido', 'Verificá el dígito verificador.', 'warning');
    }
    editarProveedor(editDatos.id, editDatos)
    setModalEditar(false)
  }

  const inp = 'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10';
  const lbl = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500';

  return (
    <div className="space-y-5">
      {canManageCatalog ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="text-3xl">🤝</span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Registrar Proveedor</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Añade nuevos proveedores a tu red de contactos.</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* Nombre */}
            <div>
              <label className={lbl}>Nombre / Razón Social *</label>
              <input className={inp} type="text" placeholder="Distribuidora XYZ" value={provNombre} onChange={(e) => setProvNombre(e.target.value)} required />
            </div>

            {/* CUIT con validador */}
            <div>
              <label className={lbl}>CUIT</label>
              <input
                className={`${inp} ${cuitInvalid(provCuit) ? 'border-rose-400 bg-rose-50' : ''}`}
                type="text" placeholder="30-12345678-9" value={provCuit}
                onChange={(e) => setProvCuit(e.target.value)}
              />
              {cuitInvalid(provCuit) && (
                <p className="mt-1 text-xs text-rose-600">⚠️ CUIT inválido</p>
              )}
            </div>

            {/* Condición fiscal */}
            <div>
              <label className={lbl}>Condición Fiscal</label>
              <select className={inp} value={provCondicionFiscal} onChange={(e) => setProvCondicionFiscal(e.target.value)}>
                {COND_FISCAL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Código fiscal */}
            <div>
              <label className={lbl}>Código Fiscal (ARCA/AFIP)</label>
              <input className={inp} type="text" placeholder="Ej: 001-00123456" value={provCodigoFiscal} onChange={(e) => setProvCodigoFiscal(e.target.value)} />
            </div>

            {/* Teléfono */}
            <div>
              <label className={lbl}>Teléfono</label>
              <input className={inp} type="text" placeholder="11 2345 6789" value={provTelefono} onChange={(e) => setProvTelefono(e.target.value)} />
            </div>

            {/* Email */}
            <div>
              <label className={lbl}>Email</label>
              <input className={inp} type="email" placeholder="contacto@xyz.com" value={provEmail} onChange={(e) => setProvEmail(e.target.value)} />
            </div>

            {/* Dirección */}
            <div className="xl:col-span-2">
              <label className={lbl}>Domicilio Comercial</label>
              <input className={inp} type="text" placeholder="Av. Corrientes 1234, CABA" value={provDireccion} onChange={(e) => setProvDireccion(e.target.value)} />
            </div>

            {/* Observaciones */}
            <div className="md:col-span-2 xl:col-span-3">
              <label className={lbl}>Observaciones</label>
              <textarea
                className={inp}
                placeholder="Horarios de entrega, notas..."
                value={provDescripcion}
                onChange={(e) => setProvDescripcion(e.target.value)}
                rows="2"
              ></textarea>
            </div>

            <div className="flex justify-end md:col-span-2 xl:col-span-3">
              <button type="submit" className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700">
                Guardar Proveedor
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 text-slate-600 shadow-sm">
          <span className="text-4xl text-slate-300">🔒</span>
          <div>
            <strong className="mb-1 block text-lg text-slate-900">Acceso Restringido</strong>
            Tu cuenta no permite administrar proveedores.
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Directorio de Proveedores</h2>
          <input
            type="text"
            placeholder="Buscar por nombre o CUIT..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((prov) => (
            <div key={prov.id} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{prov.nombre}</h3>
                  {prov.cuit && <p className="text-xs text-slate-500 mt-0.5">CUIT: {prov.cuit}</p>}
                  {prov.condicion_fiscal && (
                    <span className="inline-block mt-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {COND_FISCAL.find(c => c.value === prov.condicion_fiscal)?.label || prov.condicion_fiscal}
                    </span>
                  )}
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm text-indigo-700">🏢</span>
              </div>
              <div className="mt-auto space-y-1.5 text-sm text-slate-600">
                {prov.telefono && <div className="flex items-center gap-2"><span>📞</span>{prov.telefono}</div>}
                {prov.email && <div className="flex items-center gap-2"><span>✉️</span>{prov.email}</div>}
                {(prov.domicilio || prov.direccion) && <div className="flex items-center gap-2"><span>📍</span>{prov.domicilio || prov.direccion}</div>}
                {prov.codigo_fiscal && <div className="flex items-center gap-2 text-xs text-slate-400"><span>🔖</span>CF: {prov.codigo_fiscal}</div>}
                {prov.descripcion && <p className="mt-2 text-xs italic text-slate-400">"{prov.descripcion}"</p>}
              </div>
              {canManageCatalog && (
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                  <button onClick={() => { setEditDatos({...prov}); setModalEditar(true); }} className="flex-1 rounded-xl bg-amber-50 py-1.5 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-600 hover:text-white">
                    ✏️ Editar
                  </button>
                  <button onClick={() => eliminarProveedor(prov.id)} className="flex-1 rounded-xl bg-rose-50 py-1.5 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-600 hover:text-white">
                    🗑️ Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtrados.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              <span className="mb-2 block text-4xl opacity-50">👥</span>
              {busqueda ? 'No se encontraron proveedores con esa búsqueda.' : 'No hay proveedores registrados.'}
            </div>
          )}
        </div>
      </section>

      {/* Modal Editar Proveedor — con todos los campos fiscales */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar Proveedor</h3>
              <button type="button" onClick={() => setModalEditar(false)} className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={guardarEdicion} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={lbl}>Nombre / Razón Social *</label>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" type="text" value={editDatos.nombre || ''} onChange={(e) => setEditDatos({ ...editDatos, nombre: e.target.value })} required />
              </div>
              <div>
                <label className={lbl}>CUIT</label>
                <input
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm ${cuitInvalid(editDatos.cuit) ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                  type="text" value={editDatos.cuit || ''} onChange={(e) => setEditDatos({ ...editDatos, cuit: e.target.value })}
                />
                {cuitInvalid(editDatos.cuit) && <p className="mt-1 text-xs text-rose-600">⚠️ CUIT inválido</p>}
              </div>
              <div>
                <label className={lbl}>Condición Fiscal</label>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={editDatos.condicion_fiscal || ''} onChange={(e) => setEditDatos({ ...editDatos, condicion_fiscal: e.target.value })}>
                  {COND_FISCAL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Código Fiscal (ARCA/AFIP)</label>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" type="text" value={editDatos.codigo_fiscal || ''} onChange={(e) => setEditDatos({ ...editDatos, codigo_fiscal: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Teléfono</label>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" type="text" value={editDatos.telefono || ''} onChange={(e) => setEditDatos({ ...editDatos, telefono: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" type="email" value={editDatos.email || ''} onChange={(e) => setEditDatos({ ...editDatos, email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>Domicilio Comercial</label>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" type="text" value={editDatos.domicilio || editDatos.direccion || ''} onChange={(e) => setEditDatos({ ...editDatos, domicilio: e.target.value, direccion: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className={lbl}>Observaciones</label>
                <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" rows="2" value={editDatos.descripcion || ''} onChange={(e) => setEditDatos({ ...editDatos, descripcion: e.target.value })}></textarea>
              </div>
              <div className="col-span-full mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setModalEditar(false)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Cancelar</button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

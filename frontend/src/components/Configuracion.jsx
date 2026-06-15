import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { Settings, Store, Users, DollarSign, AlertTriangle, Plus, Trash2, RefreshCw, Save, Shield } from 'lucide-react';
import { formatDate } from '../utils/formatters';

// Validador CUIT argentino (módulo 97) — mismo algoritmo que en el backend
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

const TABS = [
  { id: 'comercio', label: 'Datos del Comercio', icon: <Store size={16} /> },
  { id: 'parametros', label: 'Parámetros Fiscales', icon: <DollarSign size={16} /> },
  { id: 'empleados', label: 'Empleados', icon: <Users size={16} /> },
];

export default function Configuracion({ canManageCatalog }) {
  const [tab, setTab] = useState('comercio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Datos del comercio
  const [comercio, setComercio] = useState({
    razon_social: '', cuit: '', domicilio: '', condicion_fiscal: 'responsable_inscripto',
    punto_venta: 1, email: '', telefono: '', leyenda_ticket: '¡Gracias por su compra!',
  });

  // Parámetros
  const [montoMinimo, setMontoMinimo] = useState('500000');
  const [limiteVariacion, setLimiteVariacion] = useState('30');

  // Empleados
  const [usuarios, setUsuarios] = useState([]);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');
  const [nuevoRol, setNuevoRol] = useState('empleado');
  const [creandoUser, setCreandoUser] = useState(false);

  const cargarConfig = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/configuracion');
      const { comercio: c = {}, params = {} } = res.data || {};
      setComercio({
        razon_social: c?.razon_social || '',
        cuit: c?.cuit || '',
        domicilio: c?.domicilio || '',
        condicion_fiscal: c?.condicion_fiscal || 'responsable_inscripto',
        punto_venta: c?.punto_venta || 1,
        email: c?.email || '',
        telefono: c?.telefono || '',
        leyenda_ticket: c?.leyenda_ticket || '¡Gracias por su compra!',
      });
      setMontoMinimo(params?.monto_minimo_identificar || '500000');
      setLimiteVariacion(params?.limite_variacion_precio_pct || '30');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cargarUsuarios = async () => {
    try {
      const res = await apiClient.get('/api/usuarios');
      setUsuarios(Array.isArray(res.data) ? res.data : []);
    } catch (_) { }
  };

  useEffect(() => {
    cargarConfig();
    cargarUsuarios();
  }, []);

  const guardarComercio = async (e) => {
    e.preventDefault();
    if (comercio.cuit && !validarCuit(comercio.cuit)) {
      return Swal.fire('❌ CUIT inválido', 'Verificá el dígito verificador del CUIT.', 'warning');
    }
    setSaving(true);
    try {
      await apiClient.put('/api/configuracion', {
        ...comercio,
        params: {
          monto_minimo_identificar: montoMinimo,
          limite_variacion_precio_pct: limiteVariacion,
        },
      });
      Swal.fire('✅ Guardado', 'Configuración actualizada con éxito', 'success');
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const crearEmpleado = async (e) => {
    e.preventDefault();
    if (!nuevoNombre || !nuevaPass) {
      return Swal.fire('❌ Faltan datos', 'Usuario y contraseña son obligatorios.', 'warning');
    }
    setCreandoUser(true);
    try {
      await apiClient.post('/api/usuarios/registro', { nombre_usuario: nuevoNombre, password: nuevaPass, rol: nuevoRol });
      Swal.fire('✅ Creado', `Usuario "${nuevoNombre}" creado con éxito.`, 'success');
      setNuevoNombre(''); setNuevaPass(''); setNuevoRol('empleado');
      cargarUsuarios();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setCreandoUser(false);
    }
  };

  const eliminarEmpleado = async (id, nombre) => {
    const conf = await Swal.fire({
      title: `¿Eliminar a "${nombre}"?`,
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#dc2626',
      cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    try {
      await apiClient.delete(`/api/usuarios/${id}`);
      Swal.fire('Eliminado', '', 'success');
      cargarUsuarios();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const input = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500';
  const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400 font-bold">Cargando configuración...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
          <Settings size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Configuración del Sistema</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Datos fiscales, parámetros y gestión de empleados</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${tab === t.id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm border border-slate-200/60 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Datos del Comercio */}
      {(tab === 'comercio' || tab === 'parametros') && (
        <form onSubmit={guardarComercio}>
          {tab === 'comercio' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-5 text-base font-bold text-slate-900 dark:text-slate-100">Datos tributarios del emisor</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <label className={label}>Razón Social / Denominación *</label>
                  <input className={input} type="text" placeholder="Distribuidora Ejemplo S.A." value={comercio.razon_social}
                    onChange={e => setComercio({ ...comercio, razon_social: e.target.value })} />
                </div>
                <div>
                  <label className={label}>CUIT</label>
                  <input className={`${input} ${comercio.cuit && !validarCuit(comercio.cuit) ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40' : ''}`}
                    type="text" placeholder="20-12345678-3" value={comercio.cuit}
                    onChange={e => setComercio({ ...comercio, cuit: e.target.value })} />
                  {comercio.cuit && !validarCuit(comercio.cuit) && (
                    <p className="mt-1 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"><AlertTriangle size={11} /> CUIT inválido</p>
                  )}
                </div>
                <div className="xl:col-span-2">
                  <label className={label}>Domicilio fiscal</label>
                  <input className={input} type="text" placeholder="Av. Corrientes 1234, CABA" value={comercio.domicilio}
                    onChange={e => setComercio({ ...comercio, domicilio: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Condición frente al IVA</label>
                  <select className={input} value={comercio.condicion_fiscal}
                    onChange={e => setComercio({ ...comercio, condicion_fiscal: e.target.value })}>
                    <option value="responsable_inscripto">Responsable Inscripto</option>
                    <option value="monotributista">Monotributista</option>
                    <option value="exento">Exento</option>
                    <option value="consumidor_final">Consumidor Final</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Punto de Venta (AFIP)</label>
                  <input className={input} type="number" min="1" max="9999" value={comercio.punto_venta}
                    onChange={e => setComercio({ ...comercio, punto_venta: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className={label}>Email de contacto</label>
                  <input className={input} type="email" placeholder="contacto@empresa.com" value={comercio.email}
                    onChange={e => setComercio({ ...comercio, email: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Teléfono</label>
                  <input className={input} type="text" placeholder="11 2345-6789" value={comercio.telefono}
                    onChange={e => setComercio({ ...comercio, telefono: e.target.value })} />
                </div>
                <div className="xl:col-span-3">
                  <label className={label}>Leyenda al pie del ticket</label>
                  <input className={input} type="text" value={comercio.leyenda_ticket}
                    onChange={e => setComercio({ ...comercio, leyenda_ticket: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {tab === 'parametros' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-5 text-base font-bold text-slate-900 dark:text-slate-100">Parámetros fiscales y operativos</h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    Monto mínimo para identificar al cliente (ARCA)
                  </label>
                  <input className="mt-2 w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-bold text-amber-950 dark:text-amber-100 outline-none"
                    type="number" min="0" step="1" value={montoMinimo}
                    onChange={e => setMontoMinimo(e.target.value)} />
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    Si el total de la venta supera este monto y no hay cliente identificado, el sistema alertará al cajero.
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-4">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-200">
                    Límite de variación de precio que genera alerta (%)
                  </label>
                  <input className="mt-2 w-full rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-bold text-rose-950 dark:text-rose-100 outline-none"
                    type="number" min="1" max="200" step="1" value={limiteVariacion}
                    onChange={e => setLimiteVariacion(e.target.value)} />
                  <p className="mt-2 text-xs text-rose-800 dark:text-rose-300">
                    Si el nuevo precio difiere más de este porcentaje del precio anterior, el sistema pedirá confirmación.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving}
              className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-all ${saving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20'}`}>
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}

      {/* Tab: Empleados */}
      {tab === 'empleados' && (
        <div className="space-y-5">
          {/* Formulario nuevo empleado */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Plus size={16} className="text-indigo-600 dark:text-indigo-400" /> Crear nuevo usuario / empleado
            </h2>
            <form onSubmit={crearEmpleado} className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className={label}>Nombre de usuario *</label>
                <input className={input} type="text" placeholder="maria_ventas" value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)} required />
              </div>
              <div>
                <label className={label}>Contraseña *</label>
                <input className={input} type="password" placeholder="••••••••" value={nuevaPass}
                  onChange={e => setNuevaPass(e.target.value)} required />
              </div>
              <div>
                <label className={label}>Rol</label>
                <select className={input} value={nuevoRol} onChange={e => setNuevoRol(e.target.value)}>
                  <option value="empleado">Empleado</option>
                  <option value="administrador">Administrador</option>
                  <option value="dueno">Dueño</option>
                  <option value="superadmin">⭐ Superadmin (Acceso Total)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={creandoUser}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20">
                  {creandoUser ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>

          {/* Lista de usuarios */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Usuarios del sistema</h2>
              <button onClick={cargarUsuarios} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700">
                <RefreshCw size={13} /> Actualizar
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-3">Usuario</th>
                    <th className="px-5 py-3">Rol</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Creado</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {usuarios.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">No hay usuarios registrados.</td></tr>
                  ) : usuarios.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-750/50">
                      <td className="px-5 py-3 font-bold text-slate-900 dark:text-slate-100">{u.nombre_usuario}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${u.rol === 'superadmin' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                            u.rol === 'administrador' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' :
                              u.rol === 'dueno' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' :
                                'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          }`}>{u.rol === 'superadmin' ? <Shield size={12} /> : null}{u.rol}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${u.suscripcion_activa ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>{u.suscripcion_activa ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{formatDate(u.created_at)}</td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => eliminarEmpleado(u.id, u.nombre_usuario)}
                          className="inline-flex items-center gap-1 rounded-xl bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-all">
                          <Trash2 size={11} /> Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

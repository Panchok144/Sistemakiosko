import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { Settings, Store, Users, DollarSign, AlertTriangle, Plus, Trash2, RefreshCw, Save, Shield, Database, Trash, CheckCircle2, Loader2, Package, ShoppingCart, UserCheck, Globe, Star, Tag } from 'lucide-react';
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
  { id: 'comercio',    label: 'Datos del Comercio',  icon: <Store size={16} /> },
  { id: 'parametros', label: 'Parámetros Fiscales',  icon: <DollarSign size={16} /> },
  { id: 'permisos',   label: 'Permisos de Roles',    icon: <Shield size={16} /> },
  { id: 'catalogo',   label: 'Catálogo Público',    icon: <Globe size={16} /> },
  { id: 'fidelidad',  label: 'Programa Fidelidad',   icon: <Star size={16} /> },
  { id: 'promociones',label: 'Promociones',           icon: <Tag size={16} /> },
  { id: 'empleados',  label: 'Empleados',             icon: <Users size={16} /> },
  { id: 'demo',       label: 'Datos Demo',            icon: <Database size={16} /> },
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
  const [facturaElectronicaHabilitada, setFacturaElectronicaHabilitada] = useState(false);
  const [timeoutInactividad, setTimeoutInactividad] = useState('15');

  // Permisos por Rol (M11)
  const [flagsPorRol, setFlagsPorRol] = useState({
    empleado: {
      descuento: false, devolucion: false, ver_costos: false,
      cerrar_caja: false, cambiar_precios: false, crear_usuarios: false,
    },
    administrador: {
      descuento: true, devolucion: true, ver_costos: true,
      cerrar_caja: true, cambiar_precios: true, crear_usuarios: true,
    },
  });
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);

  // M15: Catálogo público
  const [slugCatalogo, setSlugCatalogo] = useState('');
  const [catalogoHabilitado, setCatalogoHabilitado] = useState(false);
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false);

  // M14: Fidelidad
  const [fidelidadHabilitada, setFidelidadHabilitada] = useState(false);
  const [pesosPorPunto, setPesosPorPunto] = useState('100');
  const [valorPunto, setValorPunto] = useState('1');
  const [guardandoFidelidad, setGuardandoFidelidad] = useState(false);

  // M13: Promociones
  const [promociones, setPromociones] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(false);
  const [nuevaPromo, setNuevaPromo] = useState({ nombre: '', tipo: '2x1', parametros: '{}', vigencia_desde: '', vigencia_hasta: '', activa: true });

  // Empleados
  const [usuarios, setUsuarios] = useState([]);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');
  const [nuevoRol, setNuevoRol] = useState('empleado');
  const [creandoUser, setCreandoUser] = useState(false);

  // Demo
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoResult, setDemoResult] = useState(null);

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
      setFacturaElectronicaHabilitada(params?.factura_electronica_habilitada === 'true');
      setTimeoutInactividad(params?.timeout_inactividad_minutos || '15');

      // Cargar permisos por rol
      const resPermisos = await apiClient.get('/api/configuracion/permisos').catch(() => null);
      if (resPermisos?.data?.flagsPorRol) {
        setFlagsPorRol(prev => ({
          ...prev,
          ...resPermisos.data.flagsPorRol,
        }));
      }

      // M15: Cargar slug del comercio
      const resComercio = await apiClient.get('/api/configuracion/comercio').catch(() => null);
      if (resComercio?.data) {
        setSlugCatalogo(resComercio.data.slug_catalogo || '');
        setCatalogoHabilitado(!!resComercio.data.catalogo_publico_habilitado);
      }

      // M14: Cargar config fidelidad
      const resFid = await apiClient.get('/api/fidelidad/config').catch(() => null);
      if (resFid?.data) {
        setFidelidadHabilitada(resFid.data.habilitada);
        setPesosPorPunto(String(resFid.data.pesos_por_punto));
        setValorPunto(String(resFid.data.valor_punto));
      }
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

  const cargarPromociones = async () => {
    setLoadingPromos(true);
    try {
      const res = await apiClient.get('/api/promociones');
      setPromociones(Array.isArray(res.data) ? res.data : []);
    } catch (_) { } finally { setLoadingPromos(false); }
  };

  useEffect(() => {
    cargarConfig();
    cargarUsuarios();
    cargarPromociones();
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
          factura_electronica_habilitada: facturaElectronicaHabilitada ? 'true' : 'false',
          timeout_inactividad_minutos: timeoutInactividad,
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

  // ── Demo ────────────────────────────────────────────────────────────────────
  const cargarDemo = async () => {
    const conf = await Swal.fire({
      title: '¿Cargar datos de demostración?',
      html: 'Se cargarán <b>~50 productos</b>, <b>7 clientes</b>, <b>30 días de ventas</b>, gastos y cuentas corrientes.<br/><br/>⚠️ Los datos existentes de negocio serán reemplazados.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cargar demo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7c3aed',
    });
    if (!conf.isConfirmed) return;
    setLoadingDemo(true);
    setDemoResult(null);
    try {
      const res = await apiClient.post('/api/demo/seed');
      setDemoResult({ ok: true, ...res.data });
      Swal.fire('✅ Datos demo cargados', res.data.mensaje, 'success');
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setDemoResult({ ok: false, error: msg });
      Swal.fire('❌ Error', msg, 'error');
    } finally {
      setLoadingDemo(false);
    }
  };

  const limpiarDemo = async () => {
    const conf = await Swal.fire({
      title: '¿Limpiar todos los datos de negocio?',
      html: 'Se eliminarán <b>todos los productos, ventas, clientes, caja y gastos</b>.<br/><br/>Los usuarios y la configuración del comercio se conservarán.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar todo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!conf.isConfirmed) return;
    setLoadingDemo(true);
    setDemoResult(null);
    try {
      const res = await apiClient.post('/api/demo/limpiar');
      setDemoResult({ ok: true, cleaned: true, mensaje: res.data.mensaje });
      Swal.fire('✅ Datos eliminados', res.data.mensaje, 'success');
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setDemoResult({ ok: false, error: msg });
      Swal.fire('❌ Error', msg, 'error');
    } finally {
      setLoadingDemo(false);
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

                {/* C6: Flag de Facturación Electrónica ARCA/AFIP */}
                <div className="md:col-span-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="text-indigo-600 dark:text-indigo-400" size={18} />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Facturación Electrónica Legal (ARCA / AFIP)
                        </h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          facturaElectronicaHabilitada
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {facturaElectronicaHabilitada ? 'Habilitada' : 'Deshabilitada'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                        Si está <strong>desactivada</strong>, el Punto de Venta operará en modo local/ticket interno rápido.
                        Si está <strong>activada</strong>, las ventas con Factura A y B solicitarán CAE en segundo plano sin demorar la atención al cliente.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={facturaElectronicaHabilitada}
                        onChange={(e) => setFacturaElectronicaHabilitada(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>

                {/* M12: Timeout de Inactividad POS */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    ⏱️ Bloqueo Automático POS por Inactividad (Minutos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={timeoutInactividad}
                    onChange={(e) => setTimeoutInactividad(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none"
                    placeholder="15"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Tras N minutos sin interacción en el Punto de Venta, se bloqueará la pantalla exigiendo el PIN del usuario activo para reanudar sin perder el carrito.
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

      {/* Tab: Permisos de Roles (M11) */}
      {tab === 'permisos' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Shield size={18} className="text-indigo-600 dark:text-indigo-400" />
                Matriz de Permisos Granulares por Rol
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configurá qué acciones tiene permitidas cada rol de usuario dentro del sistema.
              </p>
            </div>
            <button
              type="button"
              disabled={guardandoPermisos}
              onClick={async () => {
                setGuardandoPermisos(true);
                try {
                  await apiClient.put('/api/configuracion/permisos', { flagsPorRol });
                  Swal.fire('✅ Permisos guardados', 'Los permisos por rol se actualizaron correctamente.', 'success');
                } catch (err) {
                  Swal.fire('Error', err.response?.data?.error || err.message, 'error');
                } finally {
                  setGuardandoPermisos(false);
                }
              }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 text-xs shadow-md shadow-indigo-600/20 transition"
            >
              <Save size={15} /> {guardandoPermisos ? 'Guardando...' : 'Guardar Permisos'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 font-bold uppercase tracking-wider text-[10px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4">Acción / Funcionalidad</th>
                  <th className="py-3 px-4 text-center">Empleado</th>
                  <th className="py-3 px-4 text-center">Administrador</th>
                  <th className="py-3 px-4 text-center">Dueño / Superadmin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {[
                  { key: 'descuento',       nombre: 'Aplicar Descuentos en Ventas',      desc: 'Habilita modificar el precio o ingresar descuentos en el POS' },
                  { key: 'devolucion',      nombre: 'Registrar Devoluciones',           desc: 'Permite procesar reembolsos y devoluciones de comprobantes' },
                  { key: 'ver_costos',      nombre: 'Ver Costos y Márgenes',            desc: 'Muestra costo de compra y rentabilidad en catálogo y reportes' },
                  { key: 'cerrar_caja',     nombre: 'Cerrar Turnos de Caja',            desc: 'Permite realizar el arqueo final y cierre de caja diaria' },
                  { key: 'cambiar_precios', nombre: 'Cambiar Precios de Venta',         desc: 'Habilita editar precios de artículos en el Inventario' },
                  { key: 'crear_usuarios',  nombre: 'Crear y Gestionar Usuarios',       desc: 'Permite dar de alta nuevos usuarios y cambiar roles' },
                ].map((p) => (
                  <tr key={p.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{p.nombre}</div>
                      <div className="text-[11px] text-slate-500">{p.desc}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(flagsPorRol.empleado?.[p.key])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFlagsPorRol((prev) => ({
                            ...prev,
                            empleado: { ...prev.empleado, [p.key]: checked },
                          }));
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(flagsPorRol.administrador?.[p.key])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFlagsPorRol((prev) => ({
                            ...prev,
                            administrador: { ...prev.administrador, [p.key]: checked },
                          }));
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200">
                        Total
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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

      {/* ── Tab: Datos Demo ──────────────────────────────────────────── */}
      {tab === 'demo' && (
        <div className="space-y-5">
          {/* Banner informativo */}
          <div className="rounded-2xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/30 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <Database size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-violet-950 dark:text-violet-100">Datos de Demostración</h3>
                <p className="text-sm font-medium text-violet-800 dark:text-violet-200 mt-1">
                  Cargá un catálogo realista de minimarket para mostrar el sistema a clientes potenciales
                  sin que el dashboard aparezca en cero.
                </p>
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { icon: <Package size={13} />, text: '~50 SKUs reales de kiosco argentino' },
                    { icon: <ShoppingCart size={13} />, text: '30 días de ventas con patrones reales' },
                    { icon: <UserCheck size={13} />, text: '7 clientes con historial y cuentas corrientes' },
                  ].map(item => (
                    <li key={item.text} className="flex items-center gap-2 text-xs font-semibold text-violet-800 dark:text-violet-300">
                      <span className="text-violet-600 dark:text-violet-400">{item.icon}</span>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Resultado de la última operación */}
          {demoResult && (
            <div className={`rounded-2xl border p-4 ${
              demoResult.ok
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30'
                : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30'
            }`}>
              <div className="flex items-center gap-3">
                {demoResult.ok
                  ? <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  : <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
                }
                <div>
                  <p className={`text-sm font-bold ${
                    demoResult.ok ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'
                  }`}>
                    {demoResult.ok ? (demoResult.cleaned ? 'Datos eliminados' : 'Datos cargados exitosamente') : 'Error'}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${
                    demoResult.ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'
                  }`}>
                    {demoResult.mensaje || demoResult.error}
                  </p>
                  {demoResult.stats && (
                    <div className="flex gap-3 mt-2">
                      {[
                        { label: 'Productos', v: demoResult.stats.productos },
                        { label: 'Clientes', v: demoResult.stats.clientes },
                        { label: 'Días de ventas', v: demoResult.stats.dias_ventas },
                        { label: 'Proveedores', v: demoResult.stats.proveedores },
                      ].map(s => (
                        <span key={s.label} className="flex flex-col items-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5">
                          <span className="text-base font-black text-emerald-700 dark:text-emerald-300">{s.v}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{s.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cargar demo */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cargar Datos Demo</h3>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Catálogo + 30 días de historial</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
                Carga productos reales de kiosco, clientes, ventas de los últimos 30 días con
                variación semanal y de quincena, gastos operativos y cuentas corrientes con saldo.
              </p>
              <button
                onClick={cargarDemo}
                disabled={loadingDemo}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-60 min-h-[44px]"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.30)' }}
              >
                {loadingDemo ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                {loadingDemo ? 'Cargando datos...' : 'Cargar Datos Demo'}
              </button>
            </div>

            {/* Limpiar demo */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <Trash size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Limpiar Datos</h3>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Borra todos los datos de negocio</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
                Elimina productos, ventas, clientes, caja y gastos. Los usuarios y la
                configuración del comercio <strong>no se eliminan</strong>.
              </p>
              <button
                onClick={limpiarDemo}
                disabled={loadingDemo}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-60 bg-rose-600 hover:bg-rose-700 min-h-[44px]"
              >
                {loadingDemo ? <Loader2 size={16} className="animate-spin" /> : <Trash size={16} />}
                {loadingDemo ? 'Limpiando...' : 'Limpiar Todos los Datos'}
              </button>
            </div>
          </div>

          {/* Advertencia */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              <strong>Solo para uso en demostraciones.</strong> No usar en producción con datos reales.
              Los usuarios y la configuración del comercio nunca son afectados por estas operaciones.
              Esta sección solo es visible para administradores y dueños.
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────── CATÁLOGO PÚBLICO (M15) ──────────────────────── */}
      {tab === 'catalogo' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2"><Globe size={18} className="text-indigo-500" /> Catálogo Público</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Permitile a tus clientes ver el catálogo de productos desde un enlace público sin precios de costo ni stock.</p>
            <div className="space-y-4">
              <div>
                <label className={label}>Slug del Catálogo (identificador en la URL)</label>
                <div className="flex gap-2">
                  <span className="flex items-center rounded-l-xl border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 px-3 text-xs text-slate-500 whitespace-nowrap">/c/</span>
                  <input className={`${input} rounded-l-none`} type="text" placeholder="mi-kiosko-pepe" value={slugCatalogo}
                    onChange={e => setSlugCatalogo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
                {slugCatalogo && <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">Enlace: <strong>/c/{slugCatalogo}</strong></p>}
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="cat_pub_habilitado" checked={catalogoHabilitado}
                  onChange={e => setCatalogoHabilitado(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                <label htmlFor="cat_pub_habilitado" className="text-sm font-bold text-slate-900 dark:text-slate-100">Habilitar catálogo público</label>
              </div>
              <button
                disabled={guardandoCatalogo}
                onClick={async () => {
                  setGuardandoCatalogo(true);
                  try {
                    await apiClient.put('/api/configuracion', {
                      params: {
                        catalogo_slug: slugCatalogo,
                        catalogo_publico_habilitado: catalogoHabilitado ? 'true' : 'false',
                      },
                    });
                    Swal.fire('✅ Guardado', 'Configuración del catálogo actualizada', 'success');
                  } catch (err) {
                    Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
                  } finally { setGuardandoCatalogo(false); }
                }}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {guardandoCatalogo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Catálogo
              </button>
              {slugCatalogo && catalogoHabilitado && (
                <a href={`/c/${slugCatalogo}`} target="_blank" rel="noopener noreferrer"
                  className="block text-xs text-indigo-500 hover:text-indigo-700 underline">
                  🔗 Ver mi catálogo público →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── FIDELIDAD (M14) ─────────────────────────────── */}
      {tab === 'fidelidad' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2"><Star size={18} className="text-amber-500" /> Programa de Fidelidad</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Acumulá puntos automáticamente en cada venta y permitile a tus clientes canjearlos por descuentos en el POS.</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="fid_habilitado" checked={fidelidadHabilitada}
                  onChange={e => setFidelidadHabilitada(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                <label htmlFor="fid_habilitado" className="text-sm font-bold text-slate-900 dark:text-slate-100">Habilitar programa de fidelidad</label>
              </div>
              {fidelidadHabilitada && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Pesos por punto ($)</label>
                    <input className={input} type="number" min="1" value={pesosPorPunto}
                      onChange={e => setPesosPorPunto(e.target.value)} />
                    <p className="mt-1 text-xs text-slate-400">Ej: 100 = cada $100 de compra = 1 punto</p>
                  </div>
                  <div>
                    <label className={label}>Valor de cada punto ($)</label>
                    <input className={input} type="number" min="0.01" step="0.01" value={valorPunto}
                      onChange={e => setValorPunto(e.target.value)} />
                    <p className="mt-1 text-xs text-slate-400">Ej: 1 = cada punto vale $1 de descuento al canjear</p>
                  </div>
                </div>
              )}
              <button
                disabled={guardandoFidelidad}
                onClick={async () => {
                  setGuardandoFidelidad(true);
                  try {
                    await apiClient.put('/api/fidelidad/config', {
                      habilitada: fidelidadHabilitada,
                      pesos_por_punto: pesosPorPunto,
                      valor_punto: valorPunto,
                    });
                    Swal.fire('✅ Guardado', 'Configuración de fidelidad actualizada', 'success');
                  } catch (err) {
                    Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
                  } finally { setGuardandoFidelidad(false); }
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-amber-600 transition disabled:opacity-60"
              >
                {guardandoFidelidad ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Fidelidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── PROMOCIONES (M13) ───────────────────────────── */}
      {tab === 'promociones' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2"><Tag size={18} className="text-rose-500" /> Gestionar Promociones</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Creá y administrá promociones que se aplican automáticamente en el POS al agregar productos al carrito.</p>

            {/* Nueva promo */}
            <details className="mb-5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 p-4">
              <summary className="cursor-pointer text-sm font-bold text-indigo-700 dark:text-indigo-300">➕ Agregar nueva promoción</summary>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={label}>Nombre de la promoción</label>
                  <input className={input} value={nuevaPromo.nombre}
                    onChange={e => setNuevaPromo(p => ({...p, nombre: e.target.value}))} placeholder="Ej: 2x1 Alfajores" />
                </div>
                <div>
                  <label className={label}>Tipo</label>
                  <select className={input} value={nuevaPromo.tipo}
                    onChange={e => setNuevaPromo(p => ({...p, tipo: e.target.value}))}>
                    <option value="2x1">2x1 (llevás 2, pagás 1)</option>
                    <option value="nporx">N por X (ej: 3 por el precio de 2)</option>
                    <option value="pctproducto">% en producto específico</option>
                    <option value="pctrubro">% en rubro completo</option>
                    <option value="pcthorario">% en franja horaria</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Parámetros (JSON)</label>
                  <input className={`${input} font-mono text-xs`} value={nuevaPromo.parametros}
                    onChange={e => setNuevaPromo(p => ({...p, parametros: e.target.value}))}
                    placeholder='{"producto_id": 5}' />
                  <p className="mt-1 text-[10px] text-slate-400">
                    2x1/nporx: producto_id · pctproducto: producto_id + porcentaje · pctrubro: rubro + porcentaje · pcthorario: porcentaje
                  </p>
                </div>
                <div>
                  <label className={label}>Vigencia desde</label>
                  <input className={input} type="date" value={nuevaPromo.vigencia_desde}
                    onChange={e => setNuevaPromo(p => ({...p, vigencia_desde: e.target.value}))} />
                </div>
                <div>
                  <label className={label}>Vigencia hasta</label>
                  <input className={input} type="date" value={nuevaPromo.vigencia_hasta}
                    onChange={e => setNuevaPromo(p => ({...p, vigencia_hasta: e.target.value}))} />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={async () => {
                      let params;
                      try { params = JSON.parse(nuevaPromo.parametros || '{}'); }
                      catch { return Swal.fire('❌ JSON inválido', 'Verificá el formato de los parámetros.', 'warning'); }
                      try {
                        await apiClient.post('/api/promociones', { ...nuevaPromo, parametros: params });
                        Swal.fire('✅', 'Promoción creada', 'success');
                        setNuevaPromo({ nombre: '', tipo: '2x1', parametros: '{}', vigencia_desde: '', vigencia_hasta: '', activa: true });
                        cargarPromociones();
                      } catch (err) { Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error'); }
                    }}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition"
                  >
                    <Plus size={14} /> Crear Promoción
                  </button>
                </div>
              </div>
            </details>

            {/* Listado */}
            {loadingPromos ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
            ) : promociones.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <Tag size={32} className="mx-auto mb-2 text-slate-300" />
                No hay promociones creadas aún
              </div>
            ) : (
              <div className="space-y-3">
                {promociones.map(promo => (
                  <div key={promo.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{promo.nombre}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${promo.activa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-200 text-slate-500'}`}>
                          {promo.activa ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{promo.tipo}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {promo.vigencia_desde && `Desde: ${promo.vigencia_desde}`}
                        {promo.vigencia_hasta && ` · Hasta: ${promo.vigencia_hasta}`}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            await apiClient.put(`/api/promociones/${promo.id}`, { activa: !promo.activa });
                            cargarPromociones();
                          } catch (err) { Swal.fire('❌ Error', err.message, 'error'); }
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold transition bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/60 dark:hover:text-indigo-300"
                      >
                        {promo.activa ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={async () => {
                          const conf = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'Eliminar' });
                          if (!conf.isConfirmed) return;
                          try {
                            await apiClient.delete(`/api/promociones/${promo.id}`);
                            cargarPromociones();
                          } catch (err) { Swal.fire('❌ Error', err.message, 'error'); }
                        }}
                        className="rounded-lg p-1.5 text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 hover:bg-rose-600 hover:text-white transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}


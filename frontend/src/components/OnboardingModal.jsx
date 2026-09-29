import React, { useState } from 'react';
import {
  Store,
  Receipt,
  Package,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Upload,
  Plus,
  Loader2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import Swal from 'sweetalert2';
import apiClient from '../apiClient';

export default function OnboardingModal({ isOpen, onClose, onComplete }) {
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);

  // Paso 1: Datos del Comercio
  const [comercio, setComercio] = useState({
    nombre: '',
    razon_social: '',
    cuit: '',
    domicilio: '',
    telefono: '',
  });

  // Paso 2: Configuración Fiscal y Tickets
  const [fiscal, setFiscal] = useState({
    condicion_fiscal: 'monotributo',
    iva_default: '21',
    ancho_ticket: '80mm',
    leyenda_ticket: '¡Gracias por su compra! Vuelva pronto.',
  });

  // Paso 3: Producto rápido opcional
  const [productoRapido, setProductoRapido] = useState({
    codigo_barras: '7791234567890',
    nombre: 'Alfajor Triple Chocolate',
    precio_venta: '1200',
    costo: '700',
    stock: '24',
    rubro: 'Golosinas',
  });
  const [mostrarFormProducto, setMostrarFormProducto] = useState(false);

  if (!isOpen) return null;

  const handleCargarDemo = async () => {
    const confirm = await Swal.fire({
      title: '¿Cargar catálogo y datos demo?',
      text: 'Se inicializarán rubros, productos populares de kiosco (golosinas, bebidas, snacks) y configuración recomendada.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cargar catálogo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7c3aed',
    });

    if (!confirm.isConfirmed) return;

    setLoading(true);
    try {
      await apiClient.post('/api/demo/seed');
      Swal.fire({
        icon: 'success',
        title: '¡Catálogo inicial cargado!',
        text: 'Tu sistema ya cuenta con productos, rubros y datos para comenzar a operar de inmediato.',
        timer: 2000,
        showConfirmButton: false,
      });
      localStorage.setItem('kiosko_onboarding_dismissed', 'true');
      onComplete?.();
      onClose();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo cargar el catálogo demo', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCrearProductoRapido = async (e) => {
    e.preventDefault();
    if (!productoRapido.nombre || !productoRapido.precio_venta || !productoRapido.costo) {
      Swal.fire('Campos requeridos', 'Completá nombre, precio y costo', 'warning');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/productos', {
        ...productoRapido,
        precio_venta: parseFloat(productoRapido.precio_venta),
        costo: parseFloat(productoRapido.costo),
        stock: parseInt(productoRapido.stock) || 0,
        iva_porcentaje: parseFloat(fiscal.iva_default),
      });

      Swal.fire({
        icon: 'success',
        title: '¡Producto creado!',
        text: 'Se agregó tu primer producto al inventario.',
        timer: 1800,
        showConfirmButton: false,
      });
      finalizarOnboarding();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo crear el producto', 'error');
    } finally {
      setLoading(false);
    }
  };

  const guardarConfiguracion = async () => {
    setLoading(true);
    try {
      await apiClient.put('/api/configuracion', {
        nombre: comercio.nombre || 'Mi Kiosko',
        razon_social: comercio.razon_social || comercio.nombre,
        cuit: comercio.cuit || '20-00000000-0',
        domicilio: comercio.domicilio || '',
        telefono: comercio.telefono || '',
        condicion_fiscal: fiscal.condicion_fiscal,
        leyenda_ticket: fiscal.leyenda_ticket,
        params: {
          ancho_ticket: fiscal.ancho_ticket,
          iva_default: fiscal.iva_default,
          onboarding_completado: 'true',
        },
      });
      return true;
    } catch (err) {
      console.error('Error al guardar configuración:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const finalizarOnboarding = async () => {
    await guardarConfiguracion();
    localStorage.setItem('kiosko_onboarding_dismissed', 'true');
    onComplete?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl transition-all"
        style={{
          background: 'linear-gradient(160deg, #130c25 0%, #0d081a 100%)',
          border: '1px solid rgba(124,58,237,0.30)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.8), 0 0 40px rgba(124,58,237,0.15)',
        }}
      >
        {/* Botón cerrar / omitir */}
        <button
          onClick={() => {
            localStorage.setItem('kiosko_onboarding_dismissed', 'true');
            onClose();
          }}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all"
          title="Omitir asistente"
        >
          <X size={18} />
        </button>

        {/* Encabezado con Pasos */}
        <div className="p-6 sm:p-8 border-b border-violet-900/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-violet-600/20 border border-violet-500/40 text-violet-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">¡Bienvenido a KioskoPro!</h2>
              <p className="text-xs sm:text-sm text-violet-300/70">Asistente inicial de configuración en 3 simples pasos</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { num: 1, label: 'Comercio', icon: Store },
              { num: 2, label: 'Tickets & AFIP', icon: Receipt },
              { num: 3, label: 'Catálogo', icon: Package },
            ].map((s) => {
              const Icon = s.icon;
              const activo = paso === s.num;
              const completado = paso > s.num;
              return (
                <div
                  key={s.num}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    activo
                      ? 'bg-violet-600/25 border-violet-500 text-white shadow-sm'
                      : completado
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-black ${
                      activo
                        ? 'bg-violet-600 text-white'
                        : completado
                        ? 'bg-emerald-500 text-slate-900'
                        : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {completado ? <CheckCircle2 size={13} /> : s.num}
                  </div>
                  <span className="truncate">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contenido según paso */}
        <div className="p-6 sm:p-8 max-h-[60vh] overflow-y-auto">
          {/* PASO 1: DATOS DEL COMERCIO */}
          {paso === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-violet-200/80 mb-2">
                Ingresá los datos de tu negocio. Aparecerán en los tickets impresos y comprobantes.
              </p>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                  Nombre Comercial *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Maxikiosco San Martín"
                  value={comercio.nombre}
                  onChange={(e) => setComercio({ ...comercio, nombre: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white placeholder-slate-500 outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    CUIT / Identificación Fiscal
                  </label>
                  <input
                    type="text"
                    placeholder="20-12345678-9"
                    value={comercio.cuit}
                    onChange={(e) => setComercio({ ...comercio, cuit: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white placeholder-slate-500 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre legal del titular"
                    value={comercio.razon_social}
                    onChange={(e) => setComercio({ ...comercio, razon_social: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white placeholder-slate-500 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    Domicilio
                  </label>
                  <input
                    type="text"
                    placeholder="Av. Rivadavia 1234, CABA"
                    value={comercio.domicilio}
                    onChange={(e) => setComercio({ ...comercio, domicilio: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white placeholder-slate-500 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    Teléfono de Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="011 4567-8901"
                    value={comercio.telefono}
                    onChange={(e) => setComercio({ ...comercio, telefono: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white placeholder-slate-500 outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: FISCAL Y TICKETS */}
          {paso === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-violet-200/80 mb-2">
                Parámetros fiscales y preferencias de impresión para el mostrador.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    Condición Fiscal
                  </label>
                  <select
                    value={fiscal.condicion_fiscal}
                    onChange={(e) => setFiscal({ ...fiscal, condicion_fiscal: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-slate-900 border border-violet-500/25 text-white outline-none focus:border-violet-500"
                  >
                    <option value="monotributo">Monotributo</option>
                    <option value="responsable_inscripto">Responsable Inscripto</option>
                    <option value="exento">Exento</option>
                    <option value="consumidor_final">Consumidor Final</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                    Alícuota IVA Predeterminada
                  </label>
                  <select
                    value={fiscal.iva_default}
                    onChange={(e) => setFiscal({ ...fiscal, iva_default: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-slate-900 border border-violet-500/25 text-white outline-none focus:border-violet-500"
                  >
                    <option value="21">21% (Tasa General)</option>
                    <option value="10.5">10.5% (Tasa Reducida)</option>
                    <option value="0">0% (Exento / Sin IVA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                  Ancho de Impresora Térmica
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['80mm', '58mm'].map((ancho) => (
                    <button
                      key={ancho}
                      type="button"
                      onClick={() => setFiscal({ ...fiscal, ancho_ticket: ancho })}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                        fiscal.ancho_ticket === ancho
                          ? 'bg-violet-600/30 border-violet-500 text-white'
                          : 'bg-white/5 border-white/10 text-slate-400'
                      }`}
                    >
                      {ancho} ({ancho === '80mm' ? 'Estándar EPSON/Hasar' : 'Compacta'})
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1.5">
                  Leyenda de Pie de Ticket
                </label>
                <input
                  type="text"
                  value={fiscal.leyenda_ticket}
                  onChange={(e) => setFiscal({ ...fiscal, leyenda_ticket: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/5 border border-violet-500/25 text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>
          )}

          {/* PASO 3: CATÁLOGO INICIAL */}
          {paso === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-violet-200/80 mb-2">
                Tu catálogo actualmente está vacío. Seleccioná cómo querés comenzar:
              </p>

              {/* Opción A: Cargar catálogo demo */}
              <div
                onClick={handleCargarDemo}
                className="group p-4 rounded-2xl border border-violet-500/30 bg-violet-600/10 hover:bg-violet-600/20 cursor-pointer transition-all flex items-center gap-4"
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-violet-600 text-white shadow-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <Sparkles size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">Cargar Catálogo Inicial de Kiosko</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-300 border border-violet-400/40">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-violet-200/70 mt-0.5">
                    Genera automáticamente más de 30 productos con rubros, marcas y precios reales para empezar a vender ya mismo.
                  </p>
                </div>
                <ArrowRight size={18} className="text-violet-400 group-hover:translate-x-1 transition-transform" />
              </div>

              {/* Opción B: Crear un producto rápido */}
              <div
                onClick={() => setMostrarFormProducto(!mostrarFormProducto)}
                className="group p-4 rounded-2xl border border-emerald-500/30 bg-emerald-600/10 hover:bg-emerald-600/20 cursor-pointer transition-all flex items-center gap-4"
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-600 text-white shadow-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <Plus size={22} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">Crear mi primer producto manualmente</h4>
                  <p className="text-xs text-emerald-200/70 mt-0.5">
                    Ingresá tu primer artículo para familiarizarte con la carga rápida de stock.
                  </p>
                </div>
                <ArrowRight size={18} className="text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </div>

              {/* Formulario rápido desplegable */}
              {mostrarFormProducto && (
                <form onSubmit={handleCrearProductoRapido} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 mt-2 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-300">Código de Barras</label>
                      <input
                        type="text"
                        value={productoRapido.codigo_barras}
                        onChange={(e) => setProductoRapido({ ...productoRapido, codigo_barras: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/15 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-300">Nombre del Producto</label>
                      <input
                        type="text"
                        value={productoRapido.nombre}
                        onChange={(e) => setProductoRapido({ ...productoRapido, nombre: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/15 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-300">Precio Venta ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productoRapido.precio_venta}
                        onChange={(e) => setProductoRapido({ ...productoRapido, precio_venta: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/15 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-300">Costo ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productoRapido.costo}
                        onChange={(e) => setProductoRapido({ ...productoRapido, costo: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/15 text-white"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white flex items-center justify-center gap-1.5 transition-all"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Guardar y comenzar a usar el POS
                  </button>
                </form>
              )}

              {/* Opción C: Importar desde Excel */}
              <div
                onClick={() => {
                  finalizarOnboarding();
                  window.location.hash = '#/inventario';
                }}
                className="group p-4 rounded-2xl border border-sky-500/30 bg-sky-600/10 hover:bg-sky-600/20 cursor-pointer transition-all flex items-center gap-4"
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-sky-600 text-white shadow-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <FileSpreadsheet size={22} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">Importar Catálogo desde Excel</h4>
                  <p className="text-xs text-sky-200/70 mt-0.5">
                    ¿Ya tenés un listado en Excel o planilla de cálculo? Podés importarlo directamente en Inventario.
                  </p>
                </div>
                <ArrowRight size={18} className="text-sky-400 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          )}
        </div>

        {/* Footer con Navegación */}
        <div className="p-6 sm:p-8 border-t border-violet-900/30 flex items-center justify-between bg-black/20">
          <div>
            {paso > 1 && (
              <button
                type="button"
                onClick={() => setPaso(paso - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
              >
                <ArrowLeft size={14} />
                Atrás
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('kiosko_onboarding_dismissed', 'true');
                onClose();
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 px-3 py-2 transition-all"
            >
              Configurar más tarde
            </button>

            {paso < 3 ? (
              <button
                type="button"
                onClick={async () => {
                  if (paso === 1) await guardarConfiguracion();
                  setPaso(paso + 1);
                }}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition-all"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Siguiente paso
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={finalizarOnboarding}
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition-all"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Finalizar
                <CheckCircle2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

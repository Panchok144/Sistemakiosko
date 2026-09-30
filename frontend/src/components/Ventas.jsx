import React, { useState, useEffect, useRef, useMemo } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import { Lock, History, ChevronDown, ChevronRight, AlertTriangle, LayoutGrid, List, CreditCard, DollarSign, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { calcularDesgloseBilletes, generarAtajosPago } from '../utils/vuelto';

// ── Emojis por nombre de rubro (kiosko argentino) ─────────────────────────
const RUBRO_EMOJI = {
  // Bebidas
  'Bebidas & Gaseosas':     '🥤',
  'Bebidas':                '🥤',
  'Gaseosas':               '🥤',
  'Agua':                   '💧',
  'Jugos':                  '🧃',
  // Alcohol
  'Cervezas & Vinos':       '🍺',
  'Cervezas':               '🍺',
  'Vinos':                  '🍷',
  'Fernet':                 '🥃',
  'Bebidas Alcohólicas':    '🍾',
  // Alfajores / Dulces
  'Alfajores & Masas':      '🍫',
  'Alfajores':              '🍫',
  'Masas':                  '🍰',
  'Chocolates':             '🍫',
  'Golosinas & Chocolates': '🍬',
  'Golosinas':              '🍬',
  'Caramelos':              '🍭',
  // Galletitas / Panificados
  'Galletitas & Panificados': '🍪',
  'Galletitas':             '🍪',
  'Panificados':            '🥐',
  'Pan':                    '🍞',
  'Facturas':               '🥐',
  // Snacks
  'Snacks & Salados':       '🍿',
  'Snacks':                 '🍿',
  'Salados':                '🧂',
  'Papas Fritas':           '🍟',
  // Almacén
  'Almacén & Despensa':     '🛒',
  'Almacén':                '🛒',
  'Despensa':               '🛒',
  'Conservas':              '🥫',
  'Arroz & Pastas':         '🍝',
  // Helados / Fríos
  'Helados & Fríos':        '🍦',
  'Helados':                '🍦',
  'Fríos':                  '🧊',
  'Lácteos':                '🥛',
  'Yogures':                '🥛',
  // Tabaco
  'Cigarrillos & Tabacos':  '🚬',
  'Cigarrillos':            '🚬',
  'Tabacos':                '🚬',
  // Librería / Bazar
  'Librería & Perfumería':  '📚',
  'Librería':               '📚',
  'Perfumería':             '🧴',
  'Higiene':                '🧼',
  'Limpieza':               '🧹',
  'Bazar':                  '🏪',
  // Otros
  'Carnes':                 '🥩',
  'Verduras':               '🥦',
  'Frutas':                 '🍎',
  'Farmacia':               '💊',
  'Electrónica':            '🔌',
  'Sin Categoría':          '📦',
};

// Fallback: genera emoji por inicial del nombre del rubro
const RUBRO_EMOJI_DEFAULT = (nombre) => {
  const iniciales = {
    'A': '🅰️', 'B': '📦', 'C': '📦', 'D': '📦', 'E': '📦',
    'F': '📦', 'G': '📦', 'H': '📦', 'I': '📦', 'J': '📦',
    'K': '📦', 'L': '📦', 'M': '📦', 'N': '📦', 'O': '📦',
    'P': '📦', 'Q': '📦', 'R': '📦', 'S': '📦', 'T': '📦',
    'U': '📦', 'V': '📦', 'W': '📦', 'X': '📦', 'Y': '📦', 'Z': '📦',
  };
  return iniciales[(nombre || '').charAt(0).toUpperCase()] || '📦';
};

export default function Ventas({
  productosFiltrados = [],
  carrito = [],
  setCarrito,
  busqueda = '',
  setBusqueda,
  agregarAlCarrito,
  eliminarDelCarrito,
  finalizarVenta,
  tipoComprobante,
  setTipoComprobante,
  metodoPago,
  setMetodoPago,
  clienteNombre,
  setClienteNombre,
  clienteDocumento,
  setClienteDocumento,
  clienteId,
  setClienteId,
  descuento,
  setDescuento,
  isProcessingSale,
  clientes = [],
  rubrosLista = [],
}) {
  const [pagaCon, setPagaCon] = useState('');
  const [listasPrecios, setListasPrecios] = useState([]);
  const [listaSeleccionada, setListaSeleccionada] = useState('');
  const [preciosVolumenMap, setPreciosVolumenMap] = useState({});
  const [rubroFiltro, setRubroFiltro] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const searchInputRef = useRef(null);

  // N7: tres estados de caja: 'desconocido' | 'abierta' | 'cerrada'
  // 'desconocido' = red fallida => banner de reintento, bloquear venta
  // 'cerrada'     = confirmado por servidor => banner bloqueante con CTA
  // 'abierta'     = confirmado por servidor => POS operativo
  const [cajaEstado, setCajaEstado] = useState('desconocido');
  const [cajaInfo, setCajaInfo]     = useState(null);  // datos de la caja abierta

  // Configuración
  const [montoMinimoIdentificar, setMontoMinimoIdentificar] = useState(500000);
  const [comercioConfig, setComercioConfig] = useState({});

  // M12: Bloqueo de POS por inactividad
  const [bloqueadoPorInactividad, setBloqueadoPorInactividad] = useState(false);
  const [pinDesbloqueo, setPinDesbloqueo] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [timeoutMinutos, setTimeoutMinutos] = useState(15);
  const timerInactividadRef = useRef(null);

  // Cargar configuración de inactividad
  useEffect(() => {
    apiClient.get('/api/configuracion')
      .then(res => {
        const val = parseInt(res.data?.params?.timeout_inactividad_minutos, 10);
        if (!isNaN(val) && val > 0) {
          setTimeoutMinutos(val);
        }
      })
      .catch(() => {});
  }, []);

  // Timer de inactividad
  useEffect(() => {
    if (bloqueadoPorInactividad) return;

    const ms = timeoutMinutos * 60 * 1000;
    const resetTimer = () => {
      if (timerInactividadRef.current) clearTimeout(timerInactividadRef.current);
      timerInactividadRef.current = setTimeout(() => {
        setBloqueadoPorInactividad(true);
        apiClient.post('/api/usuarios/bloquear-pos').catch(() => {});
      }, ms);
    };

    resetTimer();

    const eventos = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    const handleActividad = () => resetTimer();

    eventos.forEach(ev => window.addEventListener(ev, handleActividad, { passive: true }));

    return () => {
      if (timerInactividadRef.current) clearTimeout(timerInactividadRef.current);
      eventos.forEach(ev => window.removeEventListener(ev, handleActividad));
    };
  }, [bloqueadoPorInactividad, timeoutMinutos]);

  const handleDesbloquearPOS = async (e) => {
    e.preventDefault();
    if (!pinDesbloqueo) return;
    setDesbloqueando(true);
    setErrorPin('');
    try {
      await apiClient.post('/api/usuarios/desbloquear-pos', { pin: pinDesbloqueo });
      setBloqueadoPorInactividad(false);
      setPinDesbloqueo('');
      setErrorPin('');
    } catch (err) {
      setErrorPin(err.response?.data?.error || 'PIN o contraseña incorrectos');
    } finally {
      setDesbloqueando(false);
    }
  };

  // Historial
  const [showHistorial, setShowHistorial] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  // Rubros cerrados por defecto al abrir el punto de venta
  const [openCategories, setOpenCategories] = useState({});
  const toggleCategory = (cat) => setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  // Resetear a cerrado cuando se cargan los productos por primera vez
  const prevRubrosKey = React.useRef('');
  const currentRubrosKey = [...new Set(productosFiltrados.map(p => p.rubro || 'Sin Categoría'))].sort().join('|');
  if (prevRubrosKey.current === '' && currentRubrosKey !== '') {
    prevRubrosKey.current = currentRubrosKey;
    // No hacer nada — openCategories ya es {} (todos cerrados)
  }

  const groupedProducts = productosFiltrados
    .filter(p => !rubroFiltro || (p.rubro || 'Sin Categoría') === rubroFiltro)
    .reduce((acc, p) => {
    const cat = p.rubro || 'Sin Categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  // Lista de rubros únicos en los productos
  const rubrosDisponibles = [...new Set(productosFiltrados.map(p => p.rubro || 'Sin Categoría'))].sort();

  // Mapa de emojis: BD tiene prioridad, luego fallback estático
  const emojiMap = React.useMemo(() => {
    const map = { ...RUBRO_EMOJI };
    rubrosLista.forEach(r => { if (r.emoji) map[r.nombre] = r.emoji; });
    return map;
  }, [rubrosLista]);
  const getEmojiForRubro = (nombre) => emojiMap[nombre] || RUBRO_EMOJI_DEFAULT(nombre);

  // N7: verificar caja con tres estados posibles
  const verificarCaja = () => {
    setCajaEstado('desconocido'); // mientras recarga, mostrar banner de reintento
    apiClient.get('/api/ventas/caja-estado')
      .then(res => {
        if (res.data.caja) {
          setCajaInfo(res.data.caja);
          setCajaEstado('abierta');
        } else {
          setCajaInfo(null);
          setCajaEstado('cerrada');
        }
      })
      .catch(() => {
        // Fallo de red: NO marcar como cerrada; mantener 'desconocido'
        setCajaEstado('desconocido');
      });
  };

  // Verificar caja y cargar config al montar
  useEffect(() => {
    verificarCaja();

    apiClient.get('/api/configuracion')
      .then(res => {
        setMontoMinimoIdentificar(parseFloat(res.data.params?.monto_minimo_identificar || '500000'));
        setComercioConfig(res.data.comercio || {});
      })
      .catch(() => {});

    apiClient.get('/api/listas-precios')
      .then(res => setListasPrecios(res.data || []))
      .catch(() => {});

    apiClient.get('/api/listas-precios/precios-volumen')
      .then(res => {
        const map = {};
        (res.data || []).forEach(pv => {
          if (!map[pv.producto_id]) map[pv.producto_id] = [];
          map[pv.producto_id].push(pv);
        });
        setPreciosVolumenMap(map);
      })
      .catch(() => {});
  }, []);

  const cargarHistorial = async () => {
    setLoadingHistorial(true);
    try {
      const res = await apiClient.get('/api/ventas');
      setHistorial((res.data || []).slice(0, 30));
    } catch (_) {} finally {
      setLoadingHistorial(false);
    }
  };

  useEffect(() => {
    if (showHistorial) cargarHistorial();
  }, [showHistorial]);

  // BUG-07 FIX: Recalcular precios del carrito cuando cambia la lista de precios seleccionada
  useEffect(() => {
    if (carrito.length === 0) return;
    setCarrito(prev =>
      prev.map(item => ({
        ...item,
        // Solo actualizamos el precio de display (precio_venta en el item del carrito)
        // El backend siempre usa el precio real de la BD, esto es para mostrar el total correcto
        precio_venta: obtenerPrecioUnitario(item, item.cantidad),
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaSeleccionada]);

  // BUG-18 FIX: Sincronizar categorias abiertas cuando llegan nuevos productos
  useEffect(() => {
    if (productosFiltrados.length === 0) return;
    setOpenCategories(prev => {
      const next = { ...prev };
      productosFiltrados.forEach(p => {
        const cat = p.rubro || 'Sin Categoría';
        if (!(cat in next)) next[cat] = true; // abrir categorías nuevas por defecto
      });
      return next;
    });
  }, [productosFiltrados.length]);


  const actualizarCantidadItem = (id, nuevaCantidad) => {
    if (nuevaCantidad <= 0) { eliminarDelCarrito(id); return; }
    const item = carrito.find(i => i.id === id);
    if (item && nuevaCantidad > item.stock) {
      Swal.fire('❌ Stock insuficiente', `Solo hay ${item.stock} unidades disponibles`, 'warning');
      return;
    }
    setCarrito(carrito.map(i => i.id === id ? { ...i, cantidad: nuevaCantidad } : i));
  };

  const obtenerPrecioUnitario = (producto, cantidad = 1) => {
    let basePrice = parseFloat(producto.precio_venta || 0);
    // Si está seleccionada "Lista 2 (Mayorista)" y el producto tiene precio_lista2
    if (listaSeleccionada === 'lista2' && producto.precio_lista2) {
      basePrice = parseFloat(producto.precio_lista2);
    } else if (listaSeleccionada && listaSeleccionada !== 'lista2') {
      const volList = preciosVolumenMap[producto.id];
      if (volList?.length > 0) {
        const sorted = [...volList].sort((a, b) => b.cantidad_minima - a.cantidad_minima);
        const match = sorted.find(v => cantidad >= v.cantidad_minima);
        if (match) return parseFloat(match.precio);
      }
      const lista = listasPrecios.find(l => l.id === parseInt(listaSeleccionada));
      if (lista?.porcentaje_ajuste) {
        basePrice = basePrice * (1 + parseFloat(lista.porcentaje_ajuste) / 100);
      }
    }
    return basePrice;
  };

  const subtotalCarrito = carrito.reduce((acc, item) => {
    const pUnit = obtenerPrecioUnitario(item, item.cantidad);
    return acc + pUnit * item.cantidad;
  }, 0);

  // Calcular IVA discriminado (precio final incluye IVA)
  const ivaDiscriminado = carrito.reduce((acc, item) => {
    const pUnit = obtenerPrecioUnitario(item, item.cantidad);
    const sub = pUnit * item.cantidad;
    const ivaPorc = parseFloat(item.iva_porcentaje || 21);
    const iva = sub - sub / (1 + ivaPorc / 100);
    return acc + iva;
  }, 0);

  const descuentoMonto = parseFloat(descuento) || 0;
  const totalCarrito = Math.max(0, subtotalCarrito - descuentoMonto);
  const vuelto = parseFloat(pagaCon) >= totalCarrito ? (parseFloat(pagaCon) - totalCarrito).toFixed(2) : '0.00';

  // Alerta monto mínimo de identificación
  const requiresIdentification = totalCarrito >= montoMinimoIdentificar && !clienteNombre && !clienteDocumento && tipoComprobante === 'interno';

  // Keyboard / barcode scanner
  useEffect(() => {
    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      if ((e.key === 'F2' || e.key === 'F10') && carrito.length > 0) {
        e.preventDefault(); finalizarVenta(); return;
      }
      if (e.key === 'F4') { e.preventDefault(); searchInputRef.current?.focus(); return; }
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;
      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          const barcode = barcodeBufferRef.current.trim();
          barcodeBufferRef.current = '';
          const prodFound = productosFiltrados.find(p => p.codigo_barras?.toString().trim() === barcode);
          if (prodFound) { e.preventDefault(); agregarAlCarrito(prodFound); }
        }
        barcodeBufferRef.current = ''; return;
      }
      if (e.key.length === 1) {
        barcodeBufferRef.current = timeDiff < 40 ? barcodeBufferRef.current + e.key : e.key;
      }
      if (e.key.length === 1 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carrito, finalizarVenta, productosFiltrados, agregarAlCarrito]);

  // ── N7: Banner de estado desconocido (fallo de red) ─────────────────────
  if (cajaEstado === 'desconocido') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center shadow-sm space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 animate-pulse">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Verificando caja…</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-sm">
            No se pudo confirmar el estado de la caja (sin red o servidor no disponible). Las ventas están bloqueadas hasta confirmar.
          </p>
        </div>
        <button
          onClick={verificarCaja}
          className="rounded-xl bg-slate-700 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-600 transition-all shadow-md"
        >
          Reintentar verificación
        </button>
      </div>
    );
  }

  // ── N7: Banner bloqueante cuando caja está confirmada como CERRADA ────────
  if (cajaEstado === 'cerrada') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-12 text-center shadow-sm space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Caja cerrada</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300 max-w-sm">
            No podés realizar ventas sin una caja abierta. Ir a <strong>Caja</strong> y abrí el turno primero.
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/caja" className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-600 transition-all shadow-md">
            Ir a Caja →
          </a>
          <button
            onClick={verificarCaja}
            className="rounded-xl border border-amber-300 dark:border-amber-700 px-6 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all"
          >
            Actualizar estado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Historial toggle */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistorial(!showHistorial)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <span className="flex items-center gap-2"><History size={16} className="text-indigo-500" /> Historial de ventas de hoy</span>
          {showHistorial ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showHistorial && (
          <div className="border-t border-slate-100 dark:border-slate-700 max-h-64 overflow-y-auto">
            {loadingHistorial ? (
              <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Cargando...</div>
            ) : historial.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Sin ventas registradas hoy.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Hora</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Método</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {historial.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400">#{v.id}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2">
                        <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{v.tipo_comprobante}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{v.metodo_pago}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-slate-100">
                        ${parseFloat(v.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* POS Grid */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        {/* Search & Product Selection Panel */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Punto de Venta</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Escaneá el código de barras o presioná <kbd className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">F4</kbd> para buscar.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              {/* Toggle Vista Grilla / Lista */}
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                  title="Vista Lista"
                >
                  <List size={14} /> Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                  title="Vista Grilla Táctil"
                >
                  <LayoutGrid size={14} /> Grilla
                </button>
              </div>

              {/* Filtro por rubro */}
              <select
                value={rubroFiltro}
                onChange={(e) => setRubroFiltro(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
              >
                <option value="">Todos los rubros</option>
                {rubrosDisponibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {/* Lista de precios */}
              <select
                value={listaSeleccionada}
                onChange={(e) => setListaSeleccionada(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
              >
                <option value="">🏷️ Lista 1 — Minorista</option>
                <option value="lista2">🏷️ Lista 2 — Mayorista</option>
                {listasPrecios.map(l => (
                  <option key={l.id} value={l.id}>
                    🏷️ {l.nombre} ({l.porcentaje_ajuste >= 0 ? `+${l.porcentaje_ajuste}%` : `${l.porcentaje_ajuste}%`})
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-64">
                <input
                  ref={searchInputRef}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-2.5 pl-10 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              </div>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40">
            {productosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 dark:text-slate-400">
                <p>No se encontraron productos.</p>
              </div>
            ) : viewMode === 'grid' ? (
              /* Vista Grilla Táctil */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
                {productosFiltrados.map((producto) => {
                  const pFinal = obtenerPrecioUnitario(producto, 1);
                  return (
                    <button
                      key={producto.id}
                      type="button"
                      onClick={() => agregarAlCarrito(producto)}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-left transition-all hover:border-indigo-500 hover:shadow-md active:scale-95 group"
                    >
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block truncate">{producto.rubro || 'General'}</span>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm line-clamp-2 mt-0.5">{producto.nombre}</h3>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-zinc-700/60 pt-2">
                        <span className="font-black text-violet-600 dark:text-violet-400 text-sm">{formatCurrency(pFinal)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${producto.stock <= 5 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-violet-50 dark:bg-zinc-700 text-violet-700 dark:text-zinc-200'}`}>
                          Stk: {producto.stock}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Vista Lista */
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {Object.entries(groupedProducts).map(([categoria, prods]) => (
                  <div key={categoria}>
                    <div
                      className="flex cursor-pointer items-center justify-between bg-slate-100/70 dark:bg-zinc-800/80 px-4 py-3 transition-colors hover:bg-slate-200/60 dark:hover:bg-zinc-700/80"
                      onClick={() => toggleCategory(categoria)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base leading-none">{getEmojiForRubro(categoria)}</span>
                        {openCategories[categoria] ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        <span className="font-bold text-slate-900 dark:text-slate-100">{categoria}</span>
                        <span className="rounded-full bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-200">{prods.length}</span>
                      </div>
                    </div>
                    {openCategories[categoria] && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700 pl-4">
                        {prods.map((producto) => {
                          const pFinal = obtenerPrecioUnitario(producto, 1);
                          return (
                            <div key={producto.id} className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-white dark:hover:bg-slate-800/80 sm:flex-row sm:items-center">
                              <div>
                                <p className="text-base font-bold text-slate-900 dark:text-slate-100">{producto.nombre}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-slate-600 dark:text-slate-300 font-medium">
                                    Precio: <strong className="text-slate-900 dark:text-slate-100 font-bold">{formatCurrency(pFinal)}</strong>
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">IVA {producto.iva_porcentaje ?? 21}%</span>
                                  <span className="text-slate-300 dark:text-slate-600">•</span>
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                    producto.stock <= 5
                                      ? 'border-rose-200 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                      : 'border-violet-200 bg-violet-50 dark:bg-zinc-700/80 text-violet-700 dark:text-zinc-200'
                                  }`}>
                                    Stock: {producto.stock}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => agregarAlCarrito(producto)}
                                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-violet-700 hover:shadow-sm"
                              >
                                + Agregar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Cart & Checkout Panel */}
        <aside className="flex h-full flex-col rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-5 shadow-sm sm:p-6">
          <h2 className="mb-5 flex items-center justify-between text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            <span className="flex items-center gap-2">🛒 Carrito</span>
            {carrito.length > 0 && (
              <button onClick={() => setCarrito([])} className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline">Vaciar</button>
            )}
          </h2>

          {carrito.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-slate-500 dark:text-slate-400">
              <span className="mb-4 text-5xl opacity-50">🛍️</span>
              <p className="text-center font-bold">El carrito está vacío.</p>
              <p className="mt-1 text-center text-sm">Escaneá o seleccioná productos para comenzar.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col space-y-4">
              <ul className="max-h-[18rem] flex-1 space-y-2.5 overflow-y-auto pr-1">
                {carrito.map((item) => {
                  const pUnit = obtenerPrecioUnitario(item, item.cantidad);
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-3 transition-colors hover:border-slate-300 dark:hover:border-slate-600">
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-1 font-bold text-slate-900 dark:text-slate-100">{item.nombre}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">${pUnit.toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                        <button type="button" onClick={() => actualizarCantidadItem(item.id, item.cantidad - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200">-</button>
                        <span className="w-8 text-center text-sm font-bold text-slate-900 dark:text-slate-100">{item.cantidad}</span>
                        <button type="button" onClick={() => actualizarCantidadItem(item.id, item.cantidad + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-200">+</button>
                      </div>
                      <div className="w-20 text-right">
                        <p className="font-black text-slate-900 dark:text-slate-100">${(pUnit * item.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <button type="button" onClick={() => eliminarDelCarrito(item.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-rose-500 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40">×</button>
                    </li>
                  );
                })}
              </ul>

              {/* Totals */}
              <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <span>Subtotal</span>
                  <span className="font-bold">{formatCurrency(subtotalCarrito)}</span>
                </div>
                {tipoComprobante !== 'interno' && (
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>IVA discriminado</span>
                    <span className="font-semibold">{formatCurrency(ivaDiscriminado)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Descuento ($)</span>
                  <input type="number" min="0" placeholder="0" value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                    className="w-24 rounded border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2 py-1 text-right text-xs font-bold text-slate-900 dark:text-slate-100 outline-none" />
                </div>
                <div className="flex items-center justify-between border-t border-indigo-100 dark:border-indigo-900/80 pt-2 text-slate-900 dark:text-slate-100">
                  <span className="font-bold text-sm">TOTAL</span>
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(totalCarrito)}</span>
                </div>
              </div>

              {/* Alerta monto mínimo */}
              {requiresIdentification && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                    El total supera el mínimo de identificación (${montoMinimoIdentificar.toLocaleString('es-AR')}). 
                    Completá los datos del cliente o seleccioná Factura B/A.
                  </p>
                </div>
              )}

              {/* Checkout Form */}
              <div className="grid gap-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                    Comprobante
                    <select value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500">
                      <option value="interno">Ticket Interno</option>
                      <option value="factura_b">Factura B — Consumidor Final</option>
                      <option value="factura_a">Factura A — Resp. Inscripto</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                    Forma de Pago
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500">
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="cuenta_corriente">Cuenta Corriente</option>
                    </select>
                  </label>
                </div>

                {/* Cuenta corriente: selector de cliente */}
                {metodoPago === 'cuenta_corriente' && (
                  <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">Seleccionar Cliente para Fiar</label>
                    <select value={clienteId}
                      onChange={(e) => {
                        setClienteId(e.target.value);
                        const selected = clientes.find(c => c.id === parseInt(e.target.value));
                        if (selected) { setClienteNombre(selected.nombre); setClienteDocumento(selected.documento || ''); }
                      }}
                      className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-amber-950 dark:text-amber-100 outline-none" required>
                      <option value="">-- Seleccionar cliente --</option>
                      {clientes.filter(c => !c.bloqueado).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.saldo_deuda > 0 ? `(Deuda: $${parseFloat(c.saldo_deuda).toLocaleString('es-AR', { minimumFractionDigits: 2 })})` : ''}
                        </option>
                      ))}
                    </select>
                    {clientes.some(c => c.bloqueado) && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">* Los clientes bloqueados no aparecen en esta lista.</p>
                    )}
                  </div>
                )}

                {/* Efectivo: vuelto y desglose de billetes */}
                {metodoPago === 'efectivo' && (
                  <div className="space-y-2 rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Paga con</label>
                        <input className="w-full rounded-lg border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm font-bold text-emerald-900 dark:text-emerald-100 outline-none focus:border-emerald-500"
                          type="number" placeholder="$0.00" value={pagaCon}
                          onChange={(e) => setPagaCon(e.target.value)} />
                      </div>
                      <div className="flex-1 text-right">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Vuelto</span>
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">${vuelto}</span>
                      </div>
                    </div>

                    {/* Atajos de pago rápido */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 mr-1">Rápido:</span>
                      {generarAtajosPago(totalCarrito).map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setPagaCon(String(sug))}
                          className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          {sug === totalCarrito ? 'Exacto' : `$${sug.toLocaleString('es-AR')}`}
                        </button>
                      ))}
                    </div>

                    {/* Desglose de billetes sugerido si hay vuelto */}
                    {parseFloat(vuelto) > 0 && (
                      <div className="rounded-lg bg-white/80 dark:bg-slate-900/80 p-2 text-xs border border-emerald-100 dark:border-emerald-900/40">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Desglose sugerido de billetes:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {calcularDesgloseBilletes(parseFloat(vuelto)).desglose.map((d, i) => (
                            <span key={i} className="inline-flex items-center rounded-md bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 text-[11px] font-black text-emerald-800 dark:text-emerald-300">
                              {d.cantidad}x ${d.billete.toLocaleString('es-AR')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Factura A/B: datos del cliente */}
                {['factura_a', 'factura_b'].includes(tipoComprobante) && (
                  <div className="grid gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Datos del receptor</p>
                    <input className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500"
                      type="text" placeholder="Nombre o Razón Social" value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)} required />
                    <input className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500"
                      type="text" placeholder="DNI / CUIT" value={clienteDocumento}
                      onChange={(e) => setClienteDocumento(e.target.value)} required />
                  </div>
                )}

                <button
                  type="button"
                  onClick={finalizarVenta}
                  disabled={isProcessingSale || (cajaChecked && !cajaAbierta)}
                  className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 ${
                    isProcessingSale || (cajaChecked && !cajaAbierta)
                      ? 'bg-indigo-400 dark:bg-indigo-900 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]'
                  }`}
                >
                  {isProcessingSale ? 'Procesando...' : `Confirmar y Cobrar (F2/F10)`}
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* M12: Overlay de Bloqueo por Inactividad */}
      {bloqueadoPorInactividad && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white dark:bg-slate-900 p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/10">
              <Lock size={32} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                Punto de Venta Bloqueado
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Se activó la protección por inactividad tras {timeoutMinutos} minutos sin uso. Tu carrito y turno de caja están a salvo.
              </p>
            </div>

            {carrito.length > 0 && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                🛒 <b>{carrito.length}</b> artículos en el carrito actual (Total: <b>{formatCurrency(totalCarrito)}</b>)
              </div>
            )}

            <form onSubmit={handleDesbloquearPOS} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  PIN o Contraseña del Cajero
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="••••"
                  value={pinDesbloqueo}
                  onChange={(e) => setPinDesbloqueo(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-3 text-center text-xl font-bold tracking-widest text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {errorPin && (
                  <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    {errorPin}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={desbloqueando}
                className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition disabled:opacity-50"
              >
                {desbloqueando ? 'Verificando...' : 'Desbloquear y Continuar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

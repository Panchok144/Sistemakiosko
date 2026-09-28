import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import apiClient from '../apiClient';
import { Plus, Filter, Package, ChevronDown, ChevronRight, History, Edit2, Trash2, Box, Upload, Download, TrendingUp, X } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function Inventario({ 
  productos = [], canManageCatalog, 
  codigoBarras, setCodigoBarras, nombre, setNombre, precioVenta, setPrecioVenta, costo, setCosto, stock, setStock, 
  codigoSecundario, setCodigoSecundario, codigoProveedor, setCodigoProveedor, rubro, setRubro, marca, setMarca, proveedorId, setProveedorId, 
  proveedores = [], rubrosLista = [], cargarRubros, cargarProductos,
  manejarEnvio, eliminarProducto, editarProducto, abrirAgregarStock, abrirAumentoMasivo 
}) {
  const [busqueda, setBusqueda] = useState('');
  const [rubroFiltro, setRubroFiltro] = useState('');
  const [highlightedId, setHighlightedId] = useState(null);
  const [openCategories, setOpenCategories] = useState({});
  const [modalRubros, setModalRubros] = useState(false);
  const [rubroNombre, setRubroNombre] = useState('');
  const [rubroEmoji, setRubroEmoji] = useState('');
  const [rubroEditId, setRubroEditId] = useState(null);
  const [rubroEditNombre, setRubroEditNombre] = useState('');
  const [rubroEditEmoji, setRubroEditEmoji] = useState('');
  const location = useLocation();

  // Read deep-link params from notification bell
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qBusqueda = params.get('busqueda');
    const qRubro = params.get('rubro');
    if (qBusqueda) setBusqueda(qBusqueda);
    if (qRubro) {
      setRubroFiltro(qRubro);
      // Auto-expand the matching category
      setOpenCategories(prev => ({ ...prev, [qRubro]: true }));
    }
    // Find the matching product by name to highlight it
    if (qBusqueda && Array.isArray(productos) && productos.length > 0) {
      const match = productos.find(
        p => p.nombre?.toLowerCase() === qBusqueda.toLowerCase()
      );
      if (match) {
        setHighlightedId(match.id);
        // Also expand its category
        if (match.rubro) {
          setOpenCategories(prev => ({ ...prev, [match.rubro]: true }));
        }
        // Clear highlight after animation
        const timer = setTimeout(() => setHighlightedId(null), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [location.search, productos]);
  
  // Modal de agregar producto
  const [showFormulario, setShowFormulario] = useState(false);
  const codigoBarrasPrev = useRef(codigoBarras);

  // Cerrar el modal automáticamente cuando el formulario se limpia (indicio de éxito)
  useEffect(() => {
    if (codigoBarrasPrev.current && !codigoBarras && showFormulario) {
      setShowFormulario(false);
    }
    codigoBarrasPrev.current = codigoBarras;
  }, [codigoBarras]);

  // Campos extra del formulario de producto
  const [ivaPorcentaje, setIvaPorcentaje] = useState('21');
  const [codigoProveedorExterno, setCodigoProveedorExterno] = useState('');
  const [margenGanancia, setMargenGanancia] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [stockMaximo, setStockMaximo] = useState('');

  const [modalEditarProd, setModalEditarProd] = useState(null);
  const [prodEditDatos, setProdEditDatos] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Kardex
  const [modalKardex, setModalKardex] = useState(null);
  const [kardexMovimientos, setKardexMovimientos] = useState([]);
  const [loadingKardex, setLoadingKardex] = useState(false);

  const toggleCategory = (cat) => setOpenCategories(prev => ({...prev, [cat]: !prev[cat]}));

  const abrirKardex = async (prod) => {
    setModalKardex(prod);
    setLoadingKardex(true);
    try {
      const res = await apiClient.get(`/api/productos/${prod.id}/kardex`).catch(() => ({ data: [] }));
      setKardexMovimientos(Array.isArray(res.data) ? res.data : []);
    } catch (_) {
      setKardexMovimientos([]);
    } finally {
      setLoadingKardex(false);
    }
  };
  
  const prods = Array.isArray(productos) ? productos : [];
  const productosFiltrados = prods.filter(p => {
    const matchBusqueda = (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || 
      p.codigo_barras?.toString().toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.marca && p.marca.toLowerCase().includes(busqueda.toLowerCase()));
    const matchRubro = !rubroFiltro || (p.rubro || 'Sin Categoría') === rubroFiltro;
    return matchBusqueda && matchRubro;
  });

  const groupedProducts = productosFiltrados.reduce((acc, p) => {
    const cat = p.rubro || 'Sin Categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const crearRubro = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/rubros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('kiosko_token') || ''}` },
        body: JSON.stringify({ nombre: rubroNombre, emoji: rubroEmoji || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Swal.fire('Éxito', 'Rubro creado', 'success');
      setRubroNombre('');
      setRubroEmoji('');
      cargarRubros();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const eliminarRubro = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este rubro?')) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/rubros/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('kiosko_token') || ''}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cargarRubros();
      cargarProductos();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  const guardarEdicionRubro = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/rubros/${rubroEditId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('kiosko_token') || ''}` },
        body: JSON.stringify({ nombre: rubroEditNombre, emoji: rubroEditEmoji || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRubroEditId(null);
      setRubroEditNombre('');
      setRubroEditEmoji('');
      cargarRubros();
      cargarProductos();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // BUG#6 FIX — guardarEdicionProducto: savingEdit se resetea en el finally,
  // pero si el usuario cancela el modal mientras savingEdit=true, queda bloqueado.
  // La solución es también resetear al cerrar el modal.
  const cerrarModalEdicion = () => {
    setModalEditarProd(null);
    setSavingEdit(false); // siempre resetear al cerrar
  };

  // Handler local para alta de producto (incluye campos extra que el prop no tiene)
  const manejarEnvioLocal = async (e) => {
    e.preventDefault();
    const datos = {
      codigo_barras: codigoBarras,
      nombre,
      precio_venta: parseFloat(precioVenta),
      costo: parseFloat(costo),
      stock: parseInt(stock, 10) || 0,
      codigo_secundario: codigoSecundario || null,
      codigo_proveedor: codigoProveedor || null,
      rubro: rubro || null,
      marca: marca || null,
      proveedor_id: proveedorId || null,
      iva_porcentaje: parseFloat(ivaPorcentaje) || 21,
      codigo_proveedor_externo: codigoProveedorExterno || null,
      margen_ganancia: margenGanancia ? parseFloat(margenGanancia) : null,
      stock_minimo: stockMinimo !== '' ? parseInt(stockMinimo, 10) : null,
      stock_maximo: stockMaximo !== '' ? parseInt(stockMaximo, 10) : null,
    };
    try {
      await apiClient.post('/api/productos', datos);
      Swal.fire('✅ Producto guardado!', '', 'success');
      // Limpiar estados locales
      setIvaPorcentaje('21');
      setCodigoProveedorExterno('');
      setMargenGanancia('');
      setStockMinimo('');
      setStockMaximo('');
      // Limpiar props del padre
      if (manejarEnvio) manejarEnvio({ _limparFormulario: true });
      else {
        // Si no hay prop, resetear manualmente lo que podamos
        cargarProductos();
      }
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  // Guardar edición de producto con control de variación
  const guardarEdicionProducto = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await guardarProductoConConfirmacion(prodEditDatos, false);
    } finally {
      setSavingEdit(false);
    }
  };


  const guardarProductoConConfirmacion = async (datos, confirmar) => {
    try {
      const res = await apiClient.put(`/api/productos/${datos.id}`, {
        ...datos,
        confirmar_variacion: confirmar,
      });

      if (res.data.require_confirm) {
        // El backend informa que la variación supera el límite configurado
        const { variacion_costo_pct, variacion_precio_pct, limite_pct } = res.data;
        const conf = await Swal.fire({
          title: '⚠️ Variación de precio grande',
          html: `
            <p class="text-sm text-gray-600 mb-3">${res.data.mensaje}</p>
            <div class="grid grid-cols-2 gap-3 text-sm text-left">
              <div class="bg-orange-50 rounded-lg p-3">
                <p class="font-bold text-orange-700">Variación Costo</p>
                <p class="text-2xl font-black text-orange-600">${variacion_costo_pct}%</p>
              </div>
              <div class="bg-orange-50 rounded-lg p-3">
                <p class="font-bold text-orange-700">Variación Precio</p>
                <p class="text-2xl font-black text-orange-600">${variacion_precio_pct}%</p>
              </div>
            </div>
            <p class="mt-3 text-xs text-gray-500">Límite configurado: ${limite_pct}%</p>
          `,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, actualizar igual',
          confirmButtonColor: '#d97706',
          cancelButtonText: 'Cancelar',
        });
        if (!conf.isConfirmed) return;
        // Reintentar con confirmación
        await guardarProductoConConfirmacion(datos, true);
        return;
      }

      Swal.fire('✅', 'Producto actualizado con éxito', 'success');
      setModalEditarProd(null);
      cargarProductos();
    } catch (err) {
      Swal.fire('❌ Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('archivo', file)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/productos/importar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('kiosko_token') || ''}` },
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      Swal.fire('Éxito', data.mensaje, 'success')
      cargarProductos();
    } catch (err) {
      Swal.fire('Error', err.message, 'error')
    }
  }

  const handleExport = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/productos/exportar`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${localStorage.getItem('kiosko_token') || ''}` }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al exportar listado');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'productos.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // Calcular margen automático basado en costo y precio
  const calcularMargen = (costoVal, precioVal) => {
    const c = parseFloat(costoVal);
    const p = parseFloat(precioVal);
    if (c > 0 && p > 0) return (((p - c) / c) * 100).toFixed(1);
    return '';
  };

  const inp = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400 dark:placeholder:text-slate-500';
  const lbl = 'mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider';

  return (
    <div className="space-y-5">
      
      {/* Header con botones de acción lateral */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Package className="text-indigo-600 dark:text-indigo-400" size={24} />
            Inventario
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {productos.length} productos registrados
          </p>
        </div>
        {canManageCatalog && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowFormulario(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
            >
              <Plus size={16} /> Ingresar Producto
            </button>
            <button
              type="button"
              onClick={() => setModalRubros(true)}
              className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 transition-all hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700"
            >
              <Filter size={16} /> Rubros
            </button>
          </div>
        )}
      </div>

      {/* Modal para agregar producto */}
      {canManageCatalog && showFormulario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">✨</span>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ingresar Nuevo Producto</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Registrá un nuevo artículo para comenzar a venderlo.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowFormulario(false)} className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={manejarEnvioLocal} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={lbl}>Código de Barras *</label>
                <input type="text" className={inp} value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} required placeholder="Ej: 7791234567890" />
              </div>
              <div>
                <label className={lbl}>Nombre *</label>
                <input type="text" className={inp} value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej: Alfajor Jorgito Blanco" />
              </div>
              <div>
                <label className={lbl}>Marca</label>
                <input type="text" className={inp} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: Jorgito" />
              </div>
              <div className="flex flex-col justify-end">
                <label className={lbl}>Rubro</label>
                <div className="flex gap-2">
                  <select className={inp} value={rubro} onChange={(e) => setRubro(e.target.value)}>
                    <option value="">Sin Categoría</option>
                    {rubrosLista.map(r => (
                      <option key={r.id} value={r.nombre}>{r.nombre}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setModalRubros(true)} className="flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700" title="Administrar Rubros">
                    ⚙️
                  </button>
                </div>
              </div>
              <div>
                <label className={lbl}>Costo ($) *</label>
                <input type="number" step="0.01" className={inp} value={costo} onChange={(e) => setCosto(e.target.value)} required placeholder="Ej: 500.00" />
              </div>
              <div>
                <label className={lbl}>Precio Venta ($) *</label>
                <input type="number" step="0.01" className={inp} value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} required placeholder="Ej: 800.00" />
              </div>
              <div>
                <label className={lbl}>Margen de Ganancia (%)</label>
                <input type="number" step="0.1" className={inp} value={margenGanancia || calcularMargen(costo, precioVenta)}
                  onChange={(e) => setMargenGanancia(e.target.value)} placeholder="Auto calculado" />
              </div>
              <div>
                <label className={lbl}>IVA (%)</label>
                <select className={inp} value={ivaPorcentaje} onChange={(e) => setIvaPorcentaje(e.target.value)}>
                  <option value="0">0% — Exento</option>
                  <option value="10.5">10.5%</option>
                  <option value="21">21% — General</option>
                  <option value="27">27%</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Stock Inicial</label>
                <input type="number" className={inp} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ej: 24" />
              </div>
              <div>
                <label className={lbl}>Stock Mínimo <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  className={inp}
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  placeholder="Ej: 5 — alerta al llegar"
                  min="0"
                />
                <p className="mt-1 text-[10px] text-slate-400">Se genera alerta cuando el stock llega a este número.</p>
              </div>
              <div>
                <label className={lbl}>Stock Máximo</label>
                <input
                  type="number"
                  className={inp}
                  value={stockMaximo}
                  onChange={(e) => setStockMaximo(e.target.value)}
                  placeholder="Ej: 100 — opcional"
                  min="0"
                />
              </div>

              <div>
                <label className={lbl}>Proveedor</label>
                <select className={inp} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Código de Proveedor (externo)</label>
                <input type="text" className={inp} value={codigoProveedorExterno} onChange={(e) => setCodigoProveedorExterno(e.target.value)} placeholder="Ej: PROV-001-ABC" />
              </div>
              <div>
                <label className={lbl}>Código Secundario</label>
                <input type="text" className={inp} value={codigoSecundario} onChange={(e) => setCodigoSecundario(e.target.value)} placeholder="Código interno" />
              </div>
              <div className="col-span-full mt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowFormulario(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                  Cancelar
                </button>
                <button type="submit" className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-700">
                  <span className="text-lg">💾</span> Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!canManageCatalog && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-emerald-900 dark:text-emerald-200">
          <p className="font-semibold text-sm">👋 Modo Empleado: Puedes consultar el catálogo, pero no puedes agregar o modificar productos.</p>
        </div>
      )}

      {/* Lista de inventario */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Inventario Actual</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 mb-4">Controlá el stock, precios y disponibilidad de tu negocio.</p>
            <div className="flex flex-wrap gap-2">
              <input 
                type="text"
                placeholder="Buscar por nombre, marca o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <select
                value={rubroFiltro}
                onChange={(e) => setRubroFiltro(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-indigo-500"
              >
                <option value="">Todos los rubros</option>
                <option value="Sin Categoría">Sin Categoría</option>
                {rubrosLista.map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
              </select>
              {(busqueda || rubroFiltro) && (
                <button
                  type="button"
                  onClick={() => { setBusqueda(''); setRubroFiltro(''); }}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  ✕ Limpiar
                </button>
              )}
            </div>
          </div>
          {canManageCatalog && (
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer flex items-center justify-center gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 px-4 py-2.5 text-sm font-bold text-indigo-700 dark:text-indigo-300 transition-all hover:bg-indigo-600 hover:text-white border border-indigo-100 dark:border-indigo-900/60">
                <span className="text-lg">📤</span> Importar XLS
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
              </label>
              <button type="button" onClick={handleExport} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 px-4 py-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-300 transition-all hover:bg-emerald-600 hover:text-white border border-emerald-100 dark:border-emerald-900/60">
                <span className="text-lg">📥</span> Exportar XLS
              </button>
              <button type="button" onClick={abrirAumentoMasivo} className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 px-4 py-2.5 text-sm font-bold text-rose-700 dark:text-rose-300 transition-all hover:bg-rose-600 hover:text-white border border-rose-100 dark:border-rose-900/60">
                <span className="text-lg">📈</span> Aumento Masivo
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              <tr>
                <th className="px-5 py-3 w-8"></th>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Marca</th>
                <th className="px-5 py-3">IVA</th>
                <th className="px-5 py-3">Costo</th>
                <th className="px-5 py-3">Precio</th>
                <th className="px-5 py-3">Margen</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Últ. Costo</th>
                {canManageCatalog && <th className="px-5 py-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800">
              {Object.entries(groupedProducts).map(([categoria, prods]) => (
                <React.Fragment key={categoria}>
                  <tr 
                    className="bg-slate-100/70 dark:bg-slate-750 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors border-y border-slate-200 dark:border-slate-700"
                    onClick={() => toggleCategory(categoria)}
                  >
                    <td className="px-5 py-4 text-center font-bold text-slate-500 dark:text-slate-400">
                      {openCategories[categoria] ? '▼' : '▶'}
                    </td>
                    <td colSpan={canManageCatalog ? 10 : 9} className="px-5 py-4 font-bold text-slate-900 dark:text-slate-100 text-base">
                      {categoria} <span className="ml-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 rounded-full">{prods.length} productos</span>
                    </td>
                  </tr>
                  {openCategories[categoria] && prods.map((producto) => {
                    const margen = producto.margen_ganancia != null
                      ? `${parseFloat(producto.margen_ganancia).toFixed(1)}%`
                      : producto.costo > 0 && producto.precio_venta > 0
                        ? `${(((producto.precio_venta - producto.costo) / producto.costo) * 100).toFixed(1)}%`
                        : '-';
                    const fechaCosto = producto.fecha_actualizacion_costo
                      ? new Date(producto.fecha_actualizacion_costo).toLocaleDateString('es-AR')
                      : '-';
                    return (
                      <tr
                        key={producto.id}
                        className={`odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-800 dark:even:bg-slate-850 hover:bg-slate-100/70 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700/60 ${highlightedId === producto.id ? 'notification-highlight' : ''}`}
                      >
                        <td className="px-5 py-3"></td>
                        <td className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs">
                          <div>{producto.codigo_barras}</div>
                          {producto.codigo_proveedor_externo && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Prov: {producto.codigo_proveedor_externo}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 font-bold text-slate-900 dark:text-slate-100">{producto.nombre}</td>
                        <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300 font-bold">{producto.marca || '-'}</td>
                        <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">{producto.iva_porcentaje ?? 21}%</td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300 font-semibold">{formatCurrency(producto.costo)}</td>
                        <td className="px-5 py-3 font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(producto.precio_venta)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-bold ${parseFloat(margen) > 30 ? 'text-emerald-600 dark:text-emerald-400' : parseFloat(margen) < 10 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {margen}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${producto.stock <= 5 ? 'border-rose-200 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'}`}>
                            {producto.stock} {producto.stock <= 5 && 'Bajo'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{fechaCosto}</td>
                        {canManageCatalog && (
                          <td className="px-5 py-3 text-center flex justify-center gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); abrirKardex(producto); }} className="flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all" title="Ver Kardex / Movimientos">
                              <History size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); abrirAgregarStock(producto); }} className="flex items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1.5 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all" title="Agregar Stock">
                              <Box size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setProdEditDatos({...producto}); setModalEditarProd(producto.id); }} className="flex items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white transition-all" title="Editar">
                              <Edit2 size={14} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); eliminarProducto(producto.id); }} className="flex items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1.5 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition-all" title="Eliminar">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={canManageCatalog ? 11 : 10} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <span className="mb-2 block text-4xl opacity-50">📂</span> 
                    {busqueda ? 'No se encontraron productos con esa búsqueda.' : 'No hay productos en el inventario.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Administrar Rubros */}
      {modalRubros && (() => {
        const EMOJIS_KIOSKO = [
          '🥤','🧃','💧','🍺','🍷','🥃','🍾',
          '🍫','🍬','🍭','🍪','🥐','🍞','🍰',
          '🍿','🧂','🍟','🥫','🍝','🛒','📦',
          '🍦','🧊','🥛','🚬','📚','🧴','🧼',
          '🧹','🏪','🥩','🥦','🍎','💊','🔌',
          '🎁','🧸','⚽','🎮','🖊️','📋','🔑',
          '🧺','🌿','🌸','🧆','🥜','🧇','🥚',
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Administrar Rubros</h3>
                <button type="button" onClick={() => setModalRubros(false)} className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  <span className="text-xl leading-none">&times;</span>
                </button>
              </div>

              {/* Form crear nuevo rubro */}
              <form onSubmit={crearRubro} className="mb-6 space-y-3">
                <div className="flex gap-2">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-2xl flex-shrink-0">
                    {rubroEmoji || '📦'}
                  </div>
                  <input type="text" value={rubroNombre} onChange={(e) => setRubroNombre(e.target.value)} placeholder="Nombre del nuevo rubro..." className={inp} required />
                  <button type="submit" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 flex-shrink-0">Agregar</button>
                </div>
                {/* Selector de emojis para rubro nuevo */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Elegir emoji</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJIS_KIOSKO.map(em => (
                      <button
                        key={em} type="button"
                        onClick={() => setRubroEmoji(rubroEmoji === em ? '' : em)}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all ${rubroEmoji === em ? 'ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-900/40 scale-110' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        title={em}
                      >{em}</button>
                    ))}
                  </div>
                </div>
              </form>

              {/* Lista de rubros existentes */}
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                  <tbody>
                    {rubrosLista.map(r => (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-3 w-10 text-center text-xl">{r.emoji || '📦'}</td>
                        <td className="px-2 py-3">
                          {rubroEditId === r.id ? (
                            <div className="space-y-2">
                              <input type="text" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 outline-none" value={rubroEditNombre} onChange={(e) => setRubroEditNombre(e.target.value)} autoFocus />
                              <div className="flex flex-wrap gap-1">
                                {EMOJIS_KIOSKO.map(em => (
                                  <button
                                    key={em} type="button"
                                    onClick={() => setRubroEditEmoji(rubroEditEmoji === em ? '' : em)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-all ${rubroEditEmoji === em ? 'ring-2 ring-violet-500 bg-violet-50 dark:bg-violet-900/40 scale-110' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                  >{em}</button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-800 dark:text-slate-200">{r.nombre}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rubroEditId === r.id ? (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={guardarEdicionRubro} className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-xs">Guardar</button>
                              <button type="button" onClick={() => { setRubroEditId(null); setRubroEditEmoji(''); }} className="text-slate-500 dark:text-slate-400 hover:underline text-xs">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => { setRubroEditId(r.id); setRubroEditNombre(r.nombre); setRubroEditEmoji(r.emoji || ''); }} className="text-violet-600 dark:text-violet-400 hover:text-violet-800 text-sm" title="Editar">✏️</button>
                              <button type="button" onClick={() => eliminarRubro(r.id)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 text-sm" title="Eliminar">🗑️</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rubrosLista.length === 0 && (
                      <tr><td colSpan="3" className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">No hay rubros creados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Modal Editar Producto */}
      {modalEditarProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-3xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar Producto</h3>
              <button type="button" onClick={() => setModalEditarProd(null)} className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={guardarEdicionProducto} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Información básica */}
              <div className="md:col-span-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Información Básica</h4>
              </div>
              <div>
                <label className={lbl}>Código de Barras *</label>
                <input type="text" className={inp} value={prodEditDatos.codigo_barras || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, codigo_barras: e.target.value})} required />
              </div>
              <div>
                <label className={lbl}>Nombre *</label>
                <input type="text" className={inp} value={prodEditDatos.nombre || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, nombre: e.target.value})} required />
              </div>
              <div>
                <label className={lbl}>Marca</label>
                <input type="text" className={inp} value={prodEditDatos.marca || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, marca: e.target.value})} />
              </div>
              <div>
                <label className={lbl}>Rubro</label>
                <select className={inp} value={prodEditDatos.rubro || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, rubro: e.target.value})}>
                  <option value="">Sin Categoría</option>
                  {rubrosLista.map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
                </select>
              </div>

              {/* Precios */}
              <div className="md:col-span-2 mt-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Precios y Costo</h4>
              </div>
              <div>
                <label className={lbl}>Costo ($) *</label>
                <input type="number" step="0.01" className={inp} value={prodEditDatos.costo || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, costo: e.target.value})} required />
              </div>
              <div>
                <label className={lbl}>Precio Venta ($) *</label>
                <input type="number" step="0.01" className={inp} value={prodEditDatos.precio_venta || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, precio_venta: e.target.value})} required />
              </div>
              <div>
                <label className={lbl}>Margen de Ganancia (%)</label>
                <input type="number" step="0.1" className={inp} 
                  value={prodEditDatos.margen_ganancia != null ? prodEditDatos.margen_ganancia : calcularMargen(prodEditDatos.costo, prodEditDatos.precio_venta)} 
                  onChange={(e) => setProdEditDatos({...prodEditDatos, margen_ganancia: e.target.value})} placeholder="Auto calculado" />
              </div>
              <div>
                <label className={lbl}>IVA (%)</label>
                <select className={inp} value={prodEditDatos.iva_porcentaje ?? 21} onChange={(e) => setProdEditDatos({...prodEditDatos, iva_porcentaje: e.target.value})}>
                  <option value="0">0% — Exento</option>
                  <option value="10.5">10.5%</option>
                  <option value="21">21% — General</option>
                  <option value="27">27%</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Stock</label>
                <input type="number" className={inp} value={prodEditDatos.stock || 0} onChange={(e) => setProdEditDatos({...prodEditDatos, stock: e.target.value})} required />
              </div>

              {/* Proveedor y códigos */}
              <div className="md:col-span-2 mt-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Proveedor y Códigos</h4>
              </div>
              <div>
                <label className={lbl}>Proveedor</label>
                <select className={inp} value={prodEditDatos.proveedor_id || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, proveedor_id: e.target.value})}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(prov => <option key={prov.id} value={prov.id}>{prov.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Código de Proveedor (externo)</label>
                <input type="text" className={inp} value={prodEditDatos.codigo_proveedor_externo || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, codigo_proveedor_externo: e.target.value})} placeholder="Ej: PROV-001" />
              </div>
              <div>
                <label className={lbl}>Código Secundario</label>
                <input type="text" className={inp} value={prodEditDatos.codigo_secundario || ''} onChange={(e) => setProdEditDatos({...prodEditDatos, codigo_secundario: e.target.value})} />
              </div>
              {prodEditDatos.fecha_actualizacion_costo && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Últ. Actualización de Costo</label>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 py-2">
                    {new Date(prodEditDatos.fecha_actualizacion_costo).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}

              <div className="col-span-full mt-4 flex justify-end gap-3">
                {/* BUG#6 FIX — usar cerrarModalEdicion() para resetear savingEdit siempre */}
                <button type="button" onClick={cerrarModalEdicion} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
                <button type="submit" disabled={savingEdit} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.30)' }}>
                  {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kardex de Producto */}
      {modalKardex && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white dark:bg-slate-800 p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[85vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <History className="text-indigo-600 dark:text-indigo-400" size={20} /> Kardex: {modalKardex.nombre}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Historial de entradas y salidas de stock para este producto.</p>
              </div>
              <button type="button" onClick={() => setModalKardex(null)} className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
                <X size={18} />
              </button>
            </div>

            {loadingKardex ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">Cargando kardex...</div>
            ) : kardexMovimientos.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                Sin movimientos registrados aún para este producto.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-750 text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5 text-right">Cant.</th>
                      <th className="px-4 py-2.5 text-right">P. Unit.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {kardexMovimientos.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">{formatDate(m.fecha)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            m.tipo === 'ingreso' || m.tipo === 'compra' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          }`}>
                            {m.tipo || 'Venta'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{m.cantidad} u.</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(m.precio_unitario || m.costo || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


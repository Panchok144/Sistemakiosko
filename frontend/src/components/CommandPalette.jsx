import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Command, LayoutDashboard, ShoppingCart, Package, Users, Box, CreditCard,
  FileSpreadsheet, RotateCcw, Briefcase, ShoppingBag, Truck, TrendingDown,
  Receipt, FileText, BarChart3, Settings, X, Tag,
} from 'lucide-react';
import apiClient from '../apiClient';
import { formatCurrency } from '../utils/formatters';

// ── Módulos del sistema ───────────────────────────────────────────────────────
const MODULES = [
  { name: 'Inicio',               path: '/',                icon: <LayoutDashboard size={16} /> },
  { name: 'Punto de Venta',       path: '/ventas',          icon: <ShoppingCart size={16} /> },
  { name: 'Gestión de Caja',      path: '/caja',            icon: <Box size={16} /> },
  { name: 'Inventario & Stock',   path: '/inventario',      icon: <Package size={16} /> },
  { name: 'Clientes',             path: '/clientes',        icon: <Users size={16} /> },
  { name: 'Cuenta Corriente',     path: '/cuenta-corriente',icon: <CreditCard size={16} /> },
  { name: 'Presupuestos',         path: '/presupuestos',    icon: <FileSpreadsheet size={16} /> },
  { name: 'Devoluciones',         path: '/devoluciones',    icon: <RotateCcw size={16} /> },
  { name: 'Proveedores',          path: '/proveedores',     icon: <Briefcase size={16} /> },
  { name: 'Facturas de Compra',   path: '/facturas-compra', icon: <ShoppingBag size={16} /> },
  { name: 'Órdenes de Compra',    path: '/ordenes-compra',  icon: <Truck size={16} /> },
  { name: 'Gastos Operativos',    path: '/gastos',          icon: <TrendingDown size={16} /> },
  { name: 'Listas & Volumen',     path: '/listas-precios',  icon: <Tag size={16} /> },
  { name: 'Remitos',              path: '/remitos',         icon: <Receipt size={16} /> },
  { name: 'Recibos',              path: '/recibos',         icon: <FileText size={16} /> },
  { name: 'Reportes & Analytics', path: '/reportes',        icon: <BarChart3 size={16} /> },
  { name: 'Configuración',        path: '/configuracion',   icon: <Settings size={16} /> },
];

// Construye la lista plana de resultados navegables (para ↑↓ con índice global)
function buildResults({ filteredModules, filteredProductos, filteredClientes }) {
  const items = [];
  filteredModules.forEach(m => items.push({ type: 'module', data: m }));
  filteredProductos.forEach(p => items.push({ type: 'product', data: p }));
  filteredClientes.forEach(c => items.push({ type: 'client', data: c }));
  return items;
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── Abrir/cerrar con Ctrl+K / Escape ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ── Cargar datos al abrir ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      apiClient.get('/api/productos').then(res => setProductos(Array.isArray(res.data) ? res.data : [])).catch(() => {});
      apiClient.get('/api/clientes').then(res => setClientes(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    } else {
      setQuery('');
      setSelectedIdx(0);
    }
  }, [isOpen]);

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const q = query.toLowerCase().trim();
  const filteredModules   = MODULES.filter(m => !q || m.name.toLowerCase().includes(q));
  const filteredProductos = productos.filter(p =>
    p.nombre?.toLowerCase().includes(q) ||
    (p.codigo_barras && p.codigo_barras.toString().includes(q))
  ).slice(0, 5);
  const filteredClientes  = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(q) ||
    (c.documento && c.documento.includes(q)) ||
    (c.cuit && c.cuit.includes(q))
  ).slice(0, 5);

  const allItems = buildResults({ filteredModules, filteredProductos, filteredClientes });
  const totalItems = allItems.length;

  // ── Resetear índice al cambiar query ──────────────────────────────────────
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // ── Navegación por teclado ────────────────────────────────────────────────
  const handleKeyboardNav = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => (prev + 1) % Math.max(totalItems, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => (prev - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
    } else if (e.key === 'Enter' && totalItems > 0) {
      e.preventDefault();
      const item = allItems[selectedIdx];
      if (item) executeItem(item);
    }
  }, [isOpen, totalItems, selectedIdx, allItems]); // eslint-disable-line

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardNav);
    return () => window.removeEventListener('keydown', handleKeyboardNav);
  }, [handleKeyboardNav]);

  // Hacer scroll automático al ítem seleccionado
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // ── Ejecutar acción según tipo de ítem ────────────────────────────────────
  const executeItem = (item) => {
    if (item.type === 'module') {
      navigate(item.data.path);
    } else if (item.type === 'product') {
      navigate('/inventario');
    } else if (item.type === 'client') {
      navigate('/clientes');
    }
    setIsOpen(false);
  };

  // ── Índice global para cada ítem renderizado ──────────────────────────────
  let globalIdx = 0;
  const getItemProps = (idx) => {
    const isSel = idx === selectedIdx;
    return {
      'data-selected': isSel,
      onMouseEnter: () => setSelectedIdx(idx),
      style: isSel
        ? { background: 'rgba(124,58,237,0.12)', borderRadius: '10px' }
        : {},
    };
  };

  if (!isOpen) return null;

  const isEmpty = filteredModules.length === 0 && filteredProductos.length === 0 && filteredClientes.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-4"
      style={{ background: 'rgba(15,12,41,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: 'var(--surface-card, #fff)',
          border: '1px solid var(--surface-border)',
          maxHeight: 'min(80vh, 520px)',
          animation: 'dropdownFadeIn 0.15s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Input ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
          <Search size={20} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Módulo, producto, cliente o código de barras..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-xl p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Resultados ──────────────────────────────────────────────── */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3 text-xs">

          {/* Módulos */}
          {filteredModules.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Módulos del Sistema
              </p>
              <div className="space-y-0.5">
                {filteredModules.map(m => {
                  const idx = globalIdx++;
                  return (
                    <button
                      key={m.path}
                      onClick={() => executeItem({ type: 'module', data: m })}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 transition-all text-left font-bold"
                      {...getItemProps(idx)}
                    >
                      <span className="text-slate-400 dark:text-slate-400 flex-shrink-0">{m.icon}</span>
                      <span className="flex-1">{m.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">Ir →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Productos */}
          {filteredProductos.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Productos
              </p>
              <div className="space-y-0.5">
                {filteredProductos.map(p => {
                  const idx = globalIdx++;
                  return (
                    <button
                      key={p.id}
                      onClick={() => executeItem({ type: 'product', data: p })}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 transition-all text-left"
                      {...getItemProps(idx)}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.nombre}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {p.codigo_barras && `Cód: ${p.codigo_barras}`}
                          {p.codigo_barras && p.rubro && ' · '}
                          {p.rubro}
                          {' · '}
                          Stock: <span className={p.stock <= 0 ? 'text-red-500' : p.stock <= 5 ? 'text-amber-500' : ''}>{p.stock}</span>
                        </p>
                      </div>
                      <span className="font-black text-indigo-600 dark:text-indigo-400 flex-shrink-0 ml-3 tabular-nums">
                        {formatCurrency(p.precio_venta)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clientes */}
          {filteredClientes.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Clientes
              </p>
              <div className="space-y-0.5">
                {filteredClientes.map(c => {
                  const idx = globalIdx++;
                  return (
                    <button
                      key={c.id}
                      onClick={() => executeItem({ type: 'client', data: c })}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 transition-all text-left"
                      {...getItemProps(idx)}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{c.nombre}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {c.documento || c.cuit || 'Sin CUIT'}
                          {c.saldo_pendiente > 0 && (
                            <span className="text-rose-500 ml-2">Saldo: {formatCurrency(c.saldo_pendiente)}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold flex-shrink-0 ml-3">Ver ficha →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEmpty && (
            <div className="py-10 text-center">
              <Search size={28} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {query ? `Sin resultados para "${query}"` : 'Escribí para buscar'}
              </p>
              {query && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Probá con el nombre, código de barras o módulo
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 font-medium"
          style={{ background: 'rgba(0,0,0,0.02)' }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-bold text-slate-700 dark:text-slate-200 shadow-sm text-[10px]">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-bold text-slate-700 dark:text-slate-200 shadow-sm text-[10px]">Enter</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-bold text-slate-700 dark:text-slate-200 shadow-sm text-[10px]">Esc</kbd>
              cerrar
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
            <Command size={12} /> Paleta de Comandos KioskoPro
          </div>
        </div>
      </div>
    </div>
  );
}

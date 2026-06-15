import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Command, LayoutDashboard, ShoppingCart, Package, Users, Box, CreditCard, FileSpreadsheet, RotateCcw, Briefcase, ShoppingBag, Truck, TrendingDown, Receipt, FileText, BarChart3, Settings, X } from 'lucide-react';
import apiClient from '../apiClient';
import { formatCurrency } from '../utils/formatters';

const MODULES = [
  { name: 'Inicio', path: '/', icon: <LayoutDashboard size={16} /> },
  { name: 'Punto de Venta', path: '/ventas', icon: <ShoppingCart size={16} /> },
  { name: 'Caja', path: '/caja', icon: <Box size={16} /> },
  { name: 'Inventario', path: '/inventario', icon: <Package size={16} /> },
  { name: 'Clientes', path: '/clientes', icon: <Users size={16} /> },
  { name: 'Cuenta Corriente', path: '/cuenta-corriente', icon: <CreditCard size={16} /> },
  { name: 'Presupuestos', path: '/presupuestos', icon: <FileSpreadsheet size={16} /> },
  { name: 'Devoluciones', path: '/devoluciones', icon: <RotateCcw size={16} /> },
  { name: 'Proveedores', path: '/proveedores', icon: <Briefcase size={16} /> },
  { name: 'Facturas de Compra', path: '/facturas-compra', icon: <ShoppingBag size={16} /> },
  { name: 'Órdenes de Compra', path: '/ordenes-compra', icon: <Truck size={16} /> },
  { name: 'Gastos Operativos', path: '/gastos', icon: <TrendingDown size={16} /> },
  { name: 'Remitos', path: '/remitos', icon: <Receipt size={16} /> },
  { name: 'Recibos', path: '/recibos', icon: <FileText size={16} /> },
  { name: 'Reportes & Analytics', path: '/reportes', icon: <BarChart3 size={16} /> },
  { name: 'Configuración', path: '/configuracion', icon: <Settings size={16} /> },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Escuchar Ctrl+K / Cmd+K
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

  // Cargar datos al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      apiClient.get('/api/productos').then(res => setProductos(Array.isArray(res.data) ? res.data : [])).catch(() => {});
      apiClient.get('/api/clientes').then(res => setClientes(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredModules = MODULES.filter(m => m.name.toLowerCase().includes(q));
  const filteredProductos = productos.filter(p =>
    p.nombre.toLowerCase().includes(q) ||
    (p.codigo_barras && p.codigo_barras.toString().includes(q))
  ).slice(0, 5);
  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(q) ||
    (c.documento && c.documento.includes(q))
  ).slice(0, 5);

  const handleSelectModule = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleSelectProduct = (prod) => {
    navigate('/inventario');
    setIsOpen(false);
  };

  const handleSelectClient = (client) => {
    navigate('/clientes');
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header con Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
          <Search size={20} className="text-slate-400 dark:text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Escribí un comando, módulo, producto o cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button onClick={() => setIsOpen(false)} className="rounded-xl p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4 text-xs">
          {/* Módulos */}
          {filteredModules.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Módulos</p>
              <div className="space-y-0.5">
                {filteredModules.map((m) => (
                  <button
                    key={m.path}
                    onClick={() => handleSelectModule(m.path)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all text-left font-bold"
                  >
                    <span className="text-slate-400 dark:text-slate-400">{m.icon}</span>
                    <span className="flex-1">{m.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Ir a →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Productos */}
          {filteredProductos.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Productos</p>
              <div className="space-y-0.5">
                {filteredProductos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-all text-left"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{p.nombre}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Cod: {p.codigo_barras} • Stock: {p.stock}</p>
                    </div>
                    <span className="font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(p.precio_venta)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clientes */}
          {filteredClientes.length > 0 && (
            <div>
              <p className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Clientes</p>
              <div className="space-y-0.5">
                {filteredClientes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-all text-left"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{c.nombre}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{c.documento || c.cuit || 'Sin CUIT'}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold">Ver ficha →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredModules.length === 0 && filteredProductos.length === 0 && filteredClientes.length === 0 && (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400">
              No se encontraron resultados para "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-750 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <div className="flex items-center gap-2">
            <kbd className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-bold text-slate-700 dark:text-slate-200 shadow-2xs">Esc</kbd> para cerrar
          </div>
          <div className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
            <Command size={12} /> Paleta de Comandos KioskoPro
          </div>
        </div>
      </div>
    </div>
  );
}

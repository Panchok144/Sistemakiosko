import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  Zap, Home, Search, Bell, Sun, Moon, LogOut, ChevronRight,
  AlertTriangle, AlertCircle, Info, CheckCircle, Trash2,
  Box, ShoppingCart, Package, Users, CreditCard, FileSpreadsheet,
  RotateCcw, Briefcase, ShoppingBag, Truck, TrendingDown,
  Receipt, FileText, BarChart3, Settings, ShieldCheck, Tag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import apiClient from '../apiClient';

// ── Mapa de rutas a nombre legible ────────────────────────────────────────
const ROUTE_LABELS = {
  '/':                  { label: 'Panel Principal',       icon: Home },
  '/ventas':            { label: 'Punto de Venta',        icon: ShoppingCart },
  '/caja':              { label: 'Gestión de Caja',       icon: Box },
  '/inventario':        { label: 'Inventario & Stock',    icon: Package },
  '/clientes':          { label: 'Clientes',              icon: Users },
  '/cuenta-corriente':  { label: 'Cuenta Corriente',      icon: CreditCard },
  '/presupuestos':      { label: 'Presupuestos',          icon: FileSpreadsheet },
  '/devoluciones':      { label: 'Devoluciones',          icon: RotateCcw },
  '/proveedores':       { label: 'Proveedores',           icon: Briefcase },
  '/facturas-compra':   { label: 'Facturas de Compra',    icon: ShoppingBag },
  '/ordenes-compra':    { label: 'Órdenes de Compra',     icon: Truck },
  '/gastos':            { label: 'Gastos Operativos',     icon: TrendingDown },
  '/remitos':           { label: 'Remitos',               icon: Receipt },
  '/recibos':           { label: 'Recibos',               icon: FileText },
  '/reportes':          { label: 'Reportes & Analytics',  icon: BarChart3 },
  '/configuracion':     { label: 'Configuración',         icon: Settings },
  '/licencias':         { label: 'Licencias',             icon: ShieldCheck },
  '/listas-precios':    { label: 'Listas & Volumen',      icon: Tag },
  '/historial':         { label: 'Historial de Ventas',   icon: Receipt },
};

// ── Componente de Campana de Notificaciones ────────────────────────────────
function NotificationBell() {
  const navigate = useNavigate();
  const [alertData, setAlertData] = useState({ total: 0, alertas: [] });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef(null);
  const hoverTimerRef = useRef(null);

  const cargarAlertas = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/alertas');
      setAlertData(res.data || { total: 0, alertas: [] });
      setDismissed(false);
    } catch {}
  }, []);

  useEffect(() => {
    cargarAlertas();
    const interval = setInterval(cargarAlertas, 60000);
    return () => clearInterval(interval);
  }, [cargarAlertas]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const totalVisible = dismissed ? 0 : (alertData.total || 0);
  const hayAltasOCriticas = alertData.alertas.some(a => a.urgencia === 'alta' || a.urgencia === 'critica');

  const handleMouseEnter = () => {
    clearTimeout(hoverTimerRef.current);
    if (!dismissed && alertData.alertas.length > 0) setOpen(true);
  };
  const handleMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => setOpen(false), 300);
  };

  const urgencyConfig = {
    critica: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.30)', Icon: AlertCircle, label: 'Crítica' },
    alta:    { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.30)', Icon: AlertTriangle, label: 'Alta' },
    media:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', Icon: Info, label: 'Media' },
    baja:    { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', Icon: CheckCircle, label: 'Baja' },
  };

  const handleAlertClick = (alerta, item = null) => {
    setOpen(false);
    const baseUrl = alerta.accion_url || '/inventario';
    if (item && baseUrl === '/inventario') {
      const params = new URLSearchParams();
      if (item.rubro) params.set('rubro', item.rubro);
      if (item.nombre) params.set('busqueda', item.nombre);
      navigate(`${baseUrl}?${params.toString()}`);
    } else if (baseUrl === '/inventario' && alerta.items?.length > 0) {
      const rubros = [...new Set(alerta.items.map(i => i.rubro).filter(Boolean))];
      const params = new URLSearchParams();
      if (rubros.length === 1) params.set('rubro', rubros[0]);
      navigate(`${baseUrl}?${params.toString()}`);
    } else {
      navigate(baseUrl);
    }
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    setDismissed(true);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setOpen(prev => !prev)}
        title={totalVisible > 0 ? `${totalVisible} alerta(s) activa(s)` : 'Sin alertas activas'}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all"
        style={{
          color: totalVisible > 0 ? (hayAltasOCriticas ? '#f87171' : '#f59e0b') : 'rgba(148,163,184,0.7)',
          background: open ? 'rgba(124,58,237,0.12)' : 'transparent',
        }}
      >
        <Bell size={16} style={{ animation: (totalVisible > 0 && hayAltasOCriticas) ? 'bellRing 2s ease-in-out infinite' : 'none' }} />
        {totalVisible > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white"
            style={{ background: hayAltasOCriticas ? '#ef4444' : '#f59e0b' }}
          >
            {totalVisible > 9 ? '9+' : totalVisible}
          </span>
        )}
      </button>

      {open && !dismissed && alertData.alertas.length > 0 && (
        <div
          className="absolute top-full right-0 mt-2 z-50"
          style={{
            width: '300px',
            background: '#1c1c1c',
            border: '1px solid #333333',
            borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.04)',
            animation: 'dropdownFadeIn 0.18s ease-out',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2e2e2e' }}>
            <div className="flex items-center gap-2">
              <Bell size={13} style={{ color: '#a78bfa' }} />
              <span className="text-xs font-black text-white tracking-wide">Notificaciones</span>
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black" style={{ background: hayAltasOCriticas ? '#ef4444' : '#f59e0b', color: '#fff' }}>
                {totalVisible}
              </span>
            </div>
            <button onClick={handleClearAll} title="Limpiar todas" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hover:bg-white/10" style={{ color: 'rgba(196,181,253,0.60)' }}>
              <Trash2 size={10} />Limpiar
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
            {alertData.alertas.map((alerta, idx) => {
              const cfg = urgencyConfig[alerta.urgencia] || urgencyConfig.media;
              const UrgIcon = cfg.Icon;
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(124,58,237,0.10)' }}>
                  <button onClick={() => handleAlertClick(alerta)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-all hover:bg-white/5">
                    <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg mt-0.5" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <UrgIcon size={13} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold truncate" style={{ color: '#e5e7eb' }}>{alerta.titulo}</p>
                        <span className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                      </div>
                      <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'rgba(196,181,253,0.65)' }}>{alerta.descripcion}</p>
                    </div>
                    <ChevronRight size={12} className="flex-shrink-0 mt-1" style={{ color: 'rgba(124,58,237,0.50)' }} />
                  </button>
                  {alerta.items && alerta.items.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.20)' }}>
                      {alerta.items.slice(0, 5).map((item) => (
                        <button key={item.id} onClick={() => handleAlertClick(alerta, item)} className="flex w-full items-center gap-3 px-5 py-2 text-left transition-all hover:bg-white/5">
                          <div className="flex-shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold truncate" style={{ color: '#d1d5db' }}>{item.nombre}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.rubro && <span className="text-[9px]" style={{ color: 'rgba(167,139,250,0.60)' }}>{item.rubro}</span>}
                              {item.stock !== undefined && (
                                <span className="text-[9px] font-bold" style={{ color: item.stock === 0 ? '#ef4444' : cfg.color }}>
                                  Stock: {item.stock}{item.stock_minimo > 0 && ` / mín. ${item.stock_minimo}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={10} className="flex-shrink-0" style={{ color: 'rgba(124,58,237,0.40)' }} />
                        </button>
                      ))}
                      {alerta.items.length > 5 && (
                        <button onClick={() => handleAlertClick(alerta)} className="flex w-full items-center justify-center gap-1 py-1.5 text-[10px] font-semibold transition-all hover:bg-white/5" style={{ color: '#a78bfa' }}>
                          Ver {alerta.items.length - 5} más...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(124,58,237,0.15)' }}>
            <button onClick={() => { navigate('/inventario'); setOpen(false); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold transition-all hover:bg-violet-500/15" style={{ color: '#a78bfa' }}>
              Ver todo en Inventario <ChevronRight size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente de estado de Caja ───────────────────────────────────────────
function CajaIndicator() {
  const navigate = useNavigate();
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    apiClient.get('/api/ventas/caja-estado')
      .then(res => { setCajaAbierta(res.data.caja); setChecked(true); })
      .catch(() => setChecked(true));

    const interval = setInterval(() => {
      apiClient.get('/api/ventas/caja-estado')
        .then(res => setCajaAbierta(res.data.caja))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!checked) return null;

  return (
    <button
      onClick={() => navigate('/caja')}
      title={cajaAbierta ? 'Caja abierta — Click para gestionar' : 'Caja cerrada — Click para abrir'}
      className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all"
      style={{
        background: cajaAbierta ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
        border: `1px solid ${cajaAbierta ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.25)'}`,
        color: cajaAbierta ? '#10b981' : '#ef4444',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ background: cajaAbierta ? '#10b981' : '#ef4444', animation: cajaAbierta ? 'pulse 2s ease-in-out infinite' : 'none' }}
      />
      <Box size={11} />
      {cajaAbierta ? 'Caja Abierta' : 'Caja Cerrada'}
    </button>
  );
}

// ── Avatar Dropdown ────────────────────────────────────────────────────────
function UserMenu({ user, logout, theme, toggleTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = (user?.nombre || user?.nombre_usuario || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold transition-all hover:bg-white/8"
        style={{ border: '1px solid transparent' }}
      >
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #f59e0b)' }}
        >
          {initials}
        </div>
        <div className="hidden sm:block text-left leading-none">
          <p className="text-[11px] font-bold truncate max-w-[80px] text-white">{user?.nombre || user?.nombre_usuario}</p>
          <p className="text-[10px] capitalize" style={{ color: '#a78bfa' }}>{user?.rol}</p>
        </div>
        <ChevronRight size={12} className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'rgba(148,163,184,0.5)' }} />
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 z-50 w-52"
          style={{
            background: '#1c1c1c',
            border: '1px solid #333333',
            borderRadius: '14px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.70)',
            animation: 'dropdownFadeIn 0.15s ease-out',
          }}
        >
          {/* Info usuario */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #2e2e2e' }}>
            <p className="text-xs font-bold text-white truncate">{user?.nombre || user?.nombre_usuario}</p>
            <p className="text-[10px] capitalize mt-0.5" style={{ color: '#a78bfa' }}>{user?.rol}</p>
          </div>

          {/* Toggle Tema */}
          <div className="p-2">
            <button
              onClick={() => { toggleTheme(); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:bg-white/8"
              style={{ color: 'rgba(196,181,253,0.80)' }}
            >
              {theme === 'dark'
                ? <Moon size={14} style={{ color: '#fbbf24' }} />
                : <Sun size={14} style={{ color: '#f59e0b' }} />
              }
              Modo {theme === 'dark' ? 'Oscuro' : 'Claro'}
            </button>

            {/* Logout */}
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:bg-rose-500/12 mt-0.5"
              style={{ color: '#f87171' }}
            >
              <LogOut size={14} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TopBar principal ───────────────────────────────────────────────────────
export default function TopBar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolver nombre e ícono del módulo activo
  const activeRoute = Object.entries(ROUTE_LABELS).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  );
  const activeLabel = activeRoute?.[1]?.label || 'Sistema';
  const ActiveIcon = activeRoute?.[1]?.icon || Home;

  const triggerCommandPalette = () => {
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    window.dispatchEvent(event);
  };

  const esInicio = location.pathname === '/';

  return (
    <header
      className="flex items-center gap-3 px-4 h-14 flex-shrink-0 relative z-30"
      style={{
        background: 'linear-gradient(90deg, #171717 0%, #111111 60%, #0d0d0d 100%)',
        borderBottom: '1px solid #2e2e2e',
        boxShadow: '0 1px 12px rgba(0,0,0,0.50)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <NavLink to="/" className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 3px 12px rgba(124,58,237,0.40)' }}
          >
            <Zap size={15} className="fill-current" />
          </div>
          <span className="hidden sm:block text-sm font-black tracking-widest text-white">
            KIOSKO<span style={{ color: '#a78bfa' }}>PRO</span>
          </span>
        </NavLink>
      </div>

      {/* Separador */}
      <div className="h-5 w-px flex-shrink-0" style={{ background: 'rgba(124,58,237,0.25)' }} />

      {/* Módulo activo (breadcrumb) + botón Inicio */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {!esInicio && (
          <>
            <button
              onClick={() => navigate('/')}
              className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:bg-white/8 flex-shrink-0"
              style={{ color: 'rgba(167,139,250,0.70)' }}
              title="Volver al Panel Principal"
            >
              <Home size={12} />
              <span>Inicio</span>
            </button>
            <ChevronRight size={13} className="flex-shrink-0 hidden sm:block" style={{ color: 'rgba(124,58,237,0.40)' }} />
          </>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <ActiveIcon size={15} style={{ color: '#a78bfa', flexShrink: 0 }} />
          <span className="text-sm font-bold truncate text-white">{activeLabel}</span>
        </div>
      </div>

      {/* Acciones del lado derecho */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Indicador de Caja */}
        <CajaIndicator />

        {/* Buscador (abre Command Palette) */}
        <button
          onClick={triggerCommandPalette}
          title="Buscar (Ctrl+K)"
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition-all"
          style={{
            background: 'rgba(124,58,237,0.10)',
            border: '1px solid rgba(124,58,237,0.22)',
            color: 'rgba(196,181,253,0.75)',
          }}
        >
          <Search size={13} style={{ color: '#a78bfa' }} />
          <span className="hidden md:block font-medium">Buscar...</span>
          <kbd
            className="hidden md:block rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: 'rgba(124,58,237,0.22)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.25)' }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Campana de notificaciones */}
        <NotificationBell />

        {/* Avatar + menú */}
        <UserMenu user={user} logout={logout} theme={theme} toggleTheme={toggleTheme} />
      </div>
    </header>
  );
}

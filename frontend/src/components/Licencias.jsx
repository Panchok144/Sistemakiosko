import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../apiClient';
import Swal from 'sweetalert2';
import {
  ShieldCheck, Crown, Zap, Star, Calendar, Users, Package, Building2,
  Key, CheckCircle2, XCircle, AlertTriangle, Loader2, Copy, RefreshCw,
  ArrowRight, Lock,
} from 'lucide-react';
import { formatDate } from '../utils/formatters';

const PLANES = {
  demo: {
    nombre: 'Demo',
    color: '#64748b',
    bg: 'rgba(100,116,139,0.12)',
    icon: Zap,
    descripcion: 'Período de prueba gratuito',
  },
  basico: {
    nombre: 'Básico',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    icon: Star,
    descripcion: 'Para negocios pequeños',
    precio: '$15 USD/mes',
  },
  profesional: {
    nombre: 'Profesional',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.12)',
    icon: Crown,
    descripcion: 'El más popular para comercios',
    precio: '$35 USD/mes',
  },
  enterprise: {
    nombre: 'Enterprise',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    icon: Building2,
    descripcion: 'Múltiples sucursales y usuarios',
    precio: '$70 USD/mes',
  },
};

const PLANES_FEATURES = [
  { key: 'Productos', basico: '500', profesional: 'Ilimitados', enterprise: 'Ilimitados' },
  { key: 'Usuarios', basico: '2', profesional: '5', enterprise: 'Ilimitados' },
  { key: 'Sucursales', basico: '1', profesional: '3', enterprise: 'Ilimitadas' },
  { key: 'Facturación AFIP', basico: '✅', profesional: '✅', enterprise: '✅' },
  { key: 'Cuenta Corriente', basico: '✅', profesional: '✅', enterprise: '✅' },
  { key: 'Multi-sucursal', basico: '❌', profesional: '✅', enterprise: '✅' },
  { key: 'Comisiones vendedor', basico: '❌', profesional: '✅', enterprise: '✅' },
  { key: 'API REST', basico: '❌', profesional: '❌', enterprise: '✅' },
  { key: 'Soporte', basico: 'Email', profesional: 'WhatsApp', enterprise: 'Prioritario' },
  { key: 'Backup', basico: 'Manual', profesional: 'Diario', enterprise: 'Horario' },
];

function LicenciaEstadoBadge({ licencia }) {
  if (!licencia || !licencia.activa) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <XCircle size={13} /> Sin licencia activa
      </span>
    );
  }
  if (licencia.vencida) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <XCircle size={13} /> Vencida
      </span>
    );
  }
  if (licencia.por_vencer) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <AlertTriangle size={13} /> Vence en {licencia.dias_restantes} días
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      <CheckCircle2 size={13} /> Activa
    </span>
  );
}

export default function Licencias() {
  const [licencia, setLicencia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activando, setActivando] = useState(false);
  const [claveInput, setClaveInput] = useState('');
  const [showActivar, setShowActivar] = useState(false);
  const [tab, setTab] = useState('estado'); // 'estado' | 'planes' | 'nueva'

  // Solo admin puede crear licencias
  const [isAdmin, setIsAdmin] = useState(false);
  const [nuevaLic, setNuevaLic] = useState({
    plan: 'basico',
    dias: 30,
    max_productos: 500,
    max_usuarios: 2,
    max_sucursales: 1,
    clave_activacion: '',
    notas: '',
  });
  const [creando, setCreando] = useState(false);

  const cargarLicencia = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/licencias');
      setLicencia(res.data);
    } catch {
      setLicencia(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarLicencia();
    // Verificar si es admin
    const token = localStorage.getItem('kiosko_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.rol === 'administrador');
      } catch {}
    }
  }, [cargarLicencia]);

  const activarLicencia = async (e) => {
    e.preventDefault();
    if (!claveInput.trim()) return;
    setActivando(true);
    try {
      await apiClient.post('/api/licencias/activar', { clave: claveInput.trim() });
      Swal.fire('¡Activado!', 'La licencia fue activada correctamente.', 'success');
      setClaveInput('');
      setShowActivar(false);
      cargarLicencia();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Clave inválida o expirada', 'error');
    } finally {
      setActivando(false);
    }
  };

  const generarClaveAleatoria = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bloques = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    );
    setNuevaLic(prev => ({ ...prev, clave_activacion: bloques.join('-') }));
  };

  const crearLicencia = async (e) => {
    e.preventDefault();
    setCreando(true);
    try {
      await apiClient.post('/api/licencias', nuevaLic);
      Swal.fire('Éxito', 'Licencia creada correctamente.', 'success');
      setNuevaLic({ plan: 'basico', dias: 30, max_productos: 500, max_usuarios: 2, max_sucursales: 1, clave_activacion: '', notas: '' });
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'No se pudo crear la licencia', 'error');
    } finally {
      setCreando(false);
    }
  };

  const copiarClave = (clave) => {
    navigator.clipboard.writeText(clave).then(() => {
      Swal.fire({ icon: 'success', title: 'Copiado', text: 'Clave copiada al portapapeles', timer: 1200, showConfirmButton: false });
    });
  };

  const plan = licencia?.plan ? PLANES[licencia.plan] : null;
  const PlanIcon = plan?.icon || ShieldCheck;

  const TABS = [
    { id: 'estado', label: 'Estado de Licencia' },
    { id: 'planes', label: 'Comparar Planes' },
    ...(isAdmin ? [{ id: 'nueva', label: 'Crear Licencia' }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Licencias</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Gestión de plan y activación del sistema.</p>
        </div>
        <button
          onClick={cargarLicencia}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)' }}
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Estado ──────────────────────────────────────────────────── */}
      {tab === 'estado' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Card principal de estado */}
          <div
            className="rounded-2xl p-6 shadow-sm"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={28} className="animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: plan?.bg || 'rgba(124,58,237,0.12)' }}
                    >
                      <PlanIcon size={26} style={{ color: plan?.color || '#7c3aed' }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Plan Actual</p>
                      <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                        {plan?.nombre || 'Sin licencia'}
                      </h2>
                    </div>
                  </div>
                  <LicenciaEstadoBadge licencia={licencia} />
                </div>

                {licencia && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-xl p-3" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Inicio</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatDate(licencia.fecha_inicio, false)}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Vencimiento</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {licencia.fecha_fin ? formatDate(licencia.fecha_fin, false) : 'Sin fecha'}
                      </p>
                    </div>
                  </div>
                )}

                {licencia && (
                  <div className="space-y-3 mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Límites del plan</p>
                    {[
                      { label: 'Productos', value: licencia.max_productos >= 99999 ? 'Ilimitados' : licencia.max_productos, icon: Package },
                      { label: 'Usuarios', value: licencia.max_usuarios >= 99 ? 'Ilimitados' : licencia.max_usuarios, icon: Users },
                      { label: 'Sucursales', value: licencia.max_sucursales >= 10 ? 'Ilimitadas' : licencia.max_sucursales, icon: Building2 },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Icon size={15} className="text-violet-400" />
                          {label}
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Activar clave */}
                {!showActivar ? (
                  <button
                    onClick={() => setShowActivar(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}
                  >
                    <Key size={16} />
                    Activar con clave de licencia
                  </button>
                ) : (
                  <form onSubmit={activarLicencia} className="space-y-3">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Ingresá tu clave de activación:</p>
                    <input
                      type="text"
                      value={claveInput}
                      onChange={e => setClaveInput(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      className="w-full rounded-xl px-4 py-3 text-sm font-mono tracking-widest outline-none transition"
                      style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                      maxLength={19}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={activando || !claveInput.trim()}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
                      >
                        {activando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Activar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowActivar(false)}
                        className="rounded-xl px-4 py-2.5 text-sm font-semibold"
                        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Card de información de contacto/soporte */}
          <div className="space-y-4">
            <div
              className="rounded-2xl p-6"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(59,130,246,0.08))', border: '1px solid rgba(124,58,237,0.20)' }}
            >
              <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <ShieldCheck size={18} className="text-violet-500" />
                ¿Necesitás renovar o mejorar tu plan?
              </h3>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>📱 Contactanos por <strong>WhatsApp</strong> para obtener una clave de activación.</p>
                <p>💳 Aceptamos <strong>Mercado Pago</strong>, transferencia bancaria y tarjetas.</p>
                <p>⚡ Activación <strong>inmediata</strong> una vez confirmado el pago.</p>
              </div>
              <a
                href="https://wa.me/?text=Hola!%20Quiero%20renovar%20mi%20licencia%20de%20KioskoPro"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: '#25D366' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Contactar por WhatsApp
              </a>
            </div>

            {/* Si está por vencer, mostrar alerta especial */}
            {licencia?.por_vencer && !licencia?.vencida && (
              <div className="rounded-2xl p-4 border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">Licencia por vencer</p>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Tu licencia vence en <strong>{licencia.dias_restantes} días</strong>. Renovala para no perder el acceso.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Comparar Planes ─────────────────────────────────────────── */}
      {tab === 'planes' && (
        <div
          className="rounded-2xl p-6 shadow-sm overflow-x-auto"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-6">Comparativa de Planes</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left pb-4 pr-4 text-xs font-bold uppercase tracking-wider text-slate-500">Característica</th>
                {['basico', 'profesional', 'enterprise'].map(planKey => {
                  const p = PLANES[planKey];
                  const Icon = p.icon;
                  const esPlanActual = licencia?.plan === planKey;
                  return (
                    <th key={planKey} className="pb-4 px-4 text-center min-w-[130px]">
                      <div className={`rounded-2xl p-3 ${esPlanActual ? 'ring-2 ring-violet-500' : ''}`} style={{ background: p.bg }}>
                        <Icon size={20} style={{ color: p.color }} className="mx-auto mb-1" />
                        <p className="font-black text-slate-900 dark:text-slate-100">{p.nombre}</p>
                        {p.precio && <p className="text-xs font-semibold" style={{ color: p.color }}>{p.precio}</p>}
                        {esPlanActual && (
                          <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">
                            Plan actual
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {PLANES_FEATURES.map(f => (
                <tr key={f.key}>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-300 font-medium">{f.key}</td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-900 dark:text-slate-100">{f.basico}</td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-900 dark:text-slate-100">{f.profesional}</td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-900 dark:text-slate-100">{f.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Crear Licencia (solo admin) ─────────────────────────────── */}
      {tab === 'nueva' && isAdmin && (
        <div
          className="rounded-2xl p-6 shadow-sm max-w-xl"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-6">Crear Nueva Licencia</h2>
          <form onSubmit={crearLicencia} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Plan</label>
                <select
                  value={nuevaLic.plan}
                  onChange={e => setNuevaLic(p => ({ ...p, plan: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                >
                  {Object.entries(PLANES).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Duración (días)</label>
                <input
                  type="number"
                  min={1}
                  value={nuevaLic.dias}
                  onChange={e => setNuevaLic(p => ({ ...p, dias: parseInt(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Máx. Productos</label>
                <input
                  type="number"
                  min={1}
                  value={nuevaLic.max_productos}
                  onChange={e => setNuevaLic(p => ({ ...p, max_productos: parseInt(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Máx. Usuarios</label>
                <input
                  type="number"
                  min={1}
                  value={nuevaLic.max_usuarios}
                  onChange={e => setNuevaLic(p => ({ ...p, max_usuarios: parseInt(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Clave de Activación</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaLic.clave_activacion}
                  onChange={e => setNuevaLic(p => ({ ...p, clave_activacion: e.target.value.toUpperCase() }))}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none"
                  style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
                  maxLength={19}
                />
                <button
                  type="button"
                  onClick={generarClaveAleatoria}
                  className="rounded-xl px-3 py-2.5 text-xs font-bold"
                  style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.25)' }}
                >
                  Generar
                </button>
                {nuevaLic.clave_activacion && (
                  <button
                    type="button"
                    onClick={() => copiarClave(nuevaLic.clave_activacion)}
                    title="Copiar clave"
                    className="rounded-xl px-3 py-2.5 text-xs"
                    style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)' }}
                  >
                    <Copy size={15} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Notas internas</label>
              <input
                type="text"
                value={nuevaLic.notas}
                onChange={e => setNuevaLic(p => ({ ...p, notas: e.target.value }))}
                placeholder="Cliente, comercio, referencia..."
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface-input)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)' }}
              />
            </div>

            <button
              type="submit"
              disabled={creando}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
            >
              {creando ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
              Crear Licencia
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

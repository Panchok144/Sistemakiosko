import { useState } from 'react'
import Swal from 'sweetalert2'
import { useAuth } from '../context/AuthContext.jsx'
import { Zap, ArrowRight, ShieldCheck, Package, BarChart3, Users } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [usuarioInput, setUsuarioInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [cargando, setCargando] = useState(false)

  const manejarLogin = async (e) => {
    e.preventDefault()
    setCargando(true)

    try {
      await login({ nombre_usuario: usuarioInput, password: passwordInput })
      setUsuarioInput('')
      setPasswordInput('')
    } catch (error) {
      Swal.fire('❌ Error', error.message || 'Credenciales incorrectas', 'error')
    } finally {
      setCargando(false)
    }
  }

  const features = [
    { icon: Package,  label: 'Inventario & Stock en tiempo real' },
    { icon: BarChart3, label: 'Reportes & Analytics avanzados' },
    { icon: Users,    label: 'Gestión de Clientes & Cuentas' },
  ]

  return (
    <div className="min-h-screen flex font-sans" style={{ background: '#09080f' }}>

      {/* ─── Panel izquierdo ─────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(145deg, #1a0d35 0%, #160b30 40%, #0d0820 100%)' }}
      >
        {/* Orbes decorativos */}
        <div
          className="absolute top-[-15%] left-[-15%] w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)', filter: 'blur(50px)' }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(91,33,182,0.18) 0%, transparent 70%)', filter: 'blur(30px)' }}
        />

        {/* Contenido central */}
        <div className="relative z-10 text-center text-white p-12 max-w-md animate-slide-up">
          {/* Logo grande */}
          <div
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl mb-8 shadow-brand-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(91,33,182,0.2))',
              border: '1px solid rgba(124,58,237,0.40)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Zap size={44} style={{ color: '#a78bfa' }} className="fill-current drop-shadow-lg" />
          </div>

          <h1 className="text-5xl font-black mb-2 tracking-tight">
            Kiosko<span style={{ color: '#a78bfa' }}>Pro</span>
          </h1>
          <p className="text-sm font-bold uppercase tracking-[0.25em] mb-6" style={{ color: 'rgba(167,139,250,0.60)' }}>
            Sistema Integral de Gestión
          </p>
          <p className="text-base leading-relaxed mb-10" style={{ color: 'rgba(196,181,253,0.70)' }}>
            Punto de Venta, Control de Inventario, Caja, Cuentas Corrientes y AFIP integrado en una sola plataforma.
          </p>

          {/* Features */}
          <div className="space-y-3 text-left">
            {features.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(124,58,237,0.22)', border: '1px solid rgba(124,58,237,0.30)' }}
                >
                  <Icon size={15} style={{ color: '#c4b5fd' }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: 'rgba(196,181,253,0.80)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Badge */}
          <div
            className="mt-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}
          >
            <ShieldCheck size={13} />
            Sistema Seguro & Rápido
          </div>
        </div>
      </div>

      {/* ─── Panel derecho — Formulario ──────────────────────────── */}
      <div
        className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12"
        style={{ background: 'linear-gradient(145deg, #0d0820 0%, #09080f 100%)' }}
      >
        <div className="w-full max-w-md animate-slide-up">

          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
            >
              <Zap size={28} className="fill-current text-white" />
            </div>
            <h2 className="text-2xl font-black text-white">KioskoPro</h2>
          </div>

          {/* Card del formulario */}
          <div
            className="rounded-3xl p-8 sm:p-10"
            style={{
              background: 'rgba(22,11,46,0.85)',
              border: '1px solid rgba(124,58,237,0.22)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.50), 0 0 0 1px rgba(124,58,237,0.10)',
            }}
          >
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                Iniciar Sesión
              </h2>
              <p className="text-sm font-medium" style={{ color: 'rgba(167,139,250,0.65)' }}>
                Ingresá tus credenciales para acceder al sistema.
              </p>
            </div>

            <form onSubmit={manejarLogin} className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(196,181,253,0.70)' }}>
                  Usuario
                </label>
                <input
                  type="text"
                  placeholder="admin"
                  value={usuarioInput}
                  onChange={(e) => setUsuarioInput(e.target.value)}
                  required
                  className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white placeholder-violet-700 outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(124,58,237,0.08)',
                    border: '1px solid rgba(124,58,237,0.25)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(124,58,237,0.65)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)';
                    e.target.style.background = 'rgba(124,58,237,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(124,58,237,0.25)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(124,58,237,0.08)';
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(196,181,253,0.70)' }}>
                  Contraseña
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  className="w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white placeholder-violet-700 outline-none transition-all duration-150"
                  style={{
                    background: 'rgba(124,58,237,0.08)',
                    border: '1px solid rgba(124,58,237,0.25)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(124,58,237,0.65)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)';
                    e.target.style.background = 'rgba(124,58,237,0.12)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(124,58,237,0.25)';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = 'rgba(124,58,237,0.08)';
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-xl px-5 py-4 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                style={{
                  background: cargando
                    ? 'rgba(124,58,237,0.5)'
                    : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  boxShadow: '0 4px 24px rgba(124,58,237,0.40)',
                }}
              >
                {cargando ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    Ingresar al Sistema
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] font-semibold" style={{ color: 'rgba(124,58,237,0.45)' }}>
            KioskoPro © {new Date().getFullYear()} — Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  )
}

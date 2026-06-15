import { useState } from 'react'
import Swal from 'sweetalert2'
import { formatCurrency } from '../utils/formatters'

export default function Recibos({ recibos = [], proveedores = [], crearRecibo }) {
  const [proveedorId, setProveedorId] = useState('')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')

  const recs = Array.isArray(recibos) ? recibos : []
  const provs = Array.isArray(proveedores) ? proveedores : []

  const onSubmit = (e) => {
    e.preventDefault()
    if (!monto || !concepto) return Swal.fire('Error', 'Faltan datos obligatorios', 'error')

    crearRecibo({ proveedor_id: proveedorId || null, monto: parseFloat(monto), concepto }, () => {
      setProveedorId('')
      setMonto('')
      setConcepto('')
    })
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <section
        className="rounded-2xl p-6 shadow-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
          >
            <span className="text-lg">🧾</span>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Generar Recibo de Pago</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Registra un pago a proveedor (generará un egreso en la caja automáticamente).</p>
          </div>
        </div>
        
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="label-xs">Proveedor</label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.20)', color: 'inherit' }}
            >
              <option value="">-- Opcional --</option>
              {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label-xs">Monto Abonado ($)</label>
            <input
              type="number"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.20)', color: 'inherit' }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label-xs">Concepto / Detalle</label>
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              required
              placeholder="Pago por factura Nro 123..."
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.20)', color: 'inherit' }}
            />
          </div>
          <div className="flex justify-end md:col-span-4">
            <button
              type="submit"
              className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.30)' }}
            >
              Emitir Recibo
            </button>
          </div>
        </form>
      </section>

      <section
        className="rounded-2xl p-6 shadow-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-border)' }}
      >
        <h2 className="mb-5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Historial de Recibos</h2>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--surface-border)' }}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr style={{ background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid var(--surface-border)' }}>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Nº Recibo</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Fecha</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Proveedor</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Monto</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Concepto</th>
              </tr>
            </thead>
            <tbody>
              {recs.map(r => (
                <tr
                  key={r.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--surface-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td className="px-4 py-3 font-bold" style={{ color: '#a78bfa' }}>#{r.id}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {new Date(r.fecha).toLocaleDateString()} {new Date(r.fecha).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.proveedor_nombre || '-'}</td>
                  {/* BUG#4 FIX — formatear monto como moneda argentina */}
                  <td className="px-4 py-3 font-bold" style={{ color: '#f87171' }}>{formatCurrency(r.monto)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.concepto}</td>
                </tr>
              ))}
              {recs.length === 0 && (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500 dark:text-slate-400">No hay recibos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

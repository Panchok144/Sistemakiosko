import { useState, useEffect } from 'react';
import apiClient from '../apiClient';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Swal from 'sweetalert2';

export default function Presupuestos({ productos = [], clientes = [] }) {
  const [presupuestos, setPresupuestos] = useState([]);
  const [modalNuevo, setModalNuevo] = useState(false);

  // Filtros
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Form Presupuesto
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDocumento, setClienteDocumento] = useState('');
  const [validoHasta, setValidoHasta] = useState('');
  const [validezDias, setValidezDias] = useState('30');
  const [condicionPago, setCondicionPago] = useState('');
  const [notas, setNotas] = useState('');

  // Cart for quotation
  const [itemsPresupuesto, setItemsPresupuesto] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidadInput, setCantidadInput] = useState('1');

  useEffect(() => {
    cargarPresupuestos();
  }, []);

  const cargarPresupuestos = () => {
    apiClient.get('/api/presupuestos')
      .then(res => setPresupuestos(res.data || []))
      .catch(err => console.error(err));
  };

  const agregarItem = () => {
    const prod = productos.find(p => p.id === parseInt(productoSeleccionado));
    if (!prod) return;
    const qty = parseInt(cantidadInput) || 1;

    const existe = itemsPresupuesto.find(i => i.producto_id === prod.id);
    if (existe) {
      setItemsPresupuesto(itemsPresupuesto.map(i => i.producto_id === prod.id ? { ...i, cantidad: i.cantidad + qty } : i));
    } else {
      setItemsPresupuesto([...itemsPresupuesto, {
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        cantidad: qty,
        precio_unitario: parseFloat(prod.precio_venta)
      }]);
    }
    setProductoSeleccionado('');
    setCantidadInput('1');
  };

  const eliminarItem = (prodId) => {
    setItemsPresupuesto(itemsPresupuesto.filter(i => i.producto_id !== prodId));
  };

  const guardarPresupuesto = async (e) => {
    e.preventDefault();
    if (itemsPresupuesto.length === 0) {
      Swal.fire('Atención', 'Agregá al menos un producto al presupuesto', 'warning');
      return;
    }

    // BUG-11 FIX: Validar que la fecha de vencimiento no sea anterior a hoy
    if (validoHasta) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaVenc = new Date(validoHasta + 'T00:00:00');
      if (fechaVenc < hoy) {
        Swal.fire('Fecha inválida', 'La fecha de vencimiento no puede ser anterior a hoy.', 'warning');
        return;
      }
    }

    try {
      await apiClient.post('/api/presupuestos', {
        cliente_id: clienteId || null,
        cliente_nombre: clienteNombre || null,
        cliente_documento: clienteDocumento || null,
        valido_hasta: validoHasta || null,
        validez_dias: parseInt(validezDias) || 30,
        condicion_pago: condicionPago || null,
        notas,
        items: itemsPresupuesto
      });
      Swal.fire('¡Éxito!', 'Presupuesto generado', 'success');
      setModalNuevo(false);
      setItemsPresupuesto([]);
      setClienteNombre('');
      setClienteDocumento('');
      setCondicionPago('');
      setValidezDias('30');
      setNotas('');
      cargarPresupuestos();
    } catch (err) {
      Swal.fire('Error', err.response?.data?.error || 'Error al crear presupuesto', 'error');
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await apiClient.put(`/api/presupuestos/${id}/estado`, { estado: nuevoEstado });
      cargarPresupuestos();
    } catch (err) {
      Swal.fire('Error', 'No se pudo actualizar el estado', 'error');
    }
  };

  const exportarPDF = async (presupuestoId) => {
    try {
      const res = await apiClient.get(`/api/presupuestos/${presupuestoId}`);
      const p = res.data;

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('PRESUPUESTO / COTIZACIÓN', 14, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Presupuesto N°: #${p.numero}`, 14, 28);
      doc.text(`Fecha: ${new Date(p.created_at).toLocaleDateString()}`, 14, 34);
      if (p.valido_hasta) doc.text(`Válido hasta: ${p.valido_hasta}`, 14, 40);

      if (p.cliente_nombre) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Cliente: ${p.cliente_nombre}`, 120, 28);
        if (p.cliente_documento) doc.text(`CUIT/DNI: ${p.cliente_documento}`, 120, 34);
      }

      const tableData = (p.items || []).map(item => [
        item.nombre_producto,
        item.cantidad,
        `$${parseFloat(item.precio_unitario).toFixed(2)}`,
        `$${parseFloat(item.subtotal).toFixed(2)}`
      ]);

      doc.autoTable({
        startY: 48,
        head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
        body: tableData,
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL: $${parseFloat(p.total).toFixed(2)}`, 140, finalY);

      if (p.notas) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Notas: ${p.notas}`, 14, finalY + 10);
      }

      doc.save(`Presupuesto_${p.numero}.pdf`);
    } catch (err) {
      Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Presupuestos y Cotizaciones</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Creá cotizaciones formales para tus clientes y exportalas en PDF.</p>
        </div>
        <button
          onClick={() => setModalNuevo(true)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
        >
          + Nuevo Presupuesto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <input
          type="text"
          placeholder="Buscar por cliente..."
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="flex-1 min-w-[180px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="rechazado">Rechazado</option>
          <option value="vencido">Vencido</option>
        </select>
        {(filtroCliente || filtroEstado) && (
          <button onClick={() => { setFiltroCliente(''); setFiltroEstado(''); }}
            className="rounded-xl bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-750 text-xs uppercase font-semibold text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3"># N°</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Validez</th>
                <th className="px-4 py-3">Cond. Pago</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {presupuestos
                .filter(p => {
                  const matchCliente = !filtroCliente || (p.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase());
                  const matchEstado = !filtroEstado || p.estado === filtroEstado;
                  return matchCliente && matchEstado;
                })
                .length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400">Sin presupuestos que coincidan con los filtros.</td>
                </tr>
              ) : (
                presupuestos
                  .filter(p => {
                    const matchCliente = !filtroCliente || (p.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase());
                    const matchEstado = !filtroEstado || p.estado === filtroEstado;
                    return matchCliente && matchEstado;
                  })
                  .map((p) => {
                    const estadoColors = {
                      pendiente: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
                      aprobado: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
                      rechazado: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
                      vencido: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                    }[p.estado] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">#{p.numero}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{p.cliente_nombre || 'Consumidor Final'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {p.validez_dias ? `${p.validez_dias} días` : '-'}
                          {p.valido_hasta && <div className="text-[10px] text-slate-400">hasta {p.valido_hasta}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.condicion_pago || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoColors}`}>
                            {p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-indigo-700 dark:text-indigo-400">${parseFloat(p.total).toFixed(2)}</td>
                        <td className="px-4 py-3 space-x-2">
                          <button
                            onClick={() => exportarPDF(p.id)}
                            className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                          >
                            📄 PDF
                          </button>
                          {p.estado === 'pendiente' && (
                            <button
                              onClick={() => cambiarEstado(p.id, 'aprobado')}
                              className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-2 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200"
                            >
                              ✓ Aprobar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Presupuesto */}
      {modalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nuevo Presupuesto</h2>
              <button onClick={() => setModalNuevo(false)} className="text-xl font-bold text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <form onSubmit={guardarPresupuesto} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Cliente Registrado (Opcional)</label>
                  <select
                    value={clienteId}
                    onChange={(e) => {
                      setClienteId(e.target.value);
                      const c = clientes.find(cli => cli.id === parseInt(e.target.value));
                      if (c) {
                        setClienteNombre(c.nombre);
                        setClienteDocumento(c.documento || '');
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="">-- Cliente Eventual --</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Válido Hasta</label>
                  <input
                    type="date"
                    value={validoHasta}
                    onChange={(e) => setValidoHasta(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Validez (días)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={validezDias}
                    onChange={(e) => setValidezDias(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Condición de Pago</label>
                  <input
                    type="text"
                    value={condicionPago}
                    onChange={(e) => setCondicionPago(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                    placeholder="Ej: Contado, 30 días, 50% adelanto"
                  />
                </div>
              </div>

              {!clienteId && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Nombre del Cliente..."
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    type="text"
                    placeholder="DNI / CUIT..."
                    value={clienteDocumento}
                    onChange={(e) => setClienteDocumento(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              {/* Agregar productos */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-4 space-y-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Agregar Ítems</p>
                <div className="flex gap-2">
                  <select
                    value={productoSeleccionado}
                    onChange={(e) => setProductoSeleccionado(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  >
                    <option value="">-- Seleccionar producto --</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (${p.precio_venta})</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={cantidadInput}
                    onChange={(e) => setCantidadInput(e.target.value)}
                    className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-2 text-center text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={agregarItem}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                  >
                    +
                  </button>
                </div>

                <div className="space-y-1.5 pt-2">
                  {itemsPresupuesto.map(item => (
                    <div key={item.producto_id} className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 p-2 text-xs border border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.nombre_producto}</span>
                      <span className="text-slate-600 dark:text-slate-400">{item.cantidad} u. x ${item.precio_unitario}</span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-400">${(item.cantidad * item.precio_unitario).toFixed(2)}</span>
                      <button type="button" onClick={() => eliminarItem(item.producto_id)} className="text-rose-500 font-bold">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <textarea
                  placeholder="Notas adicionales..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 outline-none"
                  rows="2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalNuevo(false)} className="rounded-xl bg-slate-100 dark:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">Cancelar</button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">Guardar Presupuesto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

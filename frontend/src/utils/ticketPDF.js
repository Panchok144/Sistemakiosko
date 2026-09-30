/**
 * ticketPDF.js — Generador de tickets/recibos en PDF con jsPDF
 * Optimizado para impresión térmica 80mm o descarga digital.
 */
import jsPDF from 'jspdf';
import { formatCurrency, formatDate } from './formatters';

/**
 * Genera y descarga un PDF de ticket de venta.
 * @param {Object} venta - Objeto con datos de la venta
 * @param {Array}  items - Array de ítems del carrito/detalle
 * @param {Object} comercio - Datos del comercio (nombre, cuit, domicilio, etc.)
 */
export function generarTicketPDF({ venta, items = [], comercio = {} }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200], // 80mm de ancho, alto dinámico
  });

  const W = 80; // ancho de página
  const MARGEN = 5;
  const ANCHO = W - MARGEN * 2;
  let y = 8;

  // Helpers
  const linea = (texto, tamaño = 8, negrita = false, align = 'left') => {
    doc.setFontSize(tamaño);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(texto, align === 'center' ? W / 2 : align === 'right' ? W - MARGEN : MARGEN, y, { align });
    y += tamaño * 0.45;
  };

  const separador = (caracter = '-') => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(caracter.repeat(Math.floor(ANCHO / 1.8)), MARGEN, y);
    y += 3;
  };

  const lineaDoble = (izq, der, tamaño = 8) => {
    doc.setFontSize(tamaño);
    doc.setFont('helvetica', 'normal');
    doc.text(izq, MARGEN, y);
    doc.text(der, W - MARGEN, y, { align: 'right' });
    y += tamaño * 0.45;
  };

  // ── Encabezado ────────────────────────────────────────────────────────────
  linea(comercio.nombre || comercio.razon_social || 'KioskoPro', 11, true, 'center');
  y += 1;

  if (comercio.domicilio) linea(comercio.domicilio, 7, false, 'center');
  if (comercio.cuit) linea(`CUIT: ${comercio.cuit}`, 7, false, 'center');
  if (comercio.condicion_fiscal) {
    const condicionLabel = {
      responsable_inscripto: 'Resp. Inscripto',
      monotributista: 'Monotributista',
      consumidor_final: 'Consumidor Final',
      exento: 'Exento',
    }[comercio.condicion_fiscal] || comercio.condicion_fiscal;
    linea(`Cond. IVA: ${condicionLabel}`, 7, false, 'center');
  }
  y += 2;

  // ── Tipo de comprobante ───────────────────────────────────────────────────
  const tipoLabel = {
    interno: 'TICKET INTERNO',
    factura_a: 'FACTURA A',
    factura_b: 'FACTURA B',
  }[venta?.tipo_comprobante] || 'TICKET';

  linea(tipoLabel, 10, true, 'center');
  y += 1;

  if (venta?.nro_comprobante) {
    linea(`Nº ${String(venta.nro_comprobante).padStart(8, '0')}`, 8, false, 'center');
  }

  separador('=');

  // ── Datos de la venta ─────────────────────────────────────────────────────
  lineaDoble('Fecha:', formatDate(venta?.fecha || new Date()), 7.5);
  if (venta?.vendedor) lineaDoble('Atendido por:', venta.vendedor, 7.5);
  if (venta?.cliente_nombre) lineaDoble('Cliente:', venta.cliente_nombre, 7.5);
  if (venta?.metodo_pago) {
    const metodoLabel = {
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      transferencia: 'Transferencia',
    }[venta.metodo_pago] || venta.metodo_pago;
    lineaDoble('Pago:', metodoLabel, 7.5);
  }
  y += 1;
  separador('-');

  // ── Encabezado de columnas ────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Producto', MARGEN, y);
  doc.text('Cant', MARGEN + 33, y);
  doc.text('P.Unit', MARGEN + 43, y);
  doc.text('Total', W - MARGEN, y, { align: 'right' });
  y += 4;
  separador('-');

  // ── Items ─────────────────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    const nombre = (item.nombre || item.name || 'Producto').slice(0, 22);
    const cant = item.cantidad || item.qty || 1;
    const precio = parseFloat(item.precio_unitario || item.precio || item.price || 0);
    const subtotal = cant * precio;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(nombre, MARGEN, y);
    doc.text(String(cant), MARGEN + 34, y);
    doc.text(formatCurrency(precio).replace('$ ', '$'), MARGEN + 41, y);
    doc.text(formatCurrency(subtotal).replace('$ ', '$'), W - MARGEN, y, { align: 'right' });
    y += 4;
  });

  separador('=');
  y += 1;

  // ── Totales ───────────────────────────────────────────────────────────────
  const total = parseFloat(venta?.total || 0);
  const descuento = parseFloat(venta?.descuento || 0);
  const subtotalBruto = total + descuento;

  if (descuento > 0) {
    lineaDoble('Subtotal:', formatCurrency(subtotalBruto), 8);
    lineaDoble('Descuento:', `- ${formatCurrency(descuento)}`, 8);
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', MARGEN, y);
  doc.text(formatCurrency(total), W - MARGEN, y, { align: 'right' });
  y += 6;

  if (venta?.pago_con && venta?.metodo_pago === 'efectivo') {
    const pagaCon = parseFloat(venta.pago_con || 0);
    const vuelto = Math.max(0, pagaCon - total);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    lineaDoble('Pagó con:', formatCurrency(pagaCon), 8);
    if (vuelto > 0) {
      doc.setFont('helvetica', 'bold');
      lineaDoble('Vuelto:', formatCurrency(vuelto), 9);
    }
    y += 1;
  }

  // ── CAE (si tiene factura AFIP) ───────────────────────────────────────────
  if (venta?.cae) {
    separador('-');
    linea('Comprobante electrónico AFIP', 7, false, 'center');
    linea(`CAE: ${venta.cae}`, 7, true, 'center');
    if (venta?.cae_vencimiento) {
      linea(`Vto. CAE: ${formatDate(venta.cae_vencimiento, false)}`, 7, false, 'center');
    }
    y += 1;
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  separador('=');
  y += 1;
  const leyenda = comercio.leyenda_ticket || '¡Gracias por su compra!';
  linea(leyenda, 8, false, 'center');
  y += 2;

  // Ajustar altura del documento dinámicamente
  doc.internal.pageSize.height = y + 5;

  // Descargar
  const fecha = new Date().toISOString().slice(0, 10);
  const nro = venta?.nro_comprobante
    ? String(venta.nro_comprobante).padStart(8, '0')
    : `${Date.now()}`;
  doc.save(`ticket_${nro}_${fecha}.pdf`);
}

/**
 * Abre el ticket en una nueva pestaña para imprimir directamente.
 */
export function imprimirTicketPDF({ venta, items = [], comercio = {} }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200],
  });

  // (misma lógica de generación — reutilizamos)
  generarTicketPDF({ venta, items, comercio });
}

/**
 * Construye un mensaje de WhatsApp con el resumen de la venta.
 * @returns {string} URL de wa.me
 */
export function generarLinkWhatsApp({ venta, items = [], comercio = {}, telefono = '' }) {
  const total = parseFloat(venta?.total || 0);
  const fecha = formatDate(venta?.fecha || new Date());
  const tipoLabel = { interno: 'Ticket', factura_a: 'Factura A', factura_b: 'Factura B' }[venta?.tipo_comprobante] || 'Comprobante';

  let mensaje = `*${comercio.nombre || 'KioskoPro'}*\n`;
  mensaje += `📄 ${tipoLabel}\n`;
  mensaje += `📅 ${fecha}\n\n`;
  mensaje += `*Detalle:*\n`;

  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    const cant = item.cantidad || 1;
    const precio = parseFloat(item.precio_unitario || item.precio || 0);
    mensaje += `• ${item.nombre} x${cant} = ${formatCurrency(cant * precio)}\n`;
  });

  mensaje += `\n*Total: ${formatCurrency(total)}*\n`;
  if (comercio.telefono) mensaje += `📞 ${comercio.telefono}\n`;
  mensaje += '\n_Generado con KioskoPro_';

  const encoded = encodeURIComponent(mensaje);
  const tel = telefono.replace(/\D/g, '');
  return `https://wa.me/${tel}?text=${encoded}`;
}

/**
 * M9: Genera y descarga el Estado de Cuenta de un cliente en formato PDF (A4)
 */
export function generarEstadoCuentaPDF({ cliente, comercio = {}, aging = {}, movimientos = [] }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const MARGEN = 14;
  let y = 18;

  // Header Comercio
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(comercio.nombre || 'KIOSKOPRO', MARGEN, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (comercio.cuit) { doc.text(`CUIT: ${comercio.cuit}`, MARGEN, y); y += 4; }
  if (comercio.domicilio) { doc.text(comercio.domicilio, MARGEN, y); y += 4; }
  if (comercio.telefono) { doc.text(`Tel: ${comercio.telefono}`, MARGEN, y); y += 4; }

  // Title Box
  doc.setFillColor(243, 244, 246);
  doc.rect(MARGEN, y + 2, W - MARGEN * 2, 9, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA CORRIENTE', W / 2, y + 8, { align: 'center' });
  y += 18;

  // Datos Cliente & Fecha
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cliente: ${cliente.nombre}`, MARGEN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, W - MARGEN, y, { align: 'right' });
  y += 5;

  if (cliente.documento) {
    doc.text(`DNI / CUIT: ${cliente.documento}`, MARGEN, y);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`DEUDA TOTAL: ${formatCurrency(cliente.saldo_deuda || 0)}`, W - MARGEN, y, { align: 'right' });
  y += 7;

  // Cuadro Aging (Antigüedad de deuda)
  doc.setFillColor(249, 250, 251);
  doc.rect(MARGEN, y, W - MARGEN * 2, 14, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.rect(MARGEN, y, W - MARGEN * 2, 14, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const colW = (W - MARGEN * 2) / 4;
  doc.text('0 a 30 días', MARGEN + colW * 0.5, y + 4.5, { align: 'center' });
  doc.text('31 a 60 días', MARGEN + colW * 1.5, y + 4.5, { align: 'center' });
  doc.text('61 a 90 días', MARGEN + colW * 2.5, y + 4.5, { align: 'center' });
  doc.text('+90 días (Mora)', MARGEN + colW * 3.5, y + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(aging.dias_0_30 || 0), MARGEN + colW * 0.5, y + 10.5, { align: 'center' });
  doc.text(formatCurrency(aging.dias_31_60 || 0), MARGEN + colW * 1.5, y + 10.5, { align: 'center' });
  doc.text(formatCurrency(aging.dias_61_90 || 0), MARGEN + colW * 2.5, y + 10.5, { align: 'center' });
  doc.text(formatCurrency(aging.dias_mas_90 || 0), MARGEN + colW * 3.5, y + 10.5, { align: 'center' });
  y += 18;

  // Tabla de Movimientos
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(243, 244, 246);
  doc.rect(MARGEN, y, W - MARGEN * 2, 7, 'F');
  doc.text('Fecha', MARGEN + 2, y + 5);
  doc.text('Tipo', MARGEN + 30, y + 5);
  doc.text('Concepto', MARGEN + 60, y + 5);
  doc.text('Monto', MARGEN + 140, y + 5, { align: 'right' });
  doc.text('Saldo Acum.', W - MARGEN - 2, y + 5, { align: 'right' });
  y += 9;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const m of (movimientos || []).slice(0, 45)) {
    if (y > 280) {
      doc.addPage();
      y = 15;
    }
    const esDebito = m.tipo === 'debito' || m.tipo === 'venta' || m.tipo === 'cargo' || (m.tipo === 'ajuste' && m.monto > 0);
    doc.text(formatDate(m.fecha), MARGEN + 2, y);
    doc.text(m.tipo || '—', MARGEN + 30, y);
    const desc = (m.descripcion || '—').slice(0, 36);
    doc.text(desc, MARGEN + 60, y);
    doc.text(`${esDebito ? '+' : '-'}${formatCurrency(m.monto)}`, MARGEN + 140, y, { align: 'right' });
    doc.text(formatCurrency(m.saldo_acumulado || 0), W - MARGEN - 2, y, { align: 'right' });
    y += 5.5;
  }

  // Footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('Documento no válido como factura fiscal. Emitido automáticamente por KioskoPro.', W / 2, 290, { align: 'center' });

  doc.save(`Estado_Cuenta_${cliente.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * M9: Genera link de WhatsApp con el recordatorio de deuda y días de mora
 */
export function generarLinkWhatsAppDeuda({ cliente, comercio = {}, monto = 0, diasMora = 0 }) {
  const tel = (cliente?.telefono || '').replace(/\D/g, '');
  const nombreComercio = comercio?.nombre || 'KioskoPro';
  let mensaje = `Hola *${cliente?.nombre || 'Estimado cliente'}*, te escribimos de *${nombreComercio}*.\n\n`;
  mensaje += `Te informamos que tu estado de cuenta corriente presenta un saldo pendiente de *${formatCurrency(monto)}*`;
  if (diasMora > 0) {
    mensaje += ` con *${diasMora} días* de antigüedad`;
  }
  mensaje += `.\n\nAgradecemos regularizar el saldo a la brevedad. ¡Muchas gracias!`;
  if (comercio?.telefono) {
    mensaje += `\n\nPor cualquier consulta comunicate al ${comercio.telefono}.`;
  }

  const encoded = encodeURIComponent(mensaje);
  return `https://wa.me/${tel}?text=${encoded}`;
}

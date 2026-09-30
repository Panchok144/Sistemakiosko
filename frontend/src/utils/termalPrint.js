/**
 * frontend/src/utils/termalPrint.js — M5
 * ─────────────────────────────────────────────────────────────────────────────
 * Generador de tickets ESC/POS para impresoras térmicas de recibos.
 * Usa Web Serial API (Chrome 89+, Edge 89+) con fallback a window.print().
 *
 * Compatibilidad: Epson TM-T20, Bixolon SRP-350, Star TSP100, WP-T5880, y clones.
 *
 * Uso:
 *   import { imprimirTicketTermal } from '../utils/termalPrint';
 *   await imprimirTicketTermal({ venta, items, comercio, config });
 */

import { formatCurrency } from './formatters';

// ── Constantes ESC/POS ────────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;
const CR  = 0x0D;

// Comandos como arrays de bytes
const CMD = {
  INIT:           [ESC, 0x40],                   // Initialize printer
  ALIGN_LEFT:     [ESC, 0x61, 0x00],
  ALIGN_CENTER:   [ESC, 0x61, 0x01],
  ALIGN_RIGHT:    [ESC, 0x61, 0x02],
  BOLD_ON:        [ESC, 0x45, 0x01],
  BOLD_OFF:       [ESC, 0x45, 0x00],
  DOUBLE_WIDTH:   [GS, 0x21, 0x10],             // Font doble ancho
  NORMAL_SIZE:    [GS, 0x21, 0x00],             // Font normal
  FEED_1:         [LF],
  FEED_3:         [LF, LF, LF],
  CUT:            [GS, 0x56, 0x42, 0x00],       // Partial cut
  CHARSET_LAT:    [ESC, 0x74, 0x02],            // Codepage PC850 (Latin-1)
};

/** Convierte string a Uint8Array usando latin-1 (para compatibilidad con impresoras básicas) */
function strToBytes(str) {
  // Reemplazar caracteres Unicode comunes en español
  const normalized = str
    .replace(/á/g, '\xe1').replace(/é/g, '\xe9').replace(/í/g, '\xed')
    .replace(/ó/g, '\xf3').replace(/ú/g, '\xfa').replace(/ü/g, '\xfc')
    .replace(/Á/g, '\xc1').replace(/É/g, '\xc9').replace(/Í/g, '\xcd')
    .replace(/Ó/g, '\xd3').replace(/Ú/g, '\xda').replace(/ñ/g, '\xf1')
    .replace(/Ñ/g, '\xd1').replace(/¡/g, '\xa1').replace(/¿/g, '\xbf')
    .replace(/[^\x00-\xff]/g, '?'); // Reemplazar el resto con ?
  return Uint8Array.from(normalized, c => c.charCodeAt(0));
}

/** Construye un buffer ESC/POS completo para el ticket */
function buildTicketBuffer({ venta, items = [], comercio = {}, anchoChar = 42 }) {
  const chunks = [];

  const push = (...cmds) => {
    for (const cmd of cmds) {
      if (Array.isArray(cmd)) chunks.push(new Uint8Array(cmd));
      else if (typeof cmd === 'string') chunks.push(strToBytes(cmd));
      else if (cmd instanceof Uint8Array) chunks.push(cmd);
    }
  };

  const linea = (texto, alinear = 'izq') => {
    if (alinear === 'cen') push(CMD.ALIGN_CENTER);
    else if (alinear === 'der') push(CMD.ALIGN_RIGHT);
    else push(CMD.ALIGN_LEFT);
    // Truncar si excede ancho
    const t = String(texto).slice(0, anchoChar);
    push(t + '\n');
  };

  const sep = (char = '-') => {
    push(CMD.ALIGN_LEFT, char.repeat(anchoChar) + '\n');
  };

  const lineaDoble = (izq, der) => {
    push(CMD.ALIGN_LEFT);
    const maxIzq = anchoChar - der.length - 1;
    const padded = String(izq).slice(0, maxIzq).padEnd(maxIzq) + ' ' + String(der);
    push(padded + '\n');
  };

  // ── 1. Init + charset ────────────────────────────────────────────────────
  push(CMD.INIT, CMD.CHARSET_LAT);

  // ── 2. Encabezado ────────────────────────────────────────────────────────
  push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_WIDTH);
  push((comercio.nombre || 'KioskoPro') + '\n');
  push(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  if (comercio.domicilio) linea(comercio.domicilio, 'cen');
  if (comercio.cuit)      linea(`CUIT: ${comercio.cuit}`, 'cen');
  if (comercio.telefono)  linea(`Tel: ${comercio.telefono}`, 'cen');
  push(CMD.FEED_1);

  // ── 3. Tipo comprobante ──────────────────────────────────────────────────
  const tipoLabel = {
    interno: 'TICKET INTERNO', factura_a: 'FACTURA A', factura_b: 'FACTURA B',
  }[venta?.tipo_comprobante] || 'TICKET';

  push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
  push(tipoLabel + '\n');
  push(CMD.BOLD_OFF);

  if (venta?.nro_comprobante) {
    linea(`N\xba ${String(venta.nro_comprobante).padStart(8, '0')}`, 'cen');
  }

  const fechaStr = venta?.fecha
    ? new Date(venta.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    : new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  linea(fechaStr, 'cen');

  sep('=');

  // ── 4. Items ─────────────────────────────────────────────────────────────
  for (const item of items) {
    const nombre = String(item.nombre || item.name || '').slice(0, anchoChar - 16);
    const cant   = Number(item.cantidad || item.qty || 1);
    const pu     = Number(item.precio_unitario || item.price || 0);
    const sub    = cant * pu;
    linea(nombre);
    lineaDoble(`  ${cant} x ${formatCurrency(pu)}`, formatCurrency(sub));
  }

  sep();

  // ── 5. Totales ───────────────────────────────────────────────────────────
  if (venta?.descuento && Number(venta.descuento) > 0) {
    lineaDoble('Descuento:', `-${formatCurrency(venta.descuento)}`);
  }
  push(CMD.BOLD_ON);
  lineaDoble('TOTAL:', formatCurrency(venta?.total || 0));
  push(CMD.BOLD_OFF);

  const metodoPago = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta', tarjeta_debito: 'Deb.',
    tarjeta_credito: 'Cred.', transferencia: 'Transfer.', qr: 'QR',
    cuenta_corriente: 'Cta. Cte.',
  }[venta?.metodo_pago] || venta?.metodo_pago || '';
  if (metodoPago) lineaDoble('Forma de pago:', metodoPago);

  if (venta?.metodo_pago === 'efectivo' && venta?.monto_recibido > 0) {
    lineaDoble('Recibido:', formatCurrency(venta.monto_recibido));
    lineaDoble('Vuelto:', formatCurrency(Math.max(0, venta.monto_recibido - venta.total)));
  }

  // ── 6. CAE si aplica ─────────────────────────────────────────────────────
  if (venta?.cae) {
    sep();
    linea(`CAE: ${venta.cae}`, 'cen');
    if (venta?.cae_vencimiento) {
      linea(`Vto. CAE: ${new Date(venta.cae_vencimiento).toLocaleDateString('es-AR')}`, 'cen');
    }
  }

  sep('=');

  // ── 7. Pie ───────────────────────────────────────────────────────────────
  push(CMD.ALIGN_CENTER);
  push('Gracias por su compra!\n');
  if (comercio.leyenda_ticket) {
    linea(String(comercio.leyenda_ticket).slice(0, anchoChar), 'cen');
  } else {
    push('Conserve su comprobante\n');
  }
  push(CMD.FEED_3, CMD.CUT);

  // ── Combinar todos los chunks ─────────────────────────────────────────────
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const buffer   = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer;
}

// ── Web Serial API ────────────────────────────────────────────────────────────

let _port = null; // conexión abierta reutilizable

async function getPort() {
  if (_port && _port.readable) return _port;
  if (!('serial' in navigator)) throw new Error('Web Serial API no disponible en este navegador.');
  _port = await navigator.serial.requestPort({ filters: [] });
  await _port.open({ baudRate: 9600 });
  return _port;
}

async function writeToPort(port, buffer) {
  const writer = port.writable.getWriter();
  try { await writer.write(buffer); }
  finally { writer.releaseLock(); }
}

/**
 * Cierra la conexión serial (útil para cleanup)
 */
export async function cerrarPuertoTermal() {
  if (_port) {
    try { await _port.close(); } catch (_) {}
    _port = null;
  }
}

/**
 * M5: Imprime el ticket en impresora térmica real por Web Serial API.
 * Fallback: window.print() con CSS optimizado si la API no está disponible
 * o el usuario cancela el selector de puertos.
 *
 * @param {{ venta, items, comercio, config }} options
 *   config.modo: 'serial' | 'browser' | 'auto' (defecto: 'auto')
 *   config.ancho_mm: 58 | 80 (defecto: 80)
 */
export async function imprimirTicketTermal({ venta, items = [], comercio = {}, config = {} }) {
  const modo    = config.modo    || 'auto';
  const ancho   = Number(config.ancho_mm) === 58 ? 58 : 80;
  const anchoChar = ancho === 58 ? 32 : 42; // chars por línea según ancho

  const buffer = buildTicketBuffer({ venta, items, comercio, anchoChar });

  // ── Modo serial ────────────────────────────────────────────────────────────
  if (modo === 'serial' || (modo === 'auto' && 'serial' in navigator)) {
    try {
      const port = await getPort();
      await writeToPort(port, buffer);
      return { ok: true, modo: 'serial' };
    } catch (err) {
      if (modo === 'serial') throw err;
      // Si modo='auto' y falló (ej: usuario canceló), cae al modo browser
      console.warn('[termalPrint] Serial falló, usando window.print()', err.message);
    }
  }

  // ── Fallback: window.print() ──────────────────────────────────────────────
  const htmlLines = [];
  for (const item of items) {
    const cant = Number(item.cantidad || item.qty || 1);
    const pu   = Number(item.precio_unitario || item.price || 0);
    htmlLines.push(
      `<tr><td>${String(item.nombre || '').slice(0, 28)}</td>` +
      `<td style="text-align:right">${cant} x ${formatCurrency(pu)}</td>` +
      `<td style="text-align:right">${formatCurrency(cant * pu)}</td></tr>`
    );
  }

  const fechaStr = venta?.fecha
    ? new Date(venta.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    : new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const html = `
  <html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 9pt; width: ${ancho}mm; }
  h1 { font-size: 12pt; text-align: center; }
  .centro { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .total { font-size: 11pt; font-weight: bold; border-top: 2px solid #000; padding-top: 3px; }
  @media print { @page { margin: 0; size: ${ancho}mm auto; } }
  </style></head><body>
  <h1>${comercio.nombre || 'KioskoPro'}</h1>
  ${comercio.domicilio ? `<div class="centro">${comercio.domicilio}</div>` : ''}
  ${comercio.cuit ? `<div class="centro">CUIT: ${comercio.cuit}</div>` : ''}
  <div class="sep"></div>
  <div class="centro">${venta?.tipo_comprobante === 'factura_a' ? 'FACTURA A' : venta?.tipo_comprobante === 'factura_b' ? 'FACTURA B' : 'TICKET'}</div>
  ${venta?.nro_comprobante ? `<div class="centro">N\u00ba ${String(venta.nro_comprobante).padStart(8, '0')}</div>` : ''}
  <div class="centro">${fechaStr}</div>
  <div class="sep"></div>
  <table>${htmlLines.join('')}</table>
  <div class="sep"></div>
  ${venta?.descuento && Number(venta.descuento) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento:</span><span>-${formatCurrency(venta.descuento)}</span></div>` : ''}
  <div class="total" style="display:flex;justify-content:space-between"><span>TOTAL:</span><span>${formatCurrency(venta?.total || 0)}</span></div>
  ${venta?.cae ? `<div class="sep"></div><div class="centro">CAE: ${venta.cae}</div>` : ''}
  <div class="sep"></div>
  <div class="centro">Gracias por su compra!</div>
  <div class="centro">${comercio.leyenda_ticket || 'Conserve su comprobante'}</div>
  </body></html>`;

  const win = window.open('', '_blank', `width=${ancho * 4},height=600`);
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); win.close(); };

  return { ok: true, modo: 'browser' };
}

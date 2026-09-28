/**
 * formatters.js — Utilidades de formato y localización es-AR centralizadas para KioskoPro
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * REGLA: Usar SIEMPRE estos helpers. Prohibido usar .toLocaleString() / .toLocaleDateString()
 * directamente fuera de este módulo.
 */

// ── Formateadores base (creados una sola vez para performance) ──────────────

const _currencyFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const _currencyNoDecFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const _numberFmt = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const _dateFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const _dateTimeFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const _timeFmt = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const _monthFmt = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
});

const _weekdayFmt = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
});

// ── Moneda ──────────────────────────────────────────────────────────────────

/**
 * Formatea un monto como moneda ARS con 2 decimales.
 * @param {number|string} amount
 * @returns {string} e.g. "$ 1.500,00"
 */
export function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '$ 0,00';
  return _currencyFmt.format(num);
}

/**
 * Formatea monto como ARS sin decimales (útil para montos grandes en KPIs).
 * @param {number|string} amount
 * @returns {string} e.g. "$ 1.500"
 */
export function formatCurrencyShort(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '$ 0';
  if (Math.abs(num) >= 1_000_000) {
    return `$ ${_numberFmt.format(Math.round(num / 1000))}K`;
  }
  return _currencyNoDecFmt.format(num);
}

/**
 * Formatea como número con separadores de miles (sin símbolo de moneda).
 * @param {number|string} value
 * @returns {string} e.g. "1.234,56"
 */
export function formatNumber(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  return _numberFmt.format(num);
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/**
 * Helper interno: parsea input a Date de forma segura.
 * Maneja strings ISO, timestamps y objetos Date.
 */
function _toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  // Strings tipo "2026-09-28" sin hora → tratarlos como fecha local (medianoche)
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formatea fecha como dd/mm/aaaa
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateOnly(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';
  return _dateFmt.format(d);
}

/**
 * Formatea fecha+hora como dd/mm/aaaa hh:mm
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';
  return _dateTimeFmt.format(d);
}

/**
 * Alias para compatibilidad retroactiva con el parámetro includeTime.
 * @param {string|Date} dateString
 * @param {boolean} includeTime
 * @returns {string}
 */
export function formatDate(dateString, includeTime = true) {
  return includeTime ? formatDateTime(dateString) : formatDateOnly(dateString);
}

/**
 * Formatea solo la hora como HH:mm
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatTime(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';
  return _timeFmt.format(d);
}

/**
 * Devuelve "mes año" capitalizado, ej: "septiembre 2026"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatMonth(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';
  return _monthFmt.format(d);
}

/**
 * Devuelve el día de semana abreviado, ej: "lun."
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatWeekday(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';
  return _weekdayFmt.format(d);
}

/**
 * Fecha relativa legible (hace N días, hoy, ayer, etc.)
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatRelative(dateInput) {
  const d = _toDate(dateInput);
  if (!d) return '-';

  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'ahora mismo';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem.`;
  return formatDateOnly(d);
}

// ── Validaciones argentinas ─────────────────────────────────────────────────

/**
 * Valida CUIT argentino (módulo 11).
 * @param {string|number} cuit
 * @returns {boolean}
 */
export function validarCuit(cuit) {
  if (!cuit) return true;
  const limpio = cuit.toString().replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(limpio)) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = mult.reduce((acc, m, i) => acc + parseInt(limpio[i], 10) * m, 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return dv === parseInt(limpio[10], 10);
}

// ── Texto ───────────────────────────────────────────────────────────────────

/**
 * Pluralización gramatical simple.
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Trunca texto a maxLen caracteres con "…"
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(text, maxLen = 40) {
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * Convierte centavos (entero) a monto visible.
 * REGLA: Internamente el dinero se almacena en centavos (ints) para evitar floats.
 * @param {number} centavos
 * @returns {string}
 */
export function formatCentavos(centavos) {
  const num = parseInt(centavos, 10);
  if (isNaN(num)) return '$ 0,00';
  return _currencyFmt.format(num / 100);
}

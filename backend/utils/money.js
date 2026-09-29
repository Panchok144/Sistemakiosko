/**
 * backend/utils/money.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regla de oro: TODA la aritmética de dinero se hace en centavos (enteros)
 * para evitar errores de punto flotante.
 *
 * Flujo:
 *   1. Leer precio de BD (NUMERIC → string/number).
 *   2. Convertir a centavos: cents(precio).
 *   3. Operar con enteros.
 *   4. Guardar en BD con round2(fromCents(resultado)).
 *
 * PROHIBIDO: acumuladores con += parseFloat(...) sin convertir antes.
 */

'use strict';

/**
 * Convierte un valor monetario a centavos enteros (safe rounding).
 * cents(10.50) → 1050
 * cents("1500.995") → 150100  (redondea al centavo más cercano)
 * @param {number|string|null} v
 * @returns {number}  entero en centavos
 */
function cents(v) {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

/**
 * Convierte centavos de vuelta a pesos con 2 decimales (para almacenar en BD).
 * fromCents(1050) → 10.50
 * @param {number} c  entero en centavos
 * @returns {number}  number con exactamente 2 decimales
 */
function fromCents(c) {
  return Math.round(c) / 100;
}

/**
 * Suma un array de valores monetarios en centavos y devuelve entero.
 * @param {...number} values  valores en centavos (enteros)
 * @returns {number}
 */
function sumCents(...values) {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/**
 * Redondea un number a exactamente 2 decimales.
 * Útil para el valor final antes de JSON / INSERT.
 * @param {number} v
 * @returns {number}
 */
function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/**
 * Calcula el neto (sin IVA) a partir del precio con IVA incluido, en centavos.
 * Precio público argentino = neto * (1 + iva/100)
 * ⟹ neto_cents = round( precio_cents / (1 + iva/100) )
 *
 * @param {number} precioCents  precio con IVA en centavos
 * @param {number} ivaPorc      porcentaje IVA (ej: 21)
 * @returns {{ neto: number, iva: number }}  ambos en centavos
 */
function descomponerIva(precioCents, ivaPorc) {
  const factor = 1 + Number(ivaPorc) / 100;
  const netoCents = Math.round(precioCents / factor);
  const ivaCents  = precioCents - netoCents;
  return { neto: netoCents, iva: ivaCents };
}

module.exports = { cents, fromCents, sumCents, round2, descomponerIva };

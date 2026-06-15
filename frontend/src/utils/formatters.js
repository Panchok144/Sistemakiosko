/**
 * Utilidades de formato y localización es-AR centralizados para KioskoPro
 */

// Formateador de moneda en pesos argentinos (ARS)
export function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Formateador de fecha uniforme dd/mm/aaaa hh:mm
export function formatDate(dateString, includeTime = true) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  if (!includeTime) {
    return `${day}/${month}/${year}`;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Validador CUIT / DNI módulo 11
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

// Helper para pluralización gramatical correcta
export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

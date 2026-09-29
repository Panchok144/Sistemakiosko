/**
 * Utilidades de cálculo de vuelto y desglose de billetes ARS
 * Frontend KioskoPro
 */

export const BILLETES_ARS = [20000, 10000, 2000, 1000, 500, 200, 100, 50];

export function calcularDesgloseBilletes(vueltoPesos) {
  let rem = Math.max(0, Math.floor(Number(vueltoPesos) || 0));
  const desglose = [];

  for (const b of BILLETES_ARS) {
    if (rem >= b) {
      const cant = Math.floor(rem / b);
      if (cant > 0) {
        desglose.push({ billete: b, cantidad: cant });
        rem -= cant * b;
      }
    }
  }

  return {
    desglose,
    total: Math.max(0, Number(vueltoPesos) || 0),
    redondeoCentavos: rem,
  };
}

export function generarAtajosPago(totalPesos) {
  const t = Math.max(0, Math.ceil(Number(totalPesos) || 0));
  if (t === 0) return [1000, 2000, 5000, 10000];

  const atajos = new Set();
  atajos.add(t); // Pago exacto

  const bases = [1000, 2000, 5000, 10000, 20000];
  for (const base of bases) {
    if (t < base) {
      atajos.add(base);
    } else {
      const proximo = Math.ceil(t / base) * base;
      if (proximo > t) atajos.add(proximo);
    }
  }

  return Array.from(atajos).sort((a, b) => a - b).slice(0, 5);
}

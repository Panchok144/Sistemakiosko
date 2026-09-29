import { describe, it, expect } from 'vitest';
const { cents, fromCents, sumCents, round2, descomponerIva } = require('../utils/money');

describe('backend/utils/money.js - Aritmética de dinero en centavos (C2)', () => {
  it('cents() convierte floats, enteros y strings a centavos enteros correctamente', () => {
    expect(cents(10.5)).toBe(1050);
    expect(cents('10.50')).toBe(1050);
    expect(cents(100)).toBe(10000);
    expect(cents('1500.995')).toBe(150100);
    expect(cents(0.01)).toBe(1);
    expect(cents(0)).toBe(0);
    expect(cents(null)).toBe(0);
    expect(cents(undefined)).toBe(0);
  });

  it('fromCents() convierte centavos a pesos con 2 decimales', () => {
    expect(fromCents(1050)).toBe(10.5);
    expect(fromCents(150100)).toBe(1501);
    expect(fromCents(1)).toBe(0.01);
    expect(fromCents(0)).toBe(0);
  });

  it('sumCents() suma múltiples centavos enteros con precisión sin drift flotante', () => {
    // Clásico error de JS: 0.1 + 0.2 = 0.30000000000000004
    const floatSum = 0.1 + 0.2;
    expect(floatSum).not.toBe(0.3);

    // Con sumCents:
    const totalCents = sumCents(cents(0.1), cents(0.2));
    expect(totalCents).toBe(30);
    expect(fromCents(totalCents)).toBe(0.3);
  });

  it('round2() redondea valores a exactamente 2 decimales', () => {
    expect(round2(10.556)).toBe(10.56);
    expect(round2(10.554)).toBe(10.55);
    expect(round2('99.999')).toBe(100);
    expect(round2(0)).toBe(0);
  });

  it('descomponerIva() calcula neto e iva en centavos a partir del precio con IVA incluido', () => {
    // Producto a $1210 final con 21% de IVA: neto = 1000, iva = 210
    const res21 = descomponerIva(121000, 21);
    expect(res21.neto).toBe(100000);
    expect(res21.iva).toBe(21000);
    expect(res21.neto + res21.iva).toBe(121000);

    // Producto a $110.50 con 10.5% de IVA
    const res105 = descomponerIva(11050, 10.5);
    expect(res105.neto + res105.iva).toBe(11050);
  });
});

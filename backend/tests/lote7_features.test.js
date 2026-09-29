import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { pool } = require('../db/pgConexion');
const { calcularDesgloseBilletes, generarAtajosPago } = require('../utils/vuelto');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign(
  { id: 1, rol: 'administrador', comercio_id: 1, nombre_usuario: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

describe('LOTE 7 — Mejoras Comerciales y Control de Flujo de Caja', () => {
  let cajaTestId = null;

  beforeAll(async () => {
    // Abrir una caja de prueba con $10.000
    const cajaRes = await pool.query(
      `INSERT INTO cajas (comercio_id, id_usuario, monto_inicial, estado, fecha_apertura)
       VALUES (1, 1, 10000, 'abierta', NOW()) RETURNING id`
    );
    cajaTestId = cajaRes.rows[0].id;

    // Agregar un movimiento de ingreso de efectivo de $5.000
    await pool.query(
      `INSERT INTO movimientos_caja (id_caja, comercio_id, tipo, monto, descripcion, metodo_pago)
       VALUES ($1, 1, 'ingreso', 5000, 'Venta efectivo prueba', 'efectivo')`,
      [cajaTestId]
    );

    // Agregar un movimiento digital (tarjeta) de $3.000
    await pool.query(
      `INSERT INTO movimientos_caja (id_caja, comercio_id, tipo, monto, descripcion, metodo_pago)
       VALUES ($1, 1, 'ingreso', 3000, 'Venta debito prueba', 'tarjeta_debito')`,
      [cajaTestId]
    );
  });

  afterAll(async () => {
    if (cajaTestId) {
      await pool.query('DELETE FROM movimientos_caja WHERE id_caja = $1', [cajaTestId]);
      await pool.query('DELETE FROM cajas WHERE id = $1', [cajaTestId]);
    }
  });

  // ── 1. Desglose de billetes ARS y atajos de cobro ───────────────────────────
  describe('1. Utilidad de cálculo de vuelto y billetes ARS', () => {
    it('desglosa correctamente $13.750 en denominaciones ARS vigentes', () => {
      const res = calcularDesgloseBilletes(13750);
      expect(res.total).toBe(13750);
      expect(res.desglose).toBeDefined();

      // Debe incluir 1x 10000, 1x 2000, 1x 1000, 1x 500, 1x 200, 1x 50
      const billetesMap = Object.fromEntries(res.desglose.map(d => [d.billete, d.cantidad]));
      expect(billetesMap[10000]).toBe(1);
      expect(billetesMap[2000]).toBe(1);
      expect(billetesMap[1000]).toBe(1);
      expect(billetesMap[500]).toBe(1);
      expect(billetesMap[200]).toBe(1);
      expect(billetesMap[50]).toBe(1);
    });

    it('genera atajos de cobro coherentes para una venta de $3.450', () => {
      const atajos = generarAtajosPago(3450);
      expect(atajos).toContain(3450); // Pago exacto
      expect(atajos.some(a => a >= 4000)).toBe(true);
      expect(atajos.some(a => a >= 5000)).toBe(true);
    });
  });

  // ── 2. Arqueo en vivo ───────────────────────────────────────────────────────
  describe('2. GET /api/caja/:id/arqueo-en-vivo', () => {
    it('calcula con precisión el efectivo físico ($15.000) separando cobros digitales', async () => {
      const res = await request(app)
        .get(`/api/caja/${cajaTestId}/arqueo-en-vivo`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.caja_id).toBe(cajaTestId);
      expect(res.body.monto_inicial).toBe(10000);
      // Efectivo disponible: $10.000 inicial + $5.000 ingreso efectivo = $15.000
      expect(res.body.saldo_efectivo_disponible).toBe(15000);
      expect(res.body.desglose_digital_y_otros.tarjeta_debito).toBe(3000);
    });
  });

  // ── 3. Retiro de efectivo con validación de saldo ────────────────────────────
  describe('3. POST /api/caja/:id/retiro-efectivo', () => {
    it('rechaza con 400 si falta el motivo', async () => {
      const res = await request(app)
        .post(`/api/caja/${cajaTestId}/retiro-efectivo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monto: 2000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/motivo/i);
    });

    it('rechaza con 409 si el monto a retirar supera el efectivo físico disponible', async () => {
      const res = await request(app)
        .post(`/api/caja/${cajaTestId}/retiro-efectivo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monto: 999999, motivo: 'Retiro excesivo' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/insuficiente/i);
    });

    it('permite retiro válido ($4.000) y descuenta del saldo físico', async () => {
      const res = await request(app)
        .post(`/api/caja/${cajaTestId}/retiro-efectivo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monto: 4000, motivo: 'Pago flete mercadería' });

      expect(res.status).toBe(201);
      expect(res.body.monto_retirado).toBe(4000);
      expect(res.body.saldo_restante).toBe(11000); // 15000 - 4000
    });
  });

  // ── 4. Exportación de inventario valorizado ─────────────────────────────────
  describe('4. GET /api/productos/exportar-valorizado', () => {
    it('entrega libro Excel con encabezados de valuación y márgenes', async () => {
      const res = await request(app)
        .get('/api/productos/exportar-valorizado')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toMatch(/spreadsheetml/i);
      expect(res.header['content-disposition']).toMatch(/inventario_valorizado/i);
      expect(res.body).toBeDefined();
    });
  });

  // ── 5. Análisis ABC de Pareto ──────────────────────────────────────────────
  describe('5. GET /api/reportes/analisis-abc', () => {
    it('clasifica productos en categorías A, B y C con resumen de participación', async () => {
      const res = await request(app)
        .get('/api/reportes/analisis-abc?dias=90')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.resumen).toBeDefined();
      expect(res.body.resumen.categoria_a).toBeDefined();
      expect(res.body.resumen.categoria_b).toBeDefined();
      expect(res.body.resumen.categoria_c).toBeDefined();
      expect(Array.isArray(res.body.categoria_a)).toBe(true);
    });
  });

  // ── 6. Semáforo de riesgo de cuenta corriente ──────────────────────────────
  describe('6. GET /api/cuenta-corriente/resumen-mora', () => {
    it('genera métricas de cartera morosa y asigna semáforo de riesgo', async () => {
      const res = await request(app)
        .get('/api/cuenta-corriente/resumen-mora')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.resumen).toBeDefined();
      expect(res.body.resumen.total_deuda_cobrar).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.body.clientes)).toBe(true);

      if (res.body.clientes.length > 0) {
        const c = res.body.clientes[0];
        expect(['verde', 'amarillo', 'rojo']).toContain(c.riesgo);
        expect(c.motivo_riesgo).toBeDefined();
      }
    });
  });
});

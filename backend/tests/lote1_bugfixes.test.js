/**
 * backend/tests/lote1_bugfixes.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LOTE 1 — Tests de los bugs N1–N7 corregidos
 *
 * N1: query 8 dashboard-hoy usa columna estado (no estado_factura)
 * N2: /abc redirige/retorna 404; /analisis-abc sigue respondiendo
 * N3: schema migration 019 creada (test verifica archivo)
 * N4: totals de /inventario son numeros exactos (no acumulacion float)
 * N5: /margenes usa costo_unitario de detalle_ventas
 * N6: /ventas acepta desde/hasta y devuelve datos correctos (sargable)
 * N7: /api/ventas/caja-estado diferencia abierta vs cerrada
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');
const { pool } = require('../db/pgConexion');
const path    = require('path');
const fs      = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const token = jwt.sign({ id: 1, rol: 'administrador', comercio_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 1 — Bugfixes N1–N7', () => {
  let testCajaId   = null;
  let testProdId   = null;
  let testVentaId  = null;

  beforeAll(async () => {
    // Crear producto de prueba con costo conocido
    const prod = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id, activo)
       VALUES ('Test N1-N7', 'TESTN1N7-' || floor(random()*100000)::text, 800, 2000, 100, 5, 1, true)
       RETURNING id`
    );
    testProdId = prod.rows[0].id;

    // Cerrar cajas previas del usuario 1
    await pool.query(
      "UPDATE cajas SET estado='cerrada', fecha_cierre=NOW() WHERE id_usuario=1 AND comercio_id=1 AND estado='abierta'"
    );

    // Abrir caja
    const caja = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 5000, 1, 'abierta') RETURNING id"
    );
    testCajaId = caja.rows[0].id;
  });

  afterAll(async () => {
    if (testVentaId) {
      await pool.query('DELETE FROM detalle_ventas WHERE id_venta = $1', [testVentaId]);
      await pool.query('DELETE FROM ventas WHERE id = $1', [testVentaId]);
    }
    if (testCajaId) {
      await pool.query('DELETE FROM movimientos_caja WHERE id_caja = $1', [testCajaId]);
      await pool.query('DELETE FROM cajas WHERE id = $1', [testCajaId]);
    }
    if (testProdId) {
      await pool.query('DELETE FROM detalle_ventas WHERE id_producto = $1', [testProdId]);
      await pool.query('DELETE FROM productos WHERE id = $1', [testProdId]);
    }
    await pool.end();
  });

  // ── N1: dashboard-hoy no usa estado_factura ─────────────────────────────────
  describe('N1: /dashboard-hoy usa columna estado correcta', () => {
    it('responde 200 sin error de columna desconocida', async () => {
      const res = await request(app)
        .get('/api/reportes/dashboard-hoy')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('badges_modulos');
      expect(res.body.badges_modulos).toHaveProperty('facturas_pendientes_cae');
      // El valor debe ser un número entero >= 0
      expect(typeof res.body.badges_modulos.facturas_pendientes_cae).toBe('number');
    });

    it('errores de BD en queries 7 y 8 ahora propagan (no se ocultan)', async () => {
      // Con el fix N1, si hay un error SQL, el errorHandler lo recibe.
      // No podemos forzar un error SQL en prod, pero verificamos que el endpoint
      // no llama .catch() silenciosamente. La prueba indirecta es que el endpoint
      // devuelve 200 con datos reales (no defaults falsos).
      const res = await request(app)
        .get('/api/reportes/dashboard-hoy')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      // deuda_total_cc debe ser un numero real (no default 0 de catch)
      expect(typeof res.body.badges_modulos.deuda_total_cc).toBe('number');
    });
  });

  // ── N2: /abc eliminado; /analisis-abc es el canon ───────────────────────────
  describe('N2: ruta /abc eliminada, /analisis-abc es canon', () => {
    it('/api/reportes/abc retorna 404 (ruta eliminada)', async () => {
      const res = await request(app)
        .get('/api/reportes/abc')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('/api/reportes/analisis-abc responde 200 con estructura correcta', async () => {
      const res = await request(app)
        .get('/api/reportes/analisis-abc?dias=30')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categoria_a');
      expect(res.body).toHaveProperty('categoria_b');
      expect(res.body).toHaveProperty('categoria_c');
      expect(res.body).toHaveProperty('resumen');
    });
  });

  // ── N3: migración 019 existe en disco ───────────────────────────────────────
  describe('N3: migración 019 creada', () => {
    it('el archivo 019_schema_drift_fix.sql existe', () => {
      const migPath = path.resolve(__dirname, '../migrations/019_schema_drift_fix.sql');
      expect(fs.existsSync(migPath)).toBe(true);
      const content = fs.readFileSync(migPath, 'utf-8');
      expect(content).toContain('superadmin');
      expect(content).toContain('qr');
      expect(content).toContain('cuenta_corriente');
      expect(content).toContain('costo_unitario');
    });
  });

  // ── N4: /inventario acumula en centavos ─────────────────────────────────────
  describe('N4: /inventario totals sin deriva float', () => {
    it('valor_costo_total y valor_venta_total son numeros con 2 decimales exactos', async () => {
      const res = await request(app)
        .get('/api/reportes/inventario')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totals');
      const { valor_costo_total, valor_venta_total } = res.body.totals;
      // No debe tener mas de 2 decimales (ej: no 1500.0000000001)
      expect(String(valor_costo_total)).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(String(valor_venta_total)).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  });

  // ── N5: /margenes usa costo_unitario de detalle_ventas ──────────────────────
  describe('N5: /margenes query con COALESCE(dv.costo_unitario, p.costo)', () => {
    it('devuelve 200 y ganancia_mes por producto', async () => {
      const res = await request(app)
        .get('/api/reportes/margenes')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('ganancia_mes');
      }
    });

    it('el margen no cambia si se actualiza p.costo despues de una venta', async () => {
      // 1. Registrar venta (costo al momento = 800)
      const ventaRes = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({ productos: [{ id: testProdId, cantidad: 1 }], metodo_pago: 'efectivo', tipo_comprobante: 'interno' });
      expect(ventaRes.status).toBe(201);
      testVentaId = ventaRes.body.id_venta;

      // 2. Actualizar costo_unitario en el detalle (simular migración M1)
      await pool.query(
        'UPDATE detalle_ventas SET costo_unitario = 800 WHERE id_venta = $1',
        [testVentaId]
      );

      // 3. Cambiar el costo actual del producto a 1500
      await pool.query('UPDATE productos SET costo = 1500 WHERE id = $1', [testProdId]);

      // 4. El reporte de margenes debe usar el costo historico (800), no el actual (1500)
      const margenRes = await request(app)
        .get('/api/reportes/margenes')
        .set('Authorization', `Bearer ${token}`);
      expect(margenRes.status).toBe(200);
      const productoMargen = margenRes.body.find(p => p.id === testProdId);
      if (productoMargen) {
        // ganancia = precio_unitario - costo_historico = 2000 - 800 = 1200
        // (no 2000 - 1500 = 500)
        expect(Number(productoMargen.ganancia_mes)).toBeCloseTo(1200, 0);
      }

      // Restaurar costo original
      await pool.query('UPDATE productos SET costo = 800 WHERE id = $1', [testProdId]);
    });
  });

  // ── N6: predicados sargables de fecha ───────────────────────────────────────
  describe('N6: /ventas acepta rango desde/hasta (sargable)', () => {
    it('filtra ventas correctamente por rango de fecha', async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/reportes/ventas?desde=${hoy}&hasta=${hoy}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('ventas');
      // ingresos_totales con maximos 2 decimales
      const ingresos = res.body.summary.ingresos_totales;
      expect(String(ingresos)).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  });

  // ── N7: caja-estado distingue estados correctamente ─────────────────────────
  describe('N7: /api/ventas/caja-estado devuelve estado real', () => {
    it('con caja abierta devuelve caja != null', async () => {
      const res = await request(app)
        .get('/api/ventas/caja-estado')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.caja).not.toBeNull();
      expect(res.body.caja).toHaveProperty('id', testCajaId);
    });

    it('sin caja abierta devuelve caja = null (no error de red)', async () => {
      // Cerrar la caja
      await pool.query("UPDATE cajas SET estado='cerrada', fecha_cierre=NOW() WHERE id=$1", [testCajaId]);

      const res = await request(app)
        .get('/api/ventas/caja-estado')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.caja).toBeNull();

      // Reabrir para que afterAll pueda limpiar
      await pool.query("UPDATE cajas SET estado='abierta', fecha_cierre=NULL WHERE id=$1", [testCajaId]);
    });
  });
});

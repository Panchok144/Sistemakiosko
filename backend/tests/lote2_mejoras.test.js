/**
 * backend/tests/lote2_mejoras.test.js
 * Tests para M1–M4 (backend). M5 y M6 son frontend/browser, se testean manualmente.
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

describe('LOTE 2 — Mejoras M1–M4', () => {
  let testProdId    = null;
  let testVentaId   = null;
  let testCajaId    = null;

  beforeAll(async () => {
    // Crear producto de prueba
    const prod = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, comercio_id, activo, activo_pos)
       VALUES ('TestM1-M4', 'TESTM1M4-' || floor(random()*100000)::text, 600, 1800, 50, 1, true, true)
       RETURNING id`
    );
    testProdId = prod.rows[0].id;

    // Caja abierta
    await pool.query(
      "UPDATE cajas SET estado='cerrada', fecha_cierre=NOW() WHERE id_usuario=1 AND comercio_id=1 AND estado='abierta'"
    );
    const caja = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 5000, 1, 'abierta') RETURNING id"
    );
    testCajaId = caja.rows[0].id;
  });

  afterAll(async () => {
    if (testVentaId) {
      await pool.query('DELETE FROM detalle_ventas WHERE id_venta=$1', [testVentaId]);
      await pool.query('DELETE FROM ventas WHERE id=$1', [testVentaId]);
    }
    if (testCajaId) {
      await pool.query('DELETE FROM cajas WHERE id=$1', [testCajaId]);
    }
    if (testProdId) {
      await pool.query('DELETE FROM historial_precios WHERE producto_id=$1', [testProdId]);
      await pool.query('DELETE FROM detalle_ventas WHERE id_producto=$1', [testProdId]);
      await pool.query('DELETE FROM productos WHERE id=$1', [testProdId]);
    }
    await pool.end();
  });

  // ── M1: Costo congelado ──────────────────────────────────────────────────────
  describe('M1: costo_unitario congelado en detalle_ventas', () => {
    it('la venta guarda costo_unitario en detalle_ventas', async () => {
      const ventaRes = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({ productos: [{ id: testProdId, cantidad: 2 }], metodo_pago: 'efectivo', tipo_comprobante: 'interno' });
      expect(ventaRes.status).toBe(201);
      testVentaId = ventaRes.body.id_venta;

      // Verificar que costo_unitario fue guardado
      const dvRes = await pool.query(
        'SELECT costo_unitario FROM detalle_ventas WHERE id_venta=$1 AND id_producto=$2',
        [testVentaId, testProdId]
      );
      expect(dvRes.rowCount).toBeGreaterThan(0);
      expect(Number(dvRes.rows[0].costo_unitario)).toBe(600);
    });

    it('cambiar el costo del producto no afecta el historial de la venta', async () => {
      await pool.query('UPDATE productos SET costo=9999 WHERE id=$1', [testProdId]);
      const dvRes = await pool.query(
        'SELECT costo_unitario FROM detalle_ventas WHERE id_venta=$1', [testVentaId]
      );
      expect(Number(dvRes.rows[0].costo_unitario)).toBe(600); // histórico intacto
      await pool.query('UPDATE productos SET costo=600 WHERE id=$1', [testProdId]);
    });
  });

  // ── M2: Sugerencia de compra ─────────────────────────────────────────────────
  describe('M2: /api/ordenes-compra/sugerencia', () => {
    it('responde 200 con estructura correcta', async () => {
      const res = await request(app)
        .get('/api/ordenes-compra/sugerencia?dias_umbral=7&dias_analisis=30')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sugerencias');
      expect(res.body).toHaveProperty('total_productos');
      expect(Array.isArray(res.body.sugerencias)).toBe(true);
    });

    it('cada item de sugerencia tiene cantidad_sugerida >= 1', async () => {
      const res = await request(app)
        .get('/api/ordenes-compra/sugerencia')
        .set('Authorization', `Bearer ${token}`);
      for (const prov of res.body.sugerencias) {
        for (const item of prov.items) {
          expect(item.cantidad_sugerida).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  // ── M3: Pausas POS ───────────────────────────────────────────────────────────
  describe('M3: pausas de productos en POS', () => {
    it('POST /:id/pausa suspende el producto del POS', async () => {
      const res = await request(app)
        .post(`/api/productos/${testProdId}/pausa`)
        .set('Authorization', `Bearer ${token}`)
        .send({ horas: 2 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pausado_hasta');
    });

    it('el producto pausado no aparece en GET /api/productos', async () => {
      const res = await request(app)
        .get('/api/productos')
        .set('Authorization', `Bearer ${token}`);
      const ids = res.body.map(p => p.id);
      expect(ids).not.toContain(testProdId);
    });

    it('GET /pausados lista el producto pausado', async () => {
      const res = await request(app)
        .get('/api/productos/pausados')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const ids = res.body.pausados.map(p => p.id);
      expect(ids).toContain(testProdId);
    });

    it('DELETE /:id/pausa reactiva el producto', async () => {
      const res = await request(app)
        .delete(`/api/productos/${testProdId}/pausa`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      // Verificar que volvió a aparecer en listado
      const lista = await request(app)
        .get('/api/productos')
        .set('Authorization', `Bearer ${token}`);
      const ids = lista.body.map(p => p.id);
      expect(ids).toContain(testProdId);
    });
  });

  // ── M4: Historial de precios ─────────────────────────────────────────────────
  describe('M4: historial de precios', () => {
    it('PUT /api/productos/:id registra cambio en historial_precios', async () => {
      // Actualizar precio del producto de prueba
      const res = await request(app)
        .put(`/api/productos/${testProdId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          codigo_barras: 'TESTM1M4-upd',
          nombre: 'TestM1-M4 Updated',
          precio_venta: 2500,   // cambio de precio
          costo: 600,
          stock: 50,
          confirmar_variacion: true,
        });
      expect(res.status).toBe(200);
    });

    it('GET /:id/historial-precios devuelve al menos 1 registro', async () => {
      const res = await request(app)
        .get(`/api/productos/${testProdId}/historial-precios`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('historial');
      expect(Array.isArray(res.body.historial)).toBe(true);
      expect(res.body.historial.length).toBeGreaterThanOrEqual(1);
      // El registro debe tener el precio anterior y nuevo
      const h = res.body.historial[0];
      expect(h).toHaveProperty('precio_anterior');
      expect(h).toHaveProperty('precio_nuevo');
      expect(h).toHaveProperty('campo');
    });
  });

  // ── Migraciones del Lote 2 ───────────────────────────────────────────────────
  describe('Archivos de migración Lote 2', () => {
    it('020_costo_congelado_historial_precios.sql existe y es correcto', () => {
      const p = path.resolve(__dirname, '../migrations/020_costo_congelado_historial_precios.sql');
      expect(fs.existsSync(p)).toBe(true);
      const c = fs.readFileSync(p, 'utf-8');
      expect(c).toContain('costo_unitario');
      expect(c).toContain('historial_precios');
      expect(c).toContain('activo_pos');
    });
  });
});

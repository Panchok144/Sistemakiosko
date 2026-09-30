import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/conexion');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign({ id: 1, rol: 'administrador', comercio_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 4 — MEJORAS P3 (M13 – M18)', () => {
  let testProdId = null;
  let testClienteId = null;
  let testPromoId = null;

  beforeAll(async () => {
    // Crear producto de prueba
    const prodRes = await db.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, rubro, comercio_id, activo)
       VALUES ('Producto Test Lote4', 'TEST-L4-' || floor(random()*100000), 100, 500, 30, 5, 'Golosinas', 1, true)
       RETURNING id`
    );
    testProdId = prodRes.rows[0].id;

    // Crear cliente de prueba para fidelidad
    const cliRes = await db.query(
      `INSERT INTO clientes (nombre, documento, telefono, comercio_id, puntos)
       VALUES ('Cliente Test Lote4', 'CLI-L4-' || floor(random()*100000), '1122334455', 1, 50)
       RETURNING id`
    );
    testClienteId = cliRes.rows[0].id;

    // Asegurar configuración de fidelidad mínima
    await db.query(
      `INSERT INTO configuracion (comercio_id, clave, valor)
       VALUES (1, 'fidelidad_habilitada', 'true'), (1, 'fidelidad_pesos_por_punto', '100'), (1, 'fidelidad_valor_punto', '1')
       ON CONFLICT (comercio_id, clave) DO UPDATE SET valor = EXCLUDED.valor`
    );

    // Asegurar slug_catalogo para prueba M15
    await db.query(
      `UPDATE comercios SET catalogo_publico_habilitado = true, slug_catalogo = 'test-kiosko-l4' WHERE id = 1`
    );
  });

  afterAll(async () => {
    // Limpiar datos de prueba
    if (testPromoId) {
      await db.query('DELETE FROM promociones WHERE id = $1', [testPromoId]).catch(() => {});
    }
    if (testClienteId) {
      await db.query('DELETE FROM cliente_puntos_movimientos WHERE cliente_id = $1', [testClienteId]).catch(() => {});
      await db.query('DELETE FROM clientes WHERE id = $1', [testClienteId]).catch(() => {});
    }
    if (testProdId) {
      await db.query('DELETE FROM productos WHERE id = $1', [testProdId]).catch(() => {});
    }
    // Revertir slug
    await db.query(`UPDATE comercios SET slug_catalogo = NULL, catalogo_publico_habilitado = false WHERE id = 1`).catch(() => {});
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  M13: Motor de Promociones
  // ────────────────────────────────────────────────────────────────────────────
  describe('M13 — Motor de Promociones', () => {
    it('GET /api/promociones — devuelve lista de promociones', async () => {
      const res = await request(app)
        .get('/api/promociones')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/promociones — crea promoción 2x1', async () => {
      const res = await request(app)
        .post('/api/promociones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nombre: 'Test 2x1 Lote4',
          tipo: '2x1',
          parametros: { producto_id: testProdId },
          activa: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.promocion).toBeDefined();
      testPromoId = res.body.promocion.id;
    });

    it('POST /api/promociones/evaluar — evalúa carrito con promo 2x1', async () => {
      const res = await request(app)
        .post('/api/promociones/evaluar')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ id: testProdId, cantidad: 2, precio_unitario: 500 }],
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('descuento_total');
      expect(res.body).toHaveProperty('promos_aplicadas');
      expect(res.body).toHaveProperty('items_con_promo');
      // 2x1: 1 par = 1 gratis = descuento de $500
      expect(res.body.descuento_total).toBe(500);
    });

    it('POST /api/promociones/evaluar — carrito sin promo aplicable retorna 0 descuento', async () => {
      const res = await request(app)
        .post('/api/promociones/evaluar')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ id: testProdId, cantidad: 1, precio_unitario: 500 }],
        });
      expect(res.status).toBe(200);
      // Solo 1 unidad, el 2x1 no aplica
      expect(res.body.descuento_total).toBe(0);
    });

    it('PUT /api/promociones/:id — actualiza activa a false', async () => {
      expect(testPromoId).toBeDefined();
      const res = await request(app)
        .put(`/api/promociones/${testPromoId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ activa: false });
      expect(res.status).toBe(200);
      expect(res.body.promocion.activa).toBe(false);
    });

    it('DELETE /api/promociones/:id — elimina la promoción', async () => {
      expect(testPromoId).toBeDefined();
      const res = await request(app)
        .delete(`/api/promociones/${testPromoId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      testPromoId = null; // ya eliminada, no limpiar en afterAll
    });

    it('POST /api/promociones — rechaza tipo inválido', async () => {
      const res = await request(app)
        .post('/api/promociones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nombre: 'Test', tipo: 'invalido', parametros: {} });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  M14: Fidelidad Simple
  // ────────────────────────────────────────────────────────────────────────────
  describe('M14 — Fidelidad Simple', () => {
    it('GET /api/fidelidad/config — devuelve configuración de fidelidad', async () => {
      const res = await request(app)
        .get('/api/fidelidad/config')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('habilitada');
      expect(res.body).toHaveProperty('pesos_por_punto');
      expect(res.body).toHaveProperty('valor_punto');
    });

    it('PUT /api/fidelidad/config — guarda configuración', async () => {
      const res = await request(app)
        .put('/api/fidelidad/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ habilitada: true, pesos_por_punto: 100, valor_punto: 1 });
      expect(res.status).toBe(200);
      expect(res.body.mensaje).toBeDefined();
    });

    it('GET /api/fidelidad/cliente/:id — devuelve puntos del cliente', async () => {
      expect(testClienteId).toBeDefined();
      const res = await request(app)
        .get(`/api/fidelidad/cliente/${testClienteId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.cliente).toHaveProperty('puntos');
      expect(res.body.cliente.puntos).toBeGreaterThanOrEqual(50);
      expect(res.body).toHaveProperty('movimientos');
    });

    it('POST /api/fidelidad/acumular — acumula puntos por compra de $500', async () => {
      const res = await request(app)
        .post('/api/fidelidad/acumular')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cliente_id: testClienteId, total_venta: 500, venta_id: null });
      expect(res.status).toBe(200);
      // $500 / $100 por punto = 5 puntos
      expect(res.body.puntos_acumulados).toBe(5);
    });

    it('POST /api/fidelidad/canjear — canjea puntos correctamente', async () => {
      const res = await request(app)
        .post('/api/fidelidad/canjear')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cliente_id: testClienteId, puntos_a_canjear: 10 });
      expect(res.status).toBe(200);
      expect(res.body.descuento_aplicado).toBe(10); // 10 puntos × $1 = $10
    });

    it('POST /api/fidelidad/canjear — rechaza canje si no hay puntos suficientes', async () => {
      const res = await request(app)
        .post('/api/fidelidad/canjear')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cliente_id: testClienteId, puntos_a_canjear: 999999 });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  M15: Catálogo Público
  // ────────────────────────────────────────────────────────────────────────────
  describe('M15 — Catálogo Público', () => {
    it('GET /api/catalogo/:slug — devuelve catálogo cuando habilitado', async () => {
      const res = await request(app)
        .get('/api/catalogo/test-kiosko-l4');
      // Sin token — ruta pública
      expect(res.status).toBe(200);
      expect(res.body.comercio).toBeDefined();
      expect(Array.isArray(res.body.productos)).toBe(true);
    });

    it('GET /api/catalogo/:slug — 404 para slug inexistente', async () => {
      const res = await request(app)
        .get('/api/catalogo/slug-que-no-existe-99999');
      expect(res.status).toBe(404);
    });

    it('PUT /api/configuracion/catalogo — guarda slug del catálogo', async () => {
      const res = await request(app)
        .put('/api/configuracion/catalogo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug_catalogo: 'test-kiosko-l4', catalogo_publico_habilitado: true });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('slug_catalogo');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  M16: Cierre de Mes Programado
  // ────────────────────────────────────────────────────────────────────────────
  describe('M16 — Cierre de Mes (Resumen Mensual)', () => {
    it('GET /api/reportes/resumen-ejecutivo — retorna resumen del mes actual', async () => {
      const res = await request(app)
        .get('/api/reportes/resumen-ejecutivo')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('periodo');
      expect(res.body).toHaveProperty('resumen');
      expect(res.body.resumen).toHaveProperty('ingresos_totales');
      expect(res.body.resumen).toHaveProperty('resultado_neto');
      expect(res.body).toHaveProperty('top_productos');
      expect(res.body).toHaveProperty('por_rubro');
      expect(res.body).toHaveProperty('por_metodo_pago');
    });

    it('GET /api/reportes/resumen-ejecutivo — acepta parámetros de mes/año', async () => {
      const res = await request(app)
        .get('/api/reportes/resumen-ejecutivo?anio=2025&mes=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.periodo.anio).toBe(2025);
      expect(res.body.periodo.mes).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  //  M17: Comparador de Períodos
  // ────────────────────────────────────────────────────────────────────────────
  describe('M17 — Comparador de Períodos', () => {
    it('GET /api/reportes/comparar-periodos — retorna comparación con deltas', async () => {
      const res = await request(app)
        .get('/api/reportes/comparar-periodos')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('periodos');
      expect(res.body.periodos).toHaveProperty('actual');
      expect(res.body.periodos).toHaveProperty('anterior');
      expect(res.body).toHaveProperty('actual');
      expect(res.body).toHaveProperty('anterior');
      expect(res.body).toHaveProperty('deltas');
      expect(res.body.deltas).toHaveProperty('ingresos_pct');
      expect(res.body).toHaveProperty('por_rubro');
      expect(res.body).toHaveProperty('por_metodo_pago');
    });

    it('GET /api/reportes/comparar-periodos — actual e ingresos son números', async () => {
      const res = await request(app)
        .get('/api/reportes/comparar-periodos')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(typeof res.body.actual.ingresos).toBe('number');
      expect(typeof res.body.anterior.ingresos).toBe('number');
    });
  });
});

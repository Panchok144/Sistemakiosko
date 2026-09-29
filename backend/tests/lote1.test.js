import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { pool } = require('../db/pgConexion');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const token = jwt.sign({ id: 1, rol: 'administrador' }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 1 — Auditoría y Correcciones Críticas (C1, C2, C3)', () => {
  let testCajaId = null;
  let testProdId = null;
  let testVentaEfectivoId = null;
  let testVentaTarjetaId = null;

  beforeAll(async () => {
    // Asegurar que existe un producto con stock para las pruebas
    const prodRes = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id)
       VALUES ('Producto Test Lote1', 'TEST-LOTE1-' || floor(random()*100000), 500, 1500, 50, 5, 1)
       RETURNING id, precio_venta`
    );
    testProdId = prodRes.rows[0].id;

    // Cerrar cualquier caja abierta previa del usuario 1 para arrancar con estado conocido
    await pool.query(
      "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id_usuario = 1 AND comercio_id = 1 AND estado = 'abierta'"
    );

    // Abrir una caja limpia para el lote de pruebas
    const cajaRes = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 5000, 1, 'abierta') RETURNING id"
    );
    testCajaId = cajaRes.rows[0].id;
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
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

  // ── C1: PRECIO IMPUESTO POR EL CLIENTE ─────────────────────────────────────
  describe('C1: Precio resuelto exclusivamente en el servidor', () => {
    it('1. Rechaza con 400 cualquier intento de enviar precio_venta en un ítem', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1, precio_venta: 10.0 }], // Manipulación de precio
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No se permite especificar precio_venta en los ítems');
    });

    it('2. Resuelve el precio desde la BD cuando el body envía solo id y cantidad', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 2 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      expect(res.body.total).toBe(3000); // 1500 * 2
      expect(res.body.id_venta).toBeDefined();
      testVentaEfectivoId = res.body.id_venta;
    });

    it('3. Resuelve el precio con lista de precios si se especifica id_lista_precios', async () => {
      // Crear una lista con 10% de recargo
      const listaRes = await pool.query(
        "INSERT INTO listas_precios (nombre, porcentaje_ajuste, activa, comercio_id) VALUES ('Mayorista Test', 10, true, 1) RETURNING id"
      );
      const listaId = listaRes.rows[0].id;

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          id_lista_precios: listaId,
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      // Precio base 1500 + 10% = 1650
      expect(res.body.total).toBe(1650);

      // Limpiar lista de test
      await pool.query('DELETE FROM listas_precios WHERE id = $1', [listaId]);
    });
  });

  // ── C2: MATEMÁTICA DE DINERO EN CENTAVOS ──────────────────────────────────
  describe('C2: Aritmética de dinero en centavos y validaciones', () => {
    it('4. Rechaza la venta si el descuento supera el subtotal calculado', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }], // subtotal = 1500
          descuento: 2000, // descuento mayor al subtotal
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no puede ser mayor al subtotal');
    });

    it('5. Aplica descuentos en centavos con exactitud matemática', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }], // 1500
          descuento: 250.50,
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      // 1500 - 250.50 = 1249.50
      expect(res.body.total).toBe(1249.5);
    });

    it('6. Rechaza venta con 409 ante stock insuficiente (rollback total)', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 999999 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Stock insuficiente');
    });
  });

  // ── C3: CAJA SOLO REGISTRA EFECTIVO ──────────────────────────────────────
  describe('C3: Arqueo y movimientos de caja según método de pago', () => {
    it('7. Venta con tarjeta_debito NO inserta movimiento en movimientos_caja', async () => {
      const movCountBefore = await pool.query(
        'SELECT COUNT(*) FROM movimientos_caja WHERE id_caja = $1',
        [testCajaId]
      );

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'tarjeta_debito',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      testVentaTarjetaId = res.body.id_venta;

      const movCountAfter = await pool.query(
        'SELECT COUNT(*) FROM movimientos_caja WHERE id_caja = $1',
        [testCajaId]
      );

      // El conteo de movimientos en la caja debe permanecer exactamente igual
      expect(Number(movCountAfter.rows[0].count)).toBe(Number(movCountBefore.rows[0].count));
    });

    it('8. Venta con efectivo SÍ inserta movimiento en movimientos_caja con metodo_pago="efectivo"', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);

      const movQuery = await pool.query(
        "SELECT * FROM movimientos_caja WHERE id_caja = $1 AND descripcion LIKE $2 ORDER BY id DESC LIMIT 1",
        [testCajaId, `%Venta #${res.body.id_venta}%`]
      );

      expect(movQuery.rowCount).toBe(1);
      expect(movQuery.rows[0].tipo).toBe('ingreso');
      expect(Number(movQuery.rows[0].monto)).toBe(1500);
      expect(movQuery.rows[0].metodo_pago).toBe('efectivo');
    });

    it('9. Cierre de caja suma únicamente movimientos de efectivo para el monto_teorico', async () => {
      // Crear una caja específica para la prueba de arqueo teórico
      const cajaCierre = await pool.query(
        "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 10000, 1, 'abierta') RETURNING id"
      );
      const cId = cajaCierre.rows[0].id;

      // 1 movimiento de ingreso en efectivo: $2000
      await pool.query(
        "INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, 'ingreso', 2000, 'Ingreso efectivo', 1, 'efectivo')",
        [cId]
      );

      // 1 movimiento de ingreso en tarjeta: $5000 (NO debe sumarse al teórico)
      await pool.query(
        "INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, 'ingreso', 5000, 'Venta tarjeta debito', 1, 'tarjeta_debito')",
        [cId]
      );

      // 1 egreso en efectivo: $500
      await pool.query(
        "INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, 'egreso', 500, 'Gasto menor efectivo', 1, 'efectivo')",
        [cId]
      );

      // Cerrar caja informando monto final = 11500 (10000 inicial + 2000 - 500 = 11500 esperado)
      const res = await request(app)
        .post(`/api/caja/${cId}/cerrar`)
        .set('Authorization', `Bearer ${token}`)
        .send({ monto_final: 11500 });

      expect(res.status).toBe(200);
      // Monto teórico debe ser 11500 (ignorando los 5000 de tarjeta)
      expect(res.body.monto_teorico).toBe(11500);
      expect(res.body.diferencia).toBe(0);

      // Limpiar caja de test
      await pool.query('DELETE FROM movimientos_caja WHERE id_caja = $1', [cId]);
      await pool.query('DELETE FROM cajas WHERE id = $1', [cId]);
    });

    it('10. Devolución de venta en tarjeta NO egresa efectivo a caja a menos que se indique reembolso_efectivo', async () => {
      // Registrar devolución vinculada a la venta en tarjeta creada en test 7
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          venta_id: testVentaTarjetaId,
          items: [{ producto_id: testProdId, cantidad: 1, precio_unitario: 1500 }],
          motivo: 'Producto defectuoso',
          devolver_a_caja: true, // Solicita devolver a caja pero la venta fue con tarjeta
          reembolso_efectivo: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.devuelto_caja).toBe(false); // No debe registrarse en la caja física
    });

    it('11. Devolución de venta en efectivo con devolver_a_caja SÍ egresa dinero de la caja', async () => {
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          venta_id: testVentaEfectivoId,
          items: [{ producto_id: testProdId, cantidad: 1, precio_unitario: 1500 }],
          motivo: 'Devolución cliente',
          devolver_a_caja: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.devuelto_caja).toBe(true);

      // Verificar que se insertó el movimiento de egreso
      const movQuery = await pool.query(
        "SELECT * FROM movimientos_caja WHERE id_caja = $1 AND tipo = 'egreso' AND descripcion LIKE $2",
        [testCajaId, `%Devolución #${res.body.id}%`]
      );
      expect(movQuery.rowCount).toBe(1);
      expect(Number(movQuery.rows[0].monto)).toBe(1500);
      expect(movQuery.rows[0].metodo_pago).toBe('efectivo');
    });

    it('12. Rechaza con 403 registrar venta si no hay una caja abierta', async () => {
      // Cerrar la caja activa
      await pool.query(
        "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id = $1",
        [testCajaId]
      );

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('No hay una caja abierta');
    });
  });
});

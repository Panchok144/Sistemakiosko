import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { pool } = require('../db/pgConexion');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign({ id: 1, rol: 'administrador' }, JWT_SECRET, { expiresIn: '1h' });
const empleadoToken = jwt.sign({ id: 3, rol: 'empleado' }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 2 — Auditoría y Correcciones Críticas (C4, C5)', () => {
  let testCajaId = null;
  let testProdId = null;
  let testClienteId = null;
  let testVentaId = null;
  let testVentaCCId = null;

  beforeAll(async () => {
    // 1. Configurar PIN supervisor en el admin (id: 1)
    await pool.query(
      "UPDATE usuarios SET pin_supervisor = '9999' WHERE id = 1"
    );

    // 2. Crear producto de test
    const prodRes = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id)
       VALUES ('Producto Test Lote2', 'TEST-L2-' || floor(random()*100000), 500, 2000, 50, 5, 1)
       RETURNING id, precio_venta`
    );
    testProdId = prodRes.rows[0].id;

    // 3. Crear cliente con cuenta corriente
    const cliRes = await pool.query(
      `INSERT INTO clientes (nombre, documento, tiene_cuenta_corriente, credito_limite, saldo_deuda, comercio_id)
       VALUES ('Cliente Test Lote2', 'CLI-' || floor(random()*100000), true, 50000, 0, 1)
       RETURNING id`
    );
    testClienteId = cliRes.rows[0].id;

    // 4. Cerrar cajas abiertas del usuario 1 y 3 para iniciar con caja limpia
    await pool.query(
      "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE (id_usuario = 1 OR id_usuario = 3) AND comercio_id = 1 AND estado = 'abierta'"
    );

    // 5. Abrir caja para usuario 1 (admin)
    const cajaAdmin = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 5000, 1, 'abierta') RETURNING id"
    );
    testCajaId = cajaAdmin.rows[0].id;

    // 6. Abrir caja para usuario 3 (empleado)
    await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (3, 5000, 1, 'abierta')"
    );

    // 7. Crear una venta de origen en efectivo con 5 unidades de testProdId
    const ventaRes = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productos: [{ id: testProdId, cantidad: 5 }],
        metodo_pago: 'efectivo',
        tipo_comprobante: 'interno',
      });
    testVentaId = ventaRes.body.id_venta;

    // 8. Crear una venta de origen en cuenta corriente con 2 unidades de testProdId
    const ventaCCRes = await request(app)
      .post('/api/ventas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productos: [{ id: testProdId, cantidad: 2 }],
        metodo_pago: 'cuenta_corriente',
        cliente_id: testClienteId,
        tipo_comprobante: 'interno',
      });
    testVentaCCId = ventaCCRes.body.id_venta;
  });

  afterAll(async () => {
    // Limpieza
    if (testCajaId) {
      await pool.query('DELETE FROM movimientos_caja WHERE id_caja = $1', [testCajaId]);
      await pool.query('DELETE FROM cajas WHERE id_usuario IN (1, 3)');
    }
    if (testVentaId || testVentaCCId) {
      const vIds = [testVentaId, testVentaCCId].filter(Boolean);
      await pool.query('DELETE FROM devolucion_items WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE venta_id = ANY($1))', [vIds]);
      await pool.query('DELETE FROM devoluciones WHERE venta_id = ANY($1)', [vIds]);
      await pool.query('DELETE FROM detalle_ventas WHERE id_venta = ANY($1)', [vIds]);
      await pool.query('DELETE FROM movimientos_cuenta_corriente WHERE cliente_id = $1', [testClienteId]);
      await pool.query('DELETE FROM ventas WHERE id = ANY($1)', [vIds]);
    }
    if (testProdId) {
      await pool.query('DELETE FROM productos WHERE id = $1', [testProdId]);
    }
    if (testClienteId) {
      await pool.query('DELETE FROM clientes WHERE id = $1', [testClienteId]);
    }
    await pool.end();
  });

  // ── C4: DEVOLUCIONES SIN TOPE Y PRECIO DESDE DETALLE_VENTAS ────────────────
  describe('C4: Control estricto de devoluciones', () => {
    it('1. Rechaza con 400 una devolución que no incluye venta_id', async () => {
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ producto_id: testProdId, cantidad: 1 }],
          motivo: 'Devolución sin ticket',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('venta_id es obligatorio');
    });

    it('2. Rechaza con 404 si la venta_id no existe en el comercio', async () => {
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venta_id: 99999999,
          items: [{ producto_id: testProdId, cantidad: 1 }],
          motivo: 'Venta inexistente',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Venta no encontrada');
    });

    it('3. Rechaza con 409 si la cantidad a devolver supera la cantidad vendida original', async () => {
      // Venta original tenía 5 unidades, intentar devolver 10
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venta_id: testVentaId,
          items: [{ producto_id: testProdId, cantidad: 10 }],
          motivo: 'Devolución excesiva',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('supera la cantidad disponible');
    });

    it('4. Procesa devolución válida tomando el precio real de detalle_ventas (ignora precio manipulado)', async () => {
      // La venta original fue a $2000 por unidad. Enviamos precio_unitario: 10 para probar inmunidad
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venta_id: testVentaId,
          items: [{ producto_id: testProdId, cantidad: 2, precio_unitario: 10.0 }],
          motivo: 'Devolución 2 unidades',
          devolver_a_caja: true,
        });

      expect(res.status).toBe(201);
      // Total devuelto debe ser 2 * 2000 = 4000 (no 2 * 10 = 20)
      expect(res.body.total_devuelto).toBe(4000);
      expect(res.body.devuelto_caja).toBe(true);

      // Verificar en BD que devolucion_items guardó $2000
      const itemRes = await pool.query(
        'SELECT precio_unitario, subtotal FROM devolucion_items WHERE devolucion_id = $1',
        [res.body.id]
      );
      expect(Number(itemRes.rows[0].precio_unitario)).toBe(2000);
      expect(Number(itemRes.rows[0].subtotal)).toBe(4000);
    });

    it('5. Rechaza con 409 si devoluciones acumuladas superan el saldo original de la venta', async () => {
      // Ya se devolvieron 2 de las 5 unidades. Quedan 3 disponibles.
      // Intentar devolver 4 debe ser rechazado con 409.
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venta_id: testVentaId,
          items: [{ producto_id: testProdId, cantidad: 4 }],
          motivo: 'Supera remanente',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('supera la cantidad disponible');
    });

    it('6. Devolución de venta en Cuenta Corriente reduce deuda del cliente e inserta nota_credito', async () => {
      // Venta CC fue de 2 unidades a $2000 = $4000 de deuda
      const cliBefore = await pool.query('SELECT saldo_deuda FROM clientes WHERE id = $1', [testClienteId]);
      expect(Number(cliBefore.rows[0].saldo_deuda)).toBe(4000);

      // Devolver 1 unidad ($2000)
      const res = await request(app)
        .post('/api/devoluciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          venta_id: testVentaCCId,
          items: [{ producto_id: testProdId, cantidad: 1 }],
          motivo: 'Devolución parcial cuenta corriente',
        });

      expect(res.status).toBe(201);
      expect(res.body.total_devuelto).toBe(2000);

      // Saldo deudor debe reducirse a $2000
      const cliAfter = await pool.query('SELECT saldo_deuda FROM clientes WHERE id = $1', [testClienteId]);
      expect(Number(cliAfter.rows[0].saldo_deuda)).toBe(2000);

      // Debe existir movimiento en cuenta corriente de tipo 'nota_credito'
      const movCC = await pool.query(
        "SELECT tipo, monto FROM movimientos_cuenta_corriente WHERE cliente_id = $1 AND tipo = 'nota_credito' ORDER BY id DESC LIMIT 1",
        [testClienteId]
      );
      expect(movCC.rowCount).toBe(1);
      expect(Number(movCC.rows[0].monto)).toBe(2000);
    });
  });

  // ── C5: DESCUENTO CON LÍMITE POR ROL Y AUTORIZACIÓN POR PIN ───────────────
  describe('C5: Límites de descuento por rol y PIN de supervisor', () => {
    it('7. Rol empleado: rechaza con 403 descuento que supera el 10% permitido', async () => {
      // Venta de 1 unidad ($2000). Descuento de $600 = 30% (supera el 10% de empleado)
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          descuento: 600,
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('supera el máximo permitido para tu rol');

      // Verificar que se registró la alerta de seguridad en la BD
      const alertaRes = await pool.query(
        "SELECT * FROM alertas_seguridad WHERE usuario_id = 3 AND tipo = 'DESCUENTO_EXCESIVO_NO_AUTORIZADO' ORDER BY id DESC LIMIT 1"
      );
      expect(alertaRes.rowCount).toBe(1);
    });

    it('8. Rol empleado: permite descuento dentro de su límite permitido (≤ 10%)', async () => {
      // Venta de 1 unidad ($2000). Descuento de $100 = 5% (permitido)
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          descuento: 100,
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      expect(res.body.total).toBe(1900);
    });

    it('9. Rol empleado: permite descuento excesivo si se acompaña de PIN supervisor válido', async () => {
      // Descuento de $800 (40%) pero con PIN '9999' del admin
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          descuento: 800,
          pin_supervisor: '9999',
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      expect(res.body.total).toBe(1200);

      // Verificar que se registró en auditoría el evento de autorización de supervisor
      const auditRes = await pool.query(
        "SELECT * FROM auditoria WHERE tipo_evento = 'DESCUENTO_AUTORIZADO' AND descripcion LIKE '%supervisor fran%' ORDER BY id DESC LIMIT 1"
      );
      expect(auditRes.rowCount).toBe(1);
    });

    it('10. Rol administrador: permite aplicar descuentos sin requerir PIN (límite 100%)', async () => {
      // Admin aplicando 50% de descuento ($1000 sobre $2000)
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          descuento: 1000,
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      expect(res.body.total).toBe(1000);
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { pool } = require('../db/pgConexion');
const { TIMEOUT_MS } = require('../services/arcaSoap');
const { procesarVentaCAE } = require('../services/arcaService');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign({ id: 1, rol: 'administrador' }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 3 — Desacople de Facturación Electrónica ARCA/AFIP (C6)', () => {
  let testCajaId = null;
  let testProdId = null;
  const ventasCreadas = [];

  beforeAll(async () => {
    // 1. Asegurar secuencias de facturación para comercio 1
    await pool.query(`
      INSERT INTO secuencias_facturacion (comercio_id, punto_venta, tipo_comprobante_afip, ultimo_numero)
      VALUES (1, 1, 1, 0), (1, 1, 6, 0)
      ON CONFLICT (comercio_id, punto_venta, tipo_comprobante_afip) DO NOTHING
    `);

    // 2. Por defecto para este test suite, arrancar con factura_electronica_habilitada = 'false'
    await pool.query(`
      INSERT INTO configuracion (comercio_id, clave, valor)
      VALUES (1, 'factura_electronica_habilitada', 'false')
      ON CONFLICT (comercio_id, clave)
      DO UPDATE SET valor = 'false'
    `);

    // 3. Crear producto de test
    const prodRes = await pool.query(`
      INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id)
      VALUES ('Producto Test Lote3', 'TEST-L3-' || floor(random()*100000), 500, 1500, 100, 5, 1)
      RETURNING id
    `);
    testProdId = prodRes.rows[0].id;

    // 4. Asegurar caja abierta para el usuario 1
    await pool.query(
      "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id_usuario = 1 AND comercio_id = 1 AND estado = 'abierta'"
    );
    const cajaRes = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 5000, 1, 'abierta') RETURNING id"
    );
    testCajaId = cajaRes.rows[0].id;
  });

  afterAll(async () => {
    // 1. Restaurar flag a false
    await pool.query(`
      UPDATE configuracion SET valor = 'false'
      WHERE comercio_id = 1 AND clave = 'factura_electronica_habilitada'
    `);

    // 2. Limpiar ventas de test
    if (ventasCreadas.length > 0) {
      await pool.query('DELETE FROM detalle_ventas WHERE id_venta = ANY($1)', [ventasCreadas]);
      await pool.query('DELETE FROM ventas WHERE id = ANY($1)', [ventasCreadas]);
    }

    // 3. Limpiar producto y caja
    if (testProdId) {
      await pool.query('DELETE FROM productos WHERE id = $1', [testProdId]);
    }
    if (testCajaId) {
      await pool.query('DELETE FROM movimientos_caja WHERE id_caja = $1', [testCajaId]);
      await pool.query('DELETE FROM cajas WHERE id = $1', [testCajaId]);
    }

    await pool.end();
  });

  // ── 1. CONFIGURACIÓN Y DESACOPLE ──────────────────────────────────────────
  describe('1. Validación previa de flag factura_electronica_habilitada', () => {
    it('1. Rechaza con 400 emitir Factura B cuando la facturación electrónica está deshabilitada', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          tipo_comprobante: 'factura_b',
          metodo_pago: 'efectivo',
          cliente: { nombre: 'Juan Pérez', documento: '20301234567' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('La facturación electrónica no está habilitada');
    });

    it('2. Rechaza con 400 emitir Factura A cuando la facturación electrónica está deshabilitada', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          tipo_comprobante: 'factura_a',
          metodo_pago: 'efectivo',
          cliente: { nombre: 'Empresa SA', documento: '30712345678' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('La facturación electrónica no está habilitada');
    });

    it('3. Rechaza con 400 Factura B si faltan datos del cliente (nombre o documento)', async () => {
      // Habilitar temporalmente facturación electrónica
      await pool.query(`
        UPDATE configuracion SET valor = 'true'
        WHERE comercio_id = 1 AND clave = 'factura_electronica_habilitada'
      `);

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          tipo_comprobante: 'factura_b',
          metodo_pago: 'efectivo',
          // Sin cliente
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('se requiere nombre y documento del cliente');
    });
  });

  // ── 2. EMISIÓN INMEDIATA Y ASÍNCRONA ───────────────────────────────────────
  describe('2. Emisión local inmediata en mostrador y CAE asíncrono', () => {
    let ventaFeId = null;

    it('4. Emite Factura B con respuesta 201 inmediata y estado pendiente_cae', async () => {
      // Garantizar flag habilitado
      await pool.query(`
        UPDATE configuracion SET valor = 'true'
        WHERE comercio_id = 1 AND clave = 'factura_electronica_habilitada'
      `);

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 2 }],
          tipo_comprobante: 'factura_b',
          metodo_pago: 'efectivo',
          cliente: { nombre: 'Cliente Consumidor Final', documento: '20334455667' },
        });

      expect(res.status).toBe(201);
      expect(res.body.estado).toBe('pendiente_cae');
      expect(res.body.tipo_comprobante).toBe('factura_b');
      expect(res.body.nro_comprobante).toBeGreaterThan(0);
      expect(res.body.total).toBe(3000);

      ventaFeId = res.body.id_venta;
      ventasCreadas.push(ventaFeId);

      // Verificar en la BD que la venta existe y tiene el número de comprobante asignado
      const ventaDb = await pool.query('SELECT * FROM ventas WHERE id = $1', [ventaFeId]);
      expect(ventaDb.rowCount).toBe(1);
      expect(['pendiente_cae', 'aprobada']).toContain(ventaDb.rows[0].estado);
      expect(ventaDb.rows[0].nro_comprobante).toBe(res.body.nro_comprobante);
    });

    it('5. El procesamiento asíncrono en segundo plano aprueba la venta y guarda el CAE', async () => {
      expect(ventaFeId).not.toBeNull();

      // Esperar brevemente o forzar la resolución en segundo plano
      const resultado = await procesarVentaCAE(ventaFeId);
      expect(resultado.status).toBe('aprobada');
      expect(resultado.cae).toMatch(/^CAE-/);

      // Verificar en la BD
      const ventaActualizada = await pool.query('SELECT * FROM ventas WHERE id = $1', [ventaFeId]);
      expect(ventaActualizada.rows[0].estado).toBe('aprobada');
      expect(ventaActualizada.rows[0].cae).toBe(resultado.cae);
      expect(ventaActualizada.rows[0].cae_vencimiento).not.toBeNull();
      expect(ventaActualizada.rows[0].error_afip_detalle).toBeNull();
    });
  });

  // ── 3. REINTENTO MANUAL Y TOLERANCIA A FALLOS ──────────────────────────────
  describe('3. Endpoint de reintento manual (1-click retry) y tolerancia a fallos', () => {
    let ventaFallidaId = null;

    it('6. POST /api/ventas/:id/reintentar-cae informa si la venta ya está aprobada', async () => {
      // Reintentar sobre la venta que ya fue aprobada
      const ventaAprobadaId = ventasCreadas[0];
      const res = await request(app)
        .post(`/api/ventas/${ventaAprobadaId}/reintentar-cae`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('aprobada');
      expect(res.body.mensaje).toContain('ya se encuentra aprobada');
    });

    it('7. Registra error y aumenta reintentos_cae cuando ARCA/AFIP no responde', async () => {
      // Crear una venta con estado pendiente_cae
      const resVenta = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          tipo_comprobante: 'factura_b',
          metodo_pago: 'efectivo',
          cliente: { nombre: 'Cliente Con Error', documento: '27445566778' },
        });

      expect(resVenta.status).toBe(201);
      ventaFallidaId = resVenta.body.id_venta;
      ventasCreadas.push(ventaFallidaId);

      // Simular fallo en ARCA
      process.env.ARCA_SIMULAR_ERROR = 'true';
      try {
        const resProceso = await procesarVentaCAE(ventaFallidaId, 2);
        expect(resProceso.status).toBe('pendiente_cae');
        expect(resProceso.reintentos).toBe(1);

        // Segundo intento: supera maxReintentos = 2 -> pasa a error_afip
        const resProceso2 = await procesarVentaCAE(ventaFallidaId, 2);
        expect(resProceso2.status).toBe('error_afip');
        expect(resProceso2.reintentos).toBe(2);

        const ventaDb = await pool.query('SELECT * FROM ventas WHERE id = $1', [ventaFallidaId]);
        expect(ventaDb.rows[0].estado).toBe('error_afip');
        expect(ventaDb.rows[0].reintentos_cae).toBe(2);
        expect(ventaDb.rows[0].error_afip_detalle).toBeTruthy();
      } finally {
        delete process.env.ARCA_SIMULAR_ERROR;
      }
    });

    it('8. POST /api/ventas/:id/reintentar-cae reintenta con 1 click y aprueba la venta al restablecerse el servicio', async () => {
      expect(ventaFallidaId).not.toBeNull();

      // Con el servicio disponible nuevamente (sin ARCA_SIMULAR_ERROR)
      const res = await request(app)
        .post(`/api/ventas/${ventaFallidaId}/reintentar-cae`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('aprobada');
      expect(res.body.cae).toMatch(/^CAE-/);

      const ventaFinal = await pool.query('SELECT estado, cae FROM ventas WHERE id = $1', [ventaFallidaId]);
      expect(ventaFinal.rows[0].estado).toBe('aprobada');
      expect(ventaFinal.rows[0].cae).toBe(res.body.cae);
    });

    it('9. Rechaza reintento con 400 si el comprobante es de tipo interno', async () => {
      // Crear una venta interna normal
      const resVenta = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          tipo_comprobante: 'interno',
          metodo_pago: 'efectivo',
        });

      ventasCreadas.push(resVenta.body.id_venta);

      const res = await request(app)
        .post(`/api/ventas/${resVenta.body.id_venta}/reintentar-cae`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No se puede solicitar CAE para una venta con estado 'interna'");
    });

    it('10. Rechaza reintento con 404 si la venta no pertenece al comercio', async () => {
      const res = await request(app)
        .post('/api/ventas/9999999/reintentar-cae')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Venta no encontrada en este comercio');
    });
  });

  // ── 4. TIMEOUT ESTRICTO DE 5 SEGUNDOS ──────────────────────────────────────
  describe('4. Cliente SOAP y Timeout', () => {
    it('11. El cliente SOAP tiene configurado un timeout estricto de 5000ms', () => {
      expect(TIMEOUT_MS).toBe(5000);
    });
  });
});

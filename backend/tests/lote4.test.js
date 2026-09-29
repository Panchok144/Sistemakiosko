import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const { pool } = require('../db/pgConexion');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign({ id: 1, rol: 'administrador' }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 4 — Hardening Comercial y Auditoría (A1 – A8)', () => {
  let testCajaId = null;
  let testProdId = null;
  let testProdSoftId = null;
  let testClienteId = null;

  beforeAll(async () => {
    // 1. Limpiar o abrir caja para el usuario 1
    await pool.query(
      "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id_usuario = 1 AND comercio_id = 1 AND estado = 'abierta'"
    );

    const cajaAdmin = await pool.query(
      "INSERT INTO cajas (id_usuario, monto_inicial, comercio_id, estado) VALUES (1, 10000, 1, 'abierta') RETURNING id"
    );
    testCajaId = cajaAdmin.rows[0].id;

    // 2. Crear producto estándar para pruebas de stock y ventas
    const pRes = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id, activo)
       VALUES ('Producto Test Lote4', 'TEST-L4-' || floor(random()*100000), 500, 1500, 30, 5, 1, true)
       RETURNING id, stock, precio_venta`
    );
    testProdId = pRes.rows[0].id;

    // 3. Crear producto para prueba específica de soft delete
    const pSoftRes = await pool.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, comercio_id, activo)
       VALUES ('Producto SoftDelete Lote4', 'TEST-SOFT-' || floor(random()*100000), 300, 1000, 20, 2, 1, true)
       RETURNING id`
    );
    testProdSoftId = pSoftRes.rows[0].id;

    // 4. Crear cliente con crédito para pruebas de pagos mixtos y cuenta corriente
    const cRes = await pool.query(
      `INSERT INTO clientes (nombre, documento, tiene_cuenta_corriente, credito_limite, saldo_deuda, comercio_id)
       VALUES ('Cliente Test Lote4', 'DOC-L4-' || floor(random()*100000), true, 100000, 0, 1)
       RETURNING id`
    );
    testClienteId = cRes.rows[0].id;
  });

  afterAll(async () => {
    if (testCajaId) {
      await pool.query(
        "UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id = $1",
        [testCajaId]
      );
    }
    if (testProdId) {
      await pool.query('DELETE FROM productos WHERE id = $1', [testProdId]);
    }
    if (testProdSoftId) {
      await pool.query('DELETE FROM productos WHERE id = $1', [testProdSoftId]);
    }
    if (testClienteId) {
      await pool.query('DELETE FROM clientes WHERE id = $1', [testClienteId]);
    }
  });

  // =========================================================================
  // A1: AJUSTE MANUAL DE STOCK AUDITADO CON MOTIVO
  // =========================================================================
  describe('A1: Ajuste manual de stock auditado con motivo', () => {
    it('1. Rechaza con 400 si falta el motivo o está vacío', async () => {
      const res = await request(app)
        .post(`/api/productos/${testProdId}/ajustar-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cantidad: 5,
          motivo: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('motivo');
    });

    it('2. Rechaza con 400 si la cantidad es cero o inválida', async () => {
      const res = await request(app)
        .post(`/api/productos/${testProdId}/ajustar-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cantidad: 0,
          motivo: 'Ajuste nulo de prueba',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('diferente de cero');
    });

    it('3. Rechaza con 409 si el ajuste resulta en stock negativo', async () => {
      const res = await request(app)
        .post(`/api/productos/${testProdId}/ajustar-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cantidad: -9999,
          motivo: 'Rotura masiva imposible',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('stock negativo');
    });

    it('4. Realiza ajuste positivo (+10) y registra auditoría en movimientos_stock', async () => {
      const prevStockRes = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      const stockAnterior = Number(prevStockRes.rows[0].stock);

      const res = await request(app)
        .post(`/api/productos/${testProdId}/ajustar-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cantidad: 10,
          motivo: 'Llegada de mercadería extraordinaria de proveedor',
          tipo: 'ingreso_extra'
        });

      expect(res.status).toBe(200);
      expect(res.body.stock_anterior).toBe(stockAnterior);
      expect(res.body.stock_nuevo).toBe(stockAnterior + 10);

      // Verificar actualización en la base de datos
      const prodDb = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      expect(Number(prodDb.rows[0].stock)).toBe(stockAnterior + 10);

      // Verificar registro en tabla movimientos_stock
      const movRes = await pool.query(
        'SELECT * FROM movimientos_stock WHERE producto_id = $1 ORDER BY id DESC LIMIT 1',
        [testProdId]
      );
      expect(movRes.rowCount).toBe(1);
      expect(movRes.rows[0].cantidad).toBe(10);
      expect(movRes.rows[0].stock_anterior).toBe(stockAnterior);
      expect(movRes.rows[0].stock_nuevo).toBe(stockAnterior + 10);
      expect(movRes.rows[0].motivo).toContain('Llegada de mercadería extraordinaria');
    });

    it('5. Realiza ajuste negativo (-3) por rotura y audita correctamente', async () => {
      const prevStockRes = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      const stockAnterior = Number(prevStockRes.rows[0].stock);

      const res = await request(app)
        .post(`/api/productos/${testProdId}/ajustar-stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          cantidad: -3,
          motivo: 'Botellas rotas durante acomodamiento en góndola',
          tipo: 'rotura'
        });

      expect(res.status).toBe(200);
      expect(res.body.stock_nuevo).toBe(stockAnterior - 3);

      const movRes = await pool.query(
        'SELECT * FROM movimientos_stock WHERE producto_id = $1 ORDER BY id DESC LIMIT 1',
        [testProdId]
      );
      expect(movRes.rows[0].cantidad).toBe(-3);
      expect(movRes.rows[0].tipo).toBe('rotura');
      expect(movRes.rows[0].stock_nuevo).toBe(stockAnterior - 3);
    });
  });

  // =========================================================================
  // A2: BORRADO LÓGICO DE PRODUCTOS (SOFT DELETE)
  // =========================================================================
  describe('A2: Borrado lógico de productos (Soft Delete)', () => {
    let ventaPreviaId = null;

    it('1. Registra una venta previa del producto antes de desactivarlo', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdSoftId, cantidad: 2 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      ventaPreviaId = res.body.id_venta;
    });

    it('2. DELETE /api/productos/:id ejecuta soft delete (activo = false)', async () => {
      const res = await request(app)
        .delete(`/api/productos/${testProdSoftId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toContain('desactivado');

      // Verificar en la BD que la fila sigue existiendo físicamente con activo = false
      const dbCheck = await pool.query(
        'SELECT id, activo FROM productos WHERE id = $1',
        [testProdSoftId]
      );
      expect(dbCheck.rowCount).toBe(1);
      expect(dbCheck.rows[0].activo).toBe(false);
    });

    it('3. GET /api/productos omite por defecto los productos inactivos', async () => {
      const res = await request(app)
        .get('/api/productos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const found = res.body.find(p => p.id === testProdSoftId);
      expect(found).toBeUndefined();
    });

    it('4. GET /api/productos?incluir_inactivos=true sí incluye los productos inactivos', async () => {
      const res = await request(app)
        .get('/api/productos?incluir_inactivos=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const found = res.body.find(p => p.id === testProdSoftId);
      expect(found).toBeDefined();
      expect(found.activo).toBe(false);
    });

    it('5. La venta histórica sigue consultando el detalle del producto desactivado sin errores FK', async () => {
      const res = await request(app)
        .get(`/api/ventas/${ventaPreviaId}/productos`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      const item = res.body.find(d => d.id_producto === testProdSoftId);
      expect(item).toBeDefined();
      expect(item.nombre).toBe('Producto SoftDelete Lote4');
    });
  });

  // =========================================================================
  // A3: IDEMPOTENCIA EN VENTAS (POST /api/ventas)
  // =========================================================================
  describe('A3: Idempotencia en registro de ventas', () => {
    it('1. Venta con Idempotency-Key se registra con éxito y guarda respuesta', async () => {
      const idempotencyKey = `test-idemp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const stockBeforeRes = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      const stockBefore = Number(stockBeforeRes.rows[0].stock);

      const res1 = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect([200, 201]).toContain(res1.status);
      const ventaId1 = res1.body.id_venta;
      expect(ventaId1).toBeDefined();

      const stockAfter1 = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      expect(Number(stockAfter1.rows[0].stock)).toBe(stockBefore - 1);

      // Reintento idéntico con la misma clave de idempotencia
      const res2 = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'efectivo',
          tipo_comprobante: 'interno',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.idempotente).toBe(true);
      expect(res2.body.id_venta).toBe(ventaId1);

      // El stock NO se debe haber descontado una segunda vez
      const stockAfter2 = await pool.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      expect(Number(stockAfter2.rows[0].stock)).toBe(stockBefore - 1);

      // Verificar que solo se creó 1 venta en la BD
      const vCount = await pool.query(
        'SELECT COUNT(*) FROM ventas WHERE id = $1',
        [ventaId1]
      );
      expect(Number(vCount.rows[0].count)).toBe(1);
    });
  });

  // =========================================================================
  // A4: PAGOS DIVIDIDOS / MIXTOS (ventas_pagos)
  // =========================================================================
  describe('A4: Pagos divididos / mixtos', () => {
    it('1. Rechaza con 409 si la suma de los desgloses no coincide con el total', async () => {
      // Precio unitario es 1500, total = 3000
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 2 }],
          pagos: [
            { metodo: 'efectivo', monto: 1000 },
            { metodo: 'tarjeta', monto: 1500 } // Suma 2500 !== 3000
          ],
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('no coincide con el total');
    });

    it('2. Procesa pago mixto ($1000 efectivo + $2000 debito) y acredita a caja SOLO el efectivo', async () => {
      // 2 unidades a 1500 = total 3000
      const movCajaBefore = await pool.query(
        'SELECT COALESCE(SUM(monto), 0) AS total_efectivo FROM movimientos_caja WHERE id_caja = $1',
        [testCajaId]
      );
      const efectivoAntes = parseFloat(movCajaBefore.rows[0].total_efectivo);

      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 2 }],
          pagos: [
            { metodo: 'efectivo', monto: 1000 },
            { metodo: 'tarjeta_debito', monto: 2000 }
          ],
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
      const ventaId = res.body.id_venta;

      // Verificar 2 registros en ventas_pagos
      const pagosDb = await pool.query(
        'SELECT metodo, monto FROM ventas_pagos WHERE venta_id = $1 ORDER BY monto ASC',
        [ventaId]
      );
      expect(pagosDb.rowCount).toBe(2);
      expect(Number(pagosDb.rows[0].monto)).toBe(1000);
      expect(pagosDb.rows[0].metodo).toBe('efectivo');
      expect(Number(pagosDb.rows[1].monto)).toBe(2000);
      expect(pagosDb.rows[1].metodo).toBe('tarjeta_debito');

      // Verificar que a movimientos_caja SOLO ingresaron los 1000 de efectivo
      const movCajaAfter = await pool.query(
        'SELECT COALESCE(SUM(monto), 0) AS total_efectivo FROM movimientos_caja WHERE id_caja = $1',
        [testCajaId]
      );
      const efectivoDespues = parseFloat(movCajaAfter.rows[0].total_efectivo);
      expect(efectivoDespues).toBe(efectivoAntes + 1000);
    });

    it('3. Procesa pago mixto con Cuenta Corriente e impacta solo la porción CC en la deuda', async () => {
      const cliBefore = await pool.query('SELECT saldo_deuda FROM clientes WHERE id = $1', [testClienteId]);
      const deudaAntes = parseFloat(cliBefore.rows[0].saldo_deuda);

      // Total 3000: 500 efectivo + 2500 cuenta_corriente
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 2 }],
          cliente_id: testClienteId,
          pagos: [
            { metodo: 'efectivo', monto: 500 },
            { metodo: 'cuenta_corriente', monto: 2500 }
          ],
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);

      // Verificar que la deuda del cliente aumentó EXACTAMENTE en 2500
      const cliAfter = await pool.query('SELECT saldo_deuda FROM clientes WHERE id = $1', [testClienteId]);
      const deudaDespues = parseFloat(cliAfter.rows[0].saldo_deuda);
      expect(deudaDespues).toBe(deudaAntes + 2500);
    });
  });

  // =========================================================================
  // A5: VALIDACIÓN ESTRICTA DEL ENUM DE MÉTODOS DE PAGO
  // =========================================================================
  describe('A5: Validación estricta del enum de métodos de pago', () => {
    it('1. Rechaza con 400 método de pago no reconocido en venta simple', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'criptomoneda_btc',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Método de pago no reconocido');
    });

    it('2. Rechaza con 400 si algún elemento de pagos tiene método inválido', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          pagos: [
            { metodo: 'efectivo', monto: 1000 },
            { metodo: 'trueque', monto: 500 }
          ],
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Método de pago no reconocido');
    });

    it('3. Acepta métodos permitidos del enum (transferencia, qr, tarjeta_credito)', async () => {
      const res = await request(app)
        .post('/api/ventas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productos: [{ id: testProdId, cantidad: 1 }],
          metodo_pago: 'transferencia',
          tipo_comprobante: 'interno',
        });

      expect(res.status).toBe(201);
    });
  });

  // =========================================================================
  // A6: HARDENING DE IMPORTACIÓN MASIVA (POST /api/productos/importar)
  // =========================================================================
  describe('A6: Hardening de importación masiva de productos', () => {
    it('1. Rechaza con 400 archivos con extensiones no permitidas (.exe)', async () => {
      const res = await request(app)
        .post('/api/productos/importar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('archivo', Buffer.from('contenido ejecutable falso'), 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Formato no permitido');
    });

    it('2. Rechaza con 400 archivos que superan el límite de 5MB', async () => {
      // 5MB + 1KB
      const granBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);

      const res = await request(app)
        .post('/api/productos/importar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('archivo', granBuffer, 'archivo_gigante.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('5MB');
    });

    it('3. Procesa Excel válido y entrega reporte detallado de filas rechazadas', async () => {
      const wb = xlsx.utils.book_new();
      const codValido = 'IMP-TEST-' + Math.floor(Math.random() * 100000);
      const rows = [
        { codigo_barras: codValido, nombre: 'Producto Valido Importado', precio_venta: 250, costo: 150, stock: 10 },
        { codigo_barras: '', nombre: 'Producto Sin Codigo', precio_venta: 300, costo: 200, stock: 5 }, // Fila rechazada: sin código
        { codigo_barras: 'IMP-NEG-01', nombre: 'Producto Con Precio Negativo', precio_venta: -50, costo: 10, stock: 2 }, // Fila rechazada: precio negativo
      ];
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'Productos');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/api/productos/importar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('archivo', buffer, 'productos_test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.procesados).toBe(1);
      expect(res.body.rechazados.length).toBe(2);
      expect(res.body.rechazados[0].motivo).toContain('código de barras');
      expect(res.body.rechazados[1].motivo).toContain('Precio de venta inválido');

      // Limpieza del producto importado
      await pool.query('DELETE FROM productos WHERE codigo_barras = $1', [codValido]);
    });
  });

  // =========================================================================
  // A7: ASINCRONÍA DE BCRYPT EN USUARIOS
  // =========================================================================
  describe('A7: Asincronía de bcrypt en usuarios', () => {
    const testUsername = `user_async_${Date.now()}`;
    const testPassword = 'PasswordSegura123!';

    it('1. Registro de usuario con bcrypt.hash asíncrono', async () => {
      const res = await request(app)
        .post('/api/usuarios/registro')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nombre_usuario: testUsername,
          password: testPassword,
          rol: 'empleado',
          comercio_id: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.usuario.nombre_usuario).toBe(testUsername);
    });

    it('2. Login de usuario con bcrypt.compare asíncrono', async () => {
      const res = await request(app)
        .post('/api/usuarios/login')
        .send({
          nombre_usuario: testUsername,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.usuario.nombre_usuario).toBe(testUsername);
    });

    it('3. Rechaza con 401 si la contraseña es incorrecta (bcrypt.compare)', async () => {
      const res = await request(app)
        .post('/api/usuarios/login')
        .send({
          nombre_usuario: testUsername,
          password: 'PasswordErronea999',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Contraseña incorrecta');

      // Limpieza del usuario creado
      await pool.query('DELETE FROM usuarios WHERE nombre_usuario = $1', [testUsername]);
    });
  });

  // =========================================================================
  // A8: VERIFICACIÓN DE REMOCIÓN DE SQLITE3
  // =========================================================================
  describe('A8: Eliminación de dependencia obsoleta sqlite3', () => {
    it('1. Verifica que sqlite3 no está presente en package.json', () => {
      const pkgPath = path.join(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.dependencies.sqlite3).toBeUndefined();
      expect(pkg.devDependencies?.sqlite3).toBeUndefined();
    });
  });
});

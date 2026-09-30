import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db/conexion');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko-jwt-super-secret-2024-sistema';
const adminToken = jwt.sign({ id: 1, rol: 'administrador', comercio_id: 1 }, JWT_SECRET, { expiresIn: '1h' });
const empleadoToken = jwt.sign({ id: 3, rol: 'empleado', comercio_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

describe('LOTE 3 — MEJORAS P2 (M7 – M12)', () => {
  let testProdId = null;
  let testClienteId = null;
  let testLoteId = null;
  let testConteoId = null;

  beforeAll(async () => {
    // Asegurar PIN de supervisor en usuario admin (id: 1)
    await db.query("UPDATE usuarios SET pin_supervisor = '1234' WHERE id = 1 AND comercio_id = 1");

    // Crear producto de prueba
    const prodRes = await db.query(
      `INSERT INTO productos (nombre, codigo_barras, costo, precio_venta, stock, stock_minimo, rubro, comercio_id, activo)
       VALUES ('Producto Test Lote3', 'TEST-L3-' || floor(random()*100000), 100, 250, 20, 5, 'Lácteos', 1, true)
       RETURNING id`
    );
    testProdId = prodRes.rows[0].id;

    // Crear cliente de prueba con deuda para estado de cuenta
    const cliRes = await db.query(
      `INSERT INTO clientes (nombre, documento, telefono, tiene_cuenta_corriente, credito_limite, saldo_deuda, comercio_id)
       VALUES ('Cliente Test Lote3', 'CLI-L3-' || floor(random()*100000), '1123456789', true, 10000, 1500, 1)
       RETURNING id`
    );
    testClienteId = cliRes.rows[0].id;

    // Insertar un movimiento de débito en cuenta corriente
    await db.query(
      `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, usuario_id, comercio_id, fecha)
       VALUES ($1, 'debito', 1500, 'Venta a crédito test', 1, 1, NOW() - INTERVAL '35 days')`,
      [testClienteId]
    );
  });

  afterAll(async () => {
    try {
      if (testLoteId) {
        await db.query('DELETE FROM producto_lotes WHERE id = $1', [testLoteId]);
      }
      if (testConteoId) {
        await db.query('DELETE FROM conteos_inventario WHERE id = $1', [testConteoId]);
      }
      if (testClienteId) {
        await db.query('DELETE FROM movimientos_cuenta_corriente WHERE cliente_id = $1', [testClienteId]);
        await db.query('DELETE FROM clientes WHERE id = $1', [testClienteId]);
      }
      if (testProdId) {
        await db.query('DELETE FROM movimientos_stock WHERE producto_id = $1', [testProdId]);
        await db.query('DELETE FROM productos WHERE id = $1', [testProdId]);
      }
    } catch (_) {}
  });

  // ── M7: VENCIMIENTOS Y LOTES ──────────────────────────────────────────────
  describe('M7 — Vencimientos y Lotes', () => {
    it('1. Registra un nuevo lote de producto con fecha de vencimiento (POST /api/vencimientos)', async () => {
      const fechaVenc = new Date();
      fechaVenc.setDate(fechaVenc.getDate() + 20); // vence en 20 días
      const fechaStr = fechaVenc.toISOString().slice(0, 10);

      const res = await request(app)
        .post('/api/vencimientos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          producto_id: testProdId,
          numero_lote: 'LOTE-TEST-001',
          cantidad: 15,
          fecha_vencimiento: fechaStr,
          alerta_dias: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      testLoteId = res.body.id;
    });

    it('2. Obtiene resumen de vencimientos para badge del dashboard (GET /api/vencimientos/resumen)', async () => {
      const res = await request(app)
        .get('/api/vencimientos/resumen')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('proximos_30_dias');
      expect(res.body).toHaveProperty('vencidos');
      expect(res.body.proximos_30_dias).toBeGreaterThanOrEqual(1);
    });

    it('3. Obtiene reporte de vencimientos por ventanas 30/60/90 días (GET /api/reportes/vencimientos)', async () => {
      const res = await request(app)
        .get('/api/reportes/vencimientos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('resumen');
      expect(res.body.resumen).toHaveProperty('dias_30');
      expect(res.body.resumen).toHaveProperty('dias_60');
      expect(res.body.resumen).toHaveProperty('dias_90');
      expect(res.body).toHaveProperty('lotes');
      expect(Array.isArray(res.body.lotes)).toBe(true);
    });
  });

  // ── M8: TOMA DE INVENTARIO FÍSICO ─────────────────────────────────────────
  describe('M8 — Toma de Inventario Físico (Conteos)', () => {
    it('4. Inicia un nuevo conteo físico con snapshot de stock (POST /api/conteos)', async () => {
      const res = await request(app)
        .post('/api/conteos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nombre: 'Conteo Test Lote 3',
          rubro: 'Lácteos',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      testConteoId = res.body.id;
    });

    it('5. Carga detalle del conteo y sus ítems (GET /api/conteos/:id)', async () => {
      const res = await request(app)
        .get(`/api/conteos/${testConteoId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('en_progreso');
      expect(Array.isArray(res.body.items)).toBe(true);
      const itemTest = res.body.items.find(i => i.producto_id === testProdId);
      expect(itemTest).toBeDefined();
      expect(itemTest.cantidad_sistema).toBe(20);
    });

    it('6. Registra recuento físico con diferencia (PUT /api/conteos/:id/item/:prodId)', async () => {
      // Stock en sistema es 20, contamos 18 (faltante de 2)
      const res = await request(app)
        .put(`/api/conteos/${testConteoId}/item/${testProdId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cantidad_fisica: 18 });

      expect(res.status).toBe(200);
      expect(res.body.diferencia).toBe(-2);
    });

    it('7. Cierra conteo y aplica ajustes al stock en movimientos_stock con motivo "inventario" (PUT /api/conteos/:id/cerrar)', async () => {
      const res = await request(app)
        .put(`/api/conteos/${testConteoId}/cerrar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ aplicar_diferencias: true });

      expect(res.status).toBe(200);
      expect(res.body.ajustes_aplicados).toBeGreaterThanOrEqual(1);

      // Verificar que el stock del producto ahora es 18
      const prodActual = await db.query('SELECT stock FROM productos WHERE id = $1', [testProdId]);
      expect(prodActual.rows[0].stock).toBe(18);

      // Verificar registro en movimientos_stock
      const movRes = await db.query(
        "SELECT * FROM movimientos_stock WHERE producto_id = $1 AND motivo = 'inventario' ORDER BY id DESC LIMIT 1",
        [testProdId]
      );
      expect(movRes.rowCount).toBe(1);
      expect(movRes.rows[0].stock_anterior).toBe(20);
      expect(movRes.rows[0].stock_nuevo).toBe(18);
      expect(movRes.rows[0].cantidad).toBe(-2);
    });
  });

  // ── M9: ESTADO DE CUENTA CON AGING Y WHATSAPP ─────────────────────────────
  describe('M9 — Estado de Cuenta PDF y WhatsApp', () => {
    it('8. Obtiene estado de cuenta con saldo acumulado y aging 30/60/90 (GET /api/cuenta-corriente/:id/estado-cuenta)', async () => {
      const res = await request(app)
        .get(`/api/cuenta-corriente/${testClienteId}/estado-cuenta`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cliente');
      expect(res.body).toHaveProperty('comercio');
      expect(res.body).toHaveProperty('aging');
      expect(res.body.aging).toHaveProperty('dias_0_30');
      expect(res.body.aging).toHaveProperty('dias_31_60');
      expect(res.body.aging).toHaveProperty('total_deuda');
      expect(res.body.aging.total_deuda).toBe(1500);
      expect(res.body.aging.dias_31_60).toBe(1500); // 35 días de antigüedad
      expect(Array.isArray(res.body.movimientos)).toBe(true);
      expect(res.body.movimientos[0]).toHaveProperty('saldo_acumulado');
    });

    it('9. Obtiene recordatorios de mora con mensaje para WhatsApp (GET /api/cuenta-corriente/recordatorios-mora)', async () => {
      const res = await request(app)
        .get('/api/cuenta-corriente/recordatorios-mora')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('clientes_mora');
      expect(Array.isArray(res.body.clientes_mora)).toBe(true);
      const moraTest = res.body.clientes_mora.find(c => c.id === testClienteId);
      expect(moraTest).toBeDefined();
      expect(moraTest.dias_mora).toBeGreaterThanOrEqual(30);
      expect(moraTest.mensaje_whatsapp).toContain('saldo pendiente');
    });
  });

  // ── M10: VENTAS POR FRANJA HORARIA ────────────────────────────────────────
  describe('M10 — Ventas por Franja Horaria (Heatmap)', () => {
    it('10. Devuelve agregación de ventas por día de semana y hora (GET /api/reportes/franja-horaria)', async () => {
      const res = await request(app)
        .get('/api/reportes/franja-horaria')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('datos');
      expect(Array.isArray(res.body.datos)).toBe(true);
      if (res.body.datos.length > 0) {
        expect(res.body.datos[0]).toHaveProperty('dia_semana');
        expect(res.body.datos[0]).toHaveProperty('hora');
        expect(res.body.datos[0]).toHaveProperty('cantidad_ventas');
        expect(res.body.datos[0]).toHaveProperty('total_ventas');
      }
    });
  });

  // ── M11: PERMISOS DE ROLES GRANULARES ─────────────────────────────────────
  describe('M11 — Permisos de Roles Granulares', () => {
    it('11. Obtiene matriz de permisos y flags por rol (GET /api/configuracion/permisos)', async () => {
      const res = await request(app)
        .get('/api/configuracion/permisos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('flagsPorRol');
      expect(res.body.flagsPorRol).toHaveProperty('empleado');
      expect(res.body.flagsPorRol).toHaveProperty('administrador');
      expect(res.body.flagsPorRol.administrador.ver_costos).toBe(true);
    });

    it('12. Actualiza permisos por rol (PUT /api/configuracion/permisos)', async () => {
      const res = await request(app)
        .put('/api/configuracion/permisos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          flagsPorRol: {
            empleado: {
              descuento: true,
              devolucion: false,
              ver_costos: false,
              cerrar_caja: false,
              cambiar_precios: false,
              crear_usuarios: false,
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toContain('actualizados');
    });

    it('13. Consulta permisos del usuario autenticado (GET /api/usuarios/mis-permisos)', async () => {
      const res = await request(app)
        .get('/api/usuarios/mis-permisos')
        .set('Authorization', `Bearer ${empleadoToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('flags');
      expect(res.body.flags.descuento).toBe(true);
      expect(res.body.flags.ver_costos).toBe(false);
    });
  });

  // ── M12: BLOQUEO DE POS POR INACTIVIDAD ───────────────────────────────────
  describe('M12 — Bloqueo de POS por Inactividad', () => {
    it('14. Registra evento de bloqueo de POS (POST /api/usuarios/bloquear-pos)', async () => {
      const res = await request(app)
        .post('/api/usuarios/bloquear-pos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toContain('Bloqueo registrado');

      // Verificar que se insertó auditoría POS_BLOQUEO
      const audit = await db.query(
        "SELECT * FROM auditoria WHERE tipo_evento = 'POS_BLOQUEO' ORDER BY id DESC LIMIT 1"
      );
      expect(audit.rowCount).toBe(1);
    });

    it('15. Rechaza desbloqueo con PIN incorrecto (POST /api/usuarios/desbloquear-pos)', async () => {
      const res = await request(app)
        .post('/api/usuarios/desbloquear-pos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '0000' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('PIN');
    });

    it('16. Desbloquea POS con PIN supervisor correcto y registra auditoría (POST /api/usuarios/desbloquear-pos)', async () => {
      const res = await request(app)
        .post('/api/usuarios/desbloquear-pos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pin: '1234' });

      expect(res.status).toBe(200);
      expect(res.body.mensaje).toContain('desbloqueado');

      // Verificar auditoría POS_DESBLOQUEO
      const audit = await db.query(
        "SELECT * FROM auditoria WHERE tipo_evento = 'POS_DESBLOQUEO' ORDER BY id DESC LIMIT 1"
      );
      expect(audit.rowCount).toBe(1);
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../server';

describe('LOTE 6 — Mejoras Comerciales y Onboarding', () => {
  let demoToken = '';
  let demoUser = null;

  it('1. POST /api/demo/login-demo permite acceso inmediato y genera token JWT para potenciales clientes', async () => {
    const res = await request(app)
      .post('/api/demo/login-demo')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.usuario).toBeDefined();
    expect(res.body.usuario.comercio_id).toBe(1);

    demoToken = res.body.token;
    demoUser = res.body.usuario;
  });

  it('2. GET /api/reportes/dashboard-hoy entrega badges_modulos con facturas_pendientes_cae y alertas en vivo', async () => {
    const res = await request(app)
      .get('/api/reportes/dashboard-hoy')
      .set('Authorization', `Bearer ${demoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.badges_modulos).toBeDefined();
    expect(typeof res.body.badges_modulos.facturas_pendientes_cae).toBe('number');
    expect(typeof res.body.badges_modulos.stock_bajo).toBe('number');
    expect(typeof res.body.badges_modulos.deuda_total_cc).toBe('number');
    expect(res.body.badges_modulos.caja_abierta).toBeDefined();
    expect(Array.isArray(res.body.sparklines_7dias)).toBe(true);
  });

  it('3. PUT /api/configuracion guarda los datos del asistente de Onboarding', async () => {
    const res = await request(app)
      .put('/api/configuracion')
      .set('Authorization', `Bearer ${demoToken}`)
      .send({
        nombre: 'Kiosko Demo Test',
        razon_social: 'Kiosko Demo S.A.',
        cuit: '30-11223344-5',
        domicilio: 'Av. Corrientes 1000',
        telefono: '011 4000-0000',
        condicion_fiscal: 'monotributo',
        leyenda_ticket: '¡Gracias por su visita!',
        params: {
          ancho_ticket: '80mm',
          iva_default: '21',
          onboarding_completado: 'true',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toMatch(/guardad/i);

    // Verificar que se persistió
    const getRes = await request(app)
      .get('/api/configuracion')
      .set('Authorization', `Bearer ${demoToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.comercio.nombre).toBe('Kiosko Demo Test');
    expect(getRes.body.params.onboarding_completado).toBe('true');
  });

  it('4. POST /api/demo/seed restablece el catálogo demo y datos de prueba para administradores', async () => {
    const res = await request(app)
      .post('/api/demo/seed')
      .set('Authorization', `Bearer ${demoToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.productos).toBeGreaterThan(0);
    expect(res.body.stats.dias_ventas).toBe(30);
  }, 60000);
});

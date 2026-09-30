'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { autorizarRoles } = require('../middleware/auth');
const { registrarAuditoria } = require('../services/auditoriaService');
const { cents, fromCents } = require('../utils/money');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/fidelidad/config — Config de fidelidad del comercio
// ─────────────────────────────────────────────────────────────────────────────
router.get('/config', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  try {
    const result = await db.query(
      `SELECT clave, valor FROM configuracion
       WHERE comercio_id = $1
         AND clave IN ('fidelidad_habilitada', 'fidelidad_pesos_por_punto', 'fidelidad_valor_punto')`,
      [comercioId]
    );

    const config = { habilitada: false, pesos_por_punto: 100, valor_punto: 1 };
    for (const row of result.rows) {
      if (row.clave === 'fidelidad_habilitada') config.habilitada = row.valor === 'true';
      if (row.clave === 'fidelidad_pesos_por_punto') config.pesos_por_punto = parseFloat(row.valor) || 100;
      if (row.clave === 'fidelidad_valor_punto') config.valor_punto = parseFloat(row.valor) || 1;
    }

    res.json(config);
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/fidelidad/config — Guardar config de fidelidad (solo admin/dueño)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/config', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const { habilitada, pesos_por_punto, valor_punto } = req.body;

  try {
    const configs = [
      ['fidelidad_habilitada', String(!!habilitada)],
      ['fidelidad_pesos_por_punto', String(parseFloat(pesos_por_punto) || 100)],
      ['fidelidad_valor_punto', String(parseFloat(valor_punto) || 1)],
    ];

    for (const [clave, valor] of configs) {
      await db.query(
        `INSERT INTO configuracion (comercio_id, clave, valor)
         VALUES ($1, $2, $3)
         ON CONFLICT (comercio_id, clave)
         DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
        [comercioId, clave, valor]
      );
    }

    res.json({ mensaje: 'Configuración de fidelidad guardada' });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/fidelidad/cliente/:clienteId — Balance de puntos del cliente
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cliente/:clienteId', async (req, res, next) => {
  const { clienteId } = req.params;
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  try {
    const [clienteRes, movimientosRes, configRes] = await Promise.all([
      db.query(
        'SELECT id, nombre, puntos, puntos_canjeados FROM clientes WHERE id = $1 AND comercio_id = $2',
        [clienteId, comercioId]
      ),
      db.query(
        `SELECT tipo, puntos, descripcion, created_at
         FROM cliente_puntos_movimientos
         WHERE cliente_id = $1 AND comercio_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [clienteId, comercioId]
      ),
      db.query(
        `SELECT clave, valor FROM configuracion
         WHERE comercio_id = $1 AND clave IN ('fidelidad_valor_punto', 'fidelidad_pesos_por_punto')`,
        [comercioId]
      ),
    ]);

    if (clienteRes.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const cliente = clienteRes.rows[0];
    let valorPunto = 1;
    for (const row of configRes.rows) {
      if (row.clave === 'fidelidad_valor_punto') valorPunto = parseFloat(row.valor) || 1;
    }

    res.json({
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        puntos: parseInt(cliente.puntos || 0),
        puntos_canjeados: parseInt(cliente.puntos_canjeados || 0),
        valor_en_pesos: parseInt(cliente.puntos || 0) * valorPunto,
      },
      movimientos: movimientosRes.rows,
    });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/fidelidad/acumular — Acumula puntos al cliente tras una venta
//  Body: { cliente_id, total_venta, venta_id }
//  Usado internamente por la ruta de ventas o llamado desde el POS
// ─────────────────────────────────────────────────────────────────────────────
router.post('/acumular', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const { cliente_id, total_venta, venta_id } = req.body;
  if (!cliente_id || !total_venta) {
    return res.status(400).json({ error: 'cliente_id y total_venta son obligatorios' });
  }

  try {
    // Verificar fidelidad habilitada
    const configRes = await db.query(
      `SELECT clave, valor FROM configuracion
       WHERE comercio_id = $1
         AND clave IN ('fidelidad_habilitada', 'fidelidad_pesos_por_punto')`,
      [comercioId]
    );

    let habilitada = false;
    let pesosPorPunto = 100;
    for (const row of configRes.rows) {
      if (row.clave === 'fidelidad_habilitada') habilitada = row.valor === 'true';
      if (row.clave === 'fidelidad_pesos_por_punto') pesosPorPunto = parseFloat(row.valor) || 100;
    }

    if (!habilitada) {
      return res.json({ mensaje: 'Fidelidad no habilitada', puntos_acumulados: 0 });
    }

    const puntosGanados = Math.floor(parseFloat(total_venta) / pesosPorPunto);
    if (puntosGanados <= 0) {
      return res.json({ mensaje: 'Monto insuficiente para acumular puntos', puntos_acumulados: 0 });
    }

    await db.transaction(async (client) => {
      await client.query(
        'UPDATE clientes SET puntos = COALESCE(puntos, 0) + $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
        [puntosGanados, cliente_id, comercioId]
      );
      await client.query(
        `INSERT INTO cliente_puntos_movimientos
           (cliente_id, comercio_id, tipo, puntos, descripcion, referencia_id, usuario_id)
         VALUES ($1, $2, 'acumulacion', $3, $4, $5, $6)`,
        [cliente_id, comercioId, puntosGanados,
         `Puntos por compra${venta_id ? ` #${venta_id}` : ''} ($${parseFloat(total_venta).toFixed(2)})`,
         venta_id || null, usuarioId]
      );
    });

    res.json({ mensaje: `Se acumularon ${puntosGanados} puntos`, puntos_acumulados: puntosGanados });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/fidelidad/canjear — Canjea puntos de un cliente
//  Body: { cliente_id, puntos_a_canjear, venta_id? }
//  Response: { descuento_aplicado } — el descuento en pesos a aplicar
// ─────────────────────────────────────────────────────────────────────────────
router.post('/canjear', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const { cliente_id, puntos_a_canjear, venta_id } = req.body;
  if (!cliente_id || !puntos_a_canjear || puntos_a_canjear <= 0) {
    return res.status(400).json({ error: 'cliente_id y puntos_a_canjear > 0 son obligatorios' });
  }

  try {
    const [clienteRes, configRes] = await Promise.all([
      db.query(
        'SELECT puntos FROM clientes WHERE id = $1 AND comercio_id = $2',
        [cliente_id, comercioId]
      ),
      db.query(
        `SELECT clave, valor FROM configuracion
         WHERE comercio_id = $1 AND clave IN ('fidelidad_habilitada', 'fidelidad_valor_punto')`,
        [comercioId]
      ),
    ]);

    if (clienteRes.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    let habilitada = false;
    let valorPunto = 1;
    for (const row of configRes.rows) {
      if (row.clave === 'fidelidad_habilitada') habilitada = row.valor === 'true';
      if (row.clave === 'fidelidad_valor_punto') valorPunto = parseFloat(row.valor) || 1;
    }

    if (!habilitada) return res.status(400).json({ error: 'El programa de fidelidad no está habilitado' });

    const puntosDisponibles = parseInt(clienteRes.rows[0].puntos || 0);
    if (puntos_a_canjear > puntosDisponibles) {
      return res.status(409).json({
        error: `El cliente solo tiene ${puntosDisponibles} puntos disponibles`,
        puntos_disponibles: puntosDisponibles,
      });
    }

    const descuento = puntos_a_canjear * valorPunto;

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE clientes
         SET puntos = puntos - $1,
             puntos_canjeados = COALESCE(puntos_canjeados, 0) + $1,
             updated_at = NOW()
         WHERE id = $2 AND comercio_id = $3`,
        [puntos_a_canjear, cliente_id, comercioId]
      );
      await client.query(
        `INSERT INTO cliente_puntos_movimientos
           (cliente_id, comercio_id, tipo, puntos, descripcion, referencia_id, usuario_id)
         VALUES ($1, $2, 'canje', $3, $4, $5, $6)`,
        [cliente_id, comercioId, -puntos_a_canjear,
         `Canje de ${puntos_a_canjear} puntos = $${descuento.toFixed(2)} de descuento${venta_id ? ` (venta #${venta_id})` : ''}`,
         venta_id || null, usuarioId]
      );
    });

    await registrarAuditoria({
      tipo_evento: 'CANJE_PUNTOS',
      descripcion: `Cliente ID ${cliente_id}: canje ${puntos_a_canjear} puntos = $${descuento.toFixed(2)}`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.json({
      mensaje: `Canje exitoso: ${puntos_a_canjear} puntos = $${descuento.toFixed(2)} de descuento`,
      puntos_canjeados: puntos_a_canjear,
      descuento_aplicado: descuento,
      puntos_restantes: puntosDisponibles - puntos_a_canjear,
    });
  } catch (error) { next(error); }
});

module.exports = router;

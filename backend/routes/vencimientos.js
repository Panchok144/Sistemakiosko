'use strict';
/**
 * backend/routes/vencimientos.js — M7
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de lotes/vencimientos de productos.
 *
 * GET  /            → próximos a vencer (filtro: dias_alerta)
 * GET  /producto/:id → lotes de un producto específico
 * POST /            → registrar nuevo lote
 * PUT  /:id         → actualizar lote (cantidad, fecha, alerta_dias)
 * DELETE /:id       → eliminar lote
 * GET  /resumen     → resumen para badge del dashboard
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /resumen — datos para badge en dashboard (ESTÁTICA antes de /:id)
router.get('/resumen', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const res30 = await db.query(
      `SELECT COUNT(*) AS total
       FROM producto_lotes
       WHERE comercio_id = $1
         AND cantidad > 0
         AND fecha_vencimiento <= NOW() + INTERVAL '30 days'`,
      [comercioId]
    );
    const resVen = await db.query(
      `SELECT COUNT(*) AS total
       FROM producto_lotes
       WHERE comercio_id = $1
         AND cantidad > 0
         AND fecha_vencimiento < NOW()::date`,
      [comercioId]
    );
    res.json({
      proximos_30_dias: parseInt(res30.rows[0].total || 0, 10),
      vencidos:         parseInt(resVen.rows[0].total || 0, 10),
    });
  } catch (error) { next(error); }
});

// GET / — Listar lotes próximos a vencer (filtro: dias_alerta, rubro, producto_id)
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const dias       = Math.min(parseInt(req.query.dias_alerta || 30, 10), 365);
  const { rubro, producto_id, incluir_vencidos = 'true' } = req.query;

  try {
    let q = `
      SELECT
        pl.id, pl.numero_lote, pl.cantidad, pl.fecha_vencimiento,
        pl.alerta_dias, pl.created_at, pl.updated_at,
        p.id AS producto_id, p.nombre AS producto_nombre,
        p.rubro, p.codigo_barras,
        (pl.fecha_vencimiento - NOW()::date) AS dias_restantes,
        CASE
          WHEN pl.fecha_vencimiento < NOW()::date           THEN 'vencido'
          WHEN pl.fecha_vencimiento <= NOW()::date + $2     THEN 'critico'
          WHEN pl.fecha_vencimiento <= NOW()::date + (pl.alerta_dias || ' days')::interval THEN 'alerta'
          ELSE 'ok'
        END AS estado_vencimiento
      FROM producto_lotes pl
      JOIN productos p ON pl.producto_id = p.id
      WHERE pl.comercio_id = $1
        AND pl.cantidad > 0
    `;
    const params = [comercioId, dias + ' days'];
    let idx = 3;

    if (incluir_vencidos !== 'true') {
      q += ' AND pl.fecha_vencimiento >= NOW()::date';
    }
    if (rubro) {
      q += ` AND p.rubro = $${idx++}`;
      params.push(rubro);
    }
    if (producto_id) {
      q += ` AND pl.producto_id = $${idx++}`;
      params.push(producto_id);
    }

    q += ' ORDER BY pl.fecha_vencimiento ASC';

    const result = await db.query(q, params);
    const rows   = result.rows;

    const vencidos = rows.filter(r => r.estado_vencimiento === 'vencido').length;
    const criticos = rows.filter(r => r.estado_vencimiento === 'critico').length;

    res.json({
      total:    rows.length,
      vencidos,
      criticos,
      lotes:    rows,
    });
  } catch (error) { next(error); }
});

// GET /producto/:id — Todos los lotes de un producto
router.get('/producto/:id', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT pl.*, (pl.fecha_vencimiento - NOW()::date) AS dias_restantes
       FROM producto_lotes pl
       WHERE pl.producto_id = $1 AND pl.comercio_id = $2
       ORDER BY pl.fecha_vencimiento ASC`,
      [id, comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// POST / — Registrar nuevo lote
router.post('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId  = req.usuario?.id;
  const { producto_id, numero_lote, cantidad, fecha_vencimiento, alerta_dias = 30 } = req.body;

  if (!producto_id || !cantidad || !fecha_vencimiento) {
    return res.status(400).json({ error: 'producto_id, cantidad y fecha_vencimiento son obligatorios' });
  }
  if (parseInt(cantidad, 10) <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
  }
  if (new Date(fecha_vencimiento) < new Date()) {
    return res.status(400).json({ error: 'No se puede registrar un lote ya vencido' });
  }

  // Verificar que el producto pertenece al comercio
  const prod = await db.query('SELECT id, nombre FROM productos WHERE id=$1 AND comercio_id=$2', [producto_id, comercioId]);
  if (prod.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });

  try {
    const result = await db.query(
      `INSERT INTO producto_lotes (producto_id, comercio_id, numero_lote, cantidad, fecha_vencimiento, alerta_dias, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [producto_id, comercioId, numero_lote || null, parseInt(cantidad, 10), fecha_vencimiento, Math.max(1, parseInt(alerta_dias, 10)), usuarioId]
    );

    registrarAuditoria({
      tipo_evento: 'LOTE_REGISTRADO',
      descripcion: `Lote registrado para "${prod.rows[0].nombre}": ${cantidad} unidades, vence ${fecha_vencimiento}`,
      usuario_id: usuarioId, comercio_id: comercioId,
    }).catch(() => {});

    res.status(201).json({ mensaje: 'Lote registrado', id: result.rows[0].id });
  } catch (error) { next(error); }
});

// PUT /:id — Actualizar lote
router.put('/:id', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  const { cantidad, fecha_vencimiento, alerta_dias, numero_lote } = req.body;

  try {
    const result = await db.query(
      `UPDATE producto_lotes
       SET cantidad          = COALESCE($1, cantidad),
           fecha_vencimiento = COALESCE($2, fecha_vencimiento),
           alerta_dias       = COALESCE($3, alerta_dias),
           numero_lote       = COALESCE($4, numero_lote),
           updated_at        = NOW()
       WHERE id = $5 AND comercio_id = $6
       RETURNING id`,
      [
        cantidad !== undefined ? parseInt(cantidad, 10) : null,
        fecha_vencimiento || null,
        alerta_dias !== undefined ? parseInt(alerta_dias, 10) : null,
        numero_lote || null,
        id, comercioId,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lote no encontrado' });
    res.json({ mensaje: 'Lote actualizado' });
  } catch (error) { next(error); }
});

// DELETE /:id — Eliminar lote
router.delete('/:id', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      'DELETE FROM producto_lotes WHERE id=$1 AND comercio_id=$2 RETURNING id',
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lote no encontrado' });
    res.json({ mensaje: 'Lote eliminado' });
  } catch (error) { next(error); }
});

module.exports = router;

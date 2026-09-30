'use strict';
/**
 * backend/routes/conteos.js — M8
 * ─────────────────────────────────────────────────────────────────────────────
 * Conteos de inventario físico (recuento).
 *
 * POST /                → iniciar nuevo conteo (carga todos los productos del comercio)
 * GET  /                → listar conteos
 * GET  /:id             → detalle de un conteo con sus ítems
 * PUT  /:id/item/:prodId → registrar cantidad física de un ítem
 * PUT  /:id/cerrar      → cerrar conteo y aplicar diferencias al stock
 * DELETE /:id           → cancelar conteo en_progreso
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET / — Listar conteos del comercio
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT c.id, c.nombre, c.estado, c.notas, c.created_at, c.cerrado_at,
              u.nombre_usuario AS creado_por,
              COUNT(ci.id) AS total_items,
              COUNT(ci.id) FILTER (WHERE ci.cantidad_fisica IS NOT NULL) AS items_contados,
              COALESCE(SUM(ABS(ci.diferencia)), 0) AS diferencia_total
       FROM conteos_inventario c
       LEFT JOIN usuarios u ON c.usuario_id = u.id
       LEFT JOIN conteo_items ci ON c.id = ci.conteo_id
       WHERE c.comercio_id = $1
       GROUP BY c.id, u.nombre_usuario
       ORDER BY c.created_at DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// POST / — Iniciar nuevo conteo (carga snapshot de todos los productos activos)
router.post('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId  = req.usuario?.id;
  const { nombre = `Conteo ${new Date().toLocaleDateString('es-AR')}`, notas, rubro } = req.body;

  try {
    let conteoId;
    await db.transaction(async (client) => {
      // 1. Crear el conteo
      const conteoRes = await client.query(
        `INSERT INTO conteos_inventario (comercio_id, usuario_id, nombre, notas)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [comercioId, usuarioId, nombre, notas || null]
      );
      conteoId = conteoRes.rows[0].id;

      // 2. Snapshot del stock actual de productos activos (filtro rubro opcional)
      let prodQ = 'SELECT id, stock FROM productos WHERE comercio_id=$1 AND activo=true';
      const prodParams = [comercioId];
      if (rubro) { prodQ += ' AND rubro=$2'; prodParams.push(rubro); }

      const productos = await client.query(prodQ, prodParams);

      // 3. Insertar items en bloque
      if (productos.rowCount > 0) {
        const values = productos.rows
          .map((p, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`)
          .join(', ');
        const params = [conteoId];
        for (const p of productos.rows) {
          params.push(p.id, comercioId, p.stock);
        }
        await client.query(
          `INSERT INTO conteo_items (conteo_id, producto_id, comercio_id, cantidad_sistema) VALUES ${values}`,
          params
        );
      }
    });

    registrarAuditoria({
      tipo_evento: 'CONTEO_INICIADO',
      descripcion: `Conteo de inventario iniciado: "${nombre}"`,
      usuario_id: usuarioId, comercio_id: comercioId,
    }).catch(() => {});

    res.status(201).json({ mensaje: 'Conteo iniciado', id: conteoId });
  } catch (error) { next(error); }
});

// GET /:id — Detalle del conteo + sus ítems
router.get('/:id', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const conteoRes = await db.query(
      `SELECT c.*, u.nombre_usuario AS creado_por
       FROM conteos_inventario c
       LEFT JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.id=$1 AND c.comercio_id=$2`,
      [id, comercioId]
    );
    if (conteoRes.rowCount === 0) return res.status(404).json({ error: 'Conteo no encontrado' });

    const itemsRes = await db.query(
      `SELECT ci.id, ci.producto_id, ci.cantidad_sistema, ci.cantidad_fisica, ci.diferencia,
              p.nombre AS producto_nombre, p.codigo_barras, p.rubro, p.marca
       FROM conteo_items ci
       JOIN productos p ON ci.producto_id = p.id
       WHERE ci.conteo_id=$1
       ORDER BY p.rubro ASC, p.nombre ASC`,
      [id]
    );

    const items      = itemsRes.rows;
    const contados   = items.filter(i => i.cantidad_fisica !== null).length;
    const sobrante   = items.filter(i => (i.diferencia || 0) > 0).length;
    const faltante   = items.filter(i => (i.diferencia || 0) < 0).length;
    const exactos    = items.filter(i => i.cantidad_fisica !== null && (i.diferencia || 0) === 0).length;

    res.json({
      ...conteoRes.rows[0],
      estadisticas: { total_items: items.length, contados, exactos, sobrante, faltante },
      items,
    });
  } catch (error) { next(error); }
});

// PUT /:id/item/:prodId — Registrar cantidad física de un ítem
router.put('/:id/item/:prodId', async (req, res, next) => {
  const { id, prodId } = req.params;
  const comercioId     = req.usuario?.comercio_id;
  const { cantidad_fisica } = req.body;

  if (cantidad_fisica === undefined || cantidad_fisica === null) {
    return res.status(400).json({ error: 'cantidad_fisica es requerida' });
  }
  const cantInt = parseInt(cantidad_fisica, 10);
  if (isNaN(cantInt) || cantInt < 0) {
    return res.status(400).json({ error: 'cantidad_fisica debe ser un entero >= 0' });
  }

  try {
    // Verificar que el conteo existe y está en progreso
    const conteo = await db.query(
      'SELECT estado FROM conteos_inventario WHERE id=$1 AND comercio_id=$2',
      [id, comercioId]
    );
    if (conteo.rowCount === 0) return res.status(404).json({ error: 'Conteo no encontrado' });
    if (conteo.rows[0].estado !== 'en_progreso') {
      return res.status(409).json({ error: `El conteo está ${conteo.rows[0].estado} y no permite modificaciones` });
    }

    const result = await db.query(
      `UPDATE conteo_items SET cantidad_fisica=$1
       WHERE conteo_id=$2 AND producto_id=$3 AND comercio_id=$4
       RETURNING id, diferencia`,
      [cantInt, id, prodId, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ítem no encontrado en este conteo' });
    res.json({ mensaje: 'Cantidad registrada', diferencia: result.rows[0].diferencia });
  } catch (error) { next(error); }
});

// PUT /:id/cerrar — Cerrar conteo y aplicar diferencias al stock
router.put('/:id/cerrar', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId  = req.usuario?.id;
  const { aplicar_diferencias = true } = req.body;

  try {
    let ajustes = 0;
    await db.transaction(async (client) => {
      // Verificar estado del conteo
      const conteo = await client.query(
        'SELECT estado, nombre FROM conteos_inventario WHERE id=$1 AND comercio_id=$2 FOR UPDATE',
        [id, comercioId]
      );
      if (conteo.rowCount === 0) throw Object.assign(new Error('Conteo no encontrado'), { statusCode: 404 });
      if (conteo.rows[0].estado !== 'en_progreso') {
        throw Object.assign(new Error(`El conteo ya está ${conteo.rows[0].estado}`), { statusCode: 409 });
      }

      // Aplicar diferencias al stock si se solicita
      if (aplicar_diferencias) {
        const items = await client.query(
          `SELECT ci.producto_id, ci.diferencia
           FROM conteo_items ci
           WHERE ci.conteo_id=$1 AND ci.cantidad_fisica IS NOT NULL AND ci.diferencia != 0`,
          [id]
        );
        for (const item of items.rows) {
          const prodRes = await client.query(
            'SELECT stock FROM productos WHERE id=$1 AND comercio_id=$2 FOR UPDATE',
            [item.producto_id, comercioId]
          );
          const stockAnterior = prodRes.rows[0]?.stock || 0;
          const stockNuevo = Math.max(0, stockAnterior + item.diferencia);

          await client.query(
            `UPDATE productos
             SET stock = $1, updated_at=NOW()
             WHERE id=$2 AND comercio_id=$3`,
            [stockNuevo, item.producto_id, comercioId]
          );

          await client.query(
            `INSERT INTO movimientos_stock (producto_id, comercio_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
             VALUES ($1, $2, $3, 'conteo_fisico', $4, $5, $6, 'inventario')`,
            [item.producto_id, comercioId, usuarioId, item.diferencia, stockAnterior, stockNuevo]
          );
          ajustes++;
        }
      }

      // Cerrar el conteo
      await client.query(
        `UPDATE conteos_inventario SET estado='cerrado', cerrado_at=NOW()
         WHERE id=$1 AND comercio_id=$2`,
        [id, comercioId]
      );
    });

    registrarAuditoria({
      tipo_evento: 'CONTEO_CERRADO',
      descripcion: `Conteo #${id} cerrado. ${ajustes} ajustes de stock aplicados.`,
      usuario_id: usuarioId, comercio_id: comercioId,
    }).catch(() => {});

    res.json({ mensaje: `Conteo cerrado. ${ajustes} ajustes de stock aplicados.`, ajustes_aplicados: ajustes });
  } catch (error) { next(error); }
});

// DELETE /:id — Cancelar conteo en progreso
router.delete('/:id', async (req, res, next) => {
  const { id }     = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `UPDATE conteos_inventario SET estado='cancelado'
       WHERE id=$1 AND comercio_id=$2 AND estado='en_progreso' RETURNING id`,
      [id, comercioId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Conteo no encontrado o no está en progreso' });
    }
    res.json({ mensaje: 'Conteo cancelado' });
  } catch (error) { next(error); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// ── Listas de Precios ────────────────────────────────────────────────────────

// GET / — Listar listas de precios
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      'SELECT * FROM listas_precios WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// POST / — Crear lista de precios
router.post('/', async (req, res, next) => {
  const { nombre, descripcion, porcentaje_ajuste = 0, es_mayorista = false } = req.body;
  const comercioId = req.usuario?.comercio_id;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la lista es obligatorio' });
  try {
    const result = await db.query(
      `INSERT INTO listas_precios (nombre, descripcion, porcentaje_ajuste, es_mayorista, comercio_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, descripcion || null, parseFloat(porcentaje_ajuste), es_mayorista, comercioId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

// PUT /:id — Actualizar lista
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre, descripcion, porcentaje_ajuste, es_mayorista, activa } = req.body;
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `UPDATE listas_precios SET nombre=$1, descripcion=$2, porcentaje_ajuste=$3, es_mayorista=$4, activa=$5
       WHERE id=$6 AND comercio_id=$7 RETURNING *`,
      [nombre, descripcion, parseFloat(porcentaje_ajuste || 0), es_mayorista, activa !== false, id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

// DELETE /:id — Eliminar lista
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    await db.query('DELETE FROM listas_precios WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    res.json({ mensaje: 'Lista eliminada' });
  } catch (error) { next(error); }
});

// ── Precios por Volumen ──────────────────────────────────────────────────────

// GET /precios-volumen — Todos los precios por volumen del comercio
router.get('/precios-volumen', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT pv.*, p.nombre AS producto_nombre, p.codigo_barras, p.precio_venta AS precio_base
       FROM precios_volumen pv
       JOIN productos p ON pv.producto_id = p.id
       WHERE pv.comercio_id = $1
       ORDER BY p.nombre, pv.cantidad_minima ASC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /precios-volumen/:producto_id — Precios por volumen de un producto
router.get('/precios-volumen/:producto_id', async (req, res, next) => {
  const { producto_id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      'SELECT * FROM precios_volumen WHERE producto_id = $1 AND comercio_id = $2 ORDER BY cantidad_minima ASC',
      [producto_id, comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// POST /precios-volumen — Crear o actualizar precio por volumen (upsert)
router.post('/precios-volumen', async (req, res, next) => {
  const { producto_id, cantidad_minima, precio } = req.body;
  const comercioId = req.usuario?.comercio_id;

  if (!producto_id || !cantidad_minima || precio == null) {
    return res.status(400).json({ error: 'producto_id, cantidad_minima y precio son obligatorios' });
  }
  if (parseInt(cantidad_minima) < 1 || parseFloat(precio) < 0) {
    return res.status(400).json({ error: 'cantidad_minima debe ser ≥ 1 y precio ≥ 0' });
  }

  try {
    const result = await db.query(
      `INSERT INTO precios_volumen (producto_id, cantidad_minima, precio, comercio_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (producto_id, cantidad_minima, comercio_id)
       DO UPDATE SET precio = EXCLUDED.precio
       RETURNING *`,
      [producto_id, parseInt(cantidad_minima), parseFloat(precio), comercioId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

// DELETE /precios-volumen/:id — Eliminar precio por volumen
router.delete('/precios-volumen/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    await db.query(
      'DELETE FROM precios_volumen WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    res.json({ mensaje: 'Precio por volumen eliminado' });
  } catch (error) { next(error); }
});

module.exports = router;

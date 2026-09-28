const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// Obtener todos los rubros del comercio
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      'SELECT * FROM rubros WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Crear un nuevo rubro
router.post('/', async (req, res, next) => {
  const { nombre, emoji } = req.body;
  const comercioId = req.usuario?.comercio_id || 1;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rubro es obligatorio' });
  }

  try {
    const result = await db.query(
      'INSERT INTO rubros (nombre, emoji, comercio_id) VALUES ($1, $2, $3) RETURNING *',
      [nombre.trim(), emoji || null, comercioId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un rubro con ese nombre.' });
    }
    next(error);
  }
});

// Editar un rubro
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre, emoji } = req.body;
  const comercioId = req.usuario?.comercio_id || 1;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre del rubro es obligatorio' });
  }

  try {
    const rubroAnterior = await db.query('SELECT nombre FROM rubros WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    if (rubroAnterior.rowCount === 0) {
      return res.status(404).json({ error: 'Rubro no encontrado' });
    }
    const oldName = rubroAnterior.rows[0].nombre;
    const newName = nombre.trim();

    const result = await db.query(
      'UPDATE rubros SET nombre = $1, emoji = $2 WHERE id = $3 AND comercio_id = $4 RETURNING *',
      [newName, emoji ?? null, id, comercioId]
    );

    await db.query(
      'UPDATE productos SET rubro = $1, updated_at = NOW() WHERE rubro = $2 AND comercio_id = $3',
      [newName, oldName, comercioId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe otro rubro con ese nombre.' });
    }
    next(error);
  }
});

// Eliminar un rubro
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const rubroAnterior = await db.query('SELECT nombre FROM rubros WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    if (rubroAnterior.rowCount === 0) {
      return res.status(404).json({ error: 'Rubro no encontrado' });
    }
    const oldName = rubroAnterior.rows[0].nombre;

    // Eliminar el rubro
    await db.query('DELETE FROM rubros WHERE id = $1 AND comercio_id = $2', [id, comercioId]);

    // Establecer rubro = NULL en los productos asociados
    await db.query(
      'UPDATE productos SET rubro = NULL, updated_at = NOW() WHERE rubro = $1 AND comercio_id = $2',
      [oldName, comercioId]
    );

    res.json({ mensaje: 'Rubro eliminado con éxito' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

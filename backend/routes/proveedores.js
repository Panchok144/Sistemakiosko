const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/proveedores
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'SELECT * FROM proveedores WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener proveedores:', error);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  const { nombre, telefono = null, email = null, descripcion = null, cuit = null, direccion = null, condicion_fiscal = null, codigo_fiscal = null } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'INSERT INTO proveedores (nombre, telefono, email, descripcion, cuit, direccion, condicion_fiscal, codigo_fiscal, comercio_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [nombre, telefono, email, descripcion, cuit, direccion, condicion_fiscal, codigo_fiscal, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'PROVEEDOR_AGREGADO',
      descripcion: `Se agregó el proveedor: ${nombre}`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.status(201).json({ mensaje: '¡Proveedor registrado con éxito!', id: result.rows[0].id });
  } catch (error) {
    console.error('Error al guardar el proveedor:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' });
    }
    res.status(500).json({ error: 'Error al guardar el proveedor', detalle: error.message });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, telefono, email, descripcion, cuit, direccion, condicion_fiscal = null, codigo_fiscal = null } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `UPDATE proveedores 
       SET nombre = $1, telefono = $2, email = $3, descripcion = $4, cuit = $5, direccion = $6,
           condicion_fiscal = $7, codigo_fiscal = $8, updated_at = NOW() 
       WHERE id = $9 AND comercio_id = $10 RETURNING id`,
      [nombre, telefono, email, descripcion, cuit, direccion, condicion_fiscal, codigo_fiscal, id, comercioId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json({ mensaje: '¡Proveedor actualizado con éxito!' });
  } catch (error) {
    console.error('Error al actualizar el proveedor:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe otro proveedor con ese nombre' });
    }
    res.status(500).json({ error: 'Error al actualizar el proveedor', detalle: error.message });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'DELETE FROM proveedores WHERE id = $1 AND comercio_id = $2 RETURNING id',
      [id, comercioId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    await registrarAuditoria({
      tipo_evento: 'PROVEEDOR_ELIMINADO',
      descripcion: `Se eliminó un proveedor con ID: ${id}`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.json({ mensaje: '¡Proveedor eliminado con éxito!' });
  } catch (error) {
    console.error('Error al eliminar el proveedor:', error);
    res.status(500).json({ error: 'Error al eliminar el proveedor', detalle: error.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// GET /api/remitos
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `SELECT r.*, p.nombre AS proveedor_nombre 
       FROM remitos r 
       LEFT JOIN proveedores p ON r.proveedor_id = p.id 
       WHERE r.comercio_id = $1 
       ORDER BY r.fecha DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener remitos:', error);
    res.status(500).json({ error: 'Error al obtener remitos' });
  }
});

// GET /api/remitos/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const remitoRes = await db.query(
      `SELECT r.*, p.nombre AS proveedor_nombre 
       FROM remitos r 
       LEFT JOIN proveedores p ON r.proveedor_id = p.id 
       WHERE r.id = $1 AND r.comercio_id = $2`,
      [id, comercioId]
    );

    if (remitoRes.rowCount === 0) {
      return res.status(404).json({ error: 'Remito no encontrado' });
    }

    const itemsRes = await db.query(
      `SELECT i.*, p.nombre AS producto_nombre, p.codigo_barras 
       FROM remito_items i
       LEFT JOIN productos p ON i.producto_id = p.id
       WHERE i.remito_id = $1 AND i.comercio_id = $2`,
      [id, comercioId]
    );

    res.json({
      ...remitoRes.rows[0],
      items: itemsRes.rows
    });
  } catch (error) {
    console.error('Error al obtener el remito:', error);
    res.status(500).json({ error: 'Error al obtener el remito' });
  }
});

// POST /api/remitos
router.post('/', async (req, res) => {
  const { tipo, proveedor_id, observaciones = '', items } = req.body;
  const comercioId = req.usuario?.comercio_id || 1;

  if (!['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de remito debe ser ingreso o egreso' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un ítem en el remito' });
  }

  try {
    const remitoId = await db.transaction(async (client) => {
      // 1. Insertar el remito
      const remitoResult = await client.query(
        'INSERT INTO remitos (tipo, proveedor_id, observaciones, comercio_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [tipo, proveedor_id || null, observaciones, comercioId]
      );
      const id = remitoResult.rows[0].id;

      // 2. Insertar los items y actualizar stock
      for (const item of items) {
        if (!item.producto_id || !item.cantidad || item.cantidad <= 0) continue;

        await client.query(
          'INSERT INTO remito_items (remito_id, producto_id, cantidad, precio_unitario, comercio_id) VALUES ($1, $2, $3, $4, $5)',
          [id, item.producto_id, item.cantidad, item.precio_unitario || null, comercioId]
        );

        // Actualizar stock. Ingreso SUMA, Egreso RESTA.
        const operacionStock = tipo === 'ingreso' ? '+' : '-';
        await client.query(
          `UPDATE productos SET stock = stock ${operacionStock} $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3`,
          [item.cantidad, item.producto_id, comercioId]
        );
      }

      return id;
    });

    res.status(201).json({ mensaje: 'Remito creado con éxito', id: remitoId });
  } catch (error) {
    console.error('Error al crear remito:', error);
    if (error.code === '23514') {
      return res.status(409).json({ error: 'Un remito de egreso no puede dejar el stock en negativo.' });
    }
    res.status(500).json({ error: 'Error al procesar el remito', detalle: error.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// GET / — Listar presupuestos
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT p.id, p.numero, p.cliente_nombre, p.cliente_documento, p.subtotal,
              p.descuento, p.total, p.estado, p.valido_hasta, p.notas, p.created_at,
              u.nombre_usuario AS vendedor
       FROM presupuestos p
       LEFT JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.comercio_id = $1
       ORDER BY p.created_at DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /:id — Detalle de presupuesto con ítems
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const pResult = await db.query(
      'SELECT * FROM presupuestos WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (pResult.rowCount === 0) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    const itemsResult = await db.query(
      'SELECT * FROM presupuesto_items WHERE presupuesto_id = $1 ORDER BY id',
      [id]
    );

    res.json({ ...pResult.rows[0], items: itemsResult.rows });
  } catch (error) { next(error); }
});

// POST / — Crear presupuesto
router.post('/', async (req, res, next) => {
  const { cliente_id, cliente_nombre, cliente_documento, items, descuento = 0, valido_hasta, notas } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El presupuesto debe tener al menos un ítem' });
  }

  try {
    const subtotal = items.reduce((acc, i) => acc + parseFloat(i.precio_unitario) * parseInt(i.cantidad), 0);
    const descuentoNum = parseFloat(descuento) || 0;
    const total = Math.max(0, subtotal - descuentoNum);

    const numResult = await db.query(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM presupuestos WHERE comercio_id = $1',
      [comercioId]
    );
    const numero = numResult.rows[0].siguiente;

    let presupuestoId;
    await db.transaction(async (client) => {
      const presResult = await client.query(
        `INSERT INTO presupuestos
           (numero, cliente_id, cliente_nombre, cliente_documento, subtotal, descuento, total, valido_hasta, notas, usuario_id, comercio_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [numero, cliente_id || null, cliente_nombre || null, cliente_documento || null,
         subtotal, descuentoNum, total, valido_hasta || null, notas || null, usuarioId, comercioId]
      );
      presupuestoId = presResult.rows[0].id;

      for (const item of items) {
        const cant = parseInt(item.cantidad);
        const precio = parseFloat(item.precio_unitario);
        await client.query(
          `INSERT INTO presupuesto_items (presupuesto_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [presupuestoId, item.producto_id || null, item.nombre_producto, cant, precio, precio * cant]
        );
      }
    });

    res.status(201).json({ mensaje: 'Presupuesto creado exitosamente', id: presupuestoId, numero });
  } catch (error) { next(error); }
});

// PUT /:id/estado — Cambiar estado del presupuesto
router.put('/:id/estado', async (req, res, next) => {
  const { id } = req.params;
  const { estado } = req.body;
  const comercioId = req.usuario?.comercio_id;

  const estadosValidos = ['pendiente', 'aprobado', 'rechazado', 'vencido'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}` });
  }

  try {
    const result = await db.query(
      'UPDATE presupuestos SET estado = $1 WHERE id = $2 AND comercio_id = $3 RETURNING id',
      [estado, id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Presupuesto no encontrado' });
    res.json({ mensaje: `Presupuesto marcado como "${estado}"` });
  } catch (error) { next(error); }
});

// DELETE /:id — Eliminar presupuesto
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    await db.query('DELETE FROM presupuestos WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    res.json({ mensaje: 'Presupuesto eliminado' });
  } catch (error) { next(error); }
});

module.exports = router;

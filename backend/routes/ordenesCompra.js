const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET / — Listar órdenes de compra
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT oc.id, oc.numero, oc.proveedor_nombre, oc.estado, oc.total,
              oc.notas, oc.fecha_esperada, oc.created_at, oc.recibida_at,
              u.nombre_usuario AS creado_por
       FROM ordenes_compra oc
       LEFT JOIN usuarios u ON oc.usuario_id = u.id
       WHERE oc.comercio_id = $1
       ORDER BY oc.created_at DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /:id — Detalle de la orden de compra con ítems
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const ocResult = await db.query(
      'SELECT * FROM ordenes_compra WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (ocResult.rowCount === 0) return res.status(404).json({ error: 'Orden de compra no encontrada' });

    const itemsResult = await db.query(
      'SELECT * FROM ordenes_compra_items WHERE orden_compra_id = $1 ORDER BY id',
      [id]
    );

    res.json({ ...ocResult.rows[0], items: itemsResult.rows });
  } catch (error) { next(error); }
});

// POST / — Crear nueva orden de compra
router.post('/', async (req, res, next) => {
  const { proveedor_id, items, notas, fecha_esperada } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La orden de compra debe tener al menos un ítem' });
  }

  try {
    const total = items.reduce(
      (acc, i) => acc + parseFloat(i.precio_unitario || 0) * parseInt(i.cantidad_pedida || 0), 0
    );

    let proveedorNombre = null;
    if (proveedor_id) {
      const provResult = await db.query('SELECT nombre FROM proveedores WHERE id = $1', [proveedor_id]);
      proveedorNombre = provResult.rows[0]?.nombre || null;
    }

    const numResult = await db.query(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM ordenes_compra WHERE comercio_id = $1',
      [comercioId]
    );
    const numero = numResult.rows[0].siguiente;

    let ocId;
    await db.transaction(async (client) => {
      const ocResult = await client.query(
        `INSERT INTO ordenes_compra
           (numero, proveedor_id, proveedor_nombre, total, notas, fecha_esperada, usuario_id, comercio_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [numero, proveedor_id || null, proveedorNombre, total, notas || null, fecha_esperada || null, usuarioId, comercioId]
      );
      ocId = ocResult.rows[0].id;

      for (const item of items) {
        const cant = parseInt(item.cantidad_pedida || 0);
        const precio = parseFloat(item.precio_unitario || 0);
        await client.query(
          `INSERT INTO ordenes_compra_items
             (orden_compra_id, producto_id, nombre_producto, cantidad_pedida, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ocId, item.producto_id || null, item.nombre_producto, cant, precio, precio * cant]
        );
      }
    });

    res.status(201).json({ mensaje: 'Orden de compra creada', id: ocId, numero });
  } catch (error) { next(error); }
});

// PUT /:id/estado — Cambiar estado de la OC
// Cuando estado = 'recibida', items_recibidos actualiza el stock
router.put('/:id/estado', async (req, res, next) => {
  const { id } = req.params;
  const { estado, items_recibidos } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  const estadosValidos = ['borrador', 'enviada', 'recibida', 'cancelada'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Opciones: ${estadosValidos.join(', ')}` });
  }

  try {
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE ordenes_compra
         SET estado = $1, recibida_at = CASE WHEN $1 = 'recibida' THEN NOW() ELSE recibida_at END
         WHERE id = $2 AND comercio_id = $3`,
        [estado, id, comercioId]
      );

      if (estado === 'recibida' && Array.isArray(items_recibidos) && items_recibidos.length > 0) {
        for (const item of items_recibidos) {
          const cantRecibida = parseInt(item.cantidad_recibida || 0);
          if (!item.item_id || cantRecibida <= 0) continue;

          await client.query(
            'UPDATE ordenes_compra_items SET cantidad_recibida = $1 WHERE id = $2',
            [cantRecibida, item.item_id]
          );

          if (item.producto_id) {
            await client.query(
              'UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
              [cantRecibida, item.producto_id, comercioId]
            );
          }
        }
      }
    });

    try {
      await registrarAuditoria({
        tipo_evento: 'ORDEN_COMPRA',
        descripcion: `OC #${id} cambió a estado: ${estado}`,
        usuario_id: usuarioId,
        comercio_id: comercioId
      });
    } catch (e) { console.error('[Auditoria] OC:', e); }

    res.json({ mensaje: `Orden de compra actualizada a "${estado}"` });
  } catch (error) { next(error); }
});

// DELETE /:id — Eliminar OC (solo en borrador)
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const check = await db.query(
      'SELECT estado FROM ordenes_compra WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: 'Orden no encontrada' });
    if (check.rows[0].estado !== 'borrador') {
      return res.status(400).json({ error: 'Solo se pueden eliminar órdenes en estado Borrador' });
    }
    await db.query('DELETE FROM ordenes_compra WHERE id = $1', [id]);
    res.json({ mensaje: 'Orden de compra eliminada' });
  } catch (error) { next(error); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET / — Listar devoluciones
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT d.id, d.venta_id, d.motivo, d.total_devuelto, d.devuelto_caja, d.estado, d.fecha,
              u.nombre_usuario AS vendedor
       FROM devoluciones d
       LEFT JOIN usuarios u ON d.usuario_id = u.id
       WHERE d.comercio_id = $1
       ORDER BY d.fecha DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /:id — Detalle de una devolución con sus ítems
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const devResult = await db.query(
      'SELECT * FROM devoluciones WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (devResult.rowCount === 0) return res.status(404).json({ error: 'Devolución no encontrada' });

    const itemsResult = await db.query(
      'SELECT * FROM devolucion_items WHERE devolucion_id = $1',
      [id]
    );

    res.json({ ...devResult.rows[0], items: itemsResult.rows });
  } catch (error) { next(error); }
});

// POST / — Registrar una devolución
router.post('/', async (req, res, next) => {
  const { venta_id, items, motivo, devolver_a_caja = false } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un ítem a devolver' });
  }

  for (const item of items) {
    if (!item.producto_id || !item.cantidad || parseInt(item.cantidad) <= 0) {
      return res.status(400).json({ error: 'Cada ítem debe tener producto_id y cantidad > 0' });
    }
  }

  try {
    // Si viene venta_id, validar que pertenezca a este comercio
    if (venta_id) {
      const ventaCheck = await db.query(
        'SELECT id FROM ventas WHERE id = $1 AND comercio_id = $2',
        [venta_id, comercioId]
      );
      if (ventaCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Venta no encontrada en este comercio' });
      }
    }

    const totalDevuelto = items.reduce(
      (acc, item) => acc + parseFloat(item.precio_unitario) * parseInt(item.cantidad), 0
    );

    let devolucionId;
    await db.transaction(async (client) => {
      // 1. Insertar cabecera de devolución
      const devResult = await client.query(
        `INSERT INTO devoluciones (venta_id, usuario_id, comercio_id, motivo, total_devuelto, devuelto_caja, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'procesada') RETURNING id`,
        [venta_id || null, usuarioId, comercioId, motivo || null, totalDevuelto, devolver_a_caja]
      );
      devolucionId = devResult.rows[0].id;

      // 2. Insertar ítems + restaurar stock
      for (const item of items) {
        const cant = parseInt(item.cantidad);
        const precio = parseFloat(item.precio_unitario);

        await client.query(
          `INSERT INTO devolucion_items (devolucion_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [devolucionId, item.producto_id, item.nombre_producto, cant, precio, precio * cant]
        );

        await client.query(
          'UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
          [cant, item.producto_id, comercioId]
        );
      }

      // 3. Si corresponde, registrar egreso en la caja abierta
      if (devolver_a_caja) {
        const cajaResult = await client.query(
          'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
          ['abierta', usuarioId, comercioId]
        );
        if (cajaResult.rowCount > 0) {
          await client.query(
            `INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id)
             VALUES ($1, 'egreso', $2, $3, $4)`,
            [cajaResult.rows[0].id, totalDevuelto, `Devolución #${devolucionId}${motivo ? ': ' + motivo : ''}`, comercioId]
          );
        }
      }
    });

    try {
      await registrarAuditoria({
        tipo_evento: 'DEVOLUCION',
        descripcion: `Devolución #${devolucionId} registrada. Venta: ${venta_id || 'sin venta'}. Total: $${totalDevuelto.toFixed(2)}`,
        usuario_id: usuarioId,
        comercio_id: comercioId
      });
    } catch (e) { console.error('[Auditoria] devolución:', e); }

    res.status(201).json({ mensaje: 'Devolución registrada y stock restaurado', id: devolucionId, total_devuelto: totalDevuelto });
  } catch (error) { next(error); }
});

module.exports = router;

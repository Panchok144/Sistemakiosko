const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/facturas-compra
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id;
  const { estado, proveedor_id } = req.query;

  let sql = `
    SELECT fc.*, p.nombre AS proveedor_real
    FROM facturas_compra fc
    LEFT JOIN proveedores p ON fc.proveedor_id = p.id
    WHERE fc.comercio_id = $1
  `;
  const params = [comercioId];
  let idx = 2;
  if (estado) { sql += ` AND fc.estado = $${idx++}`; params.push(estado); }
  if (proveedor_id) { sql += ` AND fc.proveedor_id = $${idx++}`; params.push(proveedor_id); }
  sql += ' ORDER BY fc.fecha_emision DESC LIMIT 200';

  try {
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener facturas de compra:', error);
    res.status(500).json({ error: 'Error al obtener facturas de compra' });
  }
});

// GET /api/facturas-compra/:id/items
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    // Verificar pertenencia al comercio
    const fc = await db.query('SELECT id FROM facturas_compra WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    if (fc.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });

    const items = await db.query(
      `SELECT fci.*, p.nombre AS producto_nombre_actual, p.stock AS stock_actual
       FROM facturas_compra_items fci
       LEFT JOIN productos p ON fci.producto_id = p.id
       WHERE fci.factura_compra_id = $1`,
      [id]
    );
    res.json(items.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ítems' });
  }
});

// POST /api/facturas-compra
router.post('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  const {
    numero = null, proveedor_id = null,
    fecha_emision, fecha_vencimiento = null,
    metodo_pago = 'efectivo', notas = null,
    items = [],
  } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La factura debe tener al menos un ítem' });
  }

  try {
    // Obtener nombre del proveedor si se indicó
    let proveedorNombre = null;
    if (proveedor_id) {
      const pr = await db.query('SELECT nombre FROM proveedores WHERE id = $1 AND comercio_id = $2', [proveedor_id, comercioId]);
      if (pr.rowCount > 0) proveedorNombre = pr.rows[0].nombre;
    }

    let subtotalNeto = 0;
    let ivaMonto = 0;
    for (const it of items) {
      const sub = parseFloat(it.precio_unitario) * parseInt(it.cantidad);
      const ivaPorc = parseFloat(it.iva_porcentaje || 21);
      const neto = sub / (1 + ivaPorc / 100);
      subtotalNeto += neto;
      ivaMonto += sub - neto;
    }
    const total = subtotalNeto + ivaMonto;

    let idFactura = null;
    await db.transaction(async (client) => {
      const fcRes = await client.query(
        `INSERT INTO facturas_compra
           (numero, proveedor_id, proveedor_nombre, fecha_emision, fecha_vencimiento,
            subtotal_neto, iva_monto, total, metodo_pago, notas, usuario_id, comercio_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [numero, proveedor_id, proveedorNombre, fecha_emision || new Date().toISOString().slice(0, 10),
         fecha_vencimiento, subtotalNeto.toFixed(2), ivaMonto.toFixed(2), total.toFixed(2),
         metodo_pago, notas, usuarioId, comercioId]
      );
      idFactura = fcRes.rows[0].id;

      for (const it of items) {
        const sub = parseFloat(it.precio_unitario) * parseInt(it.cantidad);
        const tipoItem = it.tipo_item || 'producto'; // 'producto' | 'gasto' | 'servicio'
        // Obtener nombre del producto si no se pasó
        let nombreProducto = it.nombre_producto || it.nombre || 'Producto sin nombre';
        if (it.producto_id && !it.nombre_producto && tipoItem === 'producto') {
          const pr = await client.query('SELECT nombre FROM productos WHERE id = $1', [it.producto_id]);
          if (pr.rowCount > 0) nombreProducto = pr.rows[0].nombre;
        }
        await client.query(
          `INSERT INTO facturas_compra_items
             (factura_compra_id, producto_id, nombre_producto, cantidad, precio_unitario, iva_porcentaje, subtotal, tipo_item)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [idFactura, tipoItem === 'producto' ? (it.producto_id || null) : null,
           nombreProducto, it.cantidad, it.precio_unitario, it.iva_porcentaje || 21,
           sub.toFixed(2), tipoItem]
        );
      }
    });

    res.status(201).json({ mensaje: 'Factura de compra creada', id: idFactura });
  } catch (error) {
    console.error('Error al crear factura de compra:', error);
    res.status(500).json({ error: 'Error al crear factura de compra', detalle: error.message });
  }
});

// POST /api/facturas-compra/:id/recibir — Suma stock y actualiza costos
router.post('/:id/recibir', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  try {
    const fcRes = await db.query(
      'SELECT * FROM facturas_compra WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (fcRes.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    const fc = fcRes.rows[0];
    if (fc.recibida) return res.status(400).json({ error: 'Esta factura ya fue recibida anteriormente' });

    const itemsRes = await db.query(
      'SELECT * FROM facturas_compra_items WHERE factura_compra_id = $1',
      [id]
    );

    await db.transaction(async (client) => {
      for (const item of itemsRes.rows) {
        // Solo los ítems de tipo 'producto' suman stock y actualizan costo
        const tipoItem = item.tipo_item || 'producto';
        if (!item.producto_id || tipoItem !== 'producto') continue;
        // Sumar stock
        await client.query(
          'UPDATE productos SET stock = stock + $1, costo = $2, fecha_actualizacion_costo = NOW(), updated_at = NOW() WHERE id = $3 AND comercio_id = $4',
          [item.cantidad, item.precio_unitario, item.producto_id, comercioId]
        );

        // M7: Si la factura tiene fecha de vencimiento, registrar lote automáticamente
        if (fc.fecha_vencimiento) {
          await client.query(
            `INSERT INTO producto_lotes (producto_id, comercio_id, numero_lote, cantidad, fecha_vencimiento, usuario_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [item.producto_id, comercioId, fc.numero || `FAC-${id}`, item.cantidad, fc.fecha_vencimiento, usuarioId]
          ).catch(() => {});
        }
      }

      // Marcar factura como recibida
      await client.query(
        "UPDATE facturas_compra SET recibida = TRUE, recibida_at = NOW(), estado = 'pagada' WHERE id = $1",
        [id]
      );
    });

    await registrarAuditoria({
      tipo_evento: 'FACTURA_COMPRA_RECIBIDA',
      descripcion: `Factura de compra #${id} recibida. Stock y costos actualizados.`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.json({ mensaje: 'Mercadería recibida. Stock y costos actualizados.' });
  } catch (error) {
    console.error('Error al recibir factura de compra:', error);
    res.status(500).json({ error: 'Error al recibir factura de compra', detalle: error.message });
  }
});

// PUT /api/facturas-compra/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  const { estado } = req.body;
  try {
    const result = await db.query(
      'UPDATE facturas_compra SET estado = $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3 RETURNING id',
      [estado, id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json({ mensaje: 'Factura actualizada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar factura' });
  }
});

// DELETE /api/facturas-compra/:id (solo si no fue recibida)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const check = await db.query(
      'SELECT recibida FROM facturas_compra WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    if (check.rows[0].recibida) {
      return res.status(400).json({ error: 'No se puede eliminar una factura ya recibida' });
    }
    await db.query('DELETE FROM facturas_compra WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    res.json({ mensaje: 'Factura eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar factura' });
  }
});

module.exports = router;

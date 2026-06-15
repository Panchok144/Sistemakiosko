const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/notas
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const { tipo, cliente_id } = req.query;

  let sql = `
    SELECT n.*, c.nombre AS cliente_nombre_db, v.nro_comprobante AS venta_nro
    FROM notas_credito_debito n
    LEFT JOIN clientes c ON n.cliente_id = c.id
    LEFT JOIN ventas v ON n.venta_id = v.id
    WHERE n.comercio_id = $1
  `;
  const params = [comercioId];
  let idx = 2;
  if (tipo) { sql += ` AND n.tipo = $${idx++}`; params.push(tipo); }
  if (cliente_id) { sql += ` AND n.cliente_id = $${idx++}`; params.push(cliente_id); }
  sql += ' ORDER BY n.created_at DESC LIMIT 200';

  try {
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener notas:', error);
    res.status(500).json({ error: 'Error al obtener notas' });
  }
});

// GET /api/notas/:id/items
router.get('/:id/items', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const nota = await db.query('SELECT id FROM notas_credito_debito WHERE id = $1 AND comercio_id = $2', [id, comercioId]);
    if (nota.rowCount === 0) return res.status(404).json({ error: 'Nota no encontrada' });
    const items = await db.query('SELECT * FROM notas_credito_debito_items WHERE nota_id = $1', [id]);
    res.json(items.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ítems de la nota' });
  }
});

// POST /api/notas
router.post('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const usuarioId = req.usuario?.id;
  const {
    tipo, venta_id = null, cliente_id = null,
    motivo, subtotal_neto = 0, iva_monto = 0,
    total, afecta_stock = false,
    cliente_nombre = null, cliente_cuit = null,
    items = [],
  } = req.body;

  if (!tipo || !motivo || total == null) {
    return res.status(400).json({ error: 'Tipo, motivo y total son obligatorios' });
  }

  try {
    let idNota = null;
    await db.transaction(async (client) => {
      const notaRes = await client.query(
        `INSERT INTO notas_credito_debito
           (tipo, venta_id, cliente_id, motivo, subtotal_neto, iva_monto, total,
            afecta_stock, cliente_nombre, cliente_cuit, usuario_id, comercio_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [tipo, venta_id, cliente_id, motivo, subtotal_neto, iva_monto, total,
         afecta_stock, cliente_nombre, cliente_cuit, usuarioId, comercioId]
      );
      idNota = notaRes.rows[0].id;

      // Si tiene ítems, insertarlos y ajustar stock si afecta_stock
      for (const it of items) {
        await client.query(
          `INSERT INTO notas_credito_debito_items
             (nota_id, producto_id, nombre, cantidad, precio_unitario, iva_porcentaje)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [idNota, it.producto_id || null, it.nombre, it.cantidad, it.precio_unitario, it.iva_porcentaje || 21]
        );

        if (afecta_stock && it.producto_id && tipo === 'credito') {
          // Nota de crédito devuelve stock al comercio
          await client.query(
            'UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
            [it.cantidad, it.producto_id, comercioId]
          );
        }
      }

      // Si la nota de crédito está vinculada a un cliente con cuenta corriente, ajustar deuda
      if (tipo === 'credito' && cliente_id) {
        await client.query(
          'UPDATE clientes SET saldo_deuda = GREATEST(0, saldo_deuda - $1), updated_at = NOW() WHERE id = $2',
          [total, cliente_id]
        );
      }
      if (tipo === 'debito' && cliente_id) {
        await client.query(
          'UPDATE clientes SET saldo_deuda = COALESCE(saldo_deuda, 0) + $1, updated_at = NOW() WHERE id = $2',
          [total, cliente_id]
        );
      }
    });

    await registrarAuditoria({
      tipo_evento: `NOTA_${tipo.toUpperCase()}`,
      descripcion: `Nota de ${tipo} emitida — $${total} — Motivo: ${motivo}`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.status(201).json({ mensaje: `Nota de ${tipo} emitida`, id: idNota });
  } catch (error) {
    console.error('Error al crear nota:', error);
    res.status(500).json({ error: 'Error al crear nota', detalle: error.message });
  }
});

// PUT /api/notas/:id/anular
router.put('/:id/anular', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      "UPDATE notas_credito_debito SET estado = 'anulada' WHERE id = $1 AND comercio_id = $2 RETURNING id",
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json({ mensaje: 'Nota anulada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al anular nota' });
  }
});

module.exports = router;

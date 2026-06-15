const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// GET /api/recibos
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `SELECT r.*, p.nombre AS proveedor_nombre 
       FROM recibos r 
       LEFT JOIN proveedores p ON r.proveedor_id = p.id 
       WHERE r.comercio_id = $1 
       ORDER BY r.fecha DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener recibos:', error);
    res.status(500).json({ error: 'Error al obtener recibos' });
  }
});

// POST /api/recibos
router.post('/', async (req, res) => {
  const { proveedor_id, monto, concepto } = req.body;
  const usuarioId = req.usuario?.id;
  const comercioId = req.usuario?.comercio_id || 1;

  // BUG-17 FIX: Validar que el monto sea un número positivo, no solo que no sea null
  if (monto == null || parseFloat(monto) <= 0 || !concepto) {
    return res.status(400).json({ error: 'El monto debe ser mayor a $0 y el concepto es obligatorio' });
  }

  try {
    const reciboId = await db.transaction(async (client) => {
      // 1. Insertar el recibo
      const reciboResult = await client.query(
        'INSERT INTO recibos (proveedor_id, monto, concepto, comercio_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [proveedor_id || null, monto, concepto, comercioId]
      );
      const id = reciboResult.rows[0].id;

      // 2. Intentar registrar egreso en la caja abierta del usuario
      const cajaOpen = await client.query(
        'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 LIMIT 1',
        ['abierta', usuarioId, comercioId]
      );

      if (cajaOpen.rowCount > 0) {
        const idCaja = cajaOpen.rows[0].id;
        const descCaja = `Recibo de Pago a Proveedor (Recibo #${id}): ${concepto}`;
        
        await client.query(
          'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id) VALUES ($1, $2, $3, $4, $5)',
          [idCaja, 'egreso', monto, descCaja, comercioId]
        );
      }

      return id;
    });

    res.status(201).json({ mensaje: 'Recibo generado con éxito', id: reciboId });
  } catch (error) {
    console.error('Error al generar recibo:', error);
    res.status(500).json({ error: 'Error al generar recibo', detalle: error.message });
  }
});

module.exports = router;

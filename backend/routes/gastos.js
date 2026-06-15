const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/gastos?desde=&hasta=&categoria=
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const { desde, hasta, categoria_id } = req.query;

  let sql = `
    SELECT g.*, cg.nombre AS categoria_nombre, p.nombre AS proveedor_nombre
    FROM gastos g
    LEFT JOIN categorias_gasto cg ON g.categoria_gasto_id = cg.id
    LEFT JOIN proveedores p ON g.proveedor_id = p.id
    WHERE g.comercio_id = $1
  `;
  const params = [comercioId];
  let idx = 2;

  if (desde) { sql += ` AND g.fecha >= $${idx++}`; params.push(desde); }
  if (hasta) { sql += ` AND g.fecha <= $${idx++}`; params.push(hasta + ' 23:59:59'); }
  if (categoria_id) { sql += ` AND g.categoria_gasto_id = $${idx++}`; params.push(categoria_id); }

  sql += ' ORDER BY g.fecha DESC LIMIT 500';

  try {
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener gastos:', error);
    res.status(500).json({ error: 'Error al obtener gastos' });
  }
});

// GET /api/gastos/categorias
router.get('/categorias', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      'SELECT * FROM categorias_gasto WHERE comercio_id = $1 ORDER BY nombre ASC',
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías de gasto' });
  }
});

// POST /api/gastos
router.post('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const usuarioId = req.usuario?.id;
  const {
    concepto, monto, categoria_gasto_id = null,
    proveedor_id = null, metodo_pago = 'efectivo',
    nro_comprobante = null, afecta_caja = true,
  } = req.body;

  if (!concepto || !monto) {
    return res.status(400).json({ error: 'Concepto y monto son obligatorios' });
  }
  if (parseFloat(monto) <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  try {
    // Buscar caja abierta del usuario
    let cajaId = null;
    if (afecta_caja && metodo_pago === 'efectivo') {
      const cajaRes = await db.query(
        "SELECT id FROM cajas WHERE estado = 'abierta' AND id_usuario = $1 AND comercio_id = $2 ORDER BY id DESC LIMIT 1",
        [usuarioId, comercioId]
      );
      if (cajaRes.rowCount > 0) {
        cajaId = cajaRes.rows[0].id;
      }
    }

    await db.transaction(async (client) => {
      const gastoRes = await client.query(
        `INSERT INTO gastos (concepto, monto, categoria_gasto_id, proveedor_id, metodo_pago,
           nro_comprobante, afecta_caja, caja_id, usuario_id, comercio_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [concepto, monto, categoria_gasto_id, proveedor_id, metodo_pago,
         nro_comprobante, afecta_caja, cajaId, usuarioId, comercioId]
      );

      // Si afecta caja, registrar egreso en movimientos_caja
      if (cajaId && afecta_caja && metodo_pago === 'efectivo') {
        await client.query(
          `INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id)
           VALUES ($1, 'egreso', $2, $3, $4)`,
          [cajaId, monto, `Gasto: ${concepto}`, comercioId]
        );
      }

      return gastoRes.rows[0].id;
    });

    await registrarAuditoria({
      tipo_evento: 'GASTO_REGISTRADO',
      descripcion: `Gasto registrado: ${concepto} — $${monto}`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.status(201).json({ mensaje: 'Gasto registrado con éxito' });
  } catch (error) {
    console.error('Error al registrar gasto:', error);
    res.status(500).json({ error: 'Error al registrar gasto', detalle: error.message });
  }
});

// DELETE /api/gastos/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      'DELETE FROM gastos WHERE id = $1 AND comercio_id = $2 RETURNING id',
      [id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json({ mensaje: 'Gasto eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar gasto' });
  }
});

module.exports = router;

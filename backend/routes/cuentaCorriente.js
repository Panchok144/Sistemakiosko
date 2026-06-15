const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// GET / — Todos los clientes con su saldo de cuenta corriente
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT id, nombre, documento, telefono, email, credito_limite, saldo_deuda
       FROM clientes WHERE comercio_id = $1 ORDER BY saldo_deuda DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /:cliente_id — Estado de cuenta de un cliente con movimientos
router.get('/:cliente_id', async (req, res, next) => {
  const { cliente_id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  try {
    const clienteResult = await db.query(
      'SELECT id, nombre, documento, telefono, email, credito_limite, saldo_deuda FROM clientes WHERE id = $1 AND comercio_id = $2',
      [cliente_id, comercioId]
    );
    if (clienteResult.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const movimientosResult = await db.query(
      `SELECT m.*, u.nombre_usuario AS operador
       FROM movimientos_cuenta_corriente m
       LEFT JOIN usuarios u ON m.usuario_id = u.id
       WHERE m.cliente_id = $1 AND m.comercio_id = $2
       ORDER BY m.fecha DESC LIMIT 100`,
      [cliente_id, comercioId]
    );

    res.json({ cliente: clienteResult.rows[0], movimientos: movimientosResult.rows });
  } catch (error) { next(error); }
});

// POST /:cliente_id/pago — Registrar un pago de deuda
router.post('/:cliente_id/pago', async (req, res, next) => {
  const { cliente_id } = req.params;
  const { monto, descripcion } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  const montoNum = parseFloat(monto);
  if (isNaN(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  try {
    const clienteResult = await db.query(
      'SELECT id, nombre, saldo_deuda FROM clientes WHERE id = $1 AND comercio_id = $2',
      [cliente_id, comercioId]
    );
    if (clienteResult.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const saldoActual = parseFloat(clienteResult.rows[0].saldo_deuda || 0);
    const nuevoSaldo = Math.max(0, saldoActual - montoNum);

    await db.transaction(async (client) => {
      await client.query(
        'UPDATE clientes SET saldo_deuda = $1, updated_at = NOW() WHERE id = $2',
        [nuevoSaldo, cliente_id]
      );

      await client.query(
        `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, usuario_id, comercio_id)
         VALUES ($1, 'pago', $2, $3, $4, $5)`,
        [cliente_id, montoNum, descripcion || 'Pago de deuda', usuarioId, comercioId]
      );

      // Registrar ingreso en caja abierta si existe
      const cajaResult = await client.query(
        'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
        ['abierta', usuarioId, comercioId]
      );
      if (cajaResult.rowCount > 0) {
        await client.query(
          `INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id)
           VALUES ($1, 'ingreso', $2, $3, $4)`,
          [cajaResult.rows[0].id, montoNum, `Pago cta cte: ${clienteResult.rows[0].nombre}`, comercioId]
        );
      }
    });

    res.json({ mensaje: 'Pago registrado correctamente', nuevo_saldo: nuevoSaldo });
  } catch (error) { next(error); }
});

// PUT /:cliente_id/limite — Actualizar límite de crédito
router.put('/:cliente_id/limite', async (req, res, next) => {
  const { cliente_id } = req.params;
  const { credito_limite } = req.body;
  const comercioId = req.usuario?.comercio_id;

  const limiteNum = parseFloat(credito_limite);
  if (isNaN(limiteNum) || limiteNum < 0) {
    return res.status(400).json({ error: 'El límite debe ser 0 o mayor' });
  }

  try {
    const result = await db.query(
      'UPDATE clientes SET credito_limite = $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3 RETURNING id',
      [limiteNum, cliente_id, comercioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Límite de crédito actualizado' });
  } catch (error) { next(error); }
});

// POST /:cliente_id/ajuste — Ajuste manual del saldo (admin)
router.post('/:cliente_id/ajuste', async (req, res, next) => {
  const { cliente_id } = req.params;
  const { monto, descripcion } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  const montoNum = parseFloat(monto);
  if (isNaN(montoNum)) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  try {
    const clienteResult = await db.query(
      'SELECT id, saldo_deuda FROM clientes WHERE id = $1 AND comercio_id = $2',
      [cliente_id, comercioId]
    );
    if (clienteResult.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const nuevoSaldo = Math.max(0, parseFloat(clienteResult.rows[0].saldo_deuda || 0) + montoNum);

    await db.transaction(async (client) => {
      await client.query(
        'UPDATE clientes SET saldo_deuda = $1, updated_at = NOW() WHERE id = $2',
        [nuevoSaldo, cliente_id]
      );
      await client.query(
        `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, usuario_id, comercio_id)
         VALUES ($1, 'ajuste', $2, $3, $4, $5)`,
        [cliente_id, montoNum, descripcion || 'Ajuste manual', usuarioId, comercioId]
      );
    });

    res.json({ mensaje: 'Ajuste aplicado', nuevo_saldo: nuevoSaldo });
  } catch (error) { next(error); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');

router.get('/estado', async (req, res) => {
  const usuarioId = req.usuario?.id;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'SELECT * FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
      ['abierta', usuarioId, comercioId]
    );

    if (result.rowCount === 0) {
      return res.json({ caja: null });
    }

    res.json({ caja: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo caja:', error);
    res.status(500).json({ error: 'Error obteniendo caja' });
  }
});

router.get('/historial', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      "SELECT * FROM cajas WHERE estado = 'cerrada' AND comercio_id = $1 ORDER BY fecha_cierre DESC LIMIT 50",
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial de cajas:', error);
    res.status(500).json({ error: 'Error obteniendo historial de cajas' });
  }
});

router.post('/abrir', async (req, res) => {
  const usuarioId = req.usuario?.id;
  const comercioId = req.usuario?.comercio_id || 1;
  const { monto_inicial } = req.body;

  if (monto_inicial == null) {
    return res.status(400).json({ error: 'Monto inicial obligatorio' });
  }

  try {
    const openBox = await db.query(
      'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 LIMIT 1',
      ['abierta', usuarioId, comercioId]
    );

    if (openBox.rowCount > 0) {
      return res.status(400).json({ error: 'Ya existe una caja abierta para este empleado' });
    }

    const result = await db.query(
      'INSERT INTO cajas (id_usuario, monto_inicial, comercio_id) VALUES ($1, $2, $3) RETURNING id',
      [usuarioId, monto_inicial, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CAJA_APERTURA',
      descripcion: `Se abrió la caja con un monto inicial de $${monto_inicial}`,
      usuario_id: usuarioId,
      comercio_id: comercioId
    });

    res.status(201).json({ mensaje: 'Caja abierta con éxito', id_caja: result.rows[0].id });
  } catch (error) {
    console.error('Error abriendo caja:', error);
    res.status(500).json({ error: 'Error abriendo caja', detalle: error.message });
  }
});

router.post('/:id_caja/movimiento', async (req, res) => {
  const { tipo, monto, descripcion } = req.body;
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  const usuarioId = req.usuario?.id;
  const rolUsuario = req.usuario?.rol;

  if (!tipo || monto == null || !descripcion) {
    return res.status(400).json({ error: 'Tipo, monto y descripción son obligatorios' });
  }

  if (parseFloat(monto) <= 0) {
    return res.status(400).json({ error: 'El monto del movimiento debe ser mayor a 0' });
  }

  try {
    // BUG-15 FIX: Verificar que el usuario sea dueño de la caja o tenga rol admin/dueño
    const boxCheck = await db.query(
      'SELECT id, id_usuario FROM cajas WHERE id = $1 AND comercio_id = $2 LIMIT 1',
      [id_caja, comercioId]
    );

    if (boxCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Caja no encontrada para este comercio' });
    }

    const esAdmin = ['administrador', 'dueno', 'superadmin'].includes(rolUsuario);
    const esDuenoCaja = boxCheck.rows[0].id_usuario === usuarioId;

    if (!esAdmin && !esDuenoCaja) {
      return res.status(403).json({ error: 'No tenés permiso para registrar movimientos en esta caja' });
    }

    const result = await db.query(
      'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [id_caja, tipo, monto, descripcion, comercioId]
    );

    res.status(201).json({ mensaje: 'Movimiento registrado', id_movimiento: result.rows[0].id });
  } catch (error) {
    console.error('Error registrando movimiento:', error);
    res.status(500).json({ error: 'Error registrando movimiento', detalle: error.message });
  }
});

router.get('/:id_caja/movimientos', async (req, res) => {
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      'SELECT * FROM movimientos_caja WHERE id_caja = $1 AND comercio_id = $2 ORDER BY id DESC',
      [id_caja, comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo movimientos:', error);
    res.status(500).json({ error: 'Error obteniendo movimientos' });
  }
});

router.post('/:id_caja/cerrar', async (req, res) => {
  const { monto_final } = req.body;
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  const usuarioId = req.usuario?.id;
  const rolUsuario = req.usuario?.rol;

  if (monto_final == null) {
    return res.status(400).json({ error: 'Monto final obligatorio' });
  }

  try {
    const cajaRes = await db.query('SELECT monto_inicial, id_usuario FROM cajas WHERE id = $1 AND comercio_id = $2', [id_caja, comercioId]);
    if (cajaRes.rowCount === 0) return res.status(404).json({ error: 'Caja no encontrada para este comercio' });

    // BUG-15 FIX: Solo el dueño de la caja o un admin puede cerrarla
    const esAdmin = ['administrador', 'dueno', 'superadmin'].includes(rolUsuario);
    const esDuenoCaja = cajaRes.rows[0].id_usuario === usuarioId;

    if (!esAdmin && !esDuenoCaja) {
      return res.status(403).json({ error: 'No tenés permiso para cerrar esta caja' });
    }

    const montoInicial = parseFloat(cajaRes.rows[0].monto_inicial);

    const movRes = await db.query('SELECT tipo, monto FROM movimientos_caja WHERE id_caja = $1 AND comercio_id = $2', [id_caja, comercioId]);
    let ingresos = 0;
    let egresos = 0;
    for (const mov of movRes.rows) {
      if (mov.tipo === 'ingreso') ingresos += parseFloat(mov.monto);
      if (mov.tipo === 'egreso') egresos += parseFloat(mov.monto);
    }
    const montoTeorico = montoInicial + ingresos - egresos;
    const diferencia = parseFloat(monto_final) - montoTeorico;

    const result = await db.query(
      'UPDATE cajas SET estado = $1, monto_final = $2, monto_teorico = $3, diferencia = $4, fecha_cierre = NOW() WHERE id = $5 AND comercio_id = $6 RETURNING id',
      ['cerrada', monto_final, montoTeorico, diferencia, id_caja, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CAJA_CIERRE',
      descripcion: `Se cerró la caja (Monto final: $${monto_final}, Diferencia: $${diferencia})`,
      usuario_id: req.usuario?.id,
      comercio_id: comercioId
    });

    res.json({ 
      mensaje: 'Caja cerrada exitosamente', 
      monto_teorico: montoTeorico, 
      diferencia: diferencia 
    });
  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({ error: 'Error al cerrar caja', detalle: error.message });
  }
});

module.exports = router;

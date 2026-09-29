const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');
const { cents, fromCents, round2 } = require('../utils/money');

const METODOS_PERMITIDOS = [
  'efectivo',
  'tarjeta_debito',
  'tarjeta_credito',
  'transferencia',
  'qr',
  'cuenta_corriente',
  'otro'
];

router.get('/estado', async (req, res) => {
  const usuarioId = req.usuario?.id;
  const comercioId = req.usuario?.comercio_id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

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
  const comercioId = req.usuario?.comercio_id;

  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

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
  const comercioId = req.usuario?.comercio_id;
  const { monto_inicial } = req.body;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  if (monto_inicial == null || isNaN(Number(monto_inicial))) {
    return res.status(400).json({ error: 'Monto inicial obligatorio y debe ser numérico' });
  }

  const montoInicialVal = fromCents(cents(monto_inicial));

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
      [usuarioId, montoInicialVal, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CAJA_APERTURA',
      descripcion: `Se abrió la caja con un monto inicial de $${montoInicialVal}`,
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
  const { tipo, monto, descripcion, metodo_pago = 'efectivo' } = req.body;
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  const rolUsuario = req.usuario?.rol;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  if (!tipo || !['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ error: 'El tipo debe ser "ingreso" o "egreso"' });
  }

  if (monto == null || isNaN(Number(monto)) || parseFloat(monto) <= 0) {
    return res.status(400).json({ error: 'El monto del movimiento debe ser un número mayor a 0' });
  }

  if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
    return res.status(400).json({ error: 'La descripción es obligatoria' });
  }

  const metodoFinal = METODOS_PERMITIDOS.includes(metodo_pago) ? metodo_pago : 'efectivo';
  const montoVal = fromCents(cents(monto));

  try {
    const boxCheck = await db.query(
      'SELECT id, id_usuario, estado FROM cajas WHERE id = $1 AND comercio_id = $2 LIMIT 1',
      [id_caja, comercioId]
    );

    if (boxCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Caja no encontrada para este comercio' });
    }

    if (boxCheck.rows[0].estado !== 'abierta') {
      return res.status(400).json({ error: 'No se pueden registrar movimientos en una caja cerrada' });
    }

    const esAdmin = ['administrador', 'dueno', 'superadmin'].includes(rolUsuario);
    const esDuenoCaja = boxCheck.rows[0].id_usuario === usuarioId;

    if (!esAdmin && !esDuenoCaja) {
      return res.status(403).json({ error: 'No tenés permiso para registrar movimientos en esta caja' });
    }

    let result;
    try {
      result = await db.query(
        'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [id_caja, tipo, montoVal, descripcion.trim(), comercioId, metodoFinal]
      );
    } catch (eCol) {
      result = await db.query(
        'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [id_caja, tipo, montoVal, descripcion.trim(), comercioId]
      );
    }

    res.status(201).json({ mensaje: 'Movimiento registrado', id_movimiento: result.rows[0].id });
  } catch (error) {
    console.error('Error registrando movimiento:', error);
    res.status(500).json({ error: 'Error registrando movimiento', detalle: error.message });
  }
});

router.get('/:id_caja/movimientos', async (req, res) => {
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id;

  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

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

// ── GET /:id_caja/arqueo-en-vivo — Arqueo en vivo y desglose de valores ───────
router.get('/:id_caja/arqueo-en-vivo', async (req, res) => {
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id;

  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  try {
    const cajaRes = await db.query(
      'SELECT id, monto_inicial, estado, fecha_apertura, id_usuario FROM cajas WHERE id = $1 AND comercio_id = $2',
      [id_caja, comercioId]
    );
    if (cajaRes.rowCount === 0) {
      return res.status(404).json({ error: 'Caja no encontrada' });
    }
    const caja = cajaRes.rows[0];

    const movRes = await db.query(
      "SELECT tipo, monto, COALESCE(metodo_pago, 'efectivo') AS metodo_pago FROM movimientos_caja WHERE id_caja = $1 AND comercio_id = $2",
      [id_caja, comercioId]
    );

    const montoInicialCents = cents(caja.monto_inicial);
    let ingresosEfectivoCents = 0;
    let egresosEfectivoCents = 0;
    const desglose = {
      efectivo: 0,
      tarjeta_debito: 0,
      tarjeta_credito: 0,
      transferencia: 0,
      qr: 0,
      cuenta_corriente: 0,
      otros: 0,
    };

    for (const mov of movRes.rows) {
      const mCents = cents(mov.monto);
      const metodo = mov.metodo_pago;
      if (mov.tipo === 'ingreso') {
        if (metodo === 'efectivo') {
          ingresosEfectivoCents += mCents;
          desglose.efectivo += mCents;
        } else if (desglose[metodo] !== undefined) {
          desglose[metodo] += mCents;
        } else {
          desglose.otros += mCents;
        }
      } else if (mov.tipo === 'egreso') {
        if (metodo === 'efectivo') {
          egresosEfectivoCents += mCents;
        }
      }
    }

    const saldoEfectivoCents = Math.max(0, montoInicialCents + ingresosEfectivoCents - egresosEfectivoCents);

    res.json({
      caja_id: Number(id_caja),
      estado: caja.estado,
      monto_inicial: fromCents(montoInicialCents),
      saldo_efectivo_disponible: fromCents(saldoEfectivoCents),
      total_ingresos_efectivo: fromCents(ingresosEfectivoCents),
      total_egresos_efectivo: fromCents(egresosEfectivoCents),
      desglose_digital_y_otros: {
        tarjeta_debito: fromCents(desglose.tarjeta_debito),
        tarjeta_credito: fromCents(desglose.tarjeta_credito),
        transferencia: fromCents(desglose.transferencia),
        qr: fromCents(desglose.qr),
        cuenta_corriente: fromCents(desglose.cuenta_corriente),
      },
      cantidad_movimientos: movRes.rowCount,
    });
  } catch (error) {
    console.error('Error calculando arqueo en vivo:', error);
    res.status(500).json({ error: 'Error calculando arqueo en vivo', detalle: error.message });
  }
});

// ── POST /:id_caja/retiro-efectivo — Retiro seguro de efectivo con validación ─
router.post('/:id_caja/retiro-efectivo', async (req, res) => {
  const { id_caja } = req.params;
  const { monto, motivo } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  if (monto == null || isNaN(Number(monto)) || Number(monto) <= 0) {
    return res.status(400).json({ error: 'El monto a retirar debe ser un número positivo mayor a 0' });
  }

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'El motivo del retiro es obligatorio' });
  }

  try {
    const cajaRes = await db.query(
      'SELECT id, monto_inicial, estado FROM cajas WHERE id = $1 AND comercio_id = $2',
      [id_caja, comercioId]
    );
    if (cajaRes.rowCount === 0) {
      return res.status(404).json({ error: 'Caja no encontrada' });
    }
    if (cajaRes.rows[0].estado !== 'abierta') {
      return res.status(400).json({ error: 'Solo se pueden realizar retiros de una caja abierta' });
    }

    const montoInicialCents = cents(cajaRes.rows[0].monto_inicial);
    const movRes = await db.query(
      "SELECT tipo, monto FROM movimientos_caja WHERE id_caja = $1 AND comercio_id = $2 AND COALESCE(metodo_pago, 'efectivo') = 'efectivo'",
      [id_caja, comercioId]
    );

    let efectivoDisponibleCents = montoInicialCents;
    for (const mov of movRes.rows) {
      const mC = cents(mov.monto);
      if (mov.tipo === 'ingreso') efectivoDisponibleCents += mC;
      else if (mov.tipo === 'egreso') efectivoDisponibleCents -= mC;
    }

    const retiroCents = cents(monto);
    if (retiroCents > efectivoDisponibleCents) {
      return res.status(409).json({
        error: `Saldo insuficiente en caja. Disponible en efectivo: $${fromCents(efectivoDisponibleCents)}, solicitado: $${fromCents(retiroCents)}`,
        disponible: fromCents(efectivoDisponibleCents),
        solicitado: fromCents(retiroCents),
      });
    }

    const montoVal = fromCents(retiroCents);
    const descFinal = `Retiro de efectivo: ${motivo.trim()}`;

    const insertRes = await db.query(
      "INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, 'egreso', $2, $3, $4, 'efectivo') RETURNING id",
      [id_caja, montoVal, descFinal, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CAJA_RETIRO',
      descripcion: `Retiro de efectivo por $${montoVal} de la caja #${id_caja}. Motivo: ${motivo.trim()}`,
      usuario_id: usuarioId,
      comercio_id: comercioId,
    });

    res.status(201).json({
      mensaje: 'Retiro registrado exitosamente',
      id_movimiento: insertRes.rows[0].id,
      monto_retirado: montoVal,
      saldo_restante: fromCents(efectivoDisponibleCents - retiroCents),
    });
  } catch (error) {
    console.error('Error registrando retiro de caja:', error);
    res.status(500).json({ error: 'Error registrando retiro de caja', detalle: error.message });
  }
});

router.post('/:id_caja/cerrar', async (req, res) => {
  const { monto_final } = req.body;
  const { id_caja } = req.params;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;
  const rolUsuario = req.usuario?.rol;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  if (monto_final == null || isNaN(Number(monto_final))) {
    return res.status(400).json({ error: 'Monto final obligatorio y numérico' });
  }

  try {
    const cajaRes = await db.query(
      'SELECT monto_inicial, id_usuario, estado FROM cajas WHERE id = $1 AND comercio_id = $2',
      [id_caja, comercioId]
    );
    if (cajaRes.rowCount === 0) {
      return res.status(404).json({ error: 'Caja no encontrada para este comercio' });
    }

    if (cajaRes.rows[0].estado === 'cerrada') {
      return res.status(400).json({ error: 'Esta caja ya se encuentra cerrada' });
    }

    const esAdmin = ['administrador', 'dueno', 'superadmin'].includes(rolUsuario);
    const esDuenoCaja = cajaRes.rows[0].id_usuario === usuarioId;

    if (!esAdmin && !esDuenoCaja) {
      return res.status(403).json({ error: 'No tenés permiso para cerrar esta caja' });
    }

    // C2: Toda la matemática en centavos enteros
    const montoInicialCents = cents(cajaRes.rows[0].monto_inicial);

    // C3: Solo sumar movimientos de EFECTIVO para el arqueo teórico físico de caja
    const movRes = await db.query(
      "SELECT tipo, monto, COALESCE(metodo_pago, 'efectivo') AS metodo_pago FROM movimientos_caja WHERE id_caja = $1 AND comercio_id = $2",
      [id_caja, comercioId]
    );

    let ingresosEfectivoCents = 0;
    let egresosEfectivoCents = 0;

    for (const mov of movRes.rows) {
      if (mov.metodo_pago === 'efectivo') {
        const mCents = cents(mov.monto);
        if (mov.tipo === 'ingreso') {
          ingresosEfectivoCents += mCents;
        } else if (mov.tipo === 'egreso') {
          egresosEfectivoCents += mCents;
        }
      }
    }

    const montoTeoricoCents = montoInicialCents + ingresosEfectivoCents - egresosEfectivoCents;
    const montoFinalCents = cents(monto_final);
    const diferenciaCents = montoFinalCents - montoTeoricoCents;

    const montoTeorico = fromCents(montoTeoricoCents);
    const diferencia = fromCents(diferenciaCents);
    const montoFinalVal = fromCents(montoFinalCents);

    await db.query(
      'UPDATE cajas SET estado = $1, monto_final = $2, monto_teorico = $3, diferencia = $4, fecha_cierre = NOW() WHERE id = $5 AND comercio_id = $6',
      ['cerrada', montoFinalVal, montoTeorico, diferencia, id_caja, comercioId]
    );

    await registrarAuditoria({
      tipo_evento: 'CAJA_CIERRE',
      descripcion: `Se cerró la caja (Monto final: $${montoFinalVal}, Teórico efectivo: $${montoTeorico}, Diferencia: $${diferencia})`,
      usuario_id: usuarioId,
      comercio_id: comercioId
    });

    res.json({
      mensaje: 'Caja cerrada exitosamente',
      monto_teorico: montoTeorico,
      monto_final: montoFinalVal,
      diferencia: diferencia
    });
  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({ error: 'Error al cerrar caja', detalle: error.message });
  }
});

module.exports = router;

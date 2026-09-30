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

// ── GET /resumen-mora — Semáforo de riesgo crediticio y antigüedad de deuda ──
router.get('/resumen-mora', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

  try {
    const clientesRes = await db.query(
      `SELECT
         c.id, c.nombre, c.documento, c.telefono, c.email,
         c.credito_limite, c.saldo_deuda,
         MIN(CASE WHEN m.tipo = 'debito' THEN m.fecha ELSE NULL END) AS primer_debito_fecha,
         MAX(CASE WHEN m.tipo = 'credito' THEN m.fecha ELSE NULL END) AS ultimo_pago_fecha,
         COUNT(m.id) AS total_movimientos
       FROM clientes c
       LEFT JOIN movimientos_cuenta_corriente m ON c.id = m.cliente_id AND m.comercio_id = $1
       WHERE c.comercio_id = $1 AND c.saldo_deuda > 0
       GROUP BY c.id
       ORDER BY c.saldo_deuda DESC`,
      [comercioId]
    );

    const hoy = new Date();
    let totalDeuda = 0;
    let alDiaCount = 0;
    let alertaCount = 0;
    let morososCount = 0;

    const listado = clientesRes.rows.map(c => {
      const deuda = Number(c.saldo_deuda) || 0;
      const limite = Number(c.credito_limite) || 0;
      totalDeuda += deuda;

      let diasMora = 0;
      if (c.primer_debito_fecha) {
        const fechaBase = c.ultimo_pago_fecha ? new Date(c.ultimo_pago_fecha) : new Date(c.primer_debito_fecha);
        const diffMs = hoy - fechaBase;
        diasMora = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      const pctUsoCredito = limite > 0 ? Math.round((deuda / limite) * 100) : 100;

      let riesgo = 'verde';
      let motivoRiesgo = 'Cuenta al día';

      if (diasMora > 60 || (limite > 0 && deuda >= limite)) {
        riesgo = 'rojo';
        motivoRiesgo = diasMora > 60 ? `Mora crítica (${diasMora} días)` : 'Límite de crédito agotado';
        morososCount++;
      } else if (diasMora >= 30 || pctUsoCredito >= 80) {
        riesgo = 'amarillo';
        motivoRiesgo = diasMora >= 30 ? `Mora moderada (${diasMora} días)` : `Uso del crédito al ${pctUsoCredito}%`;
        alertaCount++;
      } else {
        alDiaCount++;
      }

      return {
        id: c.id,
        nombre: c.nombre,
        documento: c.documento,
        telefono: c.telefono,
        saldo_deuda: deuda,
        credito_limite: limite,
        dias_mora: diasMora,
        porcentaje_credito_usado: pctUsoCredito,
        riesgo,
        motivo_riesgo: motivoRiesgo,
        ultimo_pago_fecha: c.ultimo_pago_fecha,
      };
    });

    res.json({
      resumen: {
        total_deuda_cobrar: Math.round(totalDeuda * 100) / 100,
        clientes_con_deuda: listado.length,
        clientes_al_dia: alDiaCount,
        clientes_alerta: alertaCount,
        clientes_morosos: morososCount,
      },
      clientes: listado,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /recordatorios-mora — Listado de deudas vencidas para alertas/recordatorios (M9) ──
router.get('/recordatorios-mora', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const clientesRes = await db.query(
      `SELECT c.id, c.nombre, c.telefono, c.saldo_deuda,
              MIN(CASE WHEN m.tipo = 'debito' THEN m.fecha ELSE NULL END) AS primer_debito_fecha,
              MAX(CASE WHEN m.tipo = 'credito' THEN m.fecha ELSE NULL END) AS ultimo_pago_fecha
       FROM clientes c
       LEFT JOIN movimientos_cuenta_corriente m ON c.id = m.cliente_id AND m.comercio_id = $1
       WHERE c.comercio_id = $1 AND c.saldo_deuda > 0
       GROUP BY c.id
       ORDER BY c.saldo_deuda DESC`,
      [comercioId]
    );

    const hoy = new Date();
    const morosos = [];

    for (const c of clientesRes.rows) {
      const fechaBase = c.ultimo_pago_fecha ? new Date(c.ultimo_pago_fecha) : (c.primer_debito_fecha ? new Date(c.primer_debito_fecha) : null);
      let diasMora = 0;
      if (fechaBase) {
        diasMora = Math.max(0, Math.floor((hoy - fechaBase) / (1000 * 60 * 60 * 24)));
      }
      if (diasMora >= 30) {
        morosos.push({
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          saldo_deuda: parseFloat(c.saldo_deuda || 0),
          dias_mora: diasMora,
          mensaje_whatsapp: `Hola ${c.nombre}, te recordamos que tenés un saldo pendiente de $${parseFloat(c.saldo_deuda).toLocaleString('es-AR', { minimumFractionDigits: 2 })} con ${diasMora} días de antigüedad en tu cuenta corriente. ¡Muchas gracias!`,
        });
      }
    }

    res.json({
      total_vencidas: morosos.length,
      clientes_mora: morosos,
    });
  } catch (error) { next(error); }
});

// ── GET /:cliente_id/estado-cuenta — Estado de cuenta con saldo acumulado y aging 30/60/90 (M9) ──
router.get('/:cliente_id/estado-cuenta', async (req, res, next) => {
  const { cliente_id } = req.params;
  const comercioId = req.usuario?.comercio_id;

  try {
    const [clienteResult, comercioResult, movimientosResult] = await Promise.all([
      db.query(
        'SELECT id, nombre, documento, telefono, email, direccion, credito_limite, saldo_deuda FROM clientes WHERE id = $1 AND comercio_id = $2',
        [cliente_id, comercioId]
      ),
      db.query(
        'SELECT nombre, razon_social, cuit, domicilio, telefono, email, leyenda_ticket FROM comercios WHERE id = $1',
        [comercioId]
      ),
      db.query(
        `SELECT m.*, u.nombre_usuario AS operador
         FROM movimientos_cuenta_corriente m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.cliente_id = $1 AND m.comercio_id = $2
         ORDER BY m.fecha ASC`,
        [cliente_id, comercioId]
      ),
    ]);

    if (clienteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const cliente = clienteResult.rows[0];
    const comercio = comercioResult.rows[0] || {};
    const movimientos = movimientosResult.rows;

    let saldoCents = 0;
    const movimientosConSaldo = [];

    for (const m of movimientos) {
      const montoFloat = parseFloat(m.monto || 0);
      const montoC = Math.round(montoFloat * 100);
      const esDebito = m.tipo === 'debito' || m.tipo === 'venta' || m.tipo === 'cargo' || (m.tipo === 'ajuste' && montoFloat > 0);

      if (esDebito) {
        saldoCents += montoC;
      } else {
        saldoCents -= montoC;
      }

      movimientosConSaldo.push({
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        descripcion: m.descripcion,
        monto: montoFloat,
        saldo_acumulado: Math.round(saldoCents) / 100,
        operador: m.operador,
      });
    }

    // Calcular aging de la deuda pendiente
    const hoy = new Date();
    let aging_0_30 = 0;
    let aging_31_60 = 0;
    let aging_61_90 = 0;
    let aging_90_plus = 0;
    let maxDiasMora = 0;

    let saldoRestanteDeudaCents = Math.round(parseFloat(cliente.saldo_deuda || 0) * 100);
    const debits = movimientos.filter(m => {
      const mf = parseFloat(m.monto || 0);
      return m.tipo === 'debito' || m.tipo === 'venta' || (m.tipo === 'ajuste' && mf > 0);
    });

    for (let i = debits.length - 1; i >= 0 && saldoRestanteDeudaCents > 0; i--) {
      const d = debits[i];
      const montoD = Math.min(saldoRestanteDeudaCents, Math.round(parseFloat(d.monto || 0) * 100));
      saldoRestanteDeudaCents -= montoD;
      const dias = Math.max(0, Math.floor((hoy - new Date(d.fecha)) / (1000 * 60 * 60 * 24)));
      if (dias > maxDiasMora) maxDiasMora = dias;

      if (dias <= 30) {
        aging_0_30 += montoD;
      } else if (dias <= 60) {
        aging_31_60 += montoD;
      } else if (dias <= 90) {
        aging_61_90 += montoD;
      } else {
        aging_90_plus += montoD;
      }
    }
    if (saldoRestanteDeudaCents > 0) {
      aging_90_plus += saldoRestanteDeudaCents;
    }

    const aging = {
      dias_0_30: aging_0_30 / 100,
      dias_31_60: aging_31_60 / 100,
      dias_61_90: aging_61_90 / 100,
      dias_mas_90: aging_90_plus / 100,
      total_deuda: parseFloat(cliente.saldo_deuda || 0),
      dias_mora_max: maxDiasMora,
    };

    res.json({
      cliente,
      comercio,
      aging,
      movimientos: movimientosConSaldo.reverse(), // Más recientes primero para la tabla
    });
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

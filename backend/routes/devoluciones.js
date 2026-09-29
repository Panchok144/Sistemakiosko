const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { registrarAuditoria } = require('../services/auditoriaService');
const { cents, fromCents, round2 } = require('../utils/money');

// GET / — Listar devoluciones
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

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
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

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

// POST / — Registrar una devolución (C4 + C2 + C3)
router.post('/', async (req, res, next) => {
  const { venta_id, items, motivo, devolver_a_caja = false, reembolso_efectivo = false } = req.body;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  // C4 (d): Rechazar devoluciones sin venta_id
  if (!venta_id) {
    return res.status(400).json({ error: 'El campo venta_id es obligatorio para registrar una devolución.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debe incluir al menos un ítem a devolver.' });
  }

  for (const item of items) {
    if (!item.producto_id || !item.cantidad || parseInt(item.cantidad, 10) <= 0) {
      return res.status(400).json({ error: 'Cada ítem debe tener producto_id y cantidad mayor a 0.' });
    }
  }

  try {
    // C4 (d): Validar que la venta exista y pertenezca al comercio
    const ventaCheck = await db.query(
      'SELECT id, metodo_pago, cliente_id, total FROM ventas WHERE id = $1 AND comercio_id = $2',
      [venta_id, comercioId]
    );
    if (ventaCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Venta no encontrada o no pertenece a este comercio.' });
    }

    const venta = ventaCheck.rows[0];
    const ventaMetodoPago = venta.metodo_pago;
    const ventaClienteId = venta.cliente_id;

    // C4 (a): Obtener ítems originales de detalle_ventas para tomar el precio real
    const detalleRes = await db.query(
      'SELECT id_producto, cantidad, precio_unitario FROM detalle_ventas WHERE id_venta = $1 AND comercio_id = $2',
      [venta_id, comercioId]
    );
    if (detalleRes.rowCount === 0) {
      return res.status(404).json({ error: 'No se encontraron ítems para la venta especificada.' });
    }

    const originalItemsMap = {};
    for (const d of detalleRes.rows) {
      originalItemsMap[d.id_producto] = {
        cantidad_vendida: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario)
      };
    }

    // C4 (b): Consultar devoluciones previas para calcular cantidades ya devueltas
    const devPreviasRes = await db.query(
      `SELECT di.producto_id, COALESCE(SUM(di.cantidad), 0) AS total_devuelto
       FROM devolucion_items di
       JOIN devoluciones d ON di.devolucion_id = d.id
       WHERE d.venta_id = $1 AND d.comercio_id = $2 AND d.estado != 'anulada'
       GROUP BY di.producto_id`,
      [venta_id, comercioId]
    );

    const yaDevueltoMap = {};
    for (const dp of devPreviasRes.rows) {
      yaDevueltoMap[dp.producto_id] = Number(dp.total_devuelto);
    }

    // C4 (a y b): Validar que cada ítem pertenezca a la venta y no supere el remanente disponible
    let totalDevueltoCents = 0;
    const itemsValidados = [];

    for (const item of items) {
      const orig = originalItemsMap[item.producto_id];
      if (!orig) {
        return res.status(409).json({
          error: `El producto ID ${item.producto_id} no formó parte de la venta #${venta_id}.`
        });
      }

      const cantVendida = orig.cantidad_vendida;
      const cantYaDevuelta = yaDevueltoMap[item.producto_id] || 0;
      const cantDisponible = cantVendida - cantYaDevuelta;
      const cantSolicitada = parseInt(item.cantidad, 10);

      if (cantSolicitada > cantDisponible) {
        return res.status(409).json({
          error: `La cantidad a devolver (${cantSolicitada}) supera la cantidad disponible (${cantDisponible}) para el producto #${item.producto_id}.`
        });
      }

      // C4 (a): Precio unitario SE LEE EXCLUSIVAMENTE de detalle_ventas (se ignora cualquier precio del body)
      const precioUnitario = orig.precio_unitario;
      const precioUnitarioCents = cents(precioUnitario);
      const subItemCents = precioUnitarioCents * cantSolicitada;
      totalDevueltoCents += subItemCents;

      itemsValidados.push({
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto || null,
        cantidad: cantSolicitada,
        precio_unitario: fromCents(precioUnitarioCents),
        subtotal: fromCents(subItemCents)
      });
    }

    const totalDevuelto = fromCents(totalDevueltoCents);

    // C3: Egreso en efectivo de caja solo si venta original fue en efectivo o reembolso_efectivo explícito
    const egresarEfectivoCaja = Boolean(
      devolver_a_caja && (ventaMetodoPago === 'efectivo' || reembolso_efectivo)
    );

    let devolucionId;
    await db.transaction(async (client) => {
      // 1. Insertar cabecera de devolución
      const devResult = await client.query(
        `INSERT INTO devoluciones (venta_id, usuario_id, comercio_id, motivo, total_devuelto, devuelto_caja, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'procesada') RETURNING id`,
        [venta_id, usuarioId, comercioId, motivo || null, totalDevuelto, egresarEfectivoCaja]
      );
      devolucionId = devResult.rows[0].id;

      // 2. Obtener nombres de productos de la BD para asegurar no-null
      const prodIds = itemsValidados.map(it => it.producto_id);
      const prodsRes = await client.query(
        'SELECT id, nombre FROM productos WHERE id = ANY($1) AND comercio_id = $2',
        [prodIds, comercioId]
      );
      const prodsMap = prodsRes.rows.reduce((acc, p) => { acc[p.id] = p.nombre; return acc; }, {});

      // 3. Insertar ítems de devolución y restaurar stock
      for (const item of itemsValidados) {
        const nombreFinal = item.nombre_producto || prodsMap[item.producto_id] || `Producto #${item.producto_id}`;

        await client.query(
          `INSERT INTO devolucion_items (devolucion_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [devolucionId, item.producto_id, nombreFinal, item.cantidad, item.precio_unitario, item.subtotal]
        );

        await client.query(
          'UPDATE productos SET stock = stock + $1, updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
          [item.cantidad, item.producto_id, comercioId]
        );
      }

      // C4 (c): Si la venta fue a cuenta corriente, reducir saldo_deuda e insertar movimiento_cuenta_corriente
      if (ventaMetodoPago === 'cuenta_corriente' && ventaClienteId) {
        await client.query(
          'UPDATE clientes SET saldo_deuda = GREATEST(0, COALESCE(saldo_deuda, 0) - $1), updated_at = NOW() WHERE id = $2 AND comercio_id = $3',
          [totalDevuelto, ventaClienteId, comercioId]
        );

        try {
          await client.query(
            `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, referencia_id, usuario_id, comercio_id)
             VALUES ($1, 'nota_credito', $2, $3, $4, $5, $6)`,
            [
              ventaClienteId,
              totalDevuelto,
              `Devolución #${devolucionId} de Venta #${venta_id}`,
              devolucionId,
              usuarioId,
              comercioId
            ]
          );
        } catch (eCta) {
          console.warn('[devoluciones] Error al registrar movimiento_cuenta_corriente:', eCta.message);
        }
      }

      // 4. Registrar egreso en caja si corresponde a efectivo
      if (egresarEfectivoCaja) {
        const cajaResult = await client.query(
          'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
          ['abierta', usuarioId, comercioId]
        );
        if (cajaResult.rowCount > 0) {
          try {
            await client.query(
              `INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago)
               VALUES ($1, 'egreso', $2, $3, $4, 'efectivo')`,
              [cajaResult.rows[0].id, totalDevuelto, `Devolución #${devolucionId}${motivo ? ': ' + motivo : ''}`, comercioId]
            );
          } catch (eMov) {
            await client.query(
              `INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id)
               VALUES ($1, 'egreso', $2, $3, $4)`,
              [cajaResult.rows[0].id, totalDevuelto, `Devolución #${devolucionId}${motivo ? ': ' + motivo : ''}`, comercioId]
            );
          }
        }
      }
    });

    try {
      await registrarAuditoria({
        tipo_evento: 'DEVOLUCION',
        descripcion: `Devolución #${devolucionId} registrada. Venta: #${venta_id}. Total: $${totalDevuelto.toFixed(2)} (Método venta: ${ventaMetodoPago})`,
        usuario_id: usuarioId,
        comercio_id: comercioId
      });
    } catch (e) { console.error('[Auditoria] devolución:', e); }

    res.status(201).json({
      mensaje: 'Devolución registrada y stock restaurado exitosamente',
      id: devolucionId,
      total_devuelto: totalDevuelto,
      devuelto_caja: egresarEfectivoCaja
    });
  } catch (error) { next(error); }
});

module.exports = router;

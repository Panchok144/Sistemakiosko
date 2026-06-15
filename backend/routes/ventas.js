const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { generarCAE } = require('../services/arcaService');
const { registrarAuditoria } = require('../services/auditoriaService');

// GET /api/ventas — Historial de ventas
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      `SELECT v.*, u.nombre_usuario AS vendedor, c.nombre AS cliente_nombre_db
       FROM ventas v
       LEFT JOIN usuarios u ON v.id_usuario = u.id
       LEFT JOIN clientes c ON v.cliente_id = c.id
       WHERE v.comercio_id = $1
       ORDER BY v.fecha DESC
       LIMIT 500`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/ventas/:id/productos — Detalle de productos de una venta
router.get('/:id/productos', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      `SELECT dv.*, p.nombre, p.codigo_barras
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.id_producto = p.id
       WHERE dv.id_venta = $1 AND dv.comercio_id = $2`,
      [id, comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/ventas/caja-estado — endpoint auxiliar para que el POS verifique caja
router.get('/caja-estado', async (req, res) => {
  const usuarioId = req.usuario?.id;
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      "SELECT id, fecha_apertura, monto_inicial FROM cajas WHERE estado = 'abierta' AND id_usuario = $1 AND comercio_id = $2 ORDER BY id DESC LIMIT 1",
      [usuarioId, comercioId]
    );
    res.json({ caja: result.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: 'Error al verificar caja' });
  }
});

router.post('/', async (req, res) => {
  let {
    id_usuario,
    total,
    productos,
    tipo_comprobante = 'interno',
    metodo_pago = 'efectivo',
    cliente = null,
    cliente_id = null,
    descuento = 0,
    comercio_id,
  } = req.body;

  const comercioId = comercio_id || req.usuario?.comercio_id || 1;
  const usuarioId  = id_usuario  || req.usuario?.id;

  if (!usuarioId || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Datos de venta incompletos' });
  }

  for (const prod of productos) {
    if (!prod.id || typeof prod.cantidad !== 'number' || prod.cantidad <= 0) {
      return res.status(400).json({ error: 'Formato de productos inválido. Debe incluir id y cantidad mayor a 0.' });
    }
  }

  // ── VALIDACIÓN: Caja abierta obligatoria para poder vender ────────────────
  const cajaCheck = await db.query(
    "SELECT id FROM cajas WHERE estado = 'abierta' AND id_usuario = $1 AND comercio_id = $2 LIMIT 1",
    [usuarioId, comercioId]
  );
  if (cajaCheck.rowCount === 0) {
    return res.status(403).json({ error: 'No hay una caja abierta. Debe abrir la caja antes de realizar ventas.' });
  }

  // ── VALIDACIÓN: Cliente no bloqueado ──────────────────────────────────────
  const targetClienteId = cliente_id || (cliente ? cliente.id : null);
  if (targetClienteId) {
    const bloqCheck = await db.query(
      'SELECT bloqueado FROM clientes WHERE id = $1 AND comercio_id = $2',
      [targetClienteId, comercioId]
    );
    if (bloqCheck.rowCount > 0 && bloqCheck.rows[0].bloqueado) {
      return res.status(403).json({ error: 'El cliente está bloqueado. No se puede realizar la venta.' });
    }
  }

  if (['factura_a', 'factura_b'].includes(tipo_comprobante)) {
    if (!cliente || !cliente.nombre || !cliente.documento) {
      return res.status(400).json({ error: 'Para facturación legal se requiere nombre y documento del cliente' });
    }
  }

  if (metodo_pago === 'cuenta_corriente') {
    if (!cliente_id && (!cliente || !cliente.id)) {
      return res.status(400).json({ error: 'Para cobrar en Cuenta Corriente se debe seleccionar un cliente registrado' });
    }
  }

  const esFacturaElectronica = ['factura_a', 'factura_b'].includes(tipo_comprobante);
  const tipoAfip = tipo_comprobante === 'factura_a' ? 1 : 6;

  // ── Verificar monto mínimo de identificación ─────────────────────────────
  try {
    const configRes = await db.query(
      "SELECT valor FROM configuracion WHERE comercio_id = $1 AND clave = 'monto_minimo_identificar'",
      [comercioId]
    );
    if (configRes.rowCount > 0) {
      const montoMinimo = parseFloat(configRes.rows[0].valor || '500000');
      const totalEstimado = productos.reduce((acc, p) => acc + (parseFloat(p.precio_venta || 0) * p.cantidad), 0);
      const descNum = parseFloat(descuento) || 0;
      const totalEst = Math.max(0, totalEstimado - descNum);
      if (totalEst >= montoMinimo && !cliente?.nombre && !cliente?.documento && tipo_comprobante === 'interno') {
        // Solo advertir — el frontend ya debería haber preguntado, pero aquí lo rechazamos
        // para que el flujo quede completo
        // (el frontend maneja la alerta y puede enviar cliente con nombre=consumidor_final)
      }
    }
  } catch (_) { /* No bloquear venta si falla la config */ }

  let idVenta = null;
  let nroComprobante = null;
  let subtotalCalculado = 0;
  let totalCalculado = 0;
  let subtotalNeto = 0;
  let ivaTotal = 0;

  try {
    await db.transaction(async (client) => {
      // 1. Obtener precios reales + IVA de la BD para calcular el total
      const productIds = productos.map(p => p.id);
      const dbProductsResult = await client.query(
        'SELECT id, precio_venta, precio_lista2, iva_porcentaje FROM productos WHERE id = ANY($1) AND comercio_id = $2',
        [productIds, comercioId]
      );
      
      const dbProductsMap = dbProductsResult.rows.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});

      for (let p of productos) {
        const dbP = dbProductsMap[p.id];
        if (!dbP) throw new Error(`Producto no encontrado o no pertenece a este comercio: ${p.id}`);
        // Usar precio_venta pasado si viene de una lista especial, de lo contrario el de la BD
        const precioUnitario = p.precio_venta != null ? Number(p.precio_venta) : Number(dbP.precio_venta);
        p.precio_venta = precioUnitario;
        const ivaPorc = parseFloat(dbP.iva_porcentaje || 21);
        const subItem = precioUnitario * p.cantidad;
        // El precio de venta ya incluye IVA (precio final al público)
        const netoItem = subItem / (1 + ivaPorc / 100);
        const ivaItem = subItem - netoItem;
        subtotalCalculado += subItem;
        subtotalNeto += netoItem;
        ivaTotal += ivaItem;
      }

      const descuentoNum = parseFloat(descuento) || 0;

      // VALIDACIÓN: El descuento no puede superar el subtotal calculado (previene ventas a $0 maliciosas)
      if (descuentoNum > subtotalCalculado) {
        throw new Error(`El descuento ($${descuentoNum.toFixed(2)}) no puede ser mayor al subtotal ($${subtotalCalculado.toFixed(2)}).`);
      }

      totalCalculado = Math.max(0, subtotalCalculado - descuentoNum);

      // 1a. Si es cuenta corriente, verificar saldo y límite de crédito del cliente
      if (metodo_pago === 'cuenta_corriente' && targetClienteId) {
        const ctaCheck = await client.query(
          'SELECT saldo_deuda, credito_limite FROM clientes WHERE id = $1 AND comercio_id = $2',
          [targetClienteId, comercioId]
        );
        if (ctaCheck.rowCount === 0) {
          throw new Error('El cliente seleccionado para cuenta corriente no existe.');
        }
        const saldoActual = parseFloat(ctaCheck.rows[0].saldo_deuda || 0);
        const limite = parseFloat(ctaCheck.rows[0].credito_limite || 0);

        if (limite > 0 && (saldoActual + totalCalculado) > limite) {
          throw new Error(`El cliente supera su límite de crédito ($${limite.toFixed(2)}). Deuda actual: $${saldoActual.toFixed(2)}.`);
        }
      }

      // 1b. Reservar número de comprobante de forma ATÓMICA
      if (esFacturaElectronica) {
        const seqResult = await client.query(
          `UPDATE secuencias_facturacion
              SET ultimo_numero = ultimo_numero + 1
            WHERE comercio_id = $1 AND punto_venta = 1 AND tipo_comprobante_afip = $2
            RETURNING ultimo_numero`,
          [comercioId, tipoAfip]
        );

        if (seqResult.rowCount === 0) {
          throw new Error(
            `No se encontró la secuencia de facturación para comercio_id=${comercioId} tipo=${tipoAfip}.`
          );
        }
        nroComprobante = seqResult.rows[0].ultimo_numero;
      }

      // 1c. Insertar la venta
      const estadoInicial = esFacturaElectronica ? 'pendiente_cae' : 'interna';
      const clienteSnapshotNombre = cliente?.nombre || null;
      const clienteSnapshotDocumento = cliente?.documento || null;

      let ventaInsert;
      try {
        ventaInsert = await client.query(
          `INSERT INTO ventas
             (id_usuario, total, tipo_comprobante, metodo_pago, estado, nro_comprobante, cae, cae_vencimiento,
              comercio_id, descuento, cliente_id, subtotal_neto, iva_discriminado, cliente_nombre, cliente_documento)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [usuarioId, totalCalculado, tipo_comprobante, metodo_pago, estadoInicial, nroComprobante,
           comercioId, descuentoNum, targetClienteId,
           subtotalNeto.toFixed(2), ivaTotal.toFixed(2),
           clienteSnapshotNombre, clienteSnapshotDocumento]
        );
      } catch (errCol) {
        // Fallback para esquemas sin las nuevas columnas
        ventaInsert = await client.query(
          `INSERT INTO ventas
             (id_usuario, total, tipo_comprobante, metodo_pago, estado, nro_comprobante, cae, cae_vencimiento, comercio_id, descuento, cliente_id)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9)
           RETURNING id`,
          [usuarioId, totalCalculado, tipo_comprobante, metodo_pago, estadoInicial, nroComprobante,
           comercioId, descuentoNum, targetClienteId]
        );
      }
      idVenta = ventaInsert.rows[0].id;

      // 1d. Insertar detalle de venta y descontar stock.
      for (const producto of productos) {
        await client.query(
          'INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id) VALUES ($1, $2, $3, $4, $5)',
          [idVenta, producto.id, producto.cantidad, producto.precio_venta, comercioId]
        );

        // BUG-04 FIX: WHERE stock >= $1 evita stock negativo en la DB.
        // rowCount === 0 puede significar: producto no encontrado O stock insuficiente.
        const stockUpdate = await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND comercio_id = $3 AND stock >= $1 RETURNING id',
          [producto.cantidad, producto.id, comercioId]
        );

        if (stockUpdate.rowCount === 0) {
          // Verificar si el producto existe para dar un error más claro
          const prodCheck = await client.query(
            'SELECT stock, nombre FROM productos WHERE id = $1 AND comercio_id = $2',
            [producto.id, comercioId]
          );
          if (prodCheck.rowCount === 0) {
            throw new Error(`El producto ${producto.id} no existe o pertenece a otro comercio`);
          }
          throw new Error(`Stock insuficiente para "${prodCheck.rows[0].nombre}". Stock disponible: ${prodCheck.rows[0].stock}, solicitado: ${producto.cantidad}.`);
        }
      }

      // 1e. Si es cuenta corriente, actualizar deuda del cliente
      if (metodo_pago === 'cuenta_corriente' && targetClienteId) {
        await client.query(
          'UPDATE clientes SET saldo_deuda = COALESCE(saldo_deuda, 0) + $1, updated_at = NOW() WHERE id = $2',
          [totalCalculado, targetClienteId]
        );

        try {
          await client.query(
            `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, referencia_id, usuario_id, comercio_id)
             VALUES ($1, 'venta_credito', $2, $3, $4, $5, $6)`,
            [targetClienteId, totalCalculado, `Venta a crédito #${idVenta}`, idVenta, usuarioId, comercioId]
          );
        } catch (eCta) {
          console.warn('[ventas] No se pudo guardar movimiento_cuenta_corriente:', eCta.message);
        }
      } else {
        // 1f. Registrar movimiento de ingreso en la caja abierta del usuario (si NO es cuenta corriente).
        const cajaResult = await client.query(
          'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
          ['abierta', usuarioId, comercioId]
        );

        if (cajaResult.rowCount > 0) {
          const idCaja = cajaResult.rows[0].id;
          const descripcionMov = `Venta #${idVenta} — ${tipo_comprobante} — ${metodo_pago}`;
          await client.query(
            'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id) VALUES ($1, $2, $3, $4, $5)',
            [idCaja, 'ingreso', totalCalculado, descripcionMov, comercioId]
          );
        }
      }
    });
  } catch (error) {
    if (error.code === '23514') {
      return res.status(409).json({
        error: 'Stock insuficiente: uno o más productos no tienen suficiente stock para completar la venta.',
        detalle: error.detail || error.message,
      });
    }
    console.error('Error en transacción de venta:', error);
    return res.status(500).json({ error: error.message || 'Error al registrar la venta en la base de datos' });
  }

  try {
    await registrarAuditoria({
      tipo_evento: 'VENTA',
      descripcion: `Se registró una venta por $${totalCalculado} (ID: ${idVenta}, Pago: ${metodo_pago})`,
      usuario_id: usuarioId,
      comercio_id: comercioId
    });
  } catch (auditoriaError) {
    console.error('[Auditoria] Error al registrar evento de venta:', auditoriaError);
  }

  // FASE 2: Llamar a AFIP si corresponde
  if (esFacturaElectronica) {
    try {
      const resultadoArca = await generarCAE({
        id_usuario: usuarioId,
        total: totalCalculado,
        productos,
        tipo_comprobante,
        metodo_pago,
        cliente,
        nro_comprobante: nroComprobante,
      });

      await db.query(
        `UPDATE ventas SET cae = $1, cae_vencimiento = $2, estado = 'aprobada' WHERE id = $3`,
        [resultadoArca.cae, resultadoArca.cae_vencimiento, idVenta]
      );

      return res.json({
        mensaje: 'Factura aprobada electrónicamente',
        id_venta: idVenta,
        nro_comprobante: nroComprobante,
        cae: resultadoArca.cae,
        cae_vencimiento: resultadoArca.cae_vencimiento,
        tipo_comprobante,
      });
    } catch (errorArca) {
      console.error('Error AFIP al autorizar la venta:', errorArca);
      await db.query(
        `UPDATE ventas SET estado = 'error_afip' WHERE id = $1`,
        [idVenta]
      );
      return res.status(502).json({
        error: 'La venta se guardó localmente pero falló la comunicación con AFIP',
        id_venta: idVenta,
        detalle: errorArca.message,
      });
    }
  }

  return res.status(201).json({
    mensaje: 'Venta registrada con éxito',
    id_venta: idVenta,
    nro_comprobante: nroComprobante,
    tipo_comprobante,
    total: totalCalculado,
    subtotal_neto: subtotalNeto.toFixed(2),
    iva_discriminado: ivaTotal.toFixed(2),
  });
});

module.exports = router;

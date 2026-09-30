const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { generarCAE, procesarVentaCAE } = require('../services/arcaService');
const { registrarAuditoria } = require('../services/auditoriaService');
const { cents, fromCents, sumCents, round2, descomponerIva } = require('../utils/money');

// A5: Métodos de pago permitidos en el sistema
const METODOS_PERMITIDOS = [
  'efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
  'transferencia', 'qr', 'cuenta_corriente', 'otro'
];

// GET /api/ventas — Historial de ventas
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

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
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

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
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

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

// POST /api/ventas — Registrar venta (C1, C2, C3, C5, C6, A3, A4, A5)
const registrarVentaHandler = async (req, res) => {
  let {
    productos,
    tipo_comprobante = 'interno',
    metodo_pago = 'efectivo',
    pagos = null, // A4: Lista de pagos divididos / mixtos [{ metodo, monto }]
    cliente = null,
    cliente_id = null,
    descuento = 0,
    id_lista_precios = null,
    pin_supervisor = null,
    autorizacion_supervisor = null,
  } = req.body;

  const comercioId = req.usuario?.comercio_id;
  const usuarioId  = req.usuario?.id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'Usuario no autenticado o sin comercio asignado' });
  }

  // A3: Idempotencia en POST /ventas (evitar doble cobro por doble click o reintento de red)
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotency_key;
  if (idempotencyKey) {
    // Limpieza de claves mayores a 24hs en background
    db.query("DELETE FROM ventas_idempotencia WHERE created_at < NOW() - INTERVAL '24 hours'").catch(() => {});

    try {
      const idempRes = await db.query(
        'SELECT id_venta, response_body FROM ventas_idempotencia WHERE clave = $1 AND comercio_id = $2',
        [idempotencyKey, comercioId]
      );
      if (idempRes.rowCount > 0) {
        const cached = idempRes.rows[0].response_body || {};
        return res.status(200).json({
          ...cached,
          idempotente: true,
          mensaje: 'Venta previamente registrada (respuesta idempotente)',
        });
      }
    } catch (eIdempCheck) {
      console.warn('[ventas] Error consultando clave de idempotencia:', eIdempCheck.message);
    }
  }

  if (!Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Datos de venta incompletos: lista de productos requerida' });
  }

  // A4 + A5: Validación de desglose de pagos o método de pago simple
  let listaPagos = [];
  if (Array.isArray(pagos) && pagos.length > 0) {
    for (const p of pagos) {
      if (!p.metodo || !METODOS_PERMITIDOS.includes(p.metodo)) {
        return res.status(400).json({
          error: `Método de pago no reconocido: "${p.metodo}". Métodos permitidos: ${METODOS_PERMITIDOS.join(', ')}`
        });
      }
      const m = parseFloat(p.monto);
      if (Number.isNaN(m) || m <= 0) {
        return res.status(400).json({ error: 'Cada pago en el desglose debe tener un monto numérico mayor a cero' });
      }
      listaPagos.push({ metodo: p.metodo, monto: round2(m), monto_cents: cents(m) });
    }
  } else {
    // A5: Validar método de pago único contra enum permitido
    if (!METODOS_PERMITIDOS.includes(metodo_pago)) {
      return res.status(400).json({
        error: `Método de pago no reconocido: "${metodo_pago}". Métodos permitidos: ${METODOS_PERMITIDOS.join(', ')}`
      });
    }
  }

  // C1: Validación estricta — rechazar precio_venta impuesto por cliente
  for (const prod of productos) {
    if (!prod.id || typeof prod.cantidad !== 'number' || prod.cantidad <= 0) {
      return res.status(400).json({ error: 'Formato de productos inválido. Debe incluir id y cantidad mayor a 0.' });
    }
    if (prod.precio_venta !== undefined || prod.precio !== undefined || prod.precio_unitario !== undefined) {
      return res.status(400).json({
        error: 'No se permite especificar precio_venta en los ítems; el precio se determina exclusivamente en el servidor.'
      });
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

  const esFacturaElectronica = ['factura_a', 'factura_b'].includes(tipo_comprobante);
  const tipoAfip = tipo_comprobante === 'factura_a' ? 1 : 6;

  // C6 (a): Validar bandera de facturación electrónica en configuración del comercio
  if (esFacturaElectronica) {
    const configFE = await db.query(
      "SELECT valor FROM configuracion WHERE comercio_id = $1 AND clave = 'factura_electronica_habilitada'",
      [comercioId]
    );
    const feHabilitada = configFE.rowCount > 0 && configFE.rows[0].valor === 'true';
    if (!feHabilitada) {
      return res.status(400).json({
        error: 'La facturación electrónica no está habilitada para este comercio. Configure las credenciales de ARCA/AFIP primero.'
      });
    }

    const cliNom = (cliente && cliente.nombre) || req.body.cliente_nombre;
    const cliDoc = (cliente && cliente.documento) || req.body.cliente_documento;
    if (!cliNom || !cliDoc) {
      return res.status(400).json({ error: 'Para facturación legal se requiere nombre y documento del cliente' });
    }
  }

  const tieneCuentaCorriente = listaPagos.length > 0
    ? listaPagos.some(p => p.metodo === 'cuenta_corriente')
    : metodo_pago === 'cuenta_corriente';

  if (tieneCuentaCorriente) {
    if (!cliente_id && (!cliente || !cliente.id)) {
      return res.status(400).json({ error: 'Para cobrar en Cuenta Corriente se debe seleccionar un cliente registrado' });
    }
  }

  let idVenta = null;
  let nroComprobante = null;
  let subtotalCalculado = 0;
  let totalCalculado = 0;
  let subtotalNeto = 0;
  let ivaTotal = 0;
  const estadoInicial = esFacturaElectronica ? 'pendiente_cae' : 'interna';

  try {
    await db.transaction(async (client) => {
      // 1. Obtener datos de productos de BD (precio_venta, IVA, stock) bloqueando filas para evitar condiciones de carrera
      const productIds = productos.map(p => p.id);
      const dbProductsResult = await client.query(
        'SELECT id, nombre, precio_venta, precio_lista2, iva_porcentaje, stock, costo FROM productos WHERE id = ANY($1) AND comercio_id = $2 FOR UPDATE',
        [productIds, comercioId]
      );
      
      const dbProductsMap = dbProductsResult.rows.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});

      // M1: también obtener costo actual de cada producto para congelarlo en detalle_ventas
      // (el SELECT ya incluye los campos necesarios — costo se suma aquí)
      const costoMap = {}; // id_producto -> costo en número

      // Validar existencia de productos y stock suficiente antes de calcular o insertar comprobantes
      for (const p of productos) {
        const dbP = dbProductsMap[p.id];
        if (!dbP) {
          const notFoundErr = new Error(`Producto no encontrado o no pertenece a este comercio: ${p.id}`);
          notFoundErr.statusCode = 404;
          throw notFoundErr;
        }
        if (Number(dbP.stock || 0) < p.cantidad) {
          const stockErr = new Error(`Stock insuficiente para "${dbP.nombre}". Stock disponible: ${dbP.stock}, solicitado: ${p.cantidad}.`);
          stockErr.statusCode = 409;
          throw stockErr;
        }
        // M1: registrar costo actual del producto (se congelará en detalle_ventas)
        costoMap[p.id] = parseFloat(dbP.costo || 0);
      }

      // 1b. Si se especifica lista de precios, validarla
      const listaIds = [...new Set(productos.map(p => p.id_lista_precios || id_lista_precios).filter(Boolean))];
      const listasMap = {};
      if (listaIds.length > 0) {
        const listasRes = await client.query(
          'SELECT id, porcentaje_ajuste, activa FROM listas_precios WHERE id = ANY($1) AND comercio_id = $2',
          [listaIds, comercioId]
        );
        for (const row of listasRes.rows) {
          if (!row.activa) {
            throw new Error(`La lista de precios #${row.id} no está activa.`);
          }
          listasMap[row.id] = row;
        }
        for (const lid of listaIds) {
          if (!listasMap[lid]) {
            throw new Error(`Lista de precios #${lid} no encontrada o pertenece a otro comercio.`);
          }
        }
      }

      // Precios especiales de listas
      let specialPricesMap = {};
      if (listaIds.length > 0) {
        const spRes = await client.query(
          'SELECT producto_id, lista_precios_id, precio_especial FROM productos_listas_precios WHERE lista_precios_id = ANY($1) AND producto_id = ANY($2)',
          [listaIds, productIds]
        );
        for (const sp of spRes.rows) {
          specialPricesMap[`${sp.lista_precios_id}_${sp.producto_id}`] = sp.precio_especial;
        }
      }

      let subtotalCalculadoCents = 0;
      let subtotalNetoCents = 0;
      let ivaTotalCents = 0;

      for (let p of productos) {
        const dbP = dbProductsMap[p.id];
        if (!dbP) throw new Error(`Producto no encontrado o no pertenece a este comercio: ${p.id}`);

        const targetListaId = p.id_lista_precios || id_lista_precios;
        let itemUnitCents = 0;

        if (targetListaId) {
          const lista = listasMap[targetListaId];
          const spKey = `${targetListaId}_${p.id}`;
          if (specialPricesMap[spKey] != null) {
            itemUnitCents = cents(specialPricesMap[spKey]);
          } else {
            const baseCents = cents(dbP.precio_venta);
            const factor = 1 + Number(lista.porcentaje_ajuste || 0) / 100;
            itemUnitCents = Math.round(baseCents * factor);
          }
        } else {
          itemUnitCents = cents(dbP.precio_venta);
        }

        const ivaPorc = parseFloat(dbP.iva_porcentaje || 21);
        const subItemCents = itemUnitCents * p.cantidad;
        const { neto: netoItemCents, iva: ivaItemCents } = descomponerIva(subItemCents, ivaPorc);

        subtotalCalculadoCents += subItemCents;
        subtotalNetoCents += netoItemCents;
        ivaTotalCents += ivaItemCents;

        p.precio_unitario_cents = itemUnitCents;
        p.precio_unitario = fromCents(itemUnitCents);
      }

      const descuentoCents = cents(descuento);
      if (descuentoCents > subtotalCalculadoCents) {
        throw new Error(`El descuento ($${fromCents(descuentoCents).toFixed(2)}) no puede ser mayor al subtotal ($${fromCents(subtotalCalculadoCents).toFixed(2)}).`);
      }

      // C5: Validar límite de descuento según el rol del usuario
      if (descuentoCents > 0) {
        const userRole = (req.usuario?.rol || 'empleado').toLowerCase();
        let maxPermitido = 10;

        const rolConfigRes = await client.query(
          'SELECT descuento_maximo_porc FROM roles_descuento_config WHERE comercio_id = $1 AND rol = $2',
          [comercioId, userRole]
        );

        if (rolConfigRes.rowCount > 0) {
          maxPermitido = Number(rolConfigRes.rows[0].descuento_maximo_porc);
        } else {
          if (['administrador', 'dueno', 'dueño', 'superadmin', 'owner'].includes(userRole)) {
            maxPermitido = 100;
          } else if (['encargado', 'supervisor'].includes(userRole)) {
            maxPermitido = 25;
          } else {
            maxPermitido = 10;
          }
        }

        const descuentoPorc = subtotalCalculadoCents > 0 ? (descuentoCents / subtotalCalculadoCents) * 100 : 0;

        if (descuentoPorc > maxPermitido) {
          let supervisorAutorizante = null;
          const supPin = pin_supervisor || autorizacion_supervisor;

          if (supPin) {
            const supRes = await client.query(
              `SELECT id, nombre_usuario, rol FROM usuarios
               WHERE comercio_id = $1 AND pin_supervisor = $2 AND rol IN ('administrador', 'dueno', 'superadmin', 'encargado', 'supervisor') LIMIT 1`,
              [comercioId, String(supPin)]
            );
            if (supRes.rowCount > 0) {
              supervisorAutorizante = supRes.rows[0];
            }
          }

          if (!supervisorAutorizante) {
            // Registrar alerta de seguridad (con db.query independiente para persistir tras rollback)
            try {
              await db.query(
                `INSERT INTO alertas_seguridad (comercio_id, usuario_id, tipo, descripcion, detalles)
                 VALUES ($1, $2, 'DESCUENTO_EXCESIVO_NO_AUTORIZADO', $3, $4)`,
                [
                  comercioId,
                  usuarioId,
                  `Intento de descuento de ${descuentoPorc.toFixed(1)}% superando el límite del rol ${userRole} (${maxPermitido}%)`,
                  JSON.stringify({
                    descuento_solicitado: fromCents(descuentoCents),
                    subtotal: fromCents(subtotalCalculadoCents),
                    porcentaje: descuentoPorc
                  })
                ]
              );
            } catch (eAlert) {
              console.warn('Error al guardar alerta_seguridad:', eAlert.message);
            }

            try {
              await registrarAuditoria({
                tipo_evento: 'ALERTA_SEGURIDAD',
                descripcion: `Intento de descuento no autorizado de ${descuentoPorc.toFixed(1)}% (Límite rol ${userRole}: ${maxPermitido}%)`,
                usuario_id: usuarioId,
                comercio_id: comercioId
              });
            } catch (_) {}

            const errDesc = new Error(
              `Descuento no autorizado: el porcentaje solicitado (${descuentoPorc.toFixed(1)}%) supera el máximo permitido para tu rol (${maxPermitido}%). Requiere autorización de supervisor.`
            );
            errDesc.statusCode = 403;
            throw errDesc;
          }

          // Si fue autorizado por supervisor, registrar en auditoría
          try {
            await registrarAuditoria({
              tipo_evento: 'DESCUENTO_AUTORIZADO',
              descripcion: `Descuento de ${descuentoPorc.toFixed(1)}% autorizado por supervisor ${supervisorAutorizante.nombre_usuario} (ID: ${supervisorAutorizante.id})`,
              usuario_id: usuarioId,
              comercio_id: comercioId
            });
          } catch (_) {}
        }
      }

      const totalCalculadoCents = Math.max(0, subtotalCalculadoCents - descuentoCents);
      totalCalculado = fromCents(totalCalculadoCents);
      subtotalCalculado = fromCents(subtotalCalculadoCents);
      subtotalNeto = fromCents(subtotalNetoCents);
      ivaTotal = fromCents(ivaTotalCents);

      // A4: Validar y normalizar pagos divididos o pago único
      if (listaPagos.length > 0) {
        const sumPagosCents = listaPagos.reduce((acc, p) => acc + p.monto_cents, 0);
        if (sumPagosCents !== totalCalculadoCents) {
          const errSum = new Error(
            `La suma de los pagos ($${fromCents(sumPagosCents).toFixed(2)}) no coincide con el total de la venta ($${fromCents(totalCalculadoCents).toFixed(2)}).`
          );
          errSum.statusCode = 409;
          throw errSum;
        }
      } else {
        listaPagos = [{
          metodo: metodo_pago,
          monto: totalCalculado,
          monto_cents: totalCalculadoCents,
        }];
      }

      // 1d. Reservar número de comprobante atómico para FE
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

      // 1e. Insertar la venta (SIEMPRE con estado 'pendiente_cae' para facturas electrónicas)
      const clienteSnapshotNombre = cliente?.nombre || req.body.cliente_nombre || null;
      const clienteSnapshotDocumento = cliente?.documento || req.body.cliente_documento || null;

      let ventaInsert;
      try {
        ventaInsert = await client.query(
          `INSERT INTO ventas
             (id_usuario, total, tipo_comprobante, metodo_pago, estado, nro_comprobante, cae, cae_vencimiento,
              comercio_id, descuento, cliente_id, subtotal_neto, iva_discriminado, cliente_nombre, cliente_documento)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [usuarioId, totalCalculado, tipo_comprobante, listaPagos[0].metodo, estadoInicial, nroComprobante,
           comercioId, fromCents(descuentoCents), targetClienteId,
           subtotalNeto.toFixed(2), ivaTotal.toFixed(2),
           clienteSnapshotNombre, clienteSnapshotDocumento]
        );
      } catch (errCol) {
        ventaInsert = await client.query(
          `INSERT INTO ventas
             (id_usuario, total, tipo_comprobante, metodo_pago, estado, nro_comprobante, cae, cae_vencimiento, comercio_id, descuento, cliente_id)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7, $8, $9)
           RETURNING id`,
          [usuarioId, totalCalculado, tipo_comprobante, listaPagos[0].metodo, estadoInicial, nroComprobante,
           comercioId, fromCents(descuentoCents), targetClienteId]
        );
      }

      idVenta = ventaInsert.rows[0].id;

      // A4: Guardar desglose de pagos en ventas_pagos
      for (const p of listaPagos) {
        await client.query(
          `INSERT INTO ventas_pagos (venta_id, comercio_id, metodo, monto_cents, monto)
           VALUES ($1, $2, $3, $4, $5)`,
          [idVenta, comercioId, p.metodo, p.monto_cents, p.monto]
        );
      }

      // 1f. Insertar detalle de venta y descontar stock
      for (const producto of productos) {
        // M1: usar costo congelado al momento de la venta
        const costoUnitario = costoMap[producto.id] ?? null;
        try {
          await client.query(
            'INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id, costo_unitario) VALUES ($1, $2, $3, $4, $5, $6)',
            [idVenta, producto.id, producto.cantidad, producto.precio_unitario, comercioId, costoUnitario]
          );
        } catch (_colErr) {
          // Fallback: si costo_unitario no existe (schema viejo sin 019/020)
          await client.query(
            'INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id) VALUES ($1, $2, $3, $4, $5)',
            [idVenta, producto.id, producto.cantidad, producto.precio_unitario, comercioId]
          );
        }

        const stockUpdate = await client.query(
          'UPDATE productos SET stock = stock - $1 WHERE id = $2 AND comercio_id = $3 AND stock >= $1 RETURNING id',
          [producto.cantidad, producto.id, comercioId]
        );

        if (stockUpdate.rowCount === 0) {
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

      // 1g. Cuenta corriente: si hay parte o todo pagado a cuenta corriente
      const totalCCCents = listaPagos
        .filter(p => p.metodo === 'cuenta_corriente')
        .reduce((acc, p) => acc + p.monto_cents, 0);

      if (totalCCCents > 0) {
        if (!targetClienteId) {
          throw new Error('Para cobrar en Cuenta Corriente se debe seleccionar un cliente registrado.');
        }
        const ctaCheck = await client.query(
          'SELECT saldo_deuda, credito_limite FROM clientes WHERE id = $1 AND comercio_id = $2',
          [targetClienteId, comercioId]
        );
        if (ctaCheck.rowCount === 0) {
          throw new Error('El cliente seleccionado para cuenta corriente no existe.');
        }
        const saldoActualCents = cents(ctaCheck.rows[0].saldo_deuda);
        const limiteCents = cents(ctaCheck.rows[0].credito_limite);

        if (limiteCents > 0 && (saldoActualCents + totalCCCents) > limiteCents) {
          throw new Error(`El cliente supera su límite de crédito ($${fromCents(limiteCents).toFixed(2)}). Deuda actual: $${fromCents(saldoActualCents).toFixed(2)}.`);
        }

        const montoCC = fromCents(totalCCCents);
        await client.query(
          'UPDATE clientes SET saldo_deuda = COALESCE(saldo_deuda, 0) + $1, updated_at = NOW() WHERE id = $2',
          [montoCC, targetClienteId]
        );

        try {
          await client.query(
            `INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, referencia_id, usuario_id, comercio_id)
             VALUES ($1, 'venta_credito', $2, $3, $4, $5, $6)`,
            [targetClienteId, montoCC, `Venta a crédito #${idVenta}`, idVenta, usuarioId, comercioId]
          );
        } catch (eCta) {
          console.warn('[ventas] No se pudo guardar movimiento_cuenta_corriente:', eCta.message);
        }
      }

      // 1h. Efectivo: si hay parte o todo pagado en efectivo, registrar ingreso en caja física (C3)
      const totalEfectivoCents = listaPagos
        .filter(p => p.metodo === 'efectivo')
        .reduce((acc, p) => acc + p.monto_cents, 0);

      if (totalEfectivoCents > 0) {
        const cajaResult = await client.query(
          'SELECT id FROM cajas WHERE estado = $1 AND id_usuario = $2 AND comercio_id = $3 ORDER BY id DESC LIMIT 1',
          ['abierta', usuarioId, comercioId]
        );

        if (cajaResult.rowCount > 0) {
          const idCaja = cajaResult.rows[0].id;
          const montoEfectivo = fromCents(totalEfectivoCents);
          const descripcionMov = `Venta #${idVenta} — ${tipo_comprobante} — efectivo${listaPagos.length > 1 ? ' (pago mixto)' : ''}`;
          try {
            await client.query(
              'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id, metodo_pago) VALUES ($1, $2, $3, $4, $5, $6)',
              [idCaja, 'ingreso', montoEfectivo, descripcionMov, comercioId, 'efectivo']
            );
          } catch (eMov) {
            await client.query(
              'INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, comercio_id) VALUES ($1, $2, $3, $4, $5)',
              [idCaja, 'ingreso', montoEfectivo, descripcionMov, comercioId]
            );
          }
        }
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error.code === '23514') {
      return res.status(409).json({
        error: 'Stock insuficiente: uno o más productos no tienen suficiente stock para completar la venta.',
        detalle: error.detail || error.message,
      });
    }
    console.error('Error en transacción de venta:', error);
    const msg = error.message || 'Error al registrar la venta en la base de datos';
    const isValidationErr = msg.includes('Stock insuficiente') || msg.includes('límite de crédito');
    return res.status(isValidationErr ? 409 : 400).json({ error: msg });
  }

  try {
    await registrarAuditoria({
      tipo_evento: 'VENTA',
      descripcion: `Se registró una venta por $${totalCalculado} (ID: ${idVenta}, Pagos: ${listaPagos.map(p => p.metodo).join('+')}, Comprobante: ${tipo_comprobante})`,
      usuario_id: usuarioId,
      comercio_id: comercioId
    });
  } catch (auditoriaError) {
    console.error('[Auditoria] Error al registrar evento de venta:', auditoriaError);
  }

  // C6 (b): Desacople de AFIP del mostrador:
  if (esFacturaElectronica) {
    setImmediate(() => {
      procesarVentaCAE(idVenta).catch(e => {
        console.error(`[ventas] Error asíncrono obteniendo CAE para venta #${idVenta}:`, e.message);
      });
    });
  }

  const responsePayload = {
    mensaje: esFacturaElectronica
      ? 'Venta registrada y comprobante reservado (procesando CAE en segundo plano)'
      : 'Venta registrada con éxito',
    id_venta: idVenta,
    nro_comprobante: nroComprobante,
    tipo_comprobante,
    estado: estadoInicial,
    total: totalCalculado,
    subtotal_neto: subtotalNeto.toFixed(2),
    iva_discriminado: ivaTotal.toFixed(2),
    pagos: listaPagos.map(p => ({ metodo: p.metodo, monto: p.monto })),
  };

  // A3: Guardar respuesta en ventas_idempotencia si venía Idempotency-Key
  if (idempotencyKey) {
    try {
      await db.query(
        `INSERT INTO ventas_idempotencia (clave, comercio_id, id_venta, response_body)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (clave, comercio_id) DO NOTHING`,
        [idempotencyKey, comercioId, idVenta, JSON.stringify(responsePayload)]
      );
    } catch (eIdemp) {
      console.warn('[ventas] Error al guardar clave de idempotencia:', eIdemp.message);
    }
  }

  return res.status(201).json(responsePayload);
};

router.post('/', registrarVentaHandler);

// POST /api/ventas/sync — Sincronización offline de ventas en cola
router.post('/sync', async (req, res) => {
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'Usuario no autenticado o sin comercio asignado' });
  }

  // REGLA INNEGOCIABLE: Sin caja abierta no se sincronizan ventas encoladas
  const cajaRes = await db.query(
    "SELECT id FROM cajas WHERE estado = 'abierta' AND id_usuario = $1 AND comercio_id = $2 LIMIT 1",
    [usuarioId, comercioId]
  );
  if (cajaRes.rowCount === 0) {
    return res.status(403).json({ error: 'No hay una caja abierta para procesar la sincronización de ventas.' });
  }

  const { ventas } = req.body;
  if (!Array.isArray(ventas) || ventas.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de ventas para sincronizar' });
  }

  const resultados = [];
  let sincronizadas = 0;

  for (const ventaData of ventas) {
    const key = ventaData.idempotency_key || ventaData.idempotencyKey;
    if (!key) {
      resultados.push({ estado: 'error', error: 'Falta idempotency_key en la venta encolada' });
      continue;
    }

    // Verificar si ya fue procesada previamente
    const yaExiste = await db.query(
      'SELECT id_venta, response_body FROM ventas_idempotencia WHERE clave = $1 AND comercio_id = $2',
      [key, comercioId]
    );

    if (yaExiste.rowCount > 0) {
      resultados.push({
        idempotency_key: key,
        id_venta: yaExiste.rows[0].id_venta,
        estado: 'idempotente',
        response_body: yaExiste.rows[0].response_body,
      });
      sincronizadas++;
      continue;
    }

    try {
      const mockReq = {
        headers: { 'idempotency-key': key },
        body: ventaData,
        usuario: req.usuario,
      };
      let capturedStatus = 200;
      let capturedBody = null;
      const mockRes = {
        status: (code) => {
          capturedStatus = code;
          return mockRes;
        },
        json: (data) => {
          capturedBody = data;
          return mockRes;
        },
      };

      await registrarVentaHandler(mockReq, mockRes);

      if (capturedStatus === 200 || capturedStatus === 201) {
        resultados.push({
          idempotency_key: key,
          id_venta: capturedBody?.id_venta,
          estado: 'sincronizada',
          resultado: capturedBody,
        });
        sincronizadas++;
      } else {
        resultados.push({
          idempotency_key: key,
          estado: 'error',
          error: capturedBody?.error || 'Error al procesar la venta',
        });
      }
    } catch (errSync) {
      resultados.push({
        idempotency_key: key,
        estado: 'error',
        error: errSync.message,
      });
    }
  }

  return res.json({
    mensaje: `Sincronización completada. ${sincronizadas} de ${ventas.length} ventas procesadas.`,
    sincronizadas,
    total: ventas.length,
    resultados,
  });
});

// POST /api/ventas/:id/reintentar-cae — Reintentar autorización de CAE (C6 c)
router.post('/:id/reintentar-cae', async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id;
  const usuarioId = req.usuario?.id;

  if (!comercioId || !usuarioId) {
    return res.status(401).json({ error: 'No autorizado: sesión inválida' });
  }

  try {
    const ventaRes = await db.query(
      'SELECT id, estado, tipo_comprobante, nro_comprobante, cae FROM ventas WHERE id = $1 AND comercio_id = $2',
      [id, comercioId]
    );

    if (ventaRes.rowCount === 0) {
      return res.status(404).json({ error: 'Venta no encontrada en este comercio' });
    }

    const venta = ventaRes.rows[0];

    if (venta.estado === 'aprobada') {
      return res.json({
        mensaje: 'La venta ya se encuentra aprobada con CAE',
        estado: 'aprobada',
        cae: venta.cae,
      });
    }

    if (!['pendiente_cae', 'error_afip'].includes(venta.estado)) {
      return res.status(400).json({
        error: `No se puede solicitar CAE para una venta con estado '${venta.estado}'`
      });
    }

    const resultado = await procesarVentaCAE(id);

    return res.json({
      mensaje: resultado.status === 'aprobada'
        ? 'Factura autorizada exitosamente por ARCA'
        : 'Reintento registrado (pendiente de nueva validación)',
      id_venta: Number(id),
      estado: resultado.status,
      cae: resultado.cae || null,
      cae_vencimiento: resultado.cae_vencimiento || null,
      error: resultado.error || null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// ── Helper — parsear fechas de filtro ────────────────────────────────────────
const primerDiaMes = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const hoy = () => new Date().toISOString().slice(0, 10);

// GET /ventas — Reporte de ventas con filtros
router.get('/ventas', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy(), vendedor_id, metodo_pago } = req.query;

  try {
    let query = `
      SELECT
        v.id, v.fecha, v.total, v.descuento, v.tipo_comprobante, v.metodo_pago, v.estado,
        u.nombre_usuario AS vendedor,
        COUNT(dv.id) AS lineas_items,
        COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas
      FROM ventas v
      LEFT JOIN usuarios u ON v.id_usuario = u.id
      LEFT JOIN detalle_ventas dv ON v.id = dv.id_venta
      WHERE v.comercio_id = $1
        AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
        AND v.estado != 'error_afip'
    `;
    const params = [comercioId, desde, hasta];
    let idx = 4;

    if (vendedor_id) { query += ` AND v.id_usuario = $${idx++}`; params.push(vendedor_id); }
    if (metodo_pago) { query += ` AND v.metodo_pago = $${idx++}`; params.push(metodo_pago); }

    query += ' GROUP BY v.id, u.nombre_usuario ORDER BY v.fecha DESC';

    const result = await db.query(query, params);
    const rows = result.rows;

    const ingresos_totales = rows.reduce((acc, v) => acc + parseFloat(v.total || 0), 0);
    const descuentos_totales = rows.reduce((acc, v) => acc + parseFloat(v.descuento || 0), 0);
    const por_metodo_pago = rows.reduce((acc, v) => {
      acc[v.metodo_pago] = (acc[v.metodo_pago] || 0) + parseFloat(v.total || 0);
      return acc;
    }, {});

    res.json({
      summary: {
        total_ventas: rows.length,
        ingresos_totales,
        descuentos_totales,
        ticket_promedio: rows.length > 0 ? ingresos_totales / rows.length : 0,
        por_metodo_pago,
      },
      ventas: rows,
    });
  } catch (error) { next(error); }
});

// GET /vendedores — Ranking de vendedores por período
router.get('/vendedores', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;

  try {
    const result = await db.query(
      `SELECT
         u.id, u.nombre_usuario,
         COUNT(v.id) AS total_ventas,
         COALESCE(SUM(v.total), 0) AS ingresos_totales,
         COALESCE(AVG(v.total), 0) AS ticket_promedio
       FROM usuarios u
       LEFT JOIN ventas v
         ON u.id = v.id_usuario
         AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         AND v.comercio_id = $1
         AND v.estado != 'error_afip'
       WHERE u.comercio_id = $1
       GROUP BY u.id
       ORDER BY ingresos_totales DESC`,
      [comercioId, desde, hasta]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /inventario — Valorización del inventario
router.get('/inventario', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { rubro } = req.query;

  try {
    let query = `
      SELECT
        p.id, p.nombre, p.codigo_barras, p.rubro, p.marca,
        p.stock, p.costo, p.precio_venta,
        ROUND((p.stock * p.costo)::numeric, 2)         AS valor_costo,
        ROUND((p.stock * p.precio_venta)::numeric, 2)  AS valor_venta,
        ROUND((p.precio_venta - p.costo)::numeric, 2)  AS margen_unitario,
        CASE WHEN p.costo > 0
          THEN ROUND(((p.precio_venta - p.costo) / p.costo * 100)::numeric, 2)
          ELSE 0 END AS margen_porcentaje
      FROM productos p
      WHERE p.comercio_id = $1 AND p.stock > 0
    `;
    const params = [comercioId];
    if (rubro) { query += ' AND p.rubro = $2'; params.push(rubro); }
    query += ' ORDER BY valor_costo DESC';

    const result = await db.query(query, params);
    const rows = result.rows;

    const totals = rows.reduce((acc, p) => {
      acc.valor_costo_total  += parseFloat(p.valor_costo || 0);
      acc.valor_venta_total  += parseFloat(p.valor_venta || 0);
      acc.unidades_total     += parseInt(p.stock || 0);
      return acc;
    }, { valor_costo_total: 0, valor_venta_total: 0, unidades_total: 0 });

    res.json({ totals, productos: rows });
  } catch (error) { next(error); }
});

// GET /margenes — Márgenes por producto con ventas del mes
router.get('/margenes', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { rubro } = req.query;

  try {
    let query = `
      SELECT
        p.id, p.nombre, p.rubro, p.marca, p.costo, p.precio_venta,
        ROUND((p.precio_venta - p.costo)::numeric, 2)            AS margen_unitario,
        CASE WHEN p.costo > 0
          THEN ROUND(((p.precio_venta - p.costo) / p.costo * 100)::numeric, 2)
          ELSE 0 END                                              AS margen_porcentaje,
        COALESCE(SUM(dv.cantidad), 0)                            AS unidades_vendidas_mes,
        COALESCE(SUM(dv.cantidad * (dv.precio_unitario - p.costo)), 0) AS ganancia_mes
      FROM productos p
      LEFT JOIN detalle_ventas dv ON p.id = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id
        AND DATE_TRUNC('month', v.fecha) = DATE_TRUNC('month', NOW())
        AND v.estado != 'error_afip'
        AND v.comercio_id = $1
      WHERE p.comercio_id = $1
    `;
    const params = [comercioId];
    if (rubro) { query += ' AND p.rubro = $2'; params.push(rubro); }
    query += ' GROUP BY p.id ORDER BY margen_porcentaje DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /rotacion — Rotación de productos en N días
router.get('/rotacion', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const dias = Math.min(parseInt(req.query.dias || 30), 365);
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  try {
    const result = await db.query(
      `SELECT
         p.id, p.nombre, p.rubro, p.marca, p.stock,
         COALESCE(SUM(dv.cantidad), 0)              AS vendidos_periodo,
         COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS revenue_periodo,
         CASE WHEN p.stock > 0 AND COALESCE(SUM(dv.cantidad), 0) > 0
           THEN ROUND((p.stock::numeric / (SUM(dv.cantidad)::numeric / ${dias})), 1)
           ELSE NULL END AS dias_stock_restante
       FROM productos p
       LEFT JOIN detalle_ventas dv ON p.id = dv.id_producto
       LEFT JOIN ventas v ON dv.id_venta = v.id
         AND v.fecha >= $2
         AND v.estado != 'error_afip'
         AND v.comercio_id = $1
       WHERE p.comercio_id = $1
       GROUP BY p.id
       ORDER BY vendidos_periodo DESC`,
      [comercioId, fechaLimite.toISOString()]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// GET /rubros — Ventas por categoría/rubro
router.get('/rubros', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;

  try {
    const result = await db.query(
      `SELECT
         COALESCE(p.rubro, 'Sin Categoría') AS rubro,
         COUNT(DISTINCT v.id) AS total_ventas,
         COALESCE(SUM(dv.cantidad), 0) AS unidades,
         COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS ingresos
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id
       JOIN ventas v ON dv.id_venta = v.id
       WHERE v.comercio_id = $1
         AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         AND v.estado != 'error_afip'
       GROUP BY COALESCE(p.rubro, 'Sin Categoría')
       ORDER BY ingresos DESC`,
      [comercioId, desde, hasta]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});


// GET /mensual-completo — Todo lo sucedido en el mes para el reporte Excel completo
router.get('/mensual-completo', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;

  try {
    const [
      resVentas,
      resAuditoria,
      resCajas,
      resDevoluciones,
      resOrdenesCompra,
      resVendedores,
    ] = await Promise.all([
      // 1. Ventas del período
      db.query(
        `SELECT v.id, v.fecha, v.total, v.descuento, v.tipo_comprobante, v.metodo_pago, v.estado,
                u.nombre_usuario AS vendedor,
                COUNT(dv.id) AS lineas_items,
                COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas
         FROM ventas v
         LEFT JOIN usuarios u ON v.id_usuario = u.id
         LEFT JOIN detalle_ventas dv ON v.id = dv.id_venta
         WHERE v.comercio_id = $1
           AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
           AND v.estado != 'error_afip'
         GROUP BY v.id, u.nombre_usuario
         ORDER BY v.fecha ASC`,
        [comercioId, desde, hasta]
      ),
      // 2. Auditoría completa (incluye LOGINs)
      db.query(
        `SELECT a.id, a.tipo_evento, a.descripcion, a.fecha, u.nombre_usuario AS usuario
         FROM auditoria a
         LEFT JOIN usuarios u ON a.usuario_id = u.id
         WHERE a.comercio_id = $1
           AND DATE(a.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         ORDER BY a.fecha ASC`,
        [comercioId, desde, hasta]
      ),
      // 3. Cajas del período
      db.query(
        `SELECT c.id, c.monto_inicial, c.monto_final, c.monto_teorico, c.diferencia,
                c.estado, c.fecha_cierre, c.created_at AS fecha_apertura,
                u.nombre_usuario AS usuario
         FROM cajas c
         LEFT JOIN usuarios u ON c.id_usuario = u.id
         WHERE c.comercio_id = $1
           AND DATE(COALESCE(c.fecha_cierre, c.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         ORDER BY c.created_at ASC`,
        [comercioId, desde, hasta]
      ),
      // 4. Devoluciones del período
      db.query(
        `SELECT d.id, d.venta_id, d.motivo, d.total_devuelto, d.devuelto_caja, d.estado, d.fecha,
                u.nombre_usuario AS vendedor
         FROM devoluciones d
         LEFT JOIN usuarios u ON d.usuario_id = u.id
         WHERE d.comercio_id = $1
           AND DATE(d.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         ORDER BY d.fecha ASC`,
        [comercioId, desde, hasta]
      ),
      // 5. Órdenes de compra del período
      db.query(
        `SELECT oc.id, oc.numero, oc.proveedor_nombre, oc.estado, oc.total,
                oc.notas, oc.fecha_esperada, oc.created_at, oc.recibida_at,
                u.nombre_usuario AS creado_por
         FROM ordenes_compra oc
         LEFT JOIN usuarios u ON oc.usuario_id = u.id
         WHERE oc.comercio_id = $1
           AND DATE(oc.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
         ORDER BY oc.created_at ASC`,
        [comercioId, desde, hasta]
      ),
      // 6. Ranking vendedores
      db.query(
        `SELECT u.nombre_usuario,
                COUNT(v.id) AS total_ventas,
                COALESCE(SUM(v.total), 0) AS ingresos_totales,
                COALESCE(AVG(v.total), 0) AS ticket_promedio
         FROM usuarios u
         LEFT JOIN ventas v
           ON u.id = v.id_usuario
           AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
           AND v.comercio_id = $1
           AND v.estado != 'error_afip'
         WHERE u.comercio_id = $1
         GROUP BY u.nombre_usuario
         ORDER BY ingresos_totales DESC`,
        [comercioId, desde, hasta]
      ),
    ]);

    const ventas = resVentas.rows;
    const ingresos_totales = ventas.reduce((a, v) => a + parseFloat(v.total || 0), 0);
    const descuentos_totales = ventas.reduce((a, v) => a + parseFloat(v.descuento || 0), 0);
    const por_metodo_pago = ventas.reduce((acc, v) => {
      acc[v.metodo_pago] = (acc[v.metodo_pago] || 0) + parseFloat(v.total || 0);
      return acc;
    }, {});

    res.json({
      periodo: { desde, hasta },
      summary: {
        total_ventas: ventas.length,
        ingresos_totales,
        descuentos_totales,
        ticket_promedio: ventas.length > 0 ? ingresos_totales / ventas.length : 0,
        por_metodo_pago,
        total_devoluciones: resDevoluciones.rows.length,
        total_ordenes_compra: resOrdenesCompra.rows.length,
      },
      ventas,
      auditoria: resAuditoria.rows,
      cajas: resCajas.rows,
      devoluciones: resDevoluciones.rows,
      ordenes_compra: resOrdenesCompra.rows,
      vendedores: resVendedores.rows,
    });
  } catch (error) { next(error); }
});

// GET /abc — Clasificación ABC de productos por rotación/facturación
router.get('/abc', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const dias = Math.min(parseInt(req.query.dias || 90), 365);
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  try {
    const result = await db.query(
      `WITH ventas_producto AS (
        SELECT
          dv.id_producto,
          COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS facturacion_total,
          COALESCE(SUM(dv.cantidad), 0) AS unidades_total
        FROM detalle_ventas dv
        JOIN ventas v ON dv.id_venta = v.id
        WHERE v.comercio_id = $1
          AND v.fecha >= $2
          AND v.estado != 'error_afip'
        GROUP BY dv.id_producto
      ),
      total_global AS (
        SELECT COALESCE(SUM(facturacion_total), 1) AS total FROM ventas_producto
      ),
      ranking AS (
        SELECT
          p.id, p.nombre, p.rubro, p.marca, p.stock, p.costo, p.precio_venta,
          COALESCE(vp.facturacion_total, 0) AS facturacion_total,
          COALESCE(vp.unidades_total, 0) AS unidades_total,
          ROUND((COALESCE(vp.facturacion_total, 0) / tg.total * 100)::numeric, 2) AS pct_facturacion,
          SUM(ROUND((COALESCE(vp.facturacion_total, 0) / tg.total * 100)::numeric, 2))
            OVER (ORDER BY COALESCE(vp.facturacion_total, 0) DESC) AS pct_acumulado
        FROM productos p
        CROSS JOIN total_global tg
        LEFT JOIN ventas_producto vp ON p.id = vp.id_producto
        WHERE p.comercio_id = $1
      )
      SELECT *,
        CASE
          WHEN pct_acumulado <= 80 THEN 'A'
          WHEN pct_acumulado <= 95 THEN 'B'
          ELSE 'C'
        END AS clasificacion_abc
      FROM ranking
      ORDER BY facturacion_total DESC`,
      [comercioId, fechaLimite.toISOString()]
    );

    const resumen = result.rows.reduce((acc, p) => {
      const cls = p.clasificacion_abc;
      if (!acc[cls]) acc[cls] = { cantidad: 0, facturacion: 0 };
      acc[cls].cantidad++;
      acc[cls].facturacion += parseFloat(p.facturacion_total || 0);
      return acc;
    }, {});

    res.json({
      dias_analizados: dias,
      total_productos: result.rowCount,
      resumen,
      productos: result.rows,
    });
  } catch (error) { next(error); }
});

// GET /dashboard-hoy — KPIs del día para el dashboard en tiempo real
router.get('/dashboard-hoy', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const hoyStr = new Date().toISOString().slice(0, 10);
  const ayerStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  try {
    const [
      ventasHoyRes,
      ventasAyerRes,
      topProductosRes,
      cajaActualRes,
      stockCriticoRes,
    ] = await Promise.all([
      // Ventas de hoy
      db.query(
        `SELECT
          COUNT(*) AS cantidad_ventas,
          COALESCE(SUM(total), 0) AS ingresos_totales,
          COALESCE(AVG(total), 0) AS ticket_promedio,
          COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) AS efectivo,
          COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta' THEN total ELSE 0 END), 0) AS tarjeta,
          COALESCE(SUM(CASE WHEN metodo_pago = 'transferencia' THEN total ELSE 0 END), 0) AS transferencia
         FROM ventas
         WHERE comercio_id = $1
           AND DATE(fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2
           AND estado != 'error_afip'`,
        [comercioId, hoyStr]
      ),
      // Ventas de ayer (para comparar)
      db.query(
        `SELECT COALESCE(SUM(total), 0) AS ingresos_totales, COUNT(*) AS cantidad_ventas
         FROM ventas
         WHERE comercio_id = $1
           AND DATE(fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2
           AND estado != 'error_afip'`,
        [comercioId, ayerStr]
      ),
      // Top 5 productos del día
      db.query(
        `SELECT p.nombre, p.rubro,
           SUM(dv.cantidad) AS unidades,
           SUM(dv.cantidad * dv.precio_unitario) AS facturacion
         FROM detalle_ventas dv
         JOIN ventas v ON dv.id_venta = v.id
         JOIN productos p ON dv.id_producto = p.id
         WHERE v.comercio_id = $1
           AND DATE(v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') = $2
           AND v.estado != 'error_afip'
         GROUP BY p.id, p.nombre, p.rubro
         ORDER BY facturacion DESC
         LIMIT 5`,
        [comercioId, hoyStr]
      ),
      // Caja actualmente abierta
      db.query(
        `SELECT c.id, c.monto_inicial, c.fecha_apertura, u.nombre_usuario
         FROM cajas c
         LEFT JOIN usuarios u ON c.id_usuario = u.id
         WHERE c.comercio_id = $1 AND c.estado = 'abierta'
         ORDER BY c.fecha_apertura DESC
         LIMIT 1`,
        [comercioId]
      ),
      // Productos bajo stock mínimo
      db.query(
        `SELECT COUNT(*) AS total FROM productos
         WHERE comercio_id = $1
           AND (
             (stock_minimo > 0 AND stock <= stock_minimo)
             OR (COALESCE(stock_minimo, 0) = 0 AND stock <= 5)
           )`,
        [comercioId]
      ),
    ]);

    const hoy = ventasHoyRes.rows[0];
    const ayer = ventasAyerRes.rows[0];
    const ingresosHoy = parseFloat(hoy.ingresos_totales || 0);
    const ingresosAyer = parseFloat(ayer.ingresos_totales || 0);
    const variacionPct = ingresosAyer > 0
      ? ((ingresosHoy - ingresosAyer) / ingresosAyer) * 100
      : null;

    res.json({
      fecha: hoyStr,
      ventas_hoy: {
        cantidad: parseInt(hoy.cantidad_ventas || 0),
        ingresos: ingresosHoy,
        ticket_promedio: parseFloat(hoy.ticket_promedio || 0),
        efectivo: parseFloat(hoy.efectivo || 0),
        tarjeta: parseFloat(hoy.tarjeta || 0),
        transferencia: parseFloat(hoy.transferencia || 0),
      },
      comparacion_ayer: {
        ingresos_ayer: ingresosAyer,
        variacion_pct: variacionPct ? parseFloat(variacionPct.toFixed(1)) : null,
        mejor_que_ayer: variacionPct !== null ? variacionPct >= 0 : null,
      },
      top_productos: topProductosRes.rows,
      caja_abierta: cajaActualRes.rows[0] || null,
      alertas_stock: parseInt(stockCriticoRes.rows[0]?.total || 0),
    });
  } catch (error) { next(error); }
});

module.exports = router;



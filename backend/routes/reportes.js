'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/conexion');
const { cents, fromCents, round2 } = require('../utils/money');

// ── Helpers de fecha ────────────────────────────────────────────────────────
const primerDiaMes = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * N6 — Convierte un par de fechas "YYYY-MM-DD" en rango sargable para TZ Buenos Aires.
 * Retorna { inicioBsAs: Date, finBsAs: Date } listos para usar en:
 *   fecha >= $x AND fecha < $y
 * (finBsAs apunta al inicio del día siguiente a hastaStr)
 */
function rangoFechaBsAs(desdeStr, hastaStr) {
  // Buenos Aires: UTC-3 (offset fijo; no hay DST en Argentina desde 2008)
  const OFFSET_MS = 3 * 60 * 60 * 1000;
  const inicioBsAs = new Date(desdeStr + 'T00:00:00.000Z');
  inicioBsAs.setTime(inicioBsAs.getTime() + OFFSET_MS);
  const finDia = new Date(hastaStr + 'T00:00:00.000Z');
  finDia.setTime(finDia.getTime() + OFFSET_MS);
  finDia.setDate(finDia.getDate() + 1); // día siguiente → exclusivo
  return { inicioBsAs, finBsAs: finDia };
}

// GET /ventas — Reporte de ventas con filtros (N4 centavos, N6 sargable)
router.get('/ventas', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy(), vendedor_id, metodo_pago } = req.query;
  const { inicioBsAs, finBsAs } = rangoFechaBsAs(desde, hasta); // N6

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
        AND v.fecha >= $2 AND v.fecha < $3
        AND v.estado != 'error_afip'
    `;
    const params = [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()];
    let idx = 4;

    if (vendedor_id) { query += ` AND v.id_usuario = $${idx++}`; params.push(vendedor_id); }
    if (metodo_pago) { query += ` AND v.metodo_pago = $${idx++}`; params.push(metodo_pago); }

    query += ' GROUP BY v.id, u.nombre_usuario ORDER BY v.fecha DESC';

    const result = await db.query(query, params);
    const rows   = result.rows;

    // N4 — aritmética en centavos
    let ingresosCents   = 0;
    let descuentosCents = 0;
    const porMetodoCents = {};
    for (const v of rows) {
      const tc = cents(v.total    || 0);
      const dc = cents(v.descuento || 0);
      ingresosCents   += tc;
      descuentosCents += dc;
      const mp = v.metodo_pago || 'otro';
      porMetodoCents[mp] = (porMetodoCents[mp] || 0) + tc;
    }
    const ingresos_totales   = fromCents(ingresosCents);
    const descuentos_totales = fromCents(descuentosCents);
    const por_metodo_pago    = Object.fromEntries(
      Object.entries(porMetodoCents).map(([k, v]) => [k, fromCents(v)])
    );

    res.json({
      summary: {
        total_ventas: rows.length,
        ingresos_totales,
        descuentos_totales,
        ticket_promedio: rows.length > 0 ? round2(ingresos_totales / rows.length) : 0,
        por_metodo_pago,
      },
      ventas: rows,
    });
  } catch (error) { next(error); }
});

// GET /vendedores — Ranking de vendedores por período (N6 sargable)
router.get('/vendedores', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;
  const { inicioBsAs, finBsAs } = rangoFechaBsAs(desde, hasta); // N6

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
         AND v.fecha >= $2 AND v.fecha < $3
         AND v.comercio_id = $1
         AND v.estado != 'error_afip'
       WHERE u.comercio_id = $1
       GROUP BY u.id
       ORDER BY ingresos_totales DESC`,
      [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
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

    // N4 — acumuladores en centavos
    let valorCostoCents = 0;
    let valorVentaCents = 0;
    let unidadesTotal   = 0;
    for (const p of rows) {
      valorCostoCents += cents(p.valor_costo || 0);
      valorVentaCents += cents(p.valor_venta || 0);
      unidadesTotal   += parseInt(p.stock || 0, 10);
    }

    res.json({
      totals: {
        valor_costo_total: fromCents(valorCostoCents),
        valor_venta_total: fromCents(valorVentaCents),
        unidades_total:    unidadesTotal,
      },
      productos: rows,
    });
  } catch (error) { next(error); }
});

// GET /margenes — Márgenes por producto con ventas del mes
// N5: usa dv.costo_unitario (congelado) con fallback a p.costo para ventas pre-M1
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
        COALESCE(
          SUM(dv.cantidad * (dv.precio_unitario - COALESCE(dv.costo_unitario, p.costo))),
          0
        )                                                         AS ganancia_mes
      FROM productos p
      LEFT JOIN detalle_ventas dv ON p.id = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id
        AND DATE_TRUNC('month', v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')
            = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
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

// GET /rotacion — Rotación de productos en N días (N6: sargable + parámetro dias correcto)
router.get('/rotacion', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const dias       = Math.min(parseInt(req.query.dias || 30, 10), 365);
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  try {
    const result = await db.query(
      `SELECT
         p.id, p.nombre, p.rubro, p.marca, p.stock, p.punto_reposicion, p.stock_minimo,
         COALESCE(SUM(dv.cantidad), 0)              AS vendidos_periodo,
         COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS revenue_periodo,
         CASE WHEN p.stock > 0 AND COALESCE(SUM(dv.cantidad), 0) > 0
           THEN ROUND((p.stock::numeric / (SUM(dv.cantidad)::numeric / $3)), 1)
           ELSE NULL END AS dias_stock_restante
       FROM productos p
       LEFT JOIN detalle_ventas dv ON p.id = dv.id_producto
       LEFT JOIN ventas v ON dv.id_venta = v.id
         AND v.fecha >= $2
         AND v.estado != 'error_afip'
         AND v.comercio_id = $1
       WHERE p.comercio_id = $1 AND p.activo = true
       GROUP BY p.id
       ORDER BY vendidos_periodo DESC`,
      [comercioId, fechaLimite.toISOString(), dias]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

// ── GET /analisis-abc — Clasificación ABC de productos (Pareto 80/20) ─────────
router.get('/analisis-abc', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }

  const dias = Math.min(parseInt(req.query.dias || 90, 10), 365);
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  try {
    const result = await db.query(
      `SELECT
         p.id, p.nombre, p.rubro, p.marca, p.stock, p.costo, p.precio_venta,
         COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas,
         COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS ingresos_totales
       FROM productos p
       LEFT JOIN detalle_ventas dv ON p.id = dv.id_producto AND dv.comercio_id = $1
       LEFT JOIN ventas v ON dv.id_venta = v.id
         AND v.comercio_id = $1
         AND v.fecha >= $2
         AND v.estado != 'error_afip'
       WHERE p.comercio_id = $1 AND p.activo = true
       GROUP BY p.id
       ORDER BY ingresos_totales DESC, p.nombre ASC`,
      [comercioId, fechaLimite.toISOString()]
    );

    const productos = result.rows.map(r => ({
      ...r,
      unidades_vendidas: Number(r.unidades_vendidas) || 0,
      ingresos_totales: Math.round((Number(r.ingresos_totales) || 0) * 100) / 100,
    }));

    const totalIngresos = productos.reduce((acc, p) => acc + p.ingresos_totales, 0);

    let acumulado = 0;
    const catA = [];
    const catB = [];
    const catC = [];

    for (const prod of productos) {
      acumulado += prod.ingresos_totales;
      const pctAcumulado = totalIngresos > 0 ? (acumulado / totalIngresos) * 100 : 100;
      const pctIndividual = totalIngresos > 0 ? (prod.ingresos_totales / totalIngresos) * 100 : 0;

      if (pctAcumulado <= 80 || catA.length === 0) {
        catA.push({ ...prod, clase: 'A', pct_ingresos: Math.round(pctIndividual * 100) / 100 });
      } else if (pctAcumulado <= 95) {
        catB.push({ ...prod, clase: 'B', pct_ingresos: Math.round(pctIndividual * 100) / 100 });
      } else {
        catC.push({ ...prod, clase: 'C', pct_ingresos: Math.round(pctIndividual * 100) / 100 });
      }
    }

    res.json({
      periodo_dias: dias,
      total_ingresos: Math.round(totalIngresos * 100) / 100,
      total_productos: productos.length,
      resumen: {
        categoria_a: {
          cantidad: catA.length,
          porcentaje_catalogo: productos.length > 0 ? Math.round((catA.length / productos.length) * 100) : 0,
          ingresos: Math.round(catA.reduce((s, p) => s + p.ingresos_totales, 0) * 100) / 100,
          descripcion: 'Productos estrella (generan ~80% de las ventas). Mantener stock siempre.',
        },
        categoria_b: {
          cantidad: catB.length,
          porcentaje_catalogo: productos.length > 0 ? Math.round((catB.length / productos.length) * 100) : 0,
          ingresos: Math.round(catB.reduce((s, p) => s + p.ingresos_totales, 0) * 100) / 100,
          descripcion: 'Rotación intermedia (generan ~15% de las ventas). Reposición estándar.',
        },
        categoria_c: {
          cantidad: catC.length,
          porcentaje_catalogo: productos.length > 0 ? Math.round((catC.length / productos.length) * 100) : 0,
          ingresos: Math.round(catC.reduce((s, p) => s + p.ingresos_totales, 0) * 100) / 100,
          descripcion: 'Baja rotación / cola larga (generan ~5% de ventas). Evaluar promociones.',
        },
      },
      categoria_a: catA,
      categoria_b: catB,
      categoria_c: catC,
    });
  } catch (error) {
    next(error);
  }
});

// GET /rubros — Ventas por categoría/rubro (N6 sargable)
router.get('/rubros', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;
  const { inicioBsAs, finBsAs } = rangoFechaBsAs(desde, hasta); // N6

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
         AND v.fecha >= $2 AND v.fecha < $3
         AND v.estado != 'error_afip'
       GROUP BY COALESCE(p.rubro, 'Sin Categoría')
       ORDER BY ingresos DESC`,
      [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});


// GET /mensual-completo — Todo lo sucedido en el mes (N4 centavos, N6 sargable)
router.get('/mensual-completo', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;
  const { inicioBsAs, finBsAs } = rangoFechaBsAs(desde, hasta); // N6

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
           AND v.fecha >= $2 AND v.fecha < $3
           AND v.estado != 'error_afip'
         GROUP BY v.id, u.nombre_usuario
         ORDER BY v.fecha ASC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
      ),
      // 2. Auditoría completa
      db.query(
        `SELECT a.id, a.tipo_evento, a.descripcion, a.fecha, u.nombre_usuario AS usuario
         FROM auditoria a
         LEFT JOIN usuarios u ON a.usuario_id = u.id
         WHERE a.comercio_id = $1
           AND a.fecha >= $2 AND a.fecha < $3
         ORDER BY a.fecha ASC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
      ),
      // 3. Cajas del período
      db.query(
        `SELECT c.id, c.monto_inicial, c.monto_final, c.monto_teorico, c.diferencia,
                c.estado, c.fecha_cierre, c.created_at AS fecha_apertura,
                u.nombre_usuario AS usuario
         FROM cajas c
         LEFT JOIN usuarios u ON c.id_usuario = u.id
         WHERE c.comercio_id = $1
           AND COALESCE(c.fecha_cierre, c.created_at) >= $2
           AND COALESCE(c.fecha_cierre, c.created_at) < $3
         ORDER BY c.created_at ASC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
      ),
      // 4. Devoluciones del período
      db.query(
        `SELECT d.id, d.venta_id, d.motivo, d.total_devuelto, d.devuelto_caja, d.estado, d.fecha,
                u.nombre_usuario AS vendedor
         FROM devoluciones d
         LEFT JOIN usuarios u ON d.usuario_id = u.id
         WHERE d.comercio_id = $1
           AND d.fecha >= $2 AND d.fecha < $3
         ORDER BY d.fecha ASC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
      ),
      // 5. Órdenes de compra del período
      db.query(
        `SELECT oc.id, oc.numero, oc.proveedor_nombre, oc.estado, oc.total,
                oc.notas, oc.fecha_esperada, oc.created_at, oc.recibida_at,
                u.nombre_usuario AS creado_por
         FROM ordenes_compra oc
         LEFT JOIN usuarios u ON oc.usuario_id = u.id
         WHERE oc.comercio_id = $1
           AND oc.created_at >= $2 AND oc.created_at < $3
         ORDER BY oc.created_at ASC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
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
           AND v.fecha >= $2 AND v.fecha < $3
           AND v.comercio_id = $1
           AND v.estado != 'error_afip'
         WHERE u.comercio_id = $1
         GROUP BY u.nombre_usuario
         ORDER BY ingresos_totales DESC`,
        [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
      ),
    ]);

    const ventas = resVentas.rows;
    // N4 — centavos
    let ingresosCents   = 0;
    let descuentosCents = 0;
    const porMetodoCents = {};
    for (const v of ventas) {
      const tc = cents(v.total    || 0);
      const dc = cents(v.descuento || 0);
      ingresosCents   += tc;
      descuentosCents += dc;
      const mp = v.metodo_pago || 'otro';
      porMetodoCents[mp] = (porMetodoCents[mp] || 0) + tc;
    }
    const ingresos_totales   = fromCents(ingresosCents);
    const descuentos_totales = fromCents(descuentosCents);
    const por_metodo_pago    = Object.fromEntries(
      Object.entries(porMetodoCents).map(([k, v]) => [k, fromCents(v)])
    );

    res.json({
      periodo: { desde, hasta },
      summary: {
        total_ventas: ventas.length,
        ingresos_totales,
        descuentos_totales,
        ticket_promedio: ventas.length > 0 ? round2(ingresos_totales / ventas.length) : 0,
        por_metodo_pago,
        total_devoluciones:   resDevoluciones.rows.length,
        total_ordenes_compra: resOrdenesCompra.rows.length,
      },
      ventas,
      auditoria:      resAuditoria.rows,
      cajas:          resCajas.rows,
      devoluciones:   resDevoluciones.rows,
      ordenes_compra: resOrdenesCompra.rows,
      vendedores:     resVendedores.rows,
    });
  } catch (error) { next(error); }
});

// N2: /abc ELIMINADO — ruta unificada en /analisis-abc (ver arriba)
// Alias de compatibilidad temporal — redirige internamente sin exponer una ruta separada
// (eliminado el handler completo para evitar duplicados)

// ── BLOQUE ELIMINADO: /abc (ver N2 en el encabezado del archivo) ──────────
// El endpoint canónico es /analisis-abc. El frontend ya lo llama correctamente.
// Si tenías código que llamaba a /abc, actualizá a /analisis-abc.

// placeholder vacío para que el archivo continúe parseable
const _n2_abc_eliminado = true; void _n2_abc_eliminado;


// GET /dashboard-hoy — KPIs del día + badges de módulos + sparklines 7 días
// N1: query 8 usaba estado_factura → corregido a estado IN ('pendiente_cae','error_afip')
//     + eliminados .catch ocultos de queries 7 y 8 (ahora propagan al errorHandler)
// N6: predicados sargables
router.get('/dashboard-hoy', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;

  // N6: rangos sargables en hora local BsAs
  const hoyStr = hoy();
  const { inicioBsAs: inicioDia, finBsAs: finDia } = rangoFechaBsAs(hoyStr, hoyStr);
  const ayerStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { inicioBsAs: inicioAyer, finBsAs: finAyer } = rangoFechaBsAs(ayerStr, ayerStr);

  const ultimos7Dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    ultimos7Dias.push(d.toISOString().slice(0, 10));
  }
  const { inicioBsAs: inicioSparkline } = rangoFechaBsAs(ultimos7Dias[0], ultimos7Dias[0]);

  try {
    const [
      ventasHoyRes,
      ventasAyerRes,
      topProductosRes,
      cajaActualRes,
      stockCriticoRes,
      sparklineRes,
      deudaCCRes,
      facturasCaeRes,
      porVencerRes,
    ] = await Promise.all([
      // 1. Ventas de hoy (N6 sargable)
      db.query(
        `SELECT
          COUNT(*) AS cantidad_ventas,
          COALESCE(SUM(total), 0) AS ingresos_totales,
          COALESCE(AVG(total), 0) AS ticket_promedio,
          COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo'        THEN total ELSE 0 END), 0) AS efectivo,
          COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta'         THEN total ELSE 0 END), 0) AS tarjeta,
          COALESCE(SUM(CASE WHEN metodo_pago = 'transferencia'   THEN total ELSE 0 END), 0) AS transferencia,
          COALESCE(SUM(CASE WHEN metodo_pago = 'qr'              THEN total ELSE 0 END), 0) AS qr,
          COALESCE(SUM(CASE WHEN metodo_pago = 'cuenta_corriente' THEN total ELSE 0 END), 0) AS cuenta_corriente
         FROM ventas
         WHERE comercio_id = $1
           AND fecha >= $2 AND fecha < $3
           AND estado != 'error_afip'`,
        [comercioId, inicioDia.toISOString(), finDia.toISOString()]
      ),

      // 2. Ventas de ayer (N6 sargable)
      db.query(
        `SELECT COALESCE(SUM(total), 0) AS ingresos_totales, COUNT(*) AS cantidad_ventas
         FROM ventas
         WHERE comercio_id = $1
           AND fecha >= $2 AND fecha < $3
           AND estado != 'error_afip'`,
        [comercioId, inicioAyer.toISOString(), finAyer.toISOString()]
      ),

      // 3. Top 5 productos del día (N6 sargable)
      db.query(
        `SELECT p.nombre, p.rubro,
           SUM(dv.cantidad)::int AS unidades,
           SUM(dv.cantidad * dv.precio_unitario) AS facturacion
         FROM detalle_ventas dv
         JOIN ventas v ON dv.id_venta = v.id
         JOIN productos p ON dv.id_producto = p.id
         WHERE v.comercio_id = $1
           AND v.fecha >= $2 AND v.fecha < $3
           AND v.estado != 'error_afip'
         GROUP BY p.id, p.nombre, p.rubro
         ORDER BY facturacion DESC
         LIMIT 5`,
        [comercioId, inicioDia.toISOString(), finDia.toISOString()]
      ),

      // 4. Caja actualmente abierta
      db.query(
        `SELECT c.id, c.monto_inicial, c.fecha_apertura, u.nombre_usuario
         FROM cajas c
         LEFT JOIN usuarios u ON c.id_usuario = u.id
         WHERE c.comercio_id = $1 AND c.estado = 'abierta'
         ORDER BY c.fecha_apertura DESC
         LIMIT 1`,
        [comercioId]
      ),

      // 5. Productos bajo stock mínimo (badge Inventario)
      db.query(
        `SELECT COUNT(*) AS total FROM productos
         WHERE comercio_id = $1 AND activo = true
           AND (
             (stock_minimo > 0 AND stock <= stock_minimo)
             OR (COALESCE(stock_minimo, 0) = 0 AND stock <= 5)
           )`,
        [comercioId]
      ),

      // 6. Sparklines 7 días (N6 sargable)
      db.query(
        `SELECT
           DATE(fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') AS dia,
           COALESCE(SUM(total), 0) AS ventas,
           COUNT(*) AS comprobantes
         FROM ventas
         WHERE comercio_id = $1
           AND fecha >= $2 AND fecha < $3
           AND estado != 'error_afip'
         GROUP BY dia
         ORDER BY dia ASC`,
        [comercioId, inicioSparkline.toISOString(), finDia.toISOString()]
      ),

      // 7. Deuda CC — N1: sin .catch oculto (propaga al errorHandler)
      db.query(
        `SELECT COALESCE(SUM(saldo_deuda), 0) AS total_deuda
         FROM clientes
         WHERE comercio_id = $1 AND saldo_deuda > 0`,
        [comercioId]
      ),

      // 8. Facturas pendientes — N1: columna 'estado' (no 'estado_factura') + sin .catch oculto
      db.query(
        `SELECT COUNT(*) AS total
         FROM ventas
         WHERE comercio_id = $1
           AND estado IN ('pendiente_cae', 'error_afip')`,
        [comercioId]
      ),

      // 9. Lotes por vencer en 30 días (M7)
      db.query(
        `SELECT COUNT(*) AS total
         FROM producto_lotes
         WHERE comercio_id = $1
           AND cantidad > 0
           AND fecha_vencimiento <= NOW() + INTERVAL '30 days'`,
        [comercioId]
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const hoyRow = ventasHoyRes.rows[0];
    const ayerRow = ventasAyerRes.rows[0];
    const ingresosHoy = parseFloat(hoyRow.ingresos_totales || 0);
    const ingresosAyer = parseFloat(ayerRow.ingresos_totales || 0);
    const cantHoy = parseInt(hoyRow.cantidad_ventas || 0);
    const cantAyer = parseInt(ayerRow.cantidad_ventas || 0);
    const variacionPct = ingresosAyer > 0
      ? ((ingresosHoy - ingresosAyer) / ingresosAyer) * 100
      : null;
    const variacionCantPct = cantAyer > 0
      ? ((cantHoy - cantAyer) / cantAyer) * 100
      : null;

    // Normalizar sparklines: rellenar días sin ventas con 0
    const sparkMap = {};
    for (const row of sparklineRes.rows) {
      const key = typeof row.dia === 'string' ? row.dia : new Date(row.dia).toISOString().slice(0, 10);
      sparkMap[key] = { ventas: parseFloat(row.ventas || 0), comprobantes: parseInt(row.comprobantes || 0) };
    }
    const sparklines_7dias = ultimos7Dias.map((fecha) => ({
      fecha,
      ventas: sparkMap[fecha]?.ventas ?? 0,
      comprobantes: sparkMap[fecha]?.comprobantes ?? 0,
    }));

    const cajaAbierta = cajaActualRes.rows[0] || null;
    const stockBajoCount = parseInt(stockCriticoRes.rows[0]?.total || 0);
    const deudaTotal = parseFloat(deudaCCRes.rows[0]?.total_deuda || 0);
    const facturasPendientesCaeCount = parseInt(facturasCaeRes.rows[0]?.total || 0);
    const porVencerCount = parseInt(porVencerRes?.rows?.[0]?.total || 0, 10);

    res.json({
      fecha: hoyStr,
      ventas_hoy: {
        cantidad: cantHoy,
        ingresos: ingresosHoy,
        ticket_promedio: parseFloat(hoyRow.ticket_promedio || 0),
        efectivo: parseFloat(hoyRow.efectivo || 0),
        tarjeta: parseFloat(hoyRow.tarjeta || 0),
        transferencia: parseFloat(hoyRow.transferencia || 0),
        qr: parseFloat(hoyRow.qr || 0),
        cuenta_corriente: parseFloat(hoyRow.cuenta_corriente || 0),
      },
      comparacion_ayer: {
        ingresos_ayer: ingresosAyer,
        variacion_pct: variacionPct !== null ? parseFloat(variacionPct.toFixed(1)) : null,
        variacion_cant_pct: variacionCantPct !== null ? parseFloat(variacionCantPct.toFixed(1)) : null,
        mejor_que_ayer: variacionPct !== null ? variacionPct >= 0 : null,
      },
      top_productos: topProductosRes.rows,
      caja_abierta: cajaAbierta,
      alertas_stock: stockBajoCount,
      // ── NUEVO: badges para tarjetas de módulo ─────────────────────────
      badges_modulos: {
        stock_bajo: stockBajoCount,
        deuda_total_cc: deudaTotal,
        caja_abierta: cajaAbierta
          ? { abierta: true, desde: cajaAbierta.fecha_apertura, usuario: cajaAbierta.nombre_usuario }
          : { abierta: false },
        facturas_pendientes_cae: facturasPendientesCaeCount,
        por_vencer: porVencerCount,
      },
      // ── NUEVO: sparklines de los últimos 7 días ────────────────────────
      sparklines_7dias,
    });
  } catch (error) { next(error); }
});

// GET /vencimientos — Reporte de productos por vencer (ventanas 30 / 60 / 90 días) (M7)
router.get('/vencimientos', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const [resVencidos, res30, res60, res90, resListado] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS total
         FROM producto_lotes
         WHERE comercio_id = $1 AND cantidad > 0 AND fecha_vencimiento < NOW()::date`,
        [comercioId]
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM producto_lotes
         WHERE comercio_id = $1 AND cantidad > 0
           AND fecha_vencimiento >= NOW()::date
           AND fecha_vencimiento <= NOW()::date + INTERVAL '30 days'`,
        [comercioId]
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM producto_lotes
         WHERE comercio_id = $1 AND cantidad > 0
           AND fecha_vencimiento > NOW()::date + INTERVAL '30 days'
           AND fecha_vencimiento <= NOW()::date + INTERVAL '60 days'`,
        [comercioId]
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM producto_lotes
         WHERE comercio_id = $1 AND cantidad > 0
           AND fecha_vencimiento > NOW()::date + INTERVAL '60 days'
           AND fecha_vencimiento <= NOW()::date + INTERVAL '90 days'`,
        [comercioId]
      ),
      db.query(
        `SELECT pl.id, pl.numero_lote, pl.cantidad, pl.fecha_vencimiento, pl.alerta_dias,
                p.id AS producto_id, p.nombre AS producto_nombre, p.rubro, p.codigo_barras,
                (pl.fecha_vencimiento - NOW()::date) AS dias_restantes
         FROM producto_lotes pl
         JOIN productos p ON pl.producto_id = p.id
         WHERE pl.comercio_id = $1 AND pl.cantidad > 0
           AND pl.fecha_vencimiento <= NOW()::date + INTERVAL '90 days'
         ORDER BY pl.fecha_vencimiento ASC`,
        [comercioId]
      ),
    ]);

    res.json({
      resumen: {
        vencidos: parseInt(resVencidos.rows[0]?.total || 0, 10),
        dias_30:  parseInt(res30.rows[0]?.total || 0, 10),
        dias_60:  parseInt(res60.rows[0]?.total || 0, 10),
        dias_90:  parseInt(res90.rows[0]?.total || 0, 10),
      },
      lotes: resListado.rows,
    });
  } catch (error) { next(error); }
});

// GET /franja-horaria — Ventas por hora y día de semana (heatmap) (M10)
router.get('/franja-horaria', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;
  const { inicioBsAs, finBsAs } = rangoFechaBsAs(desde, hasta);

  try {
    const result = await db.query(
      `SELECT
         EXTRACT(DOW  FROM fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS dia_semana,
         EXTRACT(HOUR FROM fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS hora,
         COUNT(*) AS cantidad_ventas,
         COALESCE(SUM(total), 0) AS total_ventas
       FROM ventas
       WHERE comercio_id = $1
         AND fecha >= $2 AND fecha < $3
         AND estado != 'error_afip'
       GROUP BY dia_semana, hora
       ORDER BY dia_semana ASC, hora ASC`,
      [comercioId, inicioBsAs.toISOString(), finBsAs.toISOString()]
    );

    res.json({
      desde,
      hasta,
      datos: result.rows.map(r => ({
        dia_semana: r.dia_semana, // 0=Dom, 1=Lun, ..., 6=Sab
        hora: r.hora,             // 0..23
        cantidad_ventas: parseInt(r.cantidad_ventas, 10),
        total_ventas: parseFloat(r.total_ventas || 0),
      })),
    });
  } catch (error) { next(error); }
});

// GET /resumen-ejecutivo — Resumen ejecutivo del mes (M16 Cierre de Mes)
// Query params: anio (default: año actual), mes (1-12, default: mes actual)
router.get('/resumen-ejecutivo', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const now = new Date();
  const anio = parseInt(req.query.anio, 10) || now.getFullYear();
  const mes  = parseInt(req.query.mes,  10) || (now.getMonth() + 1);

  const OFFSET_MS = 3 * 60 * 60 * 1000;
  const inicio = new Date(`${anio}-${String(mes).padStart(2, '0')}-01T00:00:00.000Z`);
  inicio.setTime(inicio.getTime() + OFFSET_MS);
  const fin = new Date(inicio);
  fin.setMonth(fin.getMonth() + 1);

  try {
    const [ventasRes, topProductosRes, topRubrosRes, metodosRes, gastosMesRes, deudaRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS cantidad_ventas,
                COALESCE(SUM(total),0) AS ingresos_totales,
                COALESCE(AVG(total),0) AS ticket_promedio,
                COALESCE(SUM(descuento),0) AS descuentos_totales,
                COALESCE(SUM(subtotal_neto),0) AS subtotal_neto_total,
                COALESCE(SUM(iva_discriminado),0) AS iva_total
         FROM ventas
         WHERE comercio_id=$1 AND fecha>=$2 AND fecha<$3 AND estado!='error_afip'`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ),
      db.query(
        `SELECT p.nombre, p.rubro,
                SUM(dv.cantidad) AS unidades,
                SUM(dv.cantidad*dv.precio_unitario) AS ingresos,
                COALESCE(SUM(dv.cantidad*(dv.precio_unitario-COALESCE(dv.costo_unitario,p.costo))),0) AS ganancia
         FROM detalle_ventas dv
         JOIN productos p ON dv.id_producto=p.id
         JOIN ventas v ON dv.id_venta=v.id
         WHERE dv.comercio_id=$1 AND v.fecha>=$2 AND v.fecha<$3 AND v.estado!='error_afip'
         GROUP BY p.id,p.nombre,p.rubro ORDER BY ingresos DESC LIMIT 10`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ),
      db.query(
        `SELECT p.rubro, SUM(dv.cantidad*dv.precio_unitario) AS ingresos
         FROM detalle_ventas dv
         JOIN productos p ON dv.id_producto=p.id
         JOIN ventas v ON dv.id_venta=v.id
         WHERE dv.comercio_id=$1 AND v.fecha>=$2 AND v.fecha<$3 AND v.estado!='error_afip'
         GROUP BY p.rubro ORDER BY ingresos DESC`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ),
      db.query(
        `SELECT metodo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
         FROM ventas
         WHERE comercio_id=$1 AND fecha>=$2 AND fecha<$3 AND estado!='error_afip'
         GROUP BY metodo_pago ORDER BY total DESC`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ),
      db.query(
        `SELECT COALESCE(SUM(monto),0) AS total_gastos, COUNT(*) AS cantidad_gastos
         FROM gastos WHERE comercio_id=$1 AND fecha>=$2 AND fecha<$3`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ).catch(() => ({ rows: [{ total_gastos: 0, cantidad_gastos: 0 }] })),
      db.query(
        `SELECT COALESCE(SUM(monto),0) AS deuda_generada
         FROM movimientos_cuenta_corriente
         WHERE comercio_id=$1 AND tipo='venta_credito' AND created_at>=$2 AND created_at<$3`,
        [comercioId, inicio.toISOString(), fin.toISOString()]
      ).catch(() => ({ rows: [{ deuda_generada: 0 }] })),
    ]);

    const v = ventasRes.rows[0];
    const ingresos = parseFloat(v.ingresos_totales || 0);
    const gastos   = parseFloat(gastosMesRes.rows[0]?.total_gastos || 0);

    res.json({
      periodo: { anio, mes, desde: inicio.toISOString().slice(0,10), hasta: fin.toISOString().slice(0,10) },
      resumen: {
        ingresos_totales:   ingresos,
        cantidad_ventas:    parseInt(v.cantidad_ventas || 0),
        ticket_promedio:    parseFloat(parseFloat(v.ticket_promedio || 0).toFixed(2)),
        descuentos_totales: parseFloat(v.descuentos_totales || 0),
        subtotal_neto:      parseFloat(v.subtotal_neto_total || 0),
        iva_total:          parseFloat(v.iva_total || 0),
        gastos_totales:     gastos,
        resultado_neto:     parseFloat((ingresos - gastos).toFixed(2)),
        deuda_generada:     parseFloat(deudaRes.rows[0]?.deuda_generada || 0),
      },
      top_productos: topProductosRes.rows.map(r => ({
        nombre: r.nombre, rubro: r.rubro,
        unidades: parseInt(r.unidades), ingresos: parseFloat(r.ingresos), ganancia: parseFloat(r.ganancia),
      })),
      por_rubro: topRubrosRes.rows.map(r => ({
        rubro: r.rubro || 'Sin rubro', ingresos: parseFloat(r.ingresos),
      })),
      por_metodo_pago: metodosRes.rows.map(r => ({
        metodo: r.metodo_pago, cantidad: parseInt(r.cantidad), total: parseFloat(r.total),
      })),
    });
  } catch (error) { next(error); }
});

// GET /comparar-periodos — Mes actual vs mes anterior con deltas (M17)
router.get('/comparar-periodos', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const OFFSET_MS = 3 * 60 * 60 * 1000;
  const now = new Date();
  const inicioActual = new Date(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00.000Z`);
  inicioActual.setTime(inicioActual.getTime() + OFFSET_MS);
  const finActual = new Date(inicioActual);
  finActual.setMonth(finActual.getMonth() + 1);
  const inicioPrev = new Date(inicioActual);
  inicioPrev.setMonth(inicioPrev.getMonth() - 1);
  const finPrev = new Date(inicioActual);

  try {
    const queryResumen = (desde, hasta) => db.query(
      `SELECT COUNT(*) AS cantidad_ventas,
              COALESCE(SUM(total),0) AS ingresos_totales,
              COALESCE(AVG(total),0) AS ticket_promedio
       FROM ventas
       WHERE comercio_id=$1 AND fecha>=$2 AND fecha<$3 AND estado!='error_afip'`,
      [comercioId, desde.toISOString(), hasta.toISOString()]
    );
    const queryRubros = (desde, hasta) => db.query(
      `SELECT p.rubro, SUM(dv.cantidad*dv.precio_unitario) AS ingresos
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto=p.id
       JOIN ventas v ON dv.id_venta=v.id
       WHERE dv.comercio_id=$1 AND v.fecha>=$2 AND v.fecha<$3 AND v.estado!='error_afip'
       GROUP BY p.rubro`,
      [comercioId, desde.toISOString(), hasta.toISOString()]
    );
    const queryMetodos = (desde, hasta) => db.query(
      `SELECT metodo_pago, COALESCE(SUM(total),0) AS total
       FROM ventas
       WHERE comercio_id=$1 AND fecha>=$2 AND fecha<$3 AND estado!='error_afip'
       GROUP BY metodo_pago`,
      [comercioId, desde.toISOString(), hasta.toISOString()]
    );

    const [rActual, rPrev, rubActual, rubPrev, metActual, metPrev] = await Promise.all([
      queryResumen(inicioActual, finActual),
      queryResumen(inicioPrev, finPrev),
      queryRubros(inicioActual, finActual),
      queryRubros(inicioPrev, finPrev),
      queryMetodos(inicioActual, finActual),
      queryMetodos(inicioPrev, finPrev),
    ]);

    const delta = (a, b) => b > 0 ? parseFloat(((a - b) / b * 100).toFixed(1)) : null;
    const ga = rActual.rows[0], gp = rPrev.rows[0];
    const ingA = parseFloat(ga.ingresos_totales||0), ingP = parseFloat(gp.ingresos_totales||0);
    const cntA = parseInt(ga.cantidad_ventas||0),    cntP = parseInt(gp.cantidad_ventas||0);
    const tikA = parseFloat(parseFloat(ga.ticket_promedio||0).toFixed(2));
    const tikP = parseFloat(parseFloat(gp.ticket_promedio||0).toFixed(2));

    const rubrosSet = new Set([
      ...rubActual.rows.map(r=>r.rubro||'Sin rubro'),
      ...rubPrev.rows.map(r=>r.rubro||'Sin rubro'),
    ]);
    const metodosSet = new Set([
      ...metActual.rows.map(m=>m.metodo_pago),
      ...metPrev.rows.map(m=>m.metodo_pago),
    ]);

    res.json({
      periodos: {
        actual:   { desde: inicioActual.toISOString().slice(0,10), hasta: new Date(finActual-1).toISOString().slice(0,10) },
        anterior: { desde: inicioPrev.toISOString().slice(0,10),   hasta: new Date(finPrev-1).toISOString().slice(0,10)   },
      },
      actual:   { ingresos: ingA, cantidad_ventas: cntA, ticket_promedio: tikA },
      anterior: { ingresos: ingP, cantidad_ventas: cntP, ticket_promedio: tikP },
      deltas: {
        ingresos_pct:  delta(ingA, ingP),
        cantidad_pct:  delta(cntA, cntP),
        ticket_pct:    delta(tikA, tikP),
      },
      por_rubro: Array.from(rubrosSet).map(rubro => {
        const a = rubActual.rows.find(r=>(r.rubro||'Sin rubro')===rubro);
        const b = rubPrev.rows.find(r=>(r.rubro||'Sin rubro')===rubro);
        const ia = parseFloat(a?.ingresos||0), ib = parseFloat(b?.ingresos||0);
        return { rubro, actual: ia, anterior: ib, delta_pct: delta(ia, ib) };
      }).sort((a,b)=>b.actual-a.actual),
      por_metodo_pago: Array.from(metodosSet).map(metodo => {
        const a = metActual.rows.find(m=>m.metodo_pago===metodo);
        const b = metPrev.rows.find(m=>m.metodo_pago===metodo);
        const ta = parseFloat(a?.total||0), tb = parseFloat(b?.total||0);
        return { metodo, actual: ta, anterior: tb, delta_pct: delta(ta, tb) };
      }).sort((a,b)=>b.actual-a.actual),
    });
  } catch (error) { next(error); }
});

module.exports = router;




const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// ── GET /api/alertas — Resumen de alertas activas del comercio ────────────
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;

  try {
    // BUG-08 FIX: Ejecutar todas las queries en paralelo con Promise.all()
    const [stockBajoRes, stockFallbackRes, sinStockRes, cajaAbRes, licRes] = await Promise.all([
      // 1a. Productos con stock bajo el mínimo configurado
      db.query(
        `SELECT id, nombre, stock, stock_minimo, rubro
         FROM productos
         WHERE comercio_id = $1
           AND stock_minimo IS NOT NULL
           AND stock_minimo > 0
           AND stock <= stock_minimo
         ORDER BY stock ASC
         LIMIT 50`,
        [comercioId]
      ),
      // 1b. Fallback: sin stock_minimo configurado, usar ≤ 5
      db.query(
        `SELECT id, nombre, stock, stock_minimo, rubro
         FROM productos
         WHERE comercio_id = $1
           AND (stock_minimo IS NULL OR stock_minimo = 0)
           AND stock <= 5
           AND stock > 0
         ORDER BY stock ASC
         LIMIT 20`,
        [comercioId]
      ),
      // 1c. Productos sin stock
      db.query(
        `SELECT id, nombre, rubro
         FROM productos
         WHERE comercio_id = $1 AND stock = 0
         ORDER BY nombre ASC
         LIMIT 20`,
        [comercioId]
      ),
      // 2. Caja abierta sin cierre
      db.query(
        `SELECT id, fecha_apertura, id_usuario
         FROM cajas
         WHERE comercio_id = $1 AND estado = 'abierta'
         ORDER BY fecha_apertura DESC
         LIMIT 1`,
        [comercioId]
      ),
      // 3. Licencia por vencer o vencida
      db.query(
        `SELECT plan, fecha_fin,
          EXTRACT(DAY FROM (fecha_fin - NOW())) as dias_restantes
         FROM licencias
         WHERE comercio_id = $1 AND activa = TRUE AND fecha_fin IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [comercioId]
      ),
    ]);

    const alertas = [];

    if (stockBajoRes.rowCount > 0) {
      alertas.push({
        tipo: 'stock_critico',
        titulo: 'Productos bajo stock mínimo',
        descripcion: `${stockBajoRes.rowCount} producto(s) están por debajo del stock mínimo configurado`,
        cantidad: stockBajoRes.rowCount,
        urgencia: 'alta',
        accion_url: '/inventario',
        items: stockBajoRes.rows,
      });
    }

    if (stockFallbackRes.rowCount > 0) {
      alertas.push({
        tipo: 'stock_bajo',
        titulo: 'Productos con poco stock',
        descripcion: `${stockFallbackRes.rowCount} producto(s) tienen 5 o menos unidades`,
        cantidad: stockFallbackRes.rowCount,
        urgencia: 'media',
        accion_url: '/inventario',
        items: stockFallbackRes.rows,
      });
    }

    if (sinStockRes.rowCount > 0) {
      alertas.push({
        tipo: 'sin_stock',
        titulo: 'Productos agotados',
        descripcion: `${sinStockRes.rowCount} producto(s) sin stock`,
        cantidad: sinStockRes.rowCount,
        urgencia: 'alta',
        accion_url: '/inventario',
        items: sinStockRes.rows,
      });
    }

    if (cajaAbRes.rowCount > 0) {
      const caja = cajaAbRes.rows[0];
      const horasAbierta = Math.floor((Date.now() - new Date(caja.fecha_apertura)) / (1000 * 60 * 60));
      if (horasAbierta >= 12) {
        alertas.push({
          tipo: 'caja_abierta',
          titulo: 'Caja abierta hace más de 12hs',
          descripcion: `La caja lleva ${horasAbierta}hs abierta sin cierre`,
          cantidad: 1,
          urgencia: 'media',
          accion_url: '/caja',
          items: [],
        });
      }
    }

    if (licRes.rowCount > 0) {
      const lic = licRes.rows[0];
      const dias = Math.ceil(lic.dias_restantes || 0);
      if (dias <= 15 && dias >= 0) {
        alertas.push({
          tipo: 'licencia_por_vencer',
          titulo: 'Licencia próxima a vencer',
          descripcion: `Tu licencia ${lic.plan.toUpperCase()} vence en ${dias} día(s)`,
          cantidad: 1,
          urgencia: dias <= 3 ? 'alta' : 'media',
          accion_url: '/configuracion',
          items: [],
        });
      } else if (dias < 0) {
        alertas.push({
          tipo: 'licencia_vencida',
          titulo: 'Licencia vencida',
          descripcion: 'Tu licencia ha vencido. Renovala para continuar usando el sistema.',
          cantidad: 1,
          urgencia: 'critica',
          accion_url: '/configuracion',
          items: [],
        });
      }
    }

    const totalAlertas = alertas.reduce((sum, a) => sum + a.cantidad, 0);
    const hayAlertasCriticas = alertas.some(a => a.urgencia === 'alta' || a.urgencia === 'critica');

    res.json({
      total: totalAlertas,
      hay_criticas: hayAlertasCriticas,
      alertas,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/alertas/reposicion — Lista de productos a reponer ───────────
router.get('/reposicion', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    // Productos con stock_minimo configurado y stock por debajo
    const result = await db.query(
      `SELECT 
        p.id, p.nombre, p.codigo_barras, p.rubro, p.marca,
        p.stock, p.stock_minimo, p.stock_maximo,
        COALESCE(p.stock_maximo, p.stock_minimo * 3) as cantidad_sugerida_comprar,
        prov.nombre as proveedor_nombre,
        prov.telefono as proveedor_telefono
       FROM productos p
       LEFT JOIN proveedores prov ON prov.id = p.proveedor_id
       WHERE p.comercio_id = $1
         AND (
           (p.stock_minimo > 0 AND p.stock <= p.stock_minimo)
           OR (COALESCE(p.stock_minimo, 0) = 0 AND p.stock <= 5)
         )
       ORDER BY p.stock ASC, p.nombre ASC`,
      [comercioId]
    );

    res.json({
      total: result.rowCount,
      productos: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

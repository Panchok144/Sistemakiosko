const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// ── GET /api/backup/datos — Descarga todos los datos del comercio en JSON ──
router.get('/datos', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    // Recolectar datos de todas las tablas del comercio
    const [
      comercioRes,
      productosRes,
      proveedoresRes,
      clientesRes,
      ventasRes,
      detalleVentasRes,
      cajasRes,
      movCajaRes,
      gastosRes,
    ] = await Promise.all([
      db.query('SELECT * FROM comercios WHERE id = $1', [comercioId]),
      db.query('SELECT * FROM productos WHERE comercio_id = $1 ORDER BY nombre', [comercioId]),
      db.query('SELECT * FROM proveedores WHERE comercio_id = $1 ORDER BY nombre', [comercioId]),
      db.query('SELECT * FROM clientes WHERE comercio_id = $1 ORDER BY nombre', [comercioId]),
      db.query('SELECT * FROM ventas WHERE comercio_id = $1 ORDER BY fecha DESC LIMIT 5000', [comercioId]),
      db.query(`
        SELECT dv.* FROM detalle_ventas dv
        JOIN ventas v ON v.id = dv.id_venta
        WHERE dv.comercio_id = $1
      `, [comercioId]),
      db.query('SELECT * FROM cajas WHERE comercio_id = $1 ORDER BY fecha_apertura DESC LIMIT 500', [comercioId]),
      db.query(`
        SELECT mc.* FROM movimientos_caja mc
        JOIN cajas c ON c.id = mc.id_caja
        WHERE mc.comercio_id = $1
      `, [comercioId]),
      db.query('SELECT * FROM gastos WHERE comercio_id = $1 ORDER BY fecha DESC LIMIT 1000', [comercioId]).catch(() => ({ rows: [] })),
    ]);

    const backup = {
      version: '1.0',
      generado_en: new Date().toISOString(),
      comercio_id: comercioId,
      datos: {
        comercio: comercioRes.rows[0] || {},
        productos: productosRes.rows,
        proveedores: proveedoresRes.rows,
        clientes: clientesRes.rows,
        ventas: ventasRes.rows,
        detalle_ventas: detalleVentasRes.rows,
        cajas: cajasRes.rows,
        movimientos_caja: movCajaRes.rows,
        gastos: gastosRes.rows,
      },
      estadisticas: {
        total_productos: productosRes.rowCount,
        total_ventas: ventasRes.rowCount,
        total_clientes: clientesRes.rowCount,
        total_proveedores: proveedoresRes.rowCount,
      },
    };

    const nombre = comercioRes.rows[0]?.nombre || 'comercio';
    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `backup_${nombre.replace(/\s+/g, '_')}_${fecha}.json`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(backup);
  } catch (error) {
    next(error);
  }
});

// ── GET /api/backup/productos-csv — Descarga productos en CSV ──────────────
router.get('/productos-csv', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;

  try {
    const result = await db.query(
      `SELECT 
        codigo_barras, nombre, precio_venta, costo, stock,
        stock_minimo, rubro, marca, codigo_secundario
       FROM productos 
       WHERE comercio_id = $1 
       ORDER BY nombre ASC`,
      [comercioId]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No hay productos para exportar' });
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h] ?? '';
          return typeof val === 'string' && val.includes(',')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      ),
    ].join('\n');

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="productos_${fecha}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv); // BOM para que Excel lo abra correctamente
  } catch (error) {
    next(error);
  }
});

module.exports = router;

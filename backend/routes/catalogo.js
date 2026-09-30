'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/catalogo/:slug — Catálogo público (NO requiere autenticación)
//  Retorna productos activos del comercio, sin costos ni datos sensibles
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:slug', async (req, res, next) => {
  const { slug } = req.params;

  if (!slug || slug.length > 80) {
    return res.status(400).json({ error: 'Slug inválido' });
  }

  try {
    // Buscar comercio por slug y verificar habilitado
    const comercioRes = await db.query(
      `SELECT id, nombre, domicilio, telefono, email, leyenda_ticket, catalogo_publico_habilitado
       FROM comercios
       WHERE slug_catalogo = $1`,
      [slug]
    );

    if (comercioRes.rowCount === 0) {
      return res.status(404).json({ error: 'Catálogo no encontrado' });
    }

    const comercio = comercioRes.rows[0];

    if (!comercio.catalogo_publico_habilitado) {
      return res.status(403).json({ error: 'Este catálogo no está disponible públicamente' });
    }

    // Obtener productos activos — SIN costo, SIN stock
    const productosRes = await db.query(
      `SELECT p.id, p.nombre, p.codigo_barras, p.precio_venta, p.rubro
       FROM productos p
       WHERE p.comercio_id = $1
         AND p.activo = true
       ORDER BY p.rubro ASC, p.nombre ASC`,
      [comercio.id]
    );

    res.json({
      comercio: {
        nombre: comercio.nombre,
        domicilio: comercio.domicilio,
        telefono: comercio.telefono,
        email: comercio.email,
        leyenda: comercio.leyenda_ticket,
        slug,
      },
      productos: productosRes.rows,
      total_productos: productosRes.rowCount,
    });
  } catch (error) { next(error); }
});

module.exports = router;

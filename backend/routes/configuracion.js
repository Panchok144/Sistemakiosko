const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { autorizarRoles } = require('../middleware/auth');

// GET /api/configuracion/comercio — Devuelve solo los datos del comercio
router.get('/comercio', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query('SELECT * FROM comercios WHERE id = $1', [comercioId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener datos del comercio:', error);
    res.status(500).json({ error: 'Error al obtener datos del comercio' });
  }
});

// GET /api/configuracion — Devuelve configuración completa del comercio
router.get('/', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const [comercioRes, configRes] = await Promise.all([
      db.query('SELECT * FROM comercios WHERE id = $1', [comercioId]),
      db.query('SELECT clave, valor FROM configuracion WHERE comercio_id = $1', [comercioId]),
    ]);

    if (comercioRes.rowCount === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const comercio = comercioRes.rows[0];
    // Convertir filas clave/valor a objeto plano
    const params = {};
    for (const row of configRes.rows) {
      params[row.clave] = row.valor;
    }

    res.json({ comercio, params });
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/configuracion — Guarda datos del comercio y parámetros (solo admin/dueño)
router.put('/', autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const {
    razon_social, cuit, domicilio, condicion_fiscal,
    punto_venta, email, telefono, leyenda_ticket,
    params = {},
  } = req.body;

  try {
    await db.transaction(async (client) => {
      // Actualizar datos del comercio
      await client.query(
        `UPDATE comercios SET
          razon_social = COALESCE($1, razon_social),
          cuit = COALESCE($2, cuit),
          domicilio = COALESCE($3, domicilio),
          condicion_fiscal = COALESCE($4, condicion_fiscal),
          punto_venta = COALESCE($5, punto_venta),
          email = COALESCE($6, email),
          telefono = COALESCE($7, telefono),
          leyenda_ticket = COALESCE($8, leyenda_ticket)
        WHERE id = $9`,
        [razon_social, cuit, domicilio, condicion_fiscal, punto_venta, email, telefono, leyenda_ticket, comercioId]
      );

      // Upsert de cada parámetro clave/valor
      for (const [clave, valor] of Object.entries(params)) {
        await client.query(
          `INSERT INTO configuracion (comercio_id, clave, valor)
           VALUES ($1, $2, $3)
           ON CONFLICT (comercio_id, clave)
           DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
          [comercioId, clave, valor != null ? String(valor) : null]
        );
      }
    });

    res.json({ mensaje: 'Configuración guardada con éxito' });
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    res.status(500).json({ error: 'Error al guardar configuración', detalle: error.message });
  }
});

module.exports = router;

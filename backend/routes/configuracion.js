const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { autorizarRoles } = require('../middleware/auth');

// GET /api/configuracion/comercio — Devuelve solo los datos del comercio
router.get('/comercio', async (req, res) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }
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
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }
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
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) {
    return res.status(401).json({ error: 'No autorizado: falta comercio_id' });
  }
  const {
    nombre, razon_social, cuit, domicilio, condicion_fiscal,
    punto_venta, email, telefono, leyenda_ticket,
    params = {},
  } = req.body;

  try {
    await db.transaction(async (client) => {
      // Actualizar datos del comercio
      await client.query(
        `UPDATE comercios SET
          nombre = COALESCE($1, nombre),
          razon_social = COALESCE($2, razon_social),
          cuit = COALESCE($3, cuit),
          domicilio = COALESCE($4, domicilio),
          condicion_fiscal = COALESCE($5, condicion_fiscal),
          punto_venta = COALESCE($6, punto_venta),
          email = COALESCE($7, email),
          telefono = COALESCE($8, telefono),
          leyenda_ticket = COALESCE($9, leyenda_ticket)
        WHERE id = $10`,
        [nombre, razon_social, cuit, domicilio, condicion_fiscal, punto_venta, email, telefono, leyenda_ticket, comercioId]
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

// GET /api/configuracion/permisos — Obtiene permisos por rol (M11)
router.get('/permisos', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  try {
    const result = await db.query(
      `SELECT rol, recurso, accion, activo
       FROM permisos_rol
       WHERE comercio_id = $1
       ORDER BY rol, recurso, accion`,
      [comercioId]
    );

    // Mapear los flags estándar por rol para la UI
    const flagsDefecto = {
      descuento: false,
      devolucion: false,
      ver_costos: false,
      cerrar_caja: false,
      cambiar_precios: false,
      crear_usuarios: false,
    };

    const roles = ['empleado', 'administrador', 'dueno'];
    const flagsPorRol = {};
    for (const r of roles) {
      flagsPorRol[r] = {
        ...flagsDefecto,
        ...(r === 'administrador' || r === 'dueno' ? {
          descuento: true,
          devolucion: true,
          ver_costos: true,
          cerrar_caja: true,
          cambiar_precios: true,
          crear_usuarios: true,
        } : {}),
      };
    }

    for (const row of result.rows) {
      if (flagsPorRol[row.rol] && row.recurso === 'flag' && row.accion in flagsDefecto) {
        flagsPorRol[row.rol][row.accion] = row.activo;
      }
    }

    res.json({
      permisos: result.rows,
      flagsPorRol,
    });
  } catch (error) { next(error); }
});

// PUT /api/configuracion/permisos — Actualiza permisos por rol (M11)
router.put('/permisos', autorizarRoles('administrador', 'dueno', 'superadmin'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  const { permisos = [], flagsPorRol = {} } = req.body;

  try {
    await db.transaction(async (client) => {
      // 1. Guardar lista explícita si se envía
      for (const p of permisos) {
        await client.query(
          `INSERT INTO permisos_rol (comercio_id, rol, recurso, accion, activo)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (comercio_id, rol, recurso, accion)
           DO UPDATE SET activo = EXCLUDED.activo`,
          [comercioId, p.rol, p.recurso, p.accion, p.activo !== false]
        );
      }

      // 2. Guardar flags por rol si se envían
      for (const [rol, flags] of Object.entries(flagsPorRol)) {
        for (const [flag, activo] of Object.entries(flags)) {
          await client.query(
            `INSERT INTO permisos_rol (comercio_id, rol, recurso, accion, activo)
             VALUES ($1, $2, 'flag', $3, $4)
             ON CONFLICT (comercio_id, rol, recurso, accion)
             DO UPDATE SET activo = EXCLUDED.activo`,
            [comercioId, rol, flag, Boolean(activo)]
          );
        }
      }
    });

    res.json({ mensaje: 'Permisos actualizados correctamente' });
  } catch (error) { next(error); }
});

// PUT /api/configuracion/catalogo — Guardar slug y visibilidad del catálogo público (M15)
router.put('/catalogo', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id;
  if (!comercioId) return res.status(401).json({ error: 'No autorizado' });

  const { slug_catalogo, catalogo_publico_habilitado } = req.body;

  try {
    // Sanitizar slug: solo letras minúsculas, números y guiones
    const slugLimpio = slug_catalogo
      ? String(slug_catalogo).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)
      : null;

    await db.query(
      `UPDATE comercios
       SET slug_catalogo                  = $1,
           catalogo_publico_habilitado    = $2
       WHERE id = $3`,
      [slugLimpio || null, !!catalogo_publico_habilitado, comercioId]
    );

    res.json({
      mensaje: 'Catálogo público actualizado',
      slug_catalogo: slugLimpio,
      catalogo_publico_habilitado: !!catalogo_publico_habilitado,
      url_publica: slugLimpio ? `/c/${slugLimpio}` : null,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ese slug ya está en uso por otro comercio. Elegí un nombre diferente.' });
    }
    next(error);
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const db = require('../db/conexion');
const { autorizarRoles } = require('../middleware/auth');

// ── GET /api/licencias — Obtiene la licencia activa del comercio ─────────
router.get('/', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      `SELECT l.*, c.nombre as comercio_nombre
       FROM licencias l
       JOIN comercios c ON c.id = l.comercio_id
       WHERE l.comercio_id = $1 AND l.activa = TRUE
       ORDER BY l.created_at DESC
       LIMIT 1`,
      [comercioId]
    );

    if (result.rowCount === 0) {
      return res.json({
        plan: 'sin_licencia',
        activa: false,
        mensaje: 'No hay licencia activa para este comercio',
      });
    }

    const lic = result.rows[0];
    const ahora = new Date();
    const vencida = lic.fecha_fin && new Date(lic.fecha_fin) < ahora;
    const diasRestantes = lic.fecha_fin
      ? Math.max(0, Math.ceil((new Date(lic.fecha_fin) - ahora) / (1000 * 60 * 60 * 24)))
      : null;

    res.json({
      ...lic,
      vencida,
      dias_restantes: diasRestantes,
      por_vencer: diasRestantes !== null && diasRestantes <= 15,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/licencias/todas — Historial de licencias (solo admin) ────────
router.get('/todas', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  try {
    const result = await db.query(
      `SELECT * FROM licencias WHERE comercio_id = $1 ORDER BY created_at DESC`,
      [comercioId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/licencias/activar — Activa con clave ────────────────────────
router.post('/activar', async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const { clave } = req.body;

  if (!clave) {
    return res.status(400).json({ error: 'Debe proporcionar una clave de activación' });
  }

  try {
    // Buscar la clave en licencias de cualquier comercio sin asignar
    const licResult = await db.query(
      `SELECT * FROM licencias WHERE clave_activacion = $1 AND (comercio_id IS NULL OR comercio_id = $2)`,
      [clave.trim().toUpperCase(), comercioId]
    );

    if (licResult.rowCount === 0) {
      return res.status(404).json({ error: 'Clave de activación inválida o ya fue utilizada' });
    }

    const lic = licResult.rows[0];
    const ahora = new Date();
    const vencida = lic.fecha_fin && new Date(lic.fecha_fin) < ahora;

    if (vencida) {
      return res.status(400).json({ error: 'Esta clave de activación ya ha vencido' });
    }

    // Desactivar licencias previas del comercio
    await db.query(
      'UPDATE licencias SET activa = FALSE WHERE comercio_id = $1 AND activa = TRUE',
      [comercioId]
    );

    // Activar la nueva
    await db.query(
      `UPDATE licencias SET activa = TRUE, comercio_id = $1 WHERE id = $2`,
      [comercioId, lic.id]
    );

    res.json({
      mensaje: `Licencia ${lic.plan.toUpperCase()} activada correctamente`,
      plan: lic.plan,
      fecha_fin: lic.fecha_fin,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/licencias — Crear nueva licencia (solo admin del sistema) ───
router.post('/', autorizarRoles('administrador'), async (req, res, next) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const {
    plan = 'basico',
    dias = 30,
    max_productos = 500,
    max_usuarios = 2,
    max_sucursales = 1,
    clave_activacion = null,
    notas = null,
    comercio_id_destino = null,
  } = req.body;

  const fechaFin = new Date();
  fechaFin.setDate(fechaFin.getDate() + parseInt(dias));

  try {
    const result = await db.query(
      `INSERT INTO licencias (comercio_id, plan, fecha_fin, activa, max_productos, max_usuarios, max_sucursales, clave_activacion, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        comercio_id_destino || comercioId,
        plan,
        fechaFin,
        true,
        max_productos,
        max_usuarios,
        max_sucursales,
        clave_activacion ? clave_activacion.trim().toUpperCase() : null,
        notas,
      ]
    );

    res.status(201).json({ mensaje: 'Licencia creada', licencia: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Esa clave de activación ya está en uso' });
    }
    next(error);
  }
});

// ── PUT /api/licencias/:id — Actualizar licencia (solo admin) ─────────────
router.put('/:id', autorizarRoles('administrador', 'dueno'), async (req, res, next) => {
  const { id } = req.params;
  const comercioId = req.usuario?.comercio_id || 1;
  const { plan, fecha_fin, activa, max_productos, max_usuarios, max_sucursales, notas } = req.body;

  try {
    const result = await db.query(
      `UPDATE licencias SET
        plan = COALESCE($1, plan),
        fecha_fin = COALESCE($2, fecha_fin),
        activa = COALESCE($3, activa),
        max_productos = COALESCE($4, max_productos),
        max_usuarios = COALESCE($5, max_usuarios),
        max_sucursales = COALESCE($6, max_sucursales),
        notas = COALESCE($7, notas)
       WHERE id = $8 AND comercio_id = $9
       RETURNING *`,
      [plan, fecha_fin, activa, max_productos, max_usuarios, max_sucursales, notas, id, comercioId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Licencia no encontrada' });
    }

    res.json({ mensaje: 'Licencia actualizada', licencia: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db/conexion');

// Helper
const primerDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const hoy = () => new Date().toISOString().slice(0, 10);

// GET /api/auditoria/mes — mes en curso (compatibilidad)
router.get('/mes', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const result = await db.query(
      `SELECT a.id, a.tipo_evento, a.descripcion, a.fecha, u.nombre_usuario as usuario
       FROM auditoria a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.comercio_id = $1
         AND EXTRACT(YEAR FROM a.fecha) = $2
         AND EXTRACT(MONTH FROM a.fecha) = $3
       ORDER BY a.fecha DESC`,
      [comercioId, year, month]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener auditoria del mes:', error);
    res.status(500).json({ error: 'Error al obtener auditoria del mes' });
  }
});

// GET /api/auditoria/rango?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Obtiene todos los eventos de auditoría en un rango de fechas.
router.get('/rango', async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const { desde = primerDiaMes(), hasta = hoy() } = req.query;

  try {
    const result = await db.query(
      `SELECT a.id, a.tipo_evento, a.descripcion, a.fecha, u.nombre_usuario as usuario
       FROM auditoria a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.comercio_id = $1
         AND DATE(a.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires') BETWEEN $2 AND $3
       ORDER BY a.fecha ASC`,
      [comercioId, desde, hasta]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener auditoria por rango:', error);
    res.status(500).json({ error: 'Error al obtener auditoria por rango' });
  }
});

module.exports = router;

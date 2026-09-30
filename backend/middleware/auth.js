const jwt = require('jsonwebtoken');
const db = require('../db/conexion');

if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET no está definido en las variables de entorno.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const normalizarRol = (rol) => {
  const valor = (rol || '').toString().trim().toLowerCase();
  if (valor === 'superadmin' || valor === 'super_admin' || valor === 'super') return 'superadmin';
  if (valor === 'dueno' || valor === 'dueño' || valor === 'owner') return 'dueno';
  if (valor === 'administrador' || valor === 'admin') return 'administrador';
  return 'empleado';
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-access-token'];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    try {
      const usuario = await db.get(
        `SELECT u.id, u.nombre_usuario, u.rol, u.comercio_id,
                c.suscripcion_activa AS comercio_suscripcion_activa,
                c.activo_hasta AS comercio_activo_hasta
           FROM usuarios u
           JOIN comercios c ON u.comercio_id = c.id
          WHERE u.id = ?`,
        [decoded.id]
      );

      if (!usuario) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      const rolNormalizado = normalizarRol(usuario.rol);
      const suscripcionActiva = usuario.comercio_suscripcion_activa !== 0 && usuario.comercio_suscripcion_activa !== false;

      // Comparar solo la parte de fecha (YYYY-MM-DD) para evitar problemas de timezone.
      // Si activo_hasta es "2026-07-08", el acceso es válido DURANTE todo ese día.
      // Vence recién cuando hoy supera esa fecha (es decir, desde el día siguiente).
      const activoHastaStr = usuario.comercio_activo_hasta
        ? new Date(usuario.comercio_activo_hasta).toISOString().slice(0, 10)
        : null;
      const hoyStr = new Date().toISOString().slice(0, 10);
      const vencida = activoHastaStr && activoHastaStr < hoyStr;

      if (!suscripcionActiva || vencida) {
        return res.status(403).json({ error: 'La suscripción del comercio está inactiva o vencida' });
      }

      req.usuario = {
        id: usuario.id,
        nombre_usuario: usuario.nombre_usuario,
        rol: rolNormalizado,
        comercio_id: usuario.comercio_id,
      };

      next();
    } catch (dbErr) {
      console.error('Error authMiddleware:', dbErr);
      return res.status(500).json({ error: 'Error al validar usuario' });
    }
  });
};

const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
  const roles = rolesPermitidos.map((rol) => rol.toLowerCase());
  const rolUsuario = req.usuario?.rol?.toLowerCase();
  // Superadmin tiene acceso a todo
  if (rolUsuario === 'superadmin') return next();
  if (!req.usuario || !roles.includes(rolUsuario)) {
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  }
  next();
};

const checkPermiso = (recurso, accion) => async (req, res, next) => {
  const usuario = req.usuario;
  if (!usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const rol = (usuario.rol || '').toLowerCase();
  // Superadmin y dueno siempre tienen acceso total
  if (rol === 'superadmin' || rol === 'dueno') return next();

  try {
    const resPermiso = await db.query(
      `SELECT activo FROM permisos_rol
       WHERE comercio_id = $1 AND rol = $2 AND recurso = $3 AND accion = $4`,
      [usuario.comercio_id, rol, recurso, accion]
    );

    if (resPermiso.rowCount > 0) {
      if (resPermiso.rows[0].activo) return next();
      return res.status(403).json({ error: `Permiso denegado para ${recurso}:${accion}` });
    }

    // Administrador tiene acceso por defecto a menos que esté explícitamente en false
    if (rol === 'administrador') return next();

    // Empleado por defecto
    return res.status(403).json({ error: `Permiso denegado para ${recurso}:${accion}` });
  } catch (err) {
    console.error('Error al verificar permisos:', err);
    return res.status(500).json({ error: 'Error al verificar permisos' });
  }
};

module.exports = {
  authMiddleware,
  autorizarRoles,
  checkPermiso,
};

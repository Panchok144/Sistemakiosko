const errorHandler = (err, req, res, next) => {
  console.error('[Error Middleware]:', err);
  
  // Custom error from standard Postgres exceptions or manual throws
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';

  // Handle specific Postgres errors
  if (err.code === '23505') {
    message = 'Registro duplicado. Ya existe un elemento con esas características.';
  } else if (err.code === '23503') {
    message = 'Error de clave foránea. No se puede eliminar o modificar el registro porque está en uso.';
  }

  res.status(statusCode).json({
    error: message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;

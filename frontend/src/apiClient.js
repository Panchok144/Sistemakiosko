import axios from 'axios';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  timeout: 10000, // 10 seconds timeout
});

// Request interceptor to attach token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kiosko_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for centralized error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // BUG-08 FIX: Limpiar AMBAS claves de localStorage
        localStorage.removeItem('kiosko_token');
        localStorage.removeItem('kiosko_session');
        toast.error('Tu sesión ha expirado. Por favor, iniciá sesión nuevamente.', { duration: 4000 });
        setTimeout(() => { window.location.href = '/'; }, 2000);
      }
      // BUG-06 FIX: NO mostrar toast para errores de negocio (400, 409, 422, 500, etc.)
      // Esos errores son manejados por los componentes con Swal.fire() para evitar doble alerta.
    } else if (error.request) {
      // Error de red: sin respuesta del servidor
      toast.error('No se pudo conectar al servidor. Revisá tu conexión a internet.', { duration: 5000 });
    }

    return Promise.reject(error);
  }
);

export default apiClient;

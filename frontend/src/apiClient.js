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

// Response interceptor with exponential backoff for idempotent GETs (Cold start Neon / Network)
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const config = error.config;

    // Retry solo para peticiones GET o marcadas como idempotentes
    const isIdempotent = config && (config.method?.toLowerCase() === 'get' || config.idempotent);

    // Identificar fallos recuperables: sin respuesta de red o códigos 500/502/503/504 (cold start DB)
    const isNetworkOrColdStart =
      !error.response ||
      (error.response.status >= 500 && error.response.status <= 504);

    if (config && isIdempotent && isNetworkOrColdStart) {
      config.__retryCount = config.__retryCount || 0;
      const MAX_RETRIES = 3;

      if (config.__retryCount < MAX_RETRIES) {
        config.__retryCount += 1;
        const delayMs = 1000 * Math.pow(2, config.__retryCount - 1); // 1s, 2s, 4s

        // Esperar tiempo de backoff exponencial antes de reintentar
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return apiClient(config);
      } else {
        // Se agotaron los reintentos
        toast.error('El servidor está tardando en responder o no hay conexión tras 3 reintentos. Por favor, aguardá unos segundos.', {
          duration: 5000,
          id: 'server-retry-exhausted',
        });
      }
    }

    if (error.response) {
      if (error.response.status === 401) {
        // Sesión expirada
        localStorage.removeItem('kiosko_token');
        localStorage.removeItem('kiosko_session');
        toast.error('Tu sesión ha expirado. Por favor, iniciá sesión nuevamente.', { duration: 4000 });
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }
      // Errores de negocio (400, 403, 404, 409) son manejados por los componentes con Swal.fire()
    } else if (error.request && (!config || config.__retryCount === undefined || config.__retryCount >= 3)) {
      // Error de red no reintentable o reintentos completados
      toast.error('No se pudo conectar al servidor. Revisá tu conexión a internet.', {
        duration: 5000,
        id: 'network-error-toast',
      });
    }

    return Promise.reject(error);
  }
);

export default apiClient;

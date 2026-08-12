const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

// In Vite development, same-origin /api calls go through the dev proxy. This
// still uses the live API while avoiding browser CORS restrictions locally.
export const API_URL = import.meta.env.DEV ? '' : configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : '';

export const apiUrl = (path) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

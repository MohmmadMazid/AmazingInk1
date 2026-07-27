import axios from 'axios';

/** Axios instance pointed at the Express API (proxied by Vite in dev). Attaches the JWT and
 *  unwraps the { success, data, meta } envelope so callers get plain data. */
export const client = axios.create({ 
  // baseURL: '/api' ,
  baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,

});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mccms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Returns response.data.data; use rawResponse for paginated meta.
export const unwrap = (p) => p.then((r) => r.data.data);
export const rawResponse = (p) => p.then((r) => r.data); // { success, data, meta }

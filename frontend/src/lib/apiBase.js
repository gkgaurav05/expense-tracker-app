export function getApiBaseUrl(env = process.env) {
  const backendUrl = env.REACT_APP_BACKEND_URL;
  return backendUrl ? `${backendUrl}/api` : '/api';
}

import { getApiBaseUrl } from './apiBase';

describe('getApiBaseUrl', () => {
  it('falls back to /api when REACT_APP_BACKEND_URL is missing', () => {
    expect(getApiBaseUrl({})).toBe('/api');
  });

  it('uses the configured backend url when provided', () => {
    expect(getApiBaseUrl({ REACT_APP_BACKEND_URL: 'http://localhost:8001' })).toBe('http://localhost:8001/api');
  });
});


const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  '';

export async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
  return json;
}

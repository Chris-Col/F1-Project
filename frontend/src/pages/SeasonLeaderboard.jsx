import React, { useEffect, useState } from 'react';

/* Small, safe JSON fetcher.
   If your API runs on another origin in dev, set:
   VITE_API_BASE=http://localhost:5000  (Vite)
   or REACT_APP_API_BASE=http://localhost:5000 (CRA)
*/
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  ((typeof process !== 'undefined' && process.env?.REACT_APP_API_BASE) ? process.env.REACT_APP_API_BASE : '') ||
  '';


async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();            // read raw text first (better errors)
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(json?.error || `${res.status} ${res.statusText}`);
  return json;
}

export default function SeasonLeaderboard({ defaultYear = 2025 }) {
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');

    apiFetch(`/api/leaderboard/season/${year}`)
      .then((j) => {
        if (!alive) return;
        setRows(Array.isArray(j.leaderboard) ? j.leaderboard : []);
      })
      .catch((e) => alive && setErr(e.message || 'Failed to load leaderboard'))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [year]);

  return (
    <div className="container py-5 text-white">
      <h2 className="mb-3">Season Leaderboard</h2>

      <div className="mb-3">
        <label className="me-2">Season:</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          <option value={2025}>2025</option>
          <option value={2024}>2024</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {err && <p className="text-danger">{err}</p>}

      {!loading && !err && (
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId || i}>
                  <td>{i + 1}</td>
                  <td>{r.username}</td>
                  <td>{r.total}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3}>No entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

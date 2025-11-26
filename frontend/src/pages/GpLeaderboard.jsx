// src/pages/GpLeaderboard.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCachedRace } from '../utils/raceCache';

export default function GpLeaderboard() {
  const { gpId: paramGpId } = useParams();
  const navigate = useNavigate();

  const cached = getCachedRace(); // { id, name }
  const gpId = paramGpId === 'current' ? (cached ? cached.id : undefined) : paramGpId;
  const raceName = paramGpId === 'current' ? (cached ? cached.name : undefined) : undefined;

  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gpId) {
      // No cached GP and route asked for /current -> send user to start
      navigate('/start-prediction', { replace: true });
      return;
    }

    let alive = true;
    setLoading(true);
    setErr('');

    fetch(`/api/leaderboard/gp/${gpId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j && j.error ? j.error : 'Failed to load leaderboard');
        setRows(Array.isArray(j.leaderboard) ? j.leaderboard : []);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.message || 'Failed to load leaderboard');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [gpId, navigate]);

  return (
    <div className="container py-5 text-white">
      <h2 className="mb-3">
        {raceName ? `${raceName} - GP Leaderboard` : 'Grand Prix Leaderboard'}
      </h2>

      {loading && <p>Loading...</p>}
      {err && <p className="text-danger">{err}</p>}

      {!loading && !err && (
        <div className="table-responsive">
          <table className="table table-dark table-striped align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.userId || 'u'}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{r.username}</td>
                  <td>{r.score}</td>
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

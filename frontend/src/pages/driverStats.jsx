import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import logger from '../utils/logger.js';
import '../styles.css';

/**
 * Driver statistics dashboard (2025 season)
 * Now uses pre-cached backend data to avoid API rate limits
 */

export default function DriverStats() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    const loadDriverStats = async () => {
      try {
        logger.info('Fetching cached driver stats...');

        const data = await apiFetch('/api/stats/drivers');

        if (data.stats) {
          setDrivers(data.stats);
          setMetadata(data.metadata);
          logger.info('Driver stats loaded from cache', { driverCount: data.stats.length });
        } else {
          throw new Error('Invalid data format');
        }
      } catch (e) {
        logger.error('Failed to load driver stats', { error: e.message });
        setError(e);
      } finally {
        setLoading(false);
      }
    };

    loadDriverStats();
  }, []);

  if (loading) return <div className="text-white text-center">Loading driver stats…</div>;
  if (error) return <div className="text-white text-center">Error: {error.message}</div>;

  return (
    <div className="main-content">
      {metadata && (
        <div className="text-gray-400 text-sm text-center mb-4">
          Data from {metadata.finishedRaces} races • Last updated: {new Date(metadata.generatedAt).toLocaleDateString()}
        </div>
      )}

      <div className="driver-stats-grid">
        {drivers.map(d => (
          <div key={d.id} className="driver-card">
            <img src={d.img} alt={d.name} className="driver-img" />
            <h3>{d.name}</h3>
            <p><strong>Nationality:</strong> {d.nationality}</p>
            <p><strong>WDC Position:</strong> {d.wdcPosition}</p>
            <p><strong>Avg Finish:</strong> {d.avgFinish}</p>
            <p><strong>Avg Qualifying:</strong> {d.avgQual}</p>
            <p><strong>Avg Sprint Finish:</strong> {d.avgSprint}</p>
            <p><strong>Total Points:</strong> {d.points}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

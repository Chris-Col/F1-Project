import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import logger from '../utils/logger.js';
import '../styles.css';

/**
 * Teammate Head-to-Head Comparison Page
 * Now uses pre-cached backend data to avoid API rate limits
 */

export default function TeammateH2H() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    const loadH2HData = async () => {
      try {
        logger.info('Fetching cached teammate H2H data...');

        const data = await apiFetch('/api/stats/h2h');

        if (data.teams) {
          setTeams(data.teams);
          setMetadata(data.metadata);
          logger.info('Teammate H2H data loaded from cache', { teamCount: data.teams.length });
        } else {
          throw new Error('Invalid data format');
        }
      } catch (e) {
        logger.error('Failed to load teammate H2H', { error: e.message });
        setError(e);
      } finally {
        setLoading(false);
      }
    };

    loadH2HData();
  }, []);

  if (loading) {
    return (
      <div className="main-content">
        <div className="text-white text-center">
          <p>Loading teammate comparisons…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="main-content text-white text-center">Error: {error.message}</div>;
  }

  return (
    <div className="main-content">
      <div className="h2h-header">
        <h1>Teammate Head-to-Head</h1>
        {metadata && (
          <div className="text-gray-400 text-sm">
            Data from {metadata.finishedRaces} races • Updated: {new Date(metadata.generatedAt).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="h2h-grid">
        {teams.map(team => (
          <div key={team.teamId} className="h2h-card" style={{ borderColor: `#${team.teamColor}` }}>
            <div className="h2h-team-header" style={{ backgroundColor: `#${team.teamColor}22` }}>
              <h2>{team.teamName}</h2>
            </div>

            <div className="h2h-drivers">
              {/* Driver 1 */}
              <div className="h2h-driver">
                <img
                  src={`/imgs/${team.driver1.lastName.toLowerCase()}.avif`}
                  alt={team.driver1.name}
                  className="h2h-driver-img"
                  onError={e => { e.target.src = '/imgs/default.avif'; }}
                />
                <h3>{team.driver1.name}</h3>
                <p className="h2h-points">{team.driver1.points} pts</p>
              </div>

              {/* VS */}
              <div className="h2h-vs">VS</div>

              {/* Driver 2 */}
              <div className="h2h-driver">
                <img
                  src={`/imgs/${team.driver2.lastName.toLowerCase()}.avif`}
                  alt={team.driver2.name}
                  className="h2h-driver-img"
                  onError={e => { e.target.src = '/imgs/default.avif'; }}
                />
                <h3>{team.driver2.name}</h3>
                <p className="h2h-points">{team.driver2.points} pts</p>
              </div>
            </div>

            {/* Stats */}
            <div className="h2h-stats">
              <div className="h2h-stat-row">
                <span className={team.driver1.raceWins > team.driver2.raceWins ? 'h2h-winner' : ''}>
                  {team.driver1.raceWins}
                </span>
                <span className="h2h-stat-label">Race H2H</span>
                <span className={team.driver2.raceWins > team.driver1.raceWins ? 'h2h-winner' : ''}>
                  {team.driver2.raceWins}
                </span>
              </div>

              <div className="h2h-stat-row">
                <span className={team.driver1.qualiWins > team.driver2.qualiWins ? 'h2h-winner' : ''}>
                  {team.driver1.qualiWins}
                </span>
                <span className="h2h-stat-label">Quali H2H</span>
                <span className={team.driver2.qualiWins > team.driver1.qualiWins ? 'h2h-winner' : ''}>
                  {team.driver2.qualiWins}
                </span>
              </div>

              <div className="h2h-stat-row">
                <span>{team.driver1.dnfs}</span>
                <span className="h2h-stat-label">DNFs</span>
                <span>{team.driver2.dnfs}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

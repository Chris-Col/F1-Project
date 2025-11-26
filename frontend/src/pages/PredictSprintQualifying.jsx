import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCachedRace } from '../utils/raceCache';
import { predictionApi } from '../api/predictionApi';
import PodiumPicker from '../components/PodiumPicker';

export default function PredictSprintQualifying() {
  const nav = useNavigate();
  const race = getCachedRace(); // { id, name, endDate }
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (!race || !race.id) nav('/start-prediction', { replace: true });
  }, [race, nav]);

  const handleDone = async (picks) => {
    if (!race || !race.id) return;
    const sprintQualiTop3 = [picks.first, picks.second, picks.third];
    if (new Set(sprintQualiTop3).size !== 3 || sprintQualiTop3.some(x => !x)) {
      setError('Please choose three distinct drivers.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      sessionStorage.setItem(`sprintQuali:${race.id}`, JSON.stringify(sprintQualiTop3));
    } catch {}

    try {
      await predictionApi.upsert({
        gpId: race.id,
        seasonYear: new Date(race.endDate).getUTCFullYear() || 2025,
        picks: { sprintQualiTop3 },
      });
      nav('/predict-sprint-race');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to save prediction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {error && <div className="alert alert-danger text-center">{error}</div>}
      <PodiumPicker
        title={race ? `${race.name} – Sprint Qualifying Prediction` : 'Loading race…'}
        onComplete={handleDone}
        nextLabel={saving ? 'Saving…' : 'Next: Sprint Race Prediction'}
      />
    </div>
  );
}

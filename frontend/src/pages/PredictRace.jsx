import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCachedRace } from '../utils/raceCache';
import { predictionApi } from '../api/predictionApi';
import PodiumPicker from '../components/PodiumPicker';

export default function PredictRace() {
  const nav = useNavigate();
  const race = getCachedRace();
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (!race || !race.id) nav('/start-prediction', { replace: true });
  }, [race, nav]);

  const handleDone = async (picks) => {
    if (!race || !race.id) return;
    const raceTop3 = [picks.first, picks.second, picks.third];
    if (new Set(raceTop3).size !== 3 || raceTop3.some(x => !x)) {
      setError('Please choose three distinct drivers.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      sessionStorage.setItem(`race:${race.id}`, JSON.stringify(raceTop3));
    } catch {}

    try {
      await predictionApi.upsert({
        gpId: race.id,
        seasonYear: new Date(race.endDate).getUTCFullYear() || 2025,
        picks: { raceTop3 },
      });
      nav('/thank-you');
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
        title={race ? `${race.name} – Grand Prix Race Prediction` : 'Loading race…'}
        onComplete={handleDone}
        nextLabel={saving ? 'Saving…' : 'Submit Final Predictions'}
      />
    </div>
  );
}

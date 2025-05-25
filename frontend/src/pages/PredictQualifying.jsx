import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const drivers = [
  { name: 'verstappen', team: 'redbull' },
  { name: 'tsunoda', team: 'redbull' },
  { name: 'leclerc', team: 'ferrari' },
  { name: 'hamilton', team: 'ferrari' },
  { name: 'norris', team: 'mclaren' },
  { name: 'piastri', team: 'mclaren' },
  { name: 'russell', team: 'mercedes' },
  { name: 'antonelli', team: 'mercedes' },
  { name: 'albon', team: 'williams' },
  { name: 'sainz', team: 'williams' },
  { name: 'lawson', team: 'racingbulls' },
  { name: 'hadjar', team: 'racingbulls' },
  { name: 'gasly', team: 'alpine' },
  { name: 'colapinto', team: 'alpine' },
  { name: 'ocon', team: 'haas' },
  { name: 'bearman', team: 'haas' },
  { name: 'alonso', team: 'astonmartin' },
  { name: 'stroll', team: 'astonmartin' },
  { name: 'hulkenberg', team: 'sauber' },
  { name: 'bortoleto', team: 'sauber' },
];

export default function PredictQualifying() {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [picks, setPicks] = useState({ first: '', second: '', third: '' });
  const navigate = useNavigate();

  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
  };

  const handleDriverSelect = (driver) => {
    if (!selectedSlot) return;

    const alreadyPicked = Object.values(picks).includes(driver.name);
    if (alreadyPicked) return;

    setPicks((prev) => ({
      ...prev,
      [selectedSlot]: driver.name,
    }));

    setSelectedSlot(null);
  };

  const handleNext = () => {
    console.log('Qualifying prediction:', picks);
    navigate('/predict-race');
  };

  return (
    <div className="container-fluid px-5 text-white" style={{ paddingTop: '80px' }}>
      <h2 className="text-center mb-4">Qualifying Prediction</h2>

      {/* Podium selection */}
      <div className="d-flex justify-content-center gap-4 mb-5">
        {['first', 'second', 'third'].map((slot, i) => (
          <div
            key={slot}
            className={`podium-slot ${selectedSlot === slot ? 'selected' : ''}`}
            onClick={() => handleSlotClick(slot)}
          >
            <strong>{i + 1}st</strong>
            <div className="mt-2">
              {picks[slot] ? (
                <img src={`/imgs/${picks[slot]}.avif`} alt={picks[slot]} className="driver-icon" />
              ) : (
                'Click to choose'
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Driver Grid */}
      <div className="driver-grid">
        {drivers.map((driver) => (
          <div
            key={driver.name}
            className={`driver-card-grid ${Object.values(picks).includes(driver.name) ? 'disabled' : ''}`}
            onClick={() => handleDriverSelect(driver)}
          >
            <img src={`/imgs/${driver.name}.avif`} alt={driver.name} className="driver-photo-grid" />
            <div className="d-flex align-items-center justify-content-center gap-1 mt-1">
              <span className="driver-name-grid">
                {driver.name.charAt(0).toUpperCase() + driver.name.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Continue button */}
      {picks.first && picks.second && picks.third && (
        <div className="text-center mt-5">
          <button className="btn btn-f1" onClick={handleNext}>
            Next: Race Prediction
          </button>
        </div>
      )}
    </div>
  );
}

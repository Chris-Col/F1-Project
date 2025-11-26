import { useState } from 'react';
import { drivers } from '../utils/driverList';

const suffix = ['st', 'nd', 'rd'];

export default function PodiumPicker({ title, onComplete, nextLabel }) {
  const [selected, setSelected] = useState(null);
  const [picks, setPicks]       = useState({ first: '', second: '', third: '' });

  const handleSlot = slot => setSelected(slot);

  const handleDriver = d => {
    if (!selected) return;
    if (Object.values(picks).includes(d.name)) return;
    setPicks(prev => ({ ...prev, [selected]: d.name }));
    setSelected(null);
  };

  return (
    <div className="container-fluid px-5 text-white" style={{ paddingTop: '80px' }}>
      <h2 className="text-center mb-4">{title}</h2>

      <div className="d-flex justify-content-center gap-4 mb-5">
        {['first', 'second', 'third'].map((slot, i) => (
          <div
            key={slot}
            className={`podium-slot ${selected === slot ? 'selected' : ''}`}
            onClick={() => handleSlot(slot)}
          >
            <strong>{i + 1}{suffix[i]}</strong>
            <div className="mt-2">
              {picks[slot]
                ? <img src={`/imgs/${picks[slot]}.avif`} alt={picks[slot]} className="driver-icon" />
                : 'Click to choose'}
            </div>
          </div>
        ))}
      </div>

      <div className="driver-grid">
        {drivers.map(d => (
          <div
            key={d.name}
            className={`driver-card-grid ${Object.values(picks).includes(d.name) ? 'disabled' : ''}`}
            onClick={() => handleDriver(d)}
          >
            <img src={`/imgs/${d.name}.avif`} alt={d.name} className="driver-photo-grid" />
            <div className="d-flex align-items-center justify-content-center gap-1 mt-1">
              <span className="driver-name-grid">
                {d.name.charAt(0).toUpperCase() + d.name.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {picks.first && picks.second && picks.third && (
        <div className="text-center mt-5">
          <button className="btn btn-f1" onClick={() => onComplete(picks)}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}

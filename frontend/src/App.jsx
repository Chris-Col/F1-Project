import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Predict from './pages/PredictQualifying';
import PredictRace from './pages/PredictRace'; // ✅ Add this line

import './App.css';

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route
          path="/"
          element={
            <div className="main-content text-center">
              <h1>Welcome to F1 Predictor</h1>
              <p>Make predictions, view race data, and compete with others.</p>
            </div>
          }
        />
        <Route path="/predict" element={<Predict />} />
        <Route path="/predict-race" element={<PredictRace />} /> {/* ✅ Add this route */}
      </Routes>
    </>
  );
}

export default App;

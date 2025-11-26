// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar                   from './components/Navbar';
import PredictionGate           from './pages/PredictionGate';
import PredictQualifying        from './pages/PredictQualifying';
import PredictSprintQualifying  from './pages/PredictSprintQualifying';
import PredictSprintRace        from './pages/PredictSprintRace';
import PredictRace              from './pages/PredictRace';
import ThankYou                 from './pages/ThankYou';
import Register                 from './pages/Register';
import Login                    from './pages/Login';
import DriverStatsPage          from './pages/driverStats';
import SeasonLeaderboard        from './pages/SeasonLeaderboard';
import GpLeaderboard            from './pages/GpLeaderboard';
import PrivateRoute             from './components/PrivateRoute';

import './App.css';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Public pages -------------------------------------------------- */}
        <Route
          path="/"
          element={
            <div className="main-content text-center">
              <h1>Welcome to F1 Predictor</h1>
              <p>Make predictions, view race data, and compete with others.</p>
            </div>
          }
        />
        <Route path="/register"      element={<Register />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/driver-stats"  element={<DriverStatsPage />} />

        {/* Leaderboards (public) ---------------------------------------- */}
        <Route path="/leaderboard"                 element={<SeasonLeaderboard />} />
        {/* Convenience route that uses the cached GP in the component */}
        <Route path="/leaderboard/gp/current"      element={<GpLeaderboard />} />
        <Route path="/leaderboard/gp/:gpId"        element={<GpLeaderboard />} />

        {/* Protected prediction flow ------------------------------------ */}
        <Route
          path="/start-prediction"
          element={<PrivateRoute><PredictionGate /></PrivateRoute>}
        />

        {/* Sprint weekend */}
        <Route
          path="/predict-sprint-qualifying"
          element={<PrivateRoute><PredictSprintQualifying /></PrivateRoute>}
        />
        <Route
          path="/predict-sprint-race"
          element={<PrivateRoute><PredictSprintRace /></PrivateRoute>}
        />

        {/* Non-sprint (or post-sprint) flow */}
        <Route
          path="/predict-qualifying"
          element={<PrivateRoute><PredictQualifying /></PrivateRoute>}
        />
        <Route
          path="/predict-race"
          element={<PrivateRoute><PredictRace /></PrivateRoute>}
        />

        {/* Backward-compat redirect (old link -> new route) ------------- */}
        <Route path="/predict" element={<Navigate to="/predict-qualifying" replace />} />

        {/* Final confirmation ------------------------------------------- */}
        <Route
          path="/thank-you"
          element={<PrivateRoute><ThankYou /></PrivateRoute>}
        />

        {/* Optional: catch-all 404 -------------------------------------- */}
        {/* <Route path="*" element={<div className="text-center text-white py-5">Page not found</div>} /> */}
      </Routes>
    </>
  );
}

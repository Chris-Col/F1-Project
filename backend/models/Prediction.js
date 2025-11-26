// models/Prediction.js
import mongoose from 'mongoose';

const PicksSchema = new mongoose.Schema({
  sprintQualiTop3: { type: [String], default: [] }, // driver slugs (e.g., "norris")
  sprintRaceTop3:  { type: [String], default: [] },
  qualiTop3:       { type: [String], default: [] },
  raceTop3:        { type: [String], default: [] }
}, { _id: false });

const ScoreSchema = new mongoose.Schema({
  sprintQuali: { type: Number, default: 0 },
  sprintRace:  { type: Number, default: 0 },
  quali:       { type: Number, default: 0 },
  race:        { type: Number, default: 0 },
  total:       { type: Number, default: 0 }
}, { _id: false });

const PredictionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gpId:     { type: String, required: true },     // Hyprace GP id
  seasonYear: { type: Number, required: true },
  picks:    { type: PicksSchema, default: () => ({}) },
  lockedAt: { type: Date },                       // when the weekend starts (server-enforced)
  score:    { type: ScoreSchema, default: () => ({}) }
}, { timestamps: true });

PredictionSchema.index({ userId: 1, seasonYear: 1, gpId: 1 }, { unique: true });

export default mongoose.model('Prediction', PredictionSchema);

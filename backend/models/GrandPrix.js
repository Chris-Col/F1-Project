// models/GrandPrix.js
import mongoose from 'mongoose';
const SessionSchema = new mongoose.Schema({
  type: String,          // 'FirstPractice' | 'Qualifying' | 'SprintRace' | 'MainRace' ...
  startDate: Date,
  endDate: Date
}, { _id: false });

const GrandPrixSchema = new mongoose.Schema({
  hypraceId: { type: String, required: true },      // GP id from Hyprace
  seasonYear: { type: Number, required: true },
  name: { type: String, required: true },
  sprintFlag: { type: Boolean, default: false },
  weekendStart: { type: Date, required: true },     // FP1 start
  weekendEnd:   { type: Date, required: true },     // Main race end (or start+3h)
  sessions: [SessionSchema]
}, { timestamps: true });

GrandPrixSchema.index({ seasonYear: 1, hypraceId: 1 }, { unique: true });

export default mongoose.model('GrandPrix', GrandPrixSchema);

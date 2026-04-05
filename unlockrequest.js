const mongoose = require("mongoose");
 
// When admin unlocks a missed date for a teacher to re-mark
const UnlockRequestSchema = new mongoose.Schema({
  subject:    { type: String, required: true },  // which subject teacher
  section:    { type: String, required: true },  // which section
  date:       { type: Date,   required: true },  // which missed date
  unlockedBy: { type: String, default: "admin" },
  unlockedAt: { type: Date,   default: Date.now },
  used:       { type: Boolean, default: false }, // true once teacher re-marks
  usedAt:     { type: Date }
});
 
module.exports = mongoose.model("UnlockRequest", UnlockRequestSchema);
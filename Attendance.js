const mongoose = require("mongoose");
 
const AttendanceSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  subject:     { type: String, required: true },
  date:        { type: Date,   required: true },
  section:     { type: String },
 
  // ✅ "Present" / "Absent" = teacher marked
  // ✅ "NotMarked" = teacher forgot — does NOT affect student %
  status:    { type: String, enum: ["Present", "Absent", "NotMarked"], required: true },
  updatedAt: { type: Date, default: Date.now },
 
  // true = auto-filled by system (teacher forgot), false = teacher marked
  autoMarked: { type: Boolean, default: false }
});
 
module.exports = mongoose.model("Attendance", AttendanceSchema);
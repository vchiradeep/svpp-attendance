const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  subject:     { type: String, required: true },
  date:        { type: Date,   required: true },
  section:     { type: String },

  // ✅ Status values:
  // "Present"   = teacher marked present        → counts in %
  // "Absent"    = teacher marked absent         → counts in %
  // "NotMarked" = teacher forgot                → does NOT count in %
  // "OnLeave"   = leave approved by teacher/admin → does NOT count as absent
  status: {
    type: String,
    enum: ["Present", "Absent", "NotMarked", "OnLeave"],
    required: true
  },

  updatedAt:  { type: Date,    default: Date.now },
  autoMarked: { type: Boolean, default: false }
});

module.exports = mongoose.model("Attendance", AttendanceSchema);
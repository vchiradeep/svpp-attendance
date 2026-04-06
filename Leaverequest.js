const mongoose = require("mongoose");

const LeaveRequestSchema = new mongoose.Schema({
  studentName: { type: String, required: true },   // roll number
  section:     { type: String, required: true },
  date:        { type: Date,   required: true },
  reason:      { type: String, required: true },
  subject:     { type: String },                   // optional: specific subject
  status:      { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  reviewedBy:  { type: String },                   // teacher subject or "admin"
  reviewedAt:  { type: Date },
  remarks:     { type: String },                   // teacher's note on approval/rejection
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("LeaveRequest", LeaveRequestSchema);
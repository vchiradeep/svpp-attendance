const mongoose = require("mongoose");

// Tracks every change made to attendance — who changed, when, what
const AuditLogSchema = new mongoose.Schema({
  action:      { type: String, required: true },  // "MARKED", "EDITED", "DELETED", "AUTO_MARKED", "ADMIN_MARKED", "LEAVE_APPROVED"
  performedBy: { type: String, required: true },  // "teacher:BEEE", "admin", "system"
  studentName: { type: String },
  subject:     { type: String },
  section:     { type: String },
  date:        { type: Date },
  oldStatus:   { type: String },                  // what it was before
  newStatus:   { type: String },                  // what it changed to
  ipAddress:   { type: String },
  timestamp:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);
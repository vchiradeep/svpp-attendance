const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
  action:      { type: String, required: true },  // "MARKED", "EDITED", "DELETED", "LEAVE_REQUESTED", etc.
  performedBy: { type: String, required: true },  // "teacher:PHY", "student:25G01A0501", "admin", "system"
  studentName: { type: String },                  // roll number (null for system actions)
  subject:     { type: String },                  // subject name (null for non-attendance actions)
  section:     { type: String },                  // section name
  date:        { type: Date },                    // attendance date
  oldStatus:   { type: String },                  // previous status
  newStatus:   { type: String },                  // new status
  ipAddress:   { type: String, default: "unknown" },
  timestamp:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);

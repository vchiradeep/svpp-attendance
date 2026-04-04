const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    studentName: String,
    status: String,
    subject: String,
    section: String,
    date: Date,
    updatedAt: Date   // ✅ ADD THIS
});

module.exports = mongoose.model("Attendance", attendanceSchema);
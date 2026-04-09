const mongoose = require("mongoose");

const LeaveRequestSchema = new mongoose.Schema({
  studentName:     { type:String, required:true },   // roll number
  section:         { type:String, required:true },
  date:            { type:Date,   required:true },
  reason:          { type:String, required:true },
  subject:         { type:String, default:null },     // null = full day (admin reviews); set = teacher reviews
  leaveLetterText: { type:String, default:null },     // auto-generated formal leave letter
  status:          { type:String, enum:["Pending","Approved","Rejected"], default:"Pending" },
  reviewedBy:      { type:String },
  reviewedAt:      { type:Date },
  remarks:         { type:String },
  createdAt:       { type:Date, default:Date.now }
});

module.exports = mongoose.model("LeaveRequest", LeaveRequestSchema);
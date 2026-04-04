const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  name: String,
  subject: String
});

module.exports = mongoose.model("Teacher", TeacherSchema);
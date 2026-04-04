const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(bodyParser.json());

// SERVE FRONTEND
app.use(express.static(path.join(__dirname, "public")));

// CONNECT DB
mongoose.connect("mongodb+srv://vchiru1122_db_user:Chiradeep1122@attendance-cluster.iakzknl.mongodb.net/attendanceDB?retryWrites=true&w=majority")
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log(err));

// MODELS
const Attendance = require("./models/Attendance");
const Teacher = require("./models/teacher");

// ================= ATTENDANCE =================

// SAVE
app.post("/submit-attendance", async (req, res) => {

  const { date, subject, data, section } = req.body;

  // 🔥 ALL STUDENTS LIST (you can change roll numbers)
  const students = ["101","102","103","104","105"];

  try {

for(let student of students){

  // ❌ skip if not marked
  if(!data[student]) continue;

  let status = data[student];

  await Attendance.findOneAndUpdate(
   { studentName: student, subject, date: new Date(date) },
    {
      studentName: student,
      subject,
       date: new Date(date),   // ✅ FIX HERE
      section,
      status,
      updatedAt: new Date()
    },
    { upsert: true }
  );
}

    res.json({ success: true });

  } catch(err){
    console.log(err);
    res.json({ success: false });
  }

});

// GET
app.get("/attendance", async (req, res) => {
  try {
    const { studentName } = req.query;

    let filter = {};
    if(studentName) filter.studentName = studentName;

    const data = await Attendance.find(filter).sort({ date: -1 });
    res.json(data);

  } catch(err){
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE
app.post("/delete", async (req, res) => {
  const { studentName, date, subject } = req.body;

  await Attendance.deleteOne({ studentName, date, subject });

  res.send({ message: "Deleted" });
});
app.post("/delete-all", async (req, res) => {
  await Attendance.deleteMany({});
  res.send({ message: "All records deleted" });
});

// ================= TEACHERS =================

// GET ALL
app.get("/teachers", async (req, res) => {
    const teachers = await Teacher.find();
    res.json(teachers);
});

// ADD
app.post("/addTeacher", async (req, res) => {
    const { name, subject } = req.body;

    const newTeacher = new Teacher({ name, subject });
    await newTeacher.save();

    res.json({ success:true });
});

// DELETE
app.post("/deleteTeacher", async (req, res) => {
    const { id } = req.body;

    await Teacher.findByIdAndDelete(id);
    res.json({ success: true });
});

// START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running");
});
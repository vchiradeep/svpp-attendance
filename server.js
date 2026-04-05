const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
 
const app = express();
app.use(cors());
app.use(bodyParser.json());
 
// ✅ Case-insensitive static file middleware for Render
app.use((req, res, next) => {
  const publicDir = path.join(__dirname, "public");
  const requestedPath = req.path;
  if (requestedPath.includes(".")) {
    const fileName = path.basename(requestedPath);
    try {
      const files = fs.readdirSync(publicDir);
      const matchedFile = files.find(f => f.toLowerCase() === fileName.toLowerCase());
      if (matchedFile && matchedFile !== fileName) return res.redirect(301, "/" + matchedFile);
    } catch (e) {}
  }
  next();
});
 
app.use(express.static(path.join(__dirname, "public")));
 
// CONNECT DB
mongoose.connect("mongodb+srv://vchiru1122_db_user:Chiradeep1122@attendance-cluster.iakzknl.mongodb.net/attendanceDB?retryWrites=true&w=majority")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));
 
// ===================== MODELS =====================
const Attendance    = require("./models/Attendance");
const Teacher       = require("./models/teacher");
const UnlockRequest = require("./models/UnlockRequest");
 
// ===================== TIMETABLE =====================
const timetable = {
  Monday:    ["BEEE","BEEE","EG LAB","EG LAB","DS LAB","DS LAB","DS LAB"],
  Tuesday:   ["DS","BEEE","EEE LAB","EEE LAB","PHY","PHY LAB","PHY LAB"],
  Wednesday: ["DS","DEVC","PHY","BEEE","BEEE","DEVC","DS"],
  Thursday:  ["DEVC","BEEE","DS","BEEE","IT WORKSHOP","IT WORKSHOP","IT WORKSHOP"],
  Friday:    ["DEVC","EG LAB","EG LAB","EG LAB","PHY","DEVC","DS"]
};
 
const sections = {
  "CSE - A":  { prefix: "25G01A05", start: 1,  end: 75  },
  "CSE - B":  { prefix: "25G01A05", start: 76, end: 120 },
  "A.I - A":  { prefix: "25G01A43", start: 1,  end: 75  },
  "A.I - B":  { prefix: "25G01A43", start: 76, end: 120 },
  "AIML - A": { prefix: "25G01A42", start: 1,  end: 75  },
  "AIML - B": { prefix: "25G01A42", start: 76, end: 120 },
  "CIVIL":    { prefix: "25G01A01", start: 2,  end: 9   },
  "D.S":      { prefix: "25G01A32", start: 1,  end: 41  },
  "ECE - A":  { prefix: "25G01A04", start: 1,  end: 75  },
  "ECE - B":  { prefix: "25G01A04", start: 76, end: 120 },
  "ECE - C":  { prefix: "25G01A02", start: 1,  end: 19  },
  "ECE - D":  { prefix: "25G01A03", start: 1,  end: 12  },
};
 
function getStudentsForSection(section) {
  const s = sections[section];
  if (!s) return [];
  let list = [];
  for (let i = s.start; i <= s.end; i++) list.push(s.prefix + String(i).padStart(2, "0"));
  return list;
}
 
function getISTDate(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setDate(ist.getDate() + offsetDays);
  ist.setHours(0, 0, 0, 0);
  return ist;
}
 
function getDayName(date) {
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][date.getDay()];
}
 
function dateRange(date) {
  return {
    $gte: new Date(date.getTime()),
    $lt:  new Date(date.getTime() + 24 * 60 * 60 * 1000)
  };
}
 
// ===================== AUTO-MARK JOB =====================
// Runs at midnight IST — marks missed periods as "NotMarked" (teacher's fault)
// Does NOT affect student attendance %
async function autoMarkNotMarked() {
  try {
    const yesterday = getISTDate(-1);
    const dayName   = getDayName(yesterday);
 
    console.log(`\n🕐 Auto-mark: ${dayName} ${yesterday.toDateString()}`);
 
    if (dayName === "Saturday" || dayName === "Sunday") {
      console.log("⏭ Weekend — skipping"); return;
    }
 
    const subjectsToday = timetable[dayName];
    if (!subjectsToday) return;
 
    const uniqueSubjects = [...new Set(subjectsToday)];
    let count = 0;
 
    for (const [sectionName] of Object.entries(sections)) {
      const students = getStudentsForSection(sectionName);
 
      for (const subject of uniqueSubjects) {
 
        // Check if teacher marked anyone in this section+subject+date
        const teacherMarked = await Attendance.findOne({
          subject, section: sectionName, autoMarked: false,
          date: dateRange(yesterday)
        });
 
        if (teacherMarked) continue; // Teacher did their job ✅
 
        // Teacher forgot — mark all students as NotMarked
        for (const studentRoll of students) {
          const existing = await Attendance.findOne({
            studentName: studentRoll, subject, date: dateRange(yesterday)
          });
 
          if (!existing) {
            await Attendance.create({
              studentName: studentRoll, subject,
              date: yesterday, section: sectionName,
              status: "NotMarked", updatedAt: new Date(), autoMarked: true
            });
            count++;
          }
        }
      }
    }
 
    console.log(`✅ Auto-mark done — ${count} NotMarked records created`);
  } catch (err) {
    console.error("❌ Auto-mark error:", err);
  }
}
 
// Runs at 12:01 AM IST = 18:31 UTC
cron.schedule("31 18 * * *", () => { autoMarkNotMarked(); });
 
// ===================== TEACHER ALERT ROUTES =====================
 
// ✅ Teacher checks if they missed marking yesterday
// Returns list of missed subjects so frontend can show alert
app.get("/teacher/missed/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const yesterday   = getISTDate(-1);
    const dayName     = getDayName(yesterday);
 
    // Weekend — no missed
    if (dayName === "Saturday" || dayName === "Sunday") {
      return res.json({ success: true, missed: false });
    }
 
    // Check if this subject was scheduled yesterday
    const subjectsYesterday = timetable[dayName] || [];
    if (!subjectsYesterday.includes(subject)) {
      return res.json({ success: true, missed: false });
    }
 
    // Check if teacher marked it
    const marked = await Attendance.findOne({
      subject, autoMarked: false, date: dateRange(yesterday)
    });
 
    if (marked) {
      return res.json({ success: true, missed: false });
    }
 
    // Teacher missed it — check if admin already unlocked it
    const unlocked = await UnlockRequest.findOne({
      subject, date: dateRange(yesterday), used: false
    });
 
    return res.json({
      success:   true,
      missed:    true,
      date:      yesterday,
      dayName:   dayName,
      subject:   subject,
      unlocked:  !!unlocked,   // true = admin gave permission to re-mark
      unlockId:  unlocked?._id
    });
 
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ✅ Check all missed dates for a subject (teacher sees full history)
app.get("/teacher/all-missed/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
 
    // Find all NotMarked records for this subject grouped by date
    const notMarked = await Attendance.find({ subject, status: "NotMarked", autoMarked: true });
 
    // Get unique dates
    const dateSet = {};
    notMarked.forEach(r => {
      const d = new Date(r.date).toDateString();
      if (!dateSet[d]) dateSet[d] = { date: r.date, section: r.section };
    });
 
    // For each missed date, check if unlock exists
    const result = [];
    for (const [_, info] of Object.entries(dateSet)) {
      const unlock = await UnlockRequest.findOne({
        subject, date: dateRange(new Date(info.date))
      });
      result.push({
        date:     info.date,
        section:  info.section,
        unlocked: !!unlock && !unlock.used,
        used:     unlock?.used || false
      });
    }
 
    result.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, missedDates: result });
 
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ===================== ADMIN UNLOCK ROUTES =====================
 
// ✅ Admin unlocks a specific date+subject+section for teacher to re-mark
app.post("/admin/unlock", async (req, res) => {
  try {
    const { subject, section, date } = req.body;
 
    if (!subject || !section || !date) {
      return res.json({ success: false, message: "subject, section and date are required" });
    }
 
    const targetDate = new Date(date);
 
    // Check if already unlocked
    const existing = await UnlockRequest.findOne({
      subject, section, date: dateRange(targetDate)
    });
 
    if (existing) {
      if (!existing.used) {
        return res.json({ success: false, message: "Already unlocked — teacher hasn't marked yet" });
      }
      // Already used — allow re-unlock
      existing.used = false;
      existing.unlockedAt = new Date();
      await existing.save();
      return res.json({ success: true, message: "Re-unlocked successfully" });
    }
 
    await UnlockRequest.create({ subject, section, date: targetDate });
    res.json({ success: true, message: `Unlocked ${subject} for ${section} on ${new Date(date).toLocaleDateString()}` });
 
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ✅ Admin sees all missed marking dates (to decide who to unlock)
app.get("/admin/missed-summary", async (req, res) => {
  try {
    const notMarked = await Attendance.find({ status: "NotMarked", autoMarked: true });
 
    // Group by subject + date
    const grouped = {};
    notMarked.forEach(r => {
      const key = `${r.subject}__${new Date(r.date).toDateString()}__${r.section}`;
      if (!grouped[key]) {
        grouped[key] = {
          subject: r.subject, section: r.section,
          date: r.date, count: 0
        };
      }
      grouped[key].count++;
    });
 
    // Check unlock status for each
    const result = [];
    for (const [_, info] of Object.entries(grouped)) {
      const unlock = await UnlockRequest.findOne({
        subject: info.subject, section: info.section,
        date: dateRange(new Date(info.date))
      });
      result.push({
        ...info,
        unlocked: !!unlock && !unlock.used,
        used:     unlock?.used || false,
        unlockId: unlock?._id
      });
    }
 
    result.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, missed: result });
 
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ✅ Admin directly marks attendance for a missed date (if teacher still didn't)
app.post("/admin/mark-on-behalf", async (req, res) => {
  try {
    const { subject, section, date, data } = req.body;
    // data = { "roll1": "Present", "roll2": "Absent", ... }
 
    const targetDate = new Date(date);
 
    for (const [studentRoll, status] of Object.entries(data)) {
      await Attendance.findOneAndUpdate(
        { studentName: studentRoll, subject, date: dateRange(targetDate) },
        {
          studentName: studentRoll, subject,
          date: targetDate, section, status,
          updatedAt: new Date(), autoMarked: false
        },
        { upsert: true }
      );
    }
 
    res.json({ success: true, message: "Attendance marked by admin" });
 
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ===================== ATTENDANCE ROUTES =====================
 
// ✅ Submit attendance — also clears NotMarked if teacher is re-marking
app.post("/submit-attendance", async (req, res) => {
  const { date, subject, data, section, unlockId } = req.body;
 
  try {
    const targetDate = new Date(date);
 
    for (let student of Object.keys(data)) {
      if (!data[student]) continue;
 
      await Attendance.findOneAndUpdate(
        { studentName: student, subject, date: dateRange(targetDate) },
        {
          studentName: student, subject,
          date: targetDate, section,
          status: data[student],
          updatedAt: new Date(), autoMarked: false
        },
        { upsert: true }
      );
    }
 
    // ✅ If this was a re-mark via unlock — mark unlock as used
    if (unlockId) {
      await UnlockRequest.findByIdAndUpdate(unlockId, { used: true, usedAt: new Date() });
    }
 
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});
 
app.get("/attendance", async (req, res) => {
  try {
    const { studentName } = req.query;
    let filter = {};
    if (studentName) filter.studentName = studentName;
    const data = await Attendance.find(filter).sort({ date: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
 
app.post("/delete", async (req, res) => {
  const { studentName, date, subject } = req.body;
  await Attendance.deleteOne({ studentName, date, subject });
  res.send({ message: "Deleted" });
});
 
app.post("/delete-all", async (req, res) => {
  await Attendance.deleteMany({});
  res.send({ message: "All records deleted" });
});
 
// TEACHERS
app.get("/teachers", async (req, res) => {
  const teachers = await Teacher.find();
  res.json(teachers);
});
app.post("/addTeacher", async (req, res) => {
  const { name, subject } = req.body;
  await new Teacher({ name, subject }).save();
  res.json({ success: true });
});
app.post("/deleteTeacher", async (req, res) => {
  await Teacher.findByIdAndDelete(req.body.id);
  res.json({ success: true });
});
 
// Manual auto-mark trigger
app.post("/admin/auto-mark-absent", async (req, res) => {
  try {
    await autoMarkNotMarked();
    res.json({ success: true, message: "Auto-mark completed" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
 
const PORT = process.env.PORT || 3000;

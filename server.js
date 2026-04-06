const express    = require("express");
const mongoose   = require("mongoose");
const bodyParser = require("body-parser");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const cron       = require("node-cron");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Case-insensitive static file middleware
app.use((req, res, next) => {
  const publicDir = path.join(__dirname, "public");
  if (req.path.includes(".")) {
    const fileName = path.basename(req.path);
    try {
      const files = fs.readdirSync(publicDir);
      const match = files.find(f => f.toLowerCase() === fileName.toLowerCase());
      if (match && match !== fileName) return res.redirect(301, "/" + match);
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
const AuditLog      = require("./models/AuditLog");
const LeaveRequest  = require("./models/LeaveRequest");

// ===================== HELPERS =====================
const timetable = {
  Monday:    ["BEEE","BEEE","EG LAB","EG LAB","DS LAB","DS LAB","DS LAB"],
  Tuesday:   ["DS","BEEE","EEE LAB","EEE LAB","PHY","PHY LAB","PHY LAB"],
  Wednesday: ["DS","DEVC","PHY","BEEE","BEEE","DEVC","DS"],
  Thursday:  ["DEVC","BEEE","DS","BEEE","IT WORKSHOP","IT WORKSHOP","IT WORKSHOP"],
  Friday:    ["DEVC","EG LAB","EG LAB","EG LAB","PHY","DEVC","DS"]
};

const sections = {
  "CSE - A":  { prefix:"25G01A05", start:1,  end:75  },
  "CSE - B":  { prefix:"25G01A05", start:76, end:120 },
  "A.I - A":  { prefix:"25G01A43", start:1,  end:75  },
  "A.I - B":  { prefix:"25G01A43", start:76, end:120 },
  "AIML - A": { prefix:"25G01A42", start:1,  end:75  },
  "AIML - B": { prefix:"25G01A42", start:76, end:120 },
  "CIVIL":    { prefix:"25G01A01", start:2,  end:9   },
  "D.S":      { prefix:"25G01A32", start:1,  end:41  },
  "ECE - A":  { prefix:"25G01A04", start:1,  end:75  },
  "ECE - B":  { prefix:"25G01A04", start:76, end:120 },
  "ECE - C":  { prefix:"25G01A02", start:1,  end:19  },
  "ECE - D":  { prefix:"25G01A03", start:1,  end:12  },
};

function getStudentsForSection(section) {
  const s = sections[section];
  if (!s) return [];
  const list = [];
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
  return { $gte: new Date(date.getTime()), $lt: new Date(date.getTime() + 86400000) };
}

// ✅ Helper to write audit log
async function writeAudit({ action, performedBy, studentName, subject, section, date, oldStatus, newStatus, req }) {
  try {
    await AuditLog.create({
      action, performedBy, studentName, subject, section,
      date: date ? new Date(date) : undefined,
      oldStatus, newStatus,
      ipAddress: req ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress) : "system"
    });
  } catch (e) { console.error("Audit log error:", e); }
}

// ===================== AUTO-MARK JOB =====================
async function autoMarkNotMarked() {
  try {
    const yesterday = getISTDate(-1);
    const dayName   = getDayName(yesterday);
    if (dayName === "Saturday" || dayName === "Sunday") return;

    const subjectsToday = timetable[dayName];
    if (!subjectsToday) return;

    const uniqueSubjects = [...new Set(subjectsToday)];
    let count = 0;

    for (const [sectionName] of Object.entries(sections)) {
      const students = getStudentsForSection(sectionName);
      for (const subject of uniqueSubjects) {
        const teacherMarked = await Attendance.findOne({
          subject, section: sectionName, autoMarked: false, date: dateRange(yesterday)
        });
        if (teacherMarked) continue;

        for (const studentRoll of students) {
          const existing = await Attendance.findOne({ studentName: studentRoll, subject, date: dateRange(yesterday) });
          if (!existing) {
            await Attendance.create({ studentName:studentRoll, subject, date:yesterday, section:sectionName, status:"NotMarked", updatedAt:new Date(), autoMarked:true });
            count++;
          }
        }
      }
    }

    await writeAudit({ action:"AUTO_MARKED", performedBy:"system", subject:"ALL", section:"ALL", date:yesterday, newStatus:"NotMarked" });
    console.log(`✅ Auto-mark done — ${count} records`);
  } catch (err) { console.error("❌ Auto-mark error:", err); }
}

cron.schedule("31 18 * * *", () => autoMarkNotMarked());

// ===================== ATTENDANCE =====================

app.post("/submit-attendance", async (req, res) => {
  const { date, subject, data, section, unlockId } = req.body;
  const performedBy = req.headers["x-teacher-subject"] || "teacher:" + subject;
  try {
    for (const student of Object.keys(data)) {
      if (!data[student]) continue;
      const existing = await Attendance.findOne({ studentName:student, subject, date:dateRange(new Date(date)) });
      const oldStatus = existing?.status;

      await Attendance.findOneAndUpdate(
        { studentName:student, subject, date:new Date(date) },
        { studentName:student, subject, date:new Date(date), section, status:data[student], updatedAt:new Date(), autoMarked:false },
        { upsert:true }
      );

      // ✅ AUDIT LOG
      await writeAudit({ action: oldStatus ? "EDITED" : "MARKED", performedBy, studentName:student, subject, section, date, oldStatus, newStatus:data[student], req });
    }
    if (unlockId) await UnlockRequest.findByIdAndUpdate(unlockId, { used:true, usedAt:new Date() });
    res.json({ success:true });
  } catch (err) { console.log(err); res.json({ success:false }); }
});

app.get("/attendance", async (req, res) => {
  try {
    const { studentName } = req.query;
    const filter = studentName ? { studentName } : {};
    const data = await Attendance.find(filter).sort({ date:-1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error:"Server error" }); }
});

app.post("/delete", async (req, res) => {
  const { studentName, date, subject } = req.body;
  const existing = await Attendance.findOne({ studentName, date, subject });
  await Attendance.deleteOne({ studentName, date, subject });
  await writeAudit({ action:"DELETED", performedBy:"admin", studentName, subject, date, oldStatus:existing?.status, req });
  res.send({ message:"Deleted" });
});

app.post("/delete-all", async (req, res) => {
  await Attendance.deleteMany({});
  await writeAudit({ action:"DELETE_ALL", performedBy:"admin", req });
  res.send({ message:"All records deleted" });
});

// ===================== LEADERBOARD =====================

// 🏆 Student leaderboard — ranked by attendance %
app.get("/leaderboard/students", async (req, res) => {
  try {
    const all = await Attendance.find({ status: { $in: ["Present","Absent"] } });

    // Group by student
    const studentMap = {};
    all.forEach(r => {
      if (!studentMap[r.studentName]) studentMap[r.studentName] = { present:0, total:0, section:r.section };
      studentMap[r.studentName].total++;
      if (r.status === "Present") studentMap[r.studentName].present++;
    });

    const ranked = Object.entries(studentMap)
      .map(([roll, s]) => ({ roll, present:s.present, total:s.total, section:s.section, pct: s.total ? +((s.present/s.total)*100).toFixed(1) : 0 }))
      .sort((a, b) => b.pct - a.pct);

    res.json({ success:true, leaderboard: ranked });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// 🏆 Teacher leaderboard — ranked by performance score
app.get("/leaderboard/teachers", async (req, res) => {
  try {
    const subjects = ["PHY","BEEE","ECE","DS","DEVC","EG LAB","IT WORKSHOP"];
    const all      = await Attendance.find({});
    const result   = [];

    for (const subject of subjects) {
      const filtered  = all.filter(d => d.subject === subject);
      if (!filtered.length) continue;

      const dateMap  = {};
      let onTime = 0, late = 0, notMarked = 0;
      filtered.forEach(d => {
        const dk = new Date(d.date).toDateString();
        if (!dateMap[dk]) dateMap[dk] = { teacherMarked: !d.autoMarked };
        if (d.status === "NotMarked") notMarked++;
        if (!d.autoMarked && d.updatedAt) {
          const h = new Date(d.updatedAt).getHours();
          if (h <= 10) onTime++; else late++;
        }
      });

      const totalDays  = Object.keys(dateMap).length;
      const markedDays = Object.values(dateMap).filter(d => d.teacherMarked).length;
      const markingScore = (markedDays / totalDays) * 60;
      const totalActions = onTime + late;
      const punctualScore = totalActions > 0 ? (onTime / totalActions) * 30 : 30;
      const penalty = (notMarked / (totalDays || 1)) * 10;
      const score = Math.max(0, Math.min(100, markingScore + punctualScore - penalty)).toFixed(1);

      result.push({ subject, score:+score, markedDays, totalDays, onTime, late, notMarked });
    }

    result.sort((a, b) => b.score - a.score);
    res.json({ success:true, leaderboard: result });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ===================== ATTENDANCE TRENDS =====================

// 📈 Week-wise trends for a student
app.get("/trends/student/:roll", async (req, res) => {
  try {
    const { roll } = req.params;
    const data = await Attendance.find({ studentName:roll, status:{ $in:["Present","Absent"] } }).sort({ date:1 });

    // Group by week
    const weekMap = {};
    // Group by subject
    const subjectMap = {};
    // Group by day of week
    const dayMap = { Monday:{ p:0, t:0 }, Tuesday:{ p:0, t:0 }, Wednesday:{ p:0, t:0 }, Thursday:{ p:0, t:0 }, Friday:{ p:0, t:0 } };

    data.forEach(r => {
      const d   = new Date(r.date);
      const day = getDayName(d);

      // Week key: ISO week
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
      const weekKey = `${d.getFullYear()}-W${week}`;

      if (!weekMap[weekKey]) weekMap[weekKey] = { present:0, total:0, label:weekKey };
      weekMap[weekKey].total++;
      if (r.status === "Present") weekMap[weekKey].present++;

      // Subject map
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { present:0, total:0 };
      subjectMap[r.subject].total++;
      if (r.status === "Present") subjectMap[r.subject].present++;

      // Day map
      if (dayMap[day]) {
        dayMap[day].t++;
        if (r.status === "Present") dayMap[day].p++;
      }
    });

    const weekTrend = Object.values(weekMap).map(w => ({
      week: w.label, pct: w.total ? +((w.present/w.total)*100).toFixed(1) : 0, present:w.present, total:w.total
    }));

    const subjectTrend = Object.entries(subjectMap).map(([sub, s]) => ({
      subject: sub, pct: s.total ? +((s.present/s.total)*100).toFixed(1) : 0, present:s.present, total:s.total
    })).sort((a, b) => a.pct - b.pct); // weakest first

    const dayTrend = Object.entries(dayMap).map(([day, s]) => ({
      day, pct: s.t ? +((s.p/s.t)*100).toFixed(1) : 0
    }));

    res.json({ success:true, weekTrend, subjectTrend, dayTrend });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ===================== AUDIT LOG =====================

// Get audit log (admin only)
app.get("/audit-log", async (req, res) => {
  try {
    const { studentName, subject, limit = 100 } = req.query;
    const filter = {};
    if (studentName) filter.studentName = studentName;
    if (subject)     filter.subject = subject;
    const logs = await AuditLog.find(filter).sort({ timestamp:-1 }).limit(parseInt(limit));
    res.json({ success:true, logs });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ===================== LEAVE REQUESTS =====================

// Student submits leave request
app.post("/leave/request", async (req, res) => {
  try {
    const { studentName, section, date, reason, subject } = req.body;
    if (!studentName || !section || !date || !reason) {
      return res.json({ success:false, message:"All fields required" });
    }

    // Check if already requested for same date+subject
    const existing = await LeaveRequest.findOne({ studentName, date:new Date(date), subject:subject||null });
    if (existing) return res.json({ success:false, message:"Leave already requested for this date" });

    const lr = await LeaveRequest.create({ studentName, section, date:new Date(date), reason, subject });
    await writeAudit({ action:"LEAVE_REQUESTED", performedBy:"student:"+studentName, studentName, subject, section, date, newStatus:"Pending" });

    res.json({ success:true, message:"Leave request submitted", id:lr._id });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// Get leave requests for a student
app.get("/leave/student/:roll", async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ studentName:req.params.roll }).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// Teacher/admin gets all pending requests
app.get("/leave/pending", async (req, res) => {
  try {
    const { subject } = req.query;
    const filter = { status:"Pending" };
    if (subject) filter.subject = subject;
    const requests = await LeaveRequest.find(filter).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// Teacher/admin approves or rejects
app.post("/leave/review", async (req, res) => {
  try {
    const { id, status, reviewedBy, remarks } = req.body;
    if (!["Approved","Rejected"].includes(status)) return res.json({ success:false, message:"Invalid status" });

    const lr = await LeaveRequest.findByIdAndUpdate(id, { status, reviewedBy, remarks, reviewedAt:new Date() }, { new:true });
    if (!lr) return res.json({ success:false, message:"Request not found" });

    // If approved → mark attendance as "On Leave" for that date+student
    if (status === "Approved") {
      const subjects = lr.subject
        ? [lr.subject]
        : [...new Set(timetable[getDayName(lr.date)] || [])];

      for (const sub of subjects) {
        await Attendance.findOneAndUpdate(
          { studentName:lr.studentName, subject:sub, date:dateRange(lr.date) },
          { studentName:lr.studentName, subject:sub, date:lr.date, section:lr.section, status:"OnLeave", updatedAt:new Date(), autoMarked:false },
          { upsert:true }
        );
      }

      await writeAudit({ action:"LEAVE_APPROVED", performedBy:reviewedBy||"admin", studentName:lr.studentName, subject:lr.subject||"ALL", section:lr.section, date:lr.date, newStatus:"OnLeave" });
    }

    res.json({ success:true, message:`Leave ${status}` });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ===================== UNLOCK ROUTES =====================

app.post("/admin/unlock", async (req, res) => {
  try {
    const { subject, section, date } = req.body;
    if (!subject || !section || !date) return res.json({ success:false, message:"All fields required" });
    const targetDate = new Date(date);
    const existing = await UnlockRequest.findOne({ subject, section, date:dateRange(targetDate) });
    if (existing) {
      if (!existing.used) return res.json({ success:false, message:"Already unlocked — teacher hasn't marked yet" });
      existing.used = false; existing.unlockedAt = new Date(); await existing.save();
      return res.json({ success:true, message:"Re-unlocked successfully" });
    }
    await UnlockRequest.create({ subject, section, date:targetDate });
    await writeAudit({ action:"UNLOCK_GRANTED", performedBy:"admin", subject, section, date, req });
    res.json({ success:true, message:`Unlocked ${subject} for ${section} on ${new Date(date).toLocaleDateString()}` });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/teacher/missed/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const yesterday = getISTDate(-1);
    const dayName   = getDayName(yesterday);
    if (dayName === "Saturday" || dayName === "Sunday") return res.json({ success:true, missed:false });
    const subjectsYesterday = timetable[dayName] || [];
    if (!subjectsYesterday.includes(subject)) return res.json({ success:true, missed:false });
    const marked = await Attendance.findOne({ subject, autoMarked:false, date:dateRange(yesterday) });
    if (marked) return res.json({ success:true, missed:false });
    const unlocked = await UnlockRequest.findOne({ subject, date:dateRange(yesterday), used:false });
    res.json({ success:true, missed:true, date:yesterday, dayName, subject, unlocked:!!unlocked, unlockId:unlocked?._id });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/teacher/all-missed/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const notMarked = await Attendance.find({ subject, status:"NotMarked", autoMarked:true });
    const dateSet = {};
    notMarked.forEach(r => { const d = new Date(r.date).toDateString(); if (!dateSet[d]) dateSet[d] = { date:r.date, section:r.section }; });
    const result = [];
    for (const [_, info] of Object.entries(dateSet)) {
      const unlock = await UnlockRequest.findOne({ subject, date:dateRange(new Date(info.date)) });
      result.push({ date:info.date, section:info.section, unlocked:!!unlock&&!unlock.used, used:unlock?.used||false });
    }
    result.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success:true, missedDates:result });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/admin/missed-summary", async (req, res) => {
  try {
    const notMarked = await Attendance.find({ status:"NotMarked", autoMarked:true });
    const grouped = {};
    notMarked.forEach(r => {
      const key = `${r.subject}__${new Date(r.date).toDateString()}__${r.section}`;
      if (!grouped[key]) grouped[key] = { subject:r.subject, section:r.section, date:r.date, count:0 };
      grouped[key].count++;
    });
    const result = [];
    for (const [_, info] of Object.entries(grouped)) {
      const unlock = await UnlockRequest.findOne({ subject:info.subject, section:info.section, date:dateRange(new Date(info.date)) });
      result.push({ ...info, unlocked:!!unlock&&!unlock.used, used:unlock?.used||false });
    }
    result.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success:true, missed:result });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.post("/admin/mark-on-behalf", async (req, res) => {
  try {
    const { subject, section, date, data } = req.body;
    const targetDate = new Date(date);
    for (const [studentRoll, status] of Object.entries(data)) {
      await Attendance.findOneAndUpdate(
        { studentName:studentRoll, subject, date:dateRange(targetDate) },
        { studentName:studentRoll, subject, date:targetDate, section, status, updatedAt:new Date(), autoMarked:false },
        { upsert:true }
      );
      await writeAudit({ action:"ADMIN_MARKED", performedBy:"admin", studentName:studentRoll, subject, section, date, newStatus:status, req });
    }
    res.json({ success:true, message:"Attendance marked by admin" });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.post("/admin/auto-mark-absent", async (req, res) => {
  try { await autoMarkNotMarked(); res.json({ success:true, message:"Auto-mark completed" }); }
  catch (err) { res.json({ success:false, error:err.message }); }
});

// TEACHERS
app.get("/teachers",        async (req, res) => res.json(await Teacher.find()));
app.post("/addTeacher",     async (req, res) => { await new Teacher(req.body).save(); res.json({ success:true }); });
app.post("/deleteTeacher",  async (req, res) => { await Teacher.findByIdAndDelete(req.body.id); res.json({ success:true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
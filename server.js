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

// ✅ Case-insensitive static file middleware for Render
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
  .catch(err => console.log("❌ MongoDB connection error:", err));

// ===================== MODELS =====================
// ✅ Use mongoose.models to avoid OverwriteModelError on hot reload
const Attendance    = require("./models/Attendance");
const Teacher       = require("./models/teacher");
const UnlockRequest = require("./models/UnlockRequest");
const AuditLog      = require("./models/AuditLog");
const LeaveRequest  = require("./models/Leaverequest");

// Log all models loaded successfully
console.log("✅ Models loaded:", Object.keys(mongoose.models).join(", ") || "none yet (lazy load)");

// ===================== ROLL NUMBER GENERATOR =====================
const SERIES_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function seriesToIndex(ser) {
  if (/^[0-9]{2}$/.test(ser)) return parseInt(ser, 10);
  return 100 + SERIES_LETTERS.indexOf(ser[0]) * 10 + parseInt(ser[1], 10);
}
function indexToSeries(n) {
  if (n <= 99) return String(n).padStart(2, "0");
  const offset = n - 100;
  return SERIES_LETTERS[Math.floor(offset / 10)] + (offset % 10);
}
function generateSectionRolls(branch, startSer, endSer) {
  const rolls = [];
  for (let i = seriesToIndex(startSer); i <= seriesToIndex(endSer); i++)
    rolls.push("25G01A" + branch + indexToSeries(i));
  return rolls;
}
const sections = {
  "CSE - A":    { branch:"05", start:"01", end:"75" },
  "CSE - B":    { branch:"05", start:"76", end:"F0" },
  "CSE - C":    { branch:"05", start:"F1", end:"M5" },
  "CSE - D":    { branch:"05", start:"M6", end:"R9" },
  "A.I - A":    { branch:"43", start:"01", end:"75" },
  "A.I - B":    { branch:"43", start:"76", end:"F0" },
  "A.I - C":    { branch:"43", start:"F1", end:"I2" },
  "AIML - A":   { branch:"42", start:"01", end:"75" },
  "AIML - B":   { branch:"42", start:"76", end:"F0" },
  "AIML - C":   { branch:"42", start:"F1", end:"M0" },
  "D.S":        { branch:"32", start:"01", end:"41" },
  "ECE - A":    { branch:"04", start:"01", end:"75" },
  "ECE - B":    { branch:"04", start:"76", end:"B5" },
  "ECE - C":    { branch:"02", start:"01", end:"19" },
  "CIVIL":      { branch:"01", start:"02", end:"09" },
  "Mechanical": { branch:"03", start:"01", end:"12" },
};
function getStudentsForSection(section) {
  const s = sections[section];
  if (!s) return [];
  return generateSectionRolls(s.branch, s.start, s.end);
}

// ===================== TIMETABLE =====================
const timetable = {
  Monday:    ["BEEE","BEEE","EG LAB","EG LAB","DS LAB","DS LAB","DS LAB"],
  Tuesday:   ["DS","BEEE","EEE LAB","EEE LAB","PHY","PHY LAB","PHY LAB"],
  Wednesday: ["DS","DEVC","PHY","BEEE","BEEE","DEVC","DS"],
  Thursday:  ["DEVC","BEEE","DS","BEEE","IT WORKSHOP","IT WORKSHOP","IT WORKSHOP"],
  Friday:    ["DEVC","EG LAB","EG LAB","EG LAB","PHY","DEVC","DS"]
};

const subjectOwner = {
  "PHY":"PHY","PHY LAB":"PHY",
  "BEEE":"BEEE","EEE LAB":"BEEE",
  "DS":"DS","DS LAB":"DS",
  "EG LAB":"EG LAB",
  "IT WORKSHOP":"IT WORKSHOP",
  "DEVC":"DEVC"
};

function getISTDate(offsetDays=0){
  const now=new Date();
  const ist=new Date(now.getTime()+5.5*60*60*1000);
  ist.setDate(ist.getDate()+offsetDays);
  ist.setHours(0,0,0,0);
  return ist;
}
function getDayName(date){
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][date.getDay()];
}
function dateRange(date){
  return { $gte: new Date(date.getTime()), $lt: new Date(date.getTime()+86400000) };
}

// ===================== AUDIT LOG =====================
async function writeAudit({action,performedBy,studentName,subject,section,date,oldStatus,newStatus,req}){
  try {
    await AuditLog.create({
      action, performedBy, studentName, subject, section,
      date: date ? new Date(date) : undefined,
      oldStatus, newStatus,
      ipAddress: req ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress) : "system"
    });
  } catch(e) {
    console.error("Audit log error:", e.message);
  }
}

// ===================== AUTO-MARK JOB =====================
async function autoMarkNotMarked(){
  try{
    const yesterday=getISTDate(-1);
    const dayName=getDayName(yesterday);
    if(dayName==="Saturday"||dayName==="Sunday")return;
    const subjectsToday=timetable[dayName];
    if(!subjectsToday)return;
    const uniqueSubjects=[...new Set(subjectsToday)];
    let count=0;
    for(const[sectionName]of Object.entries(sections)){
      const students=getStudentsForSection(sectionName);
      for(const subject of uniqueSubjects){
        const teacherMarked=await Attendance.findOne({subject,section:sectionName,autoMarked:false,date:dateRange(yesterday)});
        if(teacherMarked)continue;
        for(const studentRoll of students){
          const existing=await Attendance.findOne({studentName:studentRoll,subject,date:dateRange(yesterday)});
          if(!existing){
            await Attendance.create({studentName:studentRoll,subject,date:yesterday,section:sectionName,status:"NotMarked",updatedAt:new Date(),autoMarked:true});
            count++;
          }
        }
      }
    }
    await writeAudit({action:"AUTO_MARKED",performedBy:"system",subject:"ALL",section:"ALL",date:yesterday,newStatus:"NotMarked"});
    console.log(`✅ Auto-mark done — ${count} records`);
  }catch(err){
    console.error("❌ Auto-mark error:",err);
  }
}
cron.schedule("31 18 * * *",()=>autoMarkNotMarked());

// ===================== ATTENDANCE ROUTES =====================

app.post("/submit-attendance", async (req, res) => {
  // ✅ Log entry point so Render logs show the route was reached
  console.log("📥 /submit-attendance called, body keys:", Object.keys(req.body || {}));

  try {
    const { date, subject, data, section, unlockId } = req.body;

    if (!date || !subject || !data || !section) {
      console.log("❌ Missing fields:", { date:!!date, subject:!!subject, data:!!data, section:!!section });
      return res.status(400).json({ success:false, message:"Missing required fields: date=" + date + " subject=" + subject + " section=" + section });
    }

    if (typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ success:false, message:"Invalid attendance data format" });
    }

    // Parse date safely — append time to avoid timezone issues
    const dateObj = new Date(date + "T00:00:00.000Z");
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success:false, message:"Invalid date: " + date });
    }

    const startOfDay = new Date(dateObj);
    const endOfDay   = new Date(dateObj.getTime() + 86400000);
    const performedBy = "teacher:" + subject;
    let markedCount = 0;

    const students = Object.keys(data);
    console.log(`📋 Marking ${students.length} students for ${subject} ${section} on ${date}`);

    for (const student of students) {
      if (!data[student]) continue;

      // ✅ FIXED: find first (range query safe for reads)
      const existing = await Attendance.findOne({
        studentName: student,
        subject:     subject,
        date:        { $gte: startOfDay, $lt: endOfDay }
      });

      const oldStatus = existing ? existing.status : null;

      if (existing) {
        // ✅ Update by _id — never use range query in update/upsert filter
        await Attendance.findByIdAndUpdate(existing._id, {
          status:     data[student],
          section:    section,
          updatedAt:  new Date(),
          autoMarked: false
        });
      } else {
        // ✅ Create with exact date value — no range operators
        await Attendance.create({
          studentName: student,
          subject:     subject,
          date:        startOfDay,
          section:     section,
          status:      data[student],
          updatedAt:   new Date(),
          autoMarked:  false
        });
      }

      await writeAudit({
        action:      oldStatus ? "EDITED" : "MARKED",
        performedBy: performedBy,
        studentName: student,
        subject:     subject,
        section:     section,
        date:        startOfDay,
        oldStatus:   oldStatus,
        newStatus:   data[student],
        req:         req
      });

      markedCount++;
    }

    if (unlockId) {
      await UnlockRequest.findByIdAndUpdate(unlockId, { used:true, usedAt:new Date() });
    }

    console.log(`✅ submit-attendance done: ${markedCount} records saved`);
    broadcastUpdate(); // ✅ instantly push to all connected student/admin pages
    return res.status(200).json({ success:true, markedCount:markedCount });

  } catch (err) {
    console.error("❌ submit-attendance CRASH:", err.message, err.stack);
    return res.status(500).json({ success:false, message:err.message || "Server error saving attendance" });
  }
});

app.get("/attendance", async (req, res) => {
  try {
    const { studentName } = req.query;
    const filter = studentName ? { studentName } : {};
    const data = await Attendance.find(filter).sort({ date:-1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error:"Server error" });
  }
});

app.post("/delete", async (req, res) => {
  try {
    const { studentName, date, subject } = req.body;
    const existing = await Attendance.findOne({ studentName, date, subject });
    await Attendance.deleteOne({ studentName, date, subject });
    await writeAudit({ action:"DELETED", performedBy:"admin", studentName, subject, date, oldStatus:existing?.status, req });
    res.json({ message:"Deleted" });
  } catch(err) {
    res.status(500).json({ error:err.message });
  }
});

app.post("/delete-all", async (req, res) => {
  try {
    await Attendance.deleteMany({});
    await writeAudit({ action:"DELETE_ALL", performedBy:"admin", req });
    res.json({ message:"All records deleted" });
  } catch(err) {
    res.status(500).json({ error:err.message });
  }
});

// ===================== LEADERBOARD =====================

app.get("/leaderboard/students", async (req, res) => {
  try {
    const all = await Attendance.find({ status:{ $in:["Present","Absent"] } });
    const studentMap = {};
    all.forEach(r => {
      if(!studentMap[r.studentName]) studentMap[r.studentName]={present:0,total:0,section:r.section};
      studentMap[r.studentName].total++;
      if(r.status==="Present") studentMap[r.studentName].present++;
    });
    const ranked = Object.entries(studentMap)
      .map(([roll,s])=>({roll,present:s.present,total:s.total,section:s.section,pct:s.total?+((s.present/s.total)*100).toFixed(1):0}))
      .sort((a,b)=>b.pct-a.pct);
    res.json({ success:true, leaderboard:ranked });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/leaderboard/teachers", async (req, res) => {
  try {
    const subjects=["PHY","BEEE","ECE","DS","DEVC","EG LAB","IT WORKSHOP"];
    const all=await Attendance.find({});
    const result=[];
    for(const subject of subjects){
      const filtered=all.filter(d=>d.subject===subject);
      if(!filtered.length)continue;
      const dateMap={};let onTime=0,late=0,notMarked=0;
      filtered.forEach(d=>{
        const dk=new Date(d.date).toDateString();
        if(!dateMap[dk])dateMap[dk]={teacherMarked:!d.autoMarked};
        if(d.status==="NotMarked")notMarked++;
        if(!d.autoMarked&&d.updatedAt){const h=new Date(d.updatedAt).getHours();if(h<=10)onTime++;else late++;}
      });
      const totalDays=Object.keys(dateMap).length;
      const markedDays=Object.values(dateMap).filter(d=>d.teacherMarked).length;
      const score=Math.max(0,Math.min(100,(markedDays/totalDays)*60+(onTime+late>0?(onTime/(onTime+late))*30:30)-(notMarked/(totalDays||1))*10)).toFixed(1);
      result.push({subject,score:+score,markedDays,totalDays,onTime,late,notMarked});
    }
    result.sort((a,b)=>b.score-a.score);
    res.json({success:true,leaderboard:result});
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ===================== TRENDS =====================
app.get("/trends/student/:roll", async (req, res) => {
  try {
    const data=await Attendance.find({studentName:req.params.roll,status:{$in:["Present","Absent"]}}).sort({date:1});
    const weekMap={},subjectMap={},dayMap={Monday:{p:0,t:0},Tuesday:{p:0,t:0},Wednesday:{p:0,t:0},Thursday:{p:0,t:0},Friday:{p:0,t:0}};
    data.forEach(r=>{
      const d=new Date(r.date);const day=getDayName(d);
      const soy=new Date(d.getFullYear(),0,1);
      const week=`${d.getFullYear()}-W${Math.ceil(((d-soy)/86400000+soy.getDay()+1)/7)}`;
      if(!weekMap[week])weekMap[week]={present:0,total:0,label:week};
      weekMap[week].total++;if(r.status==="Present")weekMap[week].present++;
      if(!subjectMap[r.subject])subjectMap[r.subject]={present:0,total:0};
      subjectMap[r.subject].total++;if(r.status==="Present")subjectMap[r.subject].present++;
      if(dayMap[day]){dayMap[day].t++;if(r.status==="Present")dayMap[day].p++;}
    });
    const weekTrend=Object.values(weekMap).map(w=>({week:w.label,pct:w.total?+((w.present/w.total)*100).toFixed(1):0,present:w.present,total:w.total}));
    const subjectTrend=Object.entries(subjectMap).map(([sub,s])=>({subject:sub,pct:s.total?+((s.present/s.total)*100).toFixed(1):0,present:s.present,total:s.total})).sort((a,b)=>a.pct-b.pct);
    const dayTrend=Object.entries(dayMap).map(([day,s])=>({day,pct:s.t?+((s.p/s.t)*100).toFixed(1):0}));
    res.json({success:true,weekTrend,subjectTrend,dayTrend});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

// ===================== AUDIT LOG =====================
app.get("/audit-log", async (req, res) => {
  try {
    const { studentName, subject, limit=100 } = req.query;
    const filter={};
    if(studentName) filter.studentName=studentName;
    if(subject)     filter.subject=subject;
    const logs=await AuditLog.find(filter).sort({timestamp:-1}).limit(parseInt(limit));
    res.json({success:true,logs});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

// ===================== LEAVE REQUESTS =====================

app.post("/leave/request", async (req, res) => {
  console.log("📥 /leave/request called");
  try {
    const { studentName, section, date, reason, subject, leaveLetterText } = req.body;

    if (!studentName || !section || !date || !reason)
      return res.status(400).json({ success:false, message:"All fields required" });

    const dateObj = new Date(date + "T00:00:00.000Z");
    if (isNaN(dateObj.getTime()))
      return res.status(400).json({ success:false, message:"Invalid date format" });

    const startOfDay = new Date(dateObj);
    const endOfDay   = new Date(dateObj.getTime() + 86400000);

    // ✅ FIXED: Read-only range query for duplicate check — no upsert
    const dupFilter = { studentName, date: { $gte:startOfDay, $lt:endOfDay } };
    if (subject) dupFilter.subject = subject;
    else         dupFilter.subject = null;

    const existing = await LeaveRequest.findOne(dupFilter);
    if (existing) return res.json({ success:false, message:"Leave already requested for this date and subject" });

    // ✅ Create with exact date — no range, no upsert
    const lr = await LeaveRequest.create({
      studentName,
      section,
      date:            startOfDay,
      reason,
      subject:         subject || null,
      leaveLetterText: leaveLetterText || null,
      status:          "Pending"
    });

    await writeAudit({ action:"LEAVE_REQUESTED", performedBy:"student:"+studentName, studentName, subject:subject||"FULL_DAY", section, date:startOfDay, newStatus:"Pending" });
    console.log("✅ Leave request created:", lr._id);
    return res.json({ success:true, message:"Leave request submitted successfully", id:lr._id });

  } catch (err) {
    console.error("❌ leave/request CRASH:", err.message);
    return res.status(500).json({ success:false, message:err.message || "Server error" });
  }
});

app.get("/leave/student/:roll", async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ studentName:req.params.roll }).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/leave/teacher/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const { status } = req.query;
    const filter = { subject };
    if (status && status !== "All") filter.status = status;
    const requests = await LeaveRequest.find(filter).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/leave/pending", async (req, res) => {
  try {
    const { subject, all } = req.query;
    let filter = {};
    if (all !== "true") filter.status = "Pending";
    if (subject) filter.subject = subject;
    const requests = await LeaveRequest.find(filter).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.get("/leave/admin/pending", async (req, res) => {
  try {
    const { all } = req.query;
    const filter = { subject:null };
    if (all !== "true") filter.status = "Pending";
    const requests = await LeaveRequest.find(filter).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

app.post("/leave/review", async (req, res) => {
  try {
    const { id, status, reviewedBy, remarks } = req.body;
    if (!["Approved","Rejected"].includes(status))
      return res.json({ success:false, message:"Invalid status" });

    const lr = await LeaveRequest.findByIdAndUpdate(
      id, { status, reviewedBy, remarks, reviewedAt:new Date() }, { new:true }
    );
    if (!lr) return res.json({ success:false, message:"Request not found" });

    if (status === "Approved") {
      const leaveDate  = new Date(lr.date);
      const startOfDay = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate());
      const endOfDay   = new Date(startOfDay.getTime() + 86400000);

      const subjects = lr.subject
        ? [lr.subject]
        : [...new Set(timetable[getDayName(leaveDate)] || [])];

      for (const sub of subjects) {
        // ✅ FIXED: find first, then update by _id OR create — no range in upsert
        const existingAtt = await Attendance.findOne({
          studentName: lr.studentName,
          subject:     sub,
          date:        { $gte:startOfDay, $lt:endOfDay }
        });

        if (existingAtt) {
          await Attendance.findByIdAndUpdate(existingAtt._id, {
            status:     "OnLeave",
            section:    lr.section,
            updatedAt:  new Date(),
            autoMarked: false
          });
        } else {
          await Attendance.create({
            studentName: lr.studentName,
            subject:     sub,
            date:        startOfDay,
            section:     lr.section,
            status:      "OnLeave",
            updatedAt:   new Date(),
            autoMarked:  false
          });
        }
      }
      await writeAudit({ action:"LEAVE_APPROVED", performedBy:reviewedBy||"admin", studentName:lr.studentName, subject:lr.subject||"ALL", section:lr.section, date:startOfDay, newStatus:"OnLeave" });
      broadcastUpdate();
    }

    return res.json({ success:true, message:`Leave ${status} successfully` });
  } catch (err) {
    console.error("❌ leave/review CRASH:", err.message);
    return res.status(500).json({ success:false, message:err.message || "Server error reviewing leave" });
  }
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
      existing.used=false; existing.unlockedAt=new Date(); await existing.save();
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
    const yesterday=getISTDate(-1);
    const dayName=getDayName(yesterday);
    if(dayName==="Saturday"||dayName==="Sunday") return res.json({success:true,missed:false});
    const subjectsYesterday=timetable[dayName]||[];
    if(!subjectsYesterday.includes(subject)) return res.json({success:true,missed:false});
    const marked=await Attendance.findOne({subject,autoMarked:false,date:dateRange(yesterday)});
    if(marked) return res.json({success:true,missed:false});
    const unlocked=await UnlockRequest.findOne({subject,date:dateRange(yesterday),used:false});
    res.json({success:true,missed:true,date:yesterday,dayName,subject,unlocked:!!unlocked,unlockId:unlocked?._id});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

app.get("/teacher/all-missed/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const notMarked=await Attendance.find({subject,status:"NotMarked",autoMarked:true});
    const dateSet={};
    notMarked.forEach(r=>{const d=new Date(r.date).toDateString();if(!dateSet[d])dateSet[d]={date:r.date,section:r.section};});
    const result=[];
    for(const[,info]of Object.entries(dateSet)){
      const unlock=await UnlockRequest.findOne({subject,date:dateRange(new Date(info.date))});
      result.push({date:info.date,section:info.section,unlocked:!!unlock&&!unlock.used,used:unlock?.used||false});
    }
    result.sort((a,b)=>new Date(b.date)-new Date(a.date));
    res.json({success:true,missedDates:result});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

app.get("/admin/missed-summary", async (req, res) => {
  try {
    const notMarked=await Attendance.find({status:"NotMarked",autoMarked:true});
    const grouped={};
    notMarked.forEach(r=>{
      const key=`${r.subject}__${new Date(r.date).toDateString()}__${r.section}`;
      if(!grouped[key])grouped[key]={subject:r.subject,section:r.section,date:r.date,count:0};
      grouped[key].count++;
    });
    const result=[];
    for(const[,info]of Object.entries(grouped)){
      const unlock=await UnlockRequest.findOne({subject:info.subject,section:info.section,date:dateRange(new Date(info.date))});
      result.push({...info,unlocked:!!unlock&&!unlock.used,used:unlock?.used||false});
    }
    result.sort((a,b)=>new Date(b.date)-new Date(a.date));
    res.json({success:true,missed:result});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

app.post("/admin/mark-on-behalf", async (req, res) => {
  try {
    const { subject, section, date, data } = req.body;
    const targetDate = new Date(date + "T00:00:00.000Z");
    for(const [studentRoll, status] of Object.entries(data)){
      const existing = await Attendance.findOne({ studentName:studentRoll, subject, date:dateRange(targetDate) });
      if (existing) {
        await Attendance.findByIdAndUpdate(existing._id, { status, section, updatedAt:new Date(), autoMarked:false });
      } else {
        await Attendance.create({ studentName:studentRoll, subject, date:targetDate, section, status, updatedAt:new Date(), autoMarked:false });
      }
      await writeAudit({action:"ADMIN_MARKED",performedBy:"admin",studentName:studentRoll,subject,section,date,newStatus:status,req});
    }
    broadcastUpdate();
    res.json({success:true,message:"Attendance marked by admin"});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

app.post("/admin/auto-mark-absent", async (req, res) => {
  try { await autoMarkNotMarked(); res.json({success:true,message:"Auto-mark completed"}); }
  catch(err){ res.json({success:false,error:err.message}); }
});

// ===================== SSE REAL-TIME UPDATES =====================
// ✅ Store all connected clients so we can broadcast instantly
const sseClients = new Set();

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type":                "text/event-stream",
    "Cache-Control":               "no-cache",
    "Connection":                  "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write("data: :heartbeat\n\n"); } catch(e){}
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    try { res.end(); } catch(e){}
  });

  res.write(`data: {"type":"connected"}\n\n`);
});

// ✅ Broadcast to all SSE clients — called after attendance is submitted
function broadcastUpdate() {
  const msg = `data: {"type":"attendance_update","ts":${Date.now()}}\n\n`;
  for(const client of sseClients) {
    try { client.write(msg); } catch(e){ sseClients.delete(client); }
  }
  console.log(`📡 Broadcast sent to ${sseClients.size} client(s)`);
}

// TEACHERS
app.get("/teachers",       async (req,res)=>res.json(await Teacher.find()));
app.post("/addTeacher",    async (req,res)=>{ await new Teacher(req.body).save(); res.json({success:true}); });
app.post("/deleteTeacher", async (req,res)=>{ await Teacher.findByIdAndDelete(req.body.id); res.json({success:true}); });

// ===================== GLOBAL ERROR HANDLER =====================
// ✅ Catches any unhandled errors and always returns JSON (never empty response)
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).json({ success:false, message: err.message || "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
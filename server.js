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
  .catch(err => console.log(err));

// ===================== MODELS =====================
const Attendance    = require("./models/Attendance");
const Teacher       = require("./models/teacher");
const UnlockRequest = require("./models/UnlockRequest");
const AuditLog      = require("./models/AuditLog");
const LeaveRequest  = require("./models/Leaverequest");

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

// Subject → which main teacher is responsible
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
function getDayName(date){return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][date.getDay()];}
function dateRange(date){return{$gte:new Date(date.getTime()),$lt:new Date(date.getTime()+86400000)};}

// ===================== AUDIT LOG =====================
async function writeAudit({action,performedBy,studentName,subject,section,date,oldStatus,newStatus,req}){
  try{
    await AuditLog.create({
      action,performedBy,studentName,subject,section,
      date:date?new Date(date):undefined,
      oldStatus,newStatus,
      ipAddress:req?(req.headers["x-forwarded-for"]||req.socket.remoteAddress):"system"
    });
  }catch(e){console.error("Audit log error:",e);}
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
  }catch(err){console.error("❌ Auto-mark error:",err);}
}
cron.schedule("31 18 * * *",()=>autoMarkNotMarked());

// ===================== ATTENDANCE ROUTES =====================

app.post("/submit-attendance", async (req, res) => {
  try {
    const { date, subject, data, section, unlockId } = req.body;

    // ✅ Validate all required fields upfront
    if (!date || !subject || !data || !section) {
      return res.status(400).json({ success:false, message:"Missing required fields" });
    }

    // ✅ Parse date safely
    const dateObj = new Date(date + "T00:00:00.000Z");
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success:false, message:"Invalid date: " + date });
    }

    const startOfDay = new Date(dateObj);
    const endOfDay   = new Date(dateObj.getTime() + 86400000);
    const performedBy = "teacher:" + subject;
    let markedCount = 0;

    for (const student of Object.keys(data)) {
      if (!data[student]) continue;
      const existing = await Attendance.findOne({ studentName:student, subject, date:{ $gte:startOfDay, $lt:endOfDay } });
      const oldStatus = existing?.status;
      await Attendance.findOneAndUpdate(
        { studentName:student, subject, date:{ $gte:startOfDay, $lt:endOfDay } },
        { studentName:student, subject, date:startOfDay, section, status:data[student], updatedAt:new Date(), autoMarked:false },
        { upsert:true, new:true }
      );
      await writeAudit({ action:oldStatus?"EDITED":"MARKED", performedBy, studentName:student, subject, section, date:startOfDay, oldStatus, newStatus:data[student], req });
      markedCount++;
    }

    if (unlockId) await UnlockRequest.findByIdAndUpdate(unlockId, { used:true, usedAt:new Date() });
    console.log(`✅ Submitted: ${markedCount} records for ${subject} ${section} on ${date}`);
    res.json({ success:true, markedCount });

  } catch (err) {
    console.error("❌ submit-attendance error:", err.message);
    res.status(500).json({ success:false, message:err.message || "Server error saving attendance" });
  }
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

// Student submits leave request
// subject = specific subject (goes to teacher) | null = full day (goes to admin)
app.post("/leave/request", async (req, res) => {
  try {
    const { studentName, section, date, reason, subject, leaveLetterText } = req.body;

    if (!studentName || !section || !date || !reason)
      return res.json({ success:false, message:"All fields required (studentName, section, date, reason)" });

    // Parse date safely
    const dateObj = new Date(date + "T00:00:00.000Z");
    if (isNaN(dateObj.getTime()))
      return res.json({ success:false, message:"Invalid date format" });

    // Check duplicate
    const startOfDay = new Date(dateObj);
    const endOfDay   = new Date(dateObj.getTime() + 86400000);
    const existing   = await LeaveRequest.findOne({
      studentName,
      date:    { $gte:startOfDay, $lt:endOfDay },
      subject: subject || null
    });
    if (existing) return res.json({ success:false, message:"Leave already requested for this date and subject" });

    const lr = await LeaveRequest.create({
      studentName, section,
      date:            startOfDay,
      reason,
      subject:         subject || null,
      leaveLetterText: leaveLetterText || null,
      status:          "Pending"
    });

    await writeAudit({ action:"LEAVE_REQUESTED", performedBy:"student:"+studentName, studentName, subject:subject||"FULL_DAY", section, date:startOfDay, newStatus:"Pending" });
    res.json({ success:true, message:"Leave request submitted successfully", id:lr._id });

  } catch (err) {
    console.error("❌ leave/request error:", err.message);
    res.status(500).json({ success:false, message:err.message || "Server error creating leave request" });
  }
});

// Get leave requests for a specific student
app.get("/leave/student/:roll", async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ studentName:req.params.roll }).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// ✅ Teacher gets leave requests for THEIR specific subject
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

// ✅ Admin gets ALL pending leave requests (full day ones where subject=null)
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

// ✅ Admin gets only full-day leave requests (subject = null)
app.get("/leave/admin/pending", async (req, res) => {
  try {
    const { all } = req.query;
    const filter = { subject:null };
    if (all !== "true") filter.status = "Pending";
    const requests = await LeaveRequest.find(filter).sort({ createdAt:-1 });
    res.json({ success:true, requests });
  } catch (err) { res.status(500).json({ success:false, error:err.message }); }
});

// Teacher or admin reviews a leave request
app.post("/leave/review", async (req, res) => {
  try {
    const { id, status, reviewedBy, remarks } = req.body;
    if (!["Approved","Rejected"].includes(status))
      return res.json({ success:false, message:"Invalid status" });

    const lr = await LeaveRequest.findByIdAndUpdate(
      id, { status, reviewedBy, remarks, reviewedAt:new Date() }, { new:true }
    );
    if (!lr) return res.json({ success:false, message:"Request not found" });

    // If approved → mark attendance as OnLeave (does NOT count as absent)
    if (status === "Approved") {
      const leaveDate = new Date(lr.date);
      const startOfDay = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), leaveDate.getDate());
      const endOfDay   = new Date(startOfDay.getTime() + 86400000);

      const subjects = lr.subject
        ? [lr.subject]
        : [...new Set(timetable[getDayName(leaveDate)] || [])];

      for (const sub of subjects) {
        // ✅ OnLeave is now in the enum — this will work
        await Attendance.findOneAndUpdate(
          { studentName:lr.studentName, subject:sub, date:{ $gte:startOfDay, $lt:endOfDay } },
          { studentName:lr.studentName, subject:sub, date:startOfDay, section:lr.section, status:"OnLeave", updatedAt:new Date(), autoMarked:false },
          { upsert:true, new:true }
        );
      }
      await writeAudit({ action:"LEAVE_APPROVED", performedBy:reviewedBy||"admin", studentName:lr.studentName, subject:lr.subject||"ALL", section:lr.section, date:startOfDay, newStatus:"OnLeave" });
    }

    res.json({ success:true, message:`Leave ${status} successfully` });
  } catch (err) {
    console.error("❌ leave/review error:", err.message);
    res.status(500).json({ success:false, message:err.message || "Server error reviewing leave" });
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
    const targetDate=new Date(date);
    for(const[studentRoll,status]of Object.entries(data)){
      await Attendance.findOneAndUpdate(
        {studentName:studentRoll,subject,date:dateRange(targetDate)},
        {studentName:studentRoll,subject,date:targetDate,section,status,updatedAt:new Date(),autoMarked:false},
        {upsert:true}
      );
      await writeAudit({action:"ADMIN_MARKED",performedBy:"admin",studentName:studentRoll,subject,section,date,newStatus:status,req});
    }
    res.json({success:true,message:"Attendance marked by admin"});
  } catch(err){res.status(500).json({success:false,error:err.message});}
});

app.post("/admin/auto-mark-absent", async (req, res) => {
  try{await autoMarkNotMarked();res.json({success:true,message:"Auto-mark completed"});}
  catch(err){res.json({success:false,error:err.message});}
});

// TEACHERS
app.get("/teachers",       async (req,res)=>res.json(await Teacher.find()));
app.post("/addTeacher",    async (req,res)=>{await new Teacher(req.body).save();res.json({success:true});});
app.post("/deleteTeacher", async (req,res)=>{await Teacher.findByIdAndDelete(req.body.id);res.json({success:true});});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
/*
  =====================================================
  SVPCET — SMART REMINDER SYSTEM
  =====================================================
  Features:
  1. ⏰ 10 mins before class → "Class about to start"
  2. ⏰ After class ends   → "Mark attendance now"
  3. ⏰ End of day         → "You missed marking X classes"
  4. Shows as toast notifications
  =====================================================
  Include this script in teacherhome.html only
*/

(function(){

  // ===== TIMETABLE WITH CLASS TIMES =====
  const schedule = {
    Monday:    [{p:1,start:"09:30",end:"10:20",sub:"BEEE"},{p:2,start:"10:20",end:"11:10",sub:"BEEE"},{p:3,start:"11:10",end:"12:00",sub:"EG LAB"},{p:4,start:"12:00",end:"12:50",sub:"EG LAB"},{p:5,start:"13:30",end:"14:20",sub:"DS LAB"},{p:6,start:"14:20",end:"15:10",sub:"DS LAB"},{p:7,start:"15:10",end:"16:00",sub:"DS LAB"}],
    Tuesday:   [{p:1,start:"09:30",end:"10:20",sub:"DS"},{p:2,start:"10:20",end:"11:10",sub:"BEEE"},{p:3,start:"11:10",end:"12:00",sub:"EEE LAB"},{p:4,start:"12:00",end:"12:50",sub:"EEE LAB"},{p:5,start:"13:30",end:"14:20",sub:"PHY"},{p:6,start:"14:20",end:"15:10",sub:"PHY LAB"},{p:7,start:"15:10",end:"16:00",sub:"PHY LAB"}],
    Wednesday: [{p:1,start:"09:30",end:"10:20",sub:"DS"},{p:2,start:"10:20",end:"11:10",sub:"DEVC"},{p:3,start:"11:10",end:"12:00",sub:"PHY"},{p:4,start:"12:00",end:"12:50",sub:"BEEE"},{p:5,start:"13:30",end:"14:20",sub:"BEEE"},{p:6,start:"14:20",end:"15:10",sub:"DEVC"},{p:7,start:"15:10",end:"16:00",sub:"DS"}],
    Thursday:  [{p:1,start:"09:30",end:"10:20",sub:"DEVC"},{p:2,start:"10:20",end:"11:10",sub:"BEEE"},{p:3,start:"11:10",end:"12:00",sub:"DS"},{p:4,start:"12:00",end:"12:50",sub:"BEEE"},{p:5,start:"13:30",end:"14:20",sub:"IT WORKSHOP"},{p:6,start:"14:20",end:"15:10",sub:"IT WORKSHOP"},{p:7,start:"15:10",end:"16:00",sub:"IT WORKSHOP"}],
    Friday:    [{p:1,start:"09:30",end:"10:20",sub:"DEVC"},{p:2,start:"10:20",end:"11:10",sub:"EG LAB"},{p:3,start:"11:10",end:"12:00",sub:"EG LAB"},{p:4,start:"12:00",end:"12:50",sub:"EG LAB"},{p:5,start:"13:30",end:"14:20",sub:"PHY"},{p:6,start:"14:20",end:"15:10",sub:"DEVC"},{p:7,start:"15:10",end:"16:00",sub:"DS"}]
  };

  // Which labs belong to which main subject
  const subjectMapping = {
    "PHY":  ["PHY","PHY LAB"],
    "BEEE": ["BEEE","EEE LAB"],
    "ECE":  ["ECE","EEE LAB"],
    "DS":   ["DS","DS LAB"],
    "IT WORKSHOP": ["IT WORKSHOP"],
    "EG LAB":      ["EG LAB"],
    "DEVC":        ["DEVC"]
  };

  const subjectDisplay = {
    "BEEE":"Electrical (BEEE)","ECE":"Electronics (BEEE)","DS":"Data Structures",
    "DS LAB":"DS Lab","DEVC":"DE&VC","EG LAB":"EG Lab",
    "IT WORKSHOP":"IT Workshop","PHY LAB":"Physics Lab","EEE LAB":"EEE Lab","PHY":"Physics"
  };

  const teacherSubject = localStorage.getItem("subject");
  if(!teacherSubject) return; // Not logged in as teacher

  // ===== GET CURRENT TIME IN MINUTES =====
  function getNowMinutes(){
    const now = new Date();
    return now.getHours()*60 + now.getMinutes();
  }

  function timeToMinutes(t){
    const [h,m] = t.split(":").map(Number);
    return h*60+m;
  }

  function getDayName(){
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  }

  function getSubName(sub){ return subjectDisplay[sub] || sub; }

  function isMySubject(sub){
    const allowed = subjectMapping[teacherSubject] || [teacherSubject];
    return allowed.includes(sub);
  }

  // ===== TOAST NOTIFICATION =====
  function showToastReminder(msg, type="info", duration=8000){
    // Remove existing reminder toasts
    document.querySelectorAll(".reminder-toast").forEach(t=>t.remove());

    const colors = {
      info:    { bg:"#1e3a8a", icon:"ℹ️" },
      warning: { bg:"#92400e", icon:"⚠️" },
      success: { bg:"#065f46", icon:"✅" },
      urgent:  { bg:"#991b1b", icon:"🚨" }
    };

    const c = colors[type] || colors.info;

    const toast = document.createElement("div");
    toast.className = "reminder-toast";
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:99999;
      background:${c.bg}; color:white;
      padding:16px 20px; border-radius:14px;
      max-width:320px; font-size:14px; font-weight:600;
      font-family:'Plus Jakarta Sans',sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.35);
      animation:slideIn 0.4s cubic-bezier(0.4,0,0.2,1);
      line-height:1.5; cursor:pointer;
    `;

    // Add animation
    if(!document.getElementById("reminder-style")){
      const style = document.createElement("style");
      style.id = "reminder-style";
      style.textContent = `
        @keyframes slideIn { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOut { from{transform:translateX(0);opacity:1} to{transform:translateX(120%);opacity:0} }
      `;
      document.head.appendChild(style);
    }

    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:20px;flex-shrink:0;">${c.icon}</span>
        <div style="flex:1;">${msg}</div>
        <span style="opacity:0.6;font-size:18px;cursor:pointer;flex-shrink:0;" onclick="this.closest('.reminder-toast').remove()">×</span>
      </div>
    `;

    document.body.appendChild(toast);

    // Auto remove
    setTimeout(()=>{
      toast.style.animation = "slideOut 0.4s ease forwards";
      setTimeout(()=>toast.remove(), 400);
    }, duration);

    // Click to dismiss
    toast.addEventListener("click", ()=>toast.remove());
  }

  // ===== CHECK REMINDERS =====
  let shownReminders = new Set(); // prevent duplicate reminders

  function checkReminders(){
    const day  = getDayName();
    const now  = getNowMinutes();
    const periods = schedule[day];

    if(!periods) return; // Weekend
    if(day === "Saturday" || day === "Sunday") return;

    // Filter to only this teacher's periods
    const myPeriods = periods.filter(p => isMySubject(p.sub));
    if(myPeriods.length === 0) return;

    myPeriods.forEach(period => {
      const startMin = timeToMinutes(period.start);
      const endMin   = timeToMinutes(period.end);
      const subName  = getSubName(period.sub);
      const key      = `${day}-P${period.p}-${period.sub}`;

      // ⏰ REMINDER 1: 10 minutes before class starts
      const preKey = key + "-pre";
      if(now >= startMin-10 && now < startMin && !shownReminders.has(preKey)){
        shownReminders.add(preKey);
        showToastReminder(
          `<b>Class starting in ~10 minutes!</b><br>📘 ${subName} — Period ${period.p} at ${period.start}`,
          "info", 10000
        );
      }

      // ⏰ REMINDER 2: Right after class ends — mark attendance
      const postKey = key + "-post";
      if(now >= endMin && now <= endMin+15 && !shownReminders.has(postKey)){
        shownReminders.add(postKey);
        showToastReminder(
          `<b>Class just ended — Mark attendance now!</b><br>📘 ${subName} — Period ${period.p}<br><span style="opacity:0.85;font-size:12px;">Don't forget or it'll be marked as NotMarked</span>`,
          "warning", 15000
        );
      }
    });

    // ⏰ REMINDER 3: End of day check (at 4:05 PM = 965 min)
    const eodKey = `${day}-eod`;
    if(now >= 965 && now <= 980 && !shownReminders.has(eodKey)){
      shownReminders.add(eodKey);

      // Check which of teacher's periods were NOT marked today
      const today = new Date().toISOString().split("T")[0];

      fetch(`/teacher/missed/${teacherSubject}`)
      .then(r=>r.json())
      .then(data=>{
        if(data.missed){
          showToastReminder(
            `<b>End of Day Reminder 🌅</b><br>⚠️ You forgot to mark attendance today!<br>Contact admin immediately to unlock it.`,
            "urgent", 20000
          );
        } else {
          showToastReminder(
            `<b>Great job today! ✅</b><br>All attendance marked for ${subjectDisplay[teacherSubject]||teacherSubject}`,
            "success", 8000
          );
        }
      })
      .catch(()=>{});
    }
  }

  // Run immediately and every 60 seconds
  checkReminders();
  setInterval(checkReminders, 60 * 1000);

  // ===== MISSED CLASSES SUMMARY ON LOAD =====
  // Show how many classes are missed (overall)
  setTimeout(()=>{
    fetch(`/teacher/all-missed/${teacherSubject}`)
    .then(r=>r.json())
    .then(data=>{
      if(data.missedDates && data.missedDates.length > 0){
        const unresolved = data.missedDates.filter(d=>!d.used);
        if(unresolved.length > 0){
          showToastReminder(
            `<b>📋 Attendance Summary</b><br>You have <b>${unresolved.length}</b> unresolved missed marking date(s).<br>Check "Missed History" or contact admin.`,
            "warning", 12000
          );
        }
      }
    })
    .catch(()=>{});
  }, 2000); // Show 2 seconds after page load

})();
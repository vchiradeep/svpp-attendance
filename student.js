/* =========================
   ✅ LOGIN FUNCTION
========================= */
function studentLogin(){
  const roll    = document.getElementById("roll").value.trim();
  const section = document.getElementById("section").value;
 
  if(!roll)    { alert("Enter Roll Number"); return; }
  if(!section) { alert("Select Section");    return; }
 
  localStorage.setItem("studentRoll", roll);
  localStorage.setItem("section", section);
  window.location.href = "studenthome.html";
}
 
/* =========================
   ✅ STUDENT HOME PAGE
========================= */
if(window.location.pathname.includes("studenthome")){
 
  const roll    = localStorage.getItem("studentRoll");
  const section = localStorage.getItem("section");
 
  if(!roll || !section){
    alert("Please login first");
    window.location.href = "student.html";
  }
 
  document.getElementById("roll").innerText    = roll;
  document.getElementById("section").innerText = section;
 
  let fullData = [];
 
  // ✅ CORRECT ATTENDANCE CALCULATION
  // Present + Absent = counted
  // NotMarked = excluded (teacher's fault, not student's)
  function calculateAttendance(data) {
    let present    = 0;
    let absent     = 0;
    let notMarked  = 0;
 
    data.forEach(item => {
      if(item.studentName === roll){
        if(item.status === "Present")   present++;
        else if(item.status === "Absent") absent++;
        else if(item.status === "NotMarked") notMarked++;
      }
    });
 
    // ✅ % = Present / (Present + Absent) ONLY
    // NotMarked periods are NOT counted in total
    const total   = present + absent;
    const percent = total === 0 ? 0 : ((present / total) * 100).toFixed(1);
 
    return { present, absent, notMarked, total, percent };
  }
 
  function loadStudentAttendance(){
    showLoader();
    fetch("/attendance?studentName=" + roll)
    .then(res => res.json())
    .then(data => {
      fullData = data;
 
      const { present, absent, notMarked, total, percent } = calculateAttendance(data);
 
      document.getElementById("total").innerText      = total;
      document.getElementById("attended").innerText   = present;
      document.getElementById("percentage").innerText = percent + "%";
 
      // Show NotMarked warning if any
      const notMarkedEl = document.getElementById("notMarkedNote");
      if(notMarkedEl){
        if(notMarked > 0){
          notMarkedEl.style.display = "block";
          notMarkedEl.innerText = `ℹ️ ${notMarked} period(s) were not marked by teacher — excluded from your %`;
        } else {
          notMarkedEl.style.display = "none";
        }
      }
 
      if(percent >= 75){
        document.getElementById("status").innerText = "🎉 Congratulations! You reached 75%";
      } else {
        document.getElementById("status").innerText = "⚠️ You need more attendance";
      }
 
      updateChart(present, absent);
      calculateTargets(present, total);
      hideLoader();
    });
  }
 
  function calculateTargets(present, total){
    function calc(target){
      const t = target / 100;
 
      if(target === 100){
        return present === total
          ? "✅ Already at 100%"
          : "❌ Cannot reach 100%";
      }
 
      let required = Math.ceil((t * total - present) / (1 - t));
 
      if(required <= 0) return `✅ Already reached ${target}%`;
      if(required === Infinity || required < 0) return `❌ Cannot reach ${target}%`;
 
      return `📚 Attend ${required} more classes to reach ${target}%`;
    }
 
    document.getElementById("target75").innerText  = calc(75);
    document.getElementById("target80").innerText  = calc(80);
    document.getElementById("target90").innerText  = calc(90);
    document.getElementById("target95").innerText  = calc(95);
    document.getElementById("target100").innerText = calc(100);
  }
 
  // CHART
  const ctx   = document.getElementById("attendanceChart").getContext("2d");
  const chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Present", "Absent"],
      datasets: [{
        data: [0, 0],
        backgroundColor: ["#4CAF50", "#f44336"]
      }]
    }
  });
 
  function updateChart(p, a){
    chart.data.datasets[0].data = [p, a];
    chart.update();
  }
 
  // TIMETABLE
  const timetable = {
    Monday:    [["1","BEEE"],["2","BEEE"],["3","EG LAB"],["4","EG LAB"],["5","DS LAB"],["6","DS LAB"],["7","DS LAB"]],
    Tuesday:   [["1","DS"],["2","BEEE"],["3","EEE LAB"],["4","EEE LAB"],["5","PHY"],["6","PHY LAB"],["7","PHY LAB"]],
    Wednesday: [["1","DS"],["2","DEVC"],["3","PHY"],["4","BEEE"],["5","BEEE"],["6","DEVC"],["7","DS"]],
    Thursday:  [["1","DEVC"],["2","BEEE"],["3","DS"],["4","BEEE"],["5","IT WORKSHOP"],["6","IT WORKSHOP"],["7","IT WORKSHOP"]],
    Friday:    [["1","DEVC"],["2","EG LAB"],["3","EG LAB"],["4","EG LAB"],["5","PHY"],["6","DEVC"],["7","DS"]]
  };
 
  // VIEW ATTENDANCE BY DATE
  function showAttendance(){
    const dateValue = document.getElementById("datePicker").value;
    const table     = document.getElementById("attendanceTable");
 
    table.innerHTML = `
      <tr>
        <th>Period</th>
        <th>Subject</th>
        <th>Status</th>
      </tr>
    `;
 
    if(!dateValue){ alert("Select a date"); return; }
 
    const dayName = new Date(dateValue).toLocaleString('en-US', { weekday: 'long' });
 
    if(dayName === "Sunday" || dayName === "Saturday"){
      let row = table.insertRow();
      row.insertCell(0).innerText = "-";
      row.insertCell(1).innerText = "Holiday";
      row.insertCell(2).innerText = "🎉 Holiday";
      return;
    }
 
    const todayTimetable = timetable[dayName];
    if(!todayTimetable) return;
 
    let todayData = fullData.filter(x => {
      if(!x.date) return false;
      let dbDate = new Date(x.date).toISOString().split("T")[0];
      return x.studentName === roll && dbDate === dateValue;
    });
 
    const today = new Date().toISOString().split("T")[0];
 
    todayTimetable.forEach(period => {
      const periodNo    = String(period[0]).trim();
      const subjectName = period[1].trim();
 
      let record = todayData.find(x => {
        let dbSub    = (x.subject || "").trim().toLowerCase();
        let ttSub    = subjectName.trim().toLowerCase();
        let dbPeriod = x.period ? String(x.period).replace("P","").trim() : "";
        if(dbPeriod){
          return dbSub === ttSub && dbPeriod === periodNo;
        } else {
          return dbSub === ttSub;
        }
      });
 
      let status;
 
      if(record){
        if(record.status === "Present"){
          status = "✅ Present";
        } else if(record.status === "Absent"){
          status = "❌ Absent";
        } else if(record.status === "NotMarked"){
          // ✅ Show clearly it was teacher's fault, not counted in %
          status = "⚠️ Not Marked (Teacher)";
        }
      } else {
        status = dateValue < today ? "❌ Absent" : "⚪ Not Marked";
      }
 
      let row = table.insertRow();
      row.insertCell(0).innerText = "P" + periodNo;
      row.insertCell(1).innerText = subjectName;
      row.insertCell(2).innerText = status;
    });
  }
 
  // LOGOUT
  function logout(){
    localStorage.clear();
    window.location.href = "index.html";
  }
 
  loadStudentAttendance();
}
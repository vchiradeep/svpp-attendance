const API = "http://localhost:3000";

/* =========================
   ✅ LOGIN FUNCTION (LOGIN PAGE)
========================= */
function studentLogin(){

    const roll = document.getElementById("roll").value.trim();
    const section = document.getElementById("section").value;

    if(!roll){
        alert("Enter Roll Number");
        return;
    }

    if(!section){
        alert("Select Section");
        return;
    }

    localStorage.setItem("studentRoll", roll);
    localStorage.setItem("studentSection", section);

    window.location.href = "studentHome.html";
}

/* =========================
   ✅ BELOW CODE ONLY FOR STUDENT HOME PAGE
========================= */

if(window.location.pathname.includes("studentHome")){
     const roll = document.getElementById("roll").value.trim();
    const section = document.getElementById("section").value;

    if(!roll || !section){
        alert("Please login first");
        window.location.href = "studentLogin.html";
    }

    document.getElementById("roll").innerText = roll;
    document.getElementById("section").innerText = section;

    let fullData = [];

    // 📊 LOAD ATTENDANCE
    function loadStudentAttendance(){
        showLoader();
        fetch(API + "/attendance?studentName=" + roll)
        .then(res => res.json())
        .then(data => {

            fullData = data;

            let total = 0;
            let present = 0;

            data.forEach(item => {
                if(item.studentName === roll){
                    total++;
                    if(item.status === "Present") present++;
                }
            });

            let percent = total === 0 ? 0 : ((present/total)*100).toFixed(1);

            document.getElementById("total").innerText = total;
            document.getElementById("attended").innerText = present;
            document.getElementById("percentage").innerText = percent + "%";

            if(percent >= 75){
                document.getElementById("status").innerText =
                    "🎉 Congratulations! You reached 75%";
            } else {
                document.getElementById("status").innerText =
                    "⚠️ You need more attendance";
            }

            updateChart(present, total - present);
            calculateTargets(present, total);
            hideLoader(); // 🔥 ADD HERE (after data processed)
        });
    }
   function calculateTargets(present, total){

    function calc(target){

        let t = target / 100;

        // ✅ SPECIAL CASE FOR 100%
        if(target === 100){
    if(present === total){
        return "✅ Already at 100%";
    } else {
        return `❌ Cannot reach ${target}%`;
    }
}

        // ✅ FORMULA TO CALCULATE REQUIRED CLASSES
        let required = Math.ceil((t * total - present) / (1 - t));

        // ✅ ALREADY REACHED
        if(required <= 0){
            return `✅ Already reached ${target}%`;
        }

        // ❌ IMPOSSIBLE CASE
        if(required === Infinity || required < 0){
            return `❌ Cannot reach ${target}%`;
        }

        return `📚 Attend ${required} more classes to reach ${target}%`;
    }

    document.getElementById("target75").innerText = calc(75);
    document.getElementById("target80").innerText = calc(80);
    document.getElementById("target90").innerText = calc(90);
    document.getElementById("target95").innerText = calc(95);
    document.getElementById("target100").innerText = calc(100);
}

    // 📊 CHART
    const ctx = document.getElementById("attendanceChart").getContext("2d");

    const chart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Present", "Absent"],
            datasets: [{
                data: [0,0],
                backgroundColor: ["#4CAF50", "#f44336"]
            }]
        }
    });

    function updateChart(p, a){
        chart.data.datasets[0].data = [p, a];
        chart.update();
    }

    // 📅 TIMETABLE
    const timetable = {
        Monday: [["1","BEEE"],["2","BEEE"],["3","EG LAB"],["4","EG LAB"],["5","DS LAB"],["6","DS LAB"],["7","DS LAB"]],
        Tuesday: [["1","DS"],["2","BEEE"],["3","EEE LAB"],["4","EEE LAB"],["5","PHY"],["6","PHY LAB"],["7","PHY LAB"]],
        Wednesday: [["1","DS"],["2","DEVC"],["3","PHY"],["4","BEEE"],["5","BEEE"],["6","DEVC"],["7","DS"]],
        Thursday: [["1","DEVC"],["2","BEEE"],["3","DS"],["4","BEEE"],["5","IT WORKSHOP"],["6","IT WORKSHOP"],["7","IT WORKSHOP"]],
        Friday: [["1","DEVC"],["2","EG LAB"],["3","EG LAB"],["4","EG LAB"],["5","PHY"],["6","DEVC"],["7","DS"]]
    };

    // 📅 VIEW ATTENDANCE
    function showAttendance(){

        const dateValue = document.getElementById("datePicker").value;

        console.log("Selected Date:", dateValue);
        console.log("Full Data:", fullData);

        const table = document.getElementById("attendanceTable");

        table.innerHTML = `
            <tr>
                <th>Period</th>
                <th>Subject</th>
                <th>Status</th>
            </tr>
        `;

        if(!dateValue){
            alert("Select a date");
            return;
        }

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

        // ✅ FIXED DATE MATCHING (MAIN ISSUE)
        let todayData = fullData.filter(x => {

            if(!x.date) return false;

            let dbDate = new Date(x.date).toISOString().split("T")[0];

            return x.studentName === roll && dbDate === dateValue;
        });

        console.log("Filtered Data:", todayData);

        todayTimetable.forEach(period => {

            const periodNo = String(period[0]).trim();
            const subjectName = period[1].trim();

            let record = todayData.find(x => {

                let dbSub = (x.subject || "").trim().toLowerCase();
                let ttSub = subjectName.trim().toLowerCase();

                // ✅ HANDLE MISSING PERIOD SAFELY
                let dbPeriod = x.period ? String(x.period).replace("P","").trim() : "";
                let ttPeriod = periodNo;

                // ✅ MATCH (period optional)
                if(dbPeriod){
                    return dbSub === ttSub && dbPeriod === ttPeriod;
                } else {
                    return dbSub === ttSub;
                }
            });

            let status;

           // ✅ GET TODAY DATE
let today = new Date().toISOString().split("T")[0];

if(record){
    status = record.status === "Present"
        ? "✅ Present"
        : "❌ Absent";
} else {
    // ✅ IF DATE IS PAST → MARK ABSENT
    if(dateValue < today){
        status = "❌ Absent";
    } else {
        status = "⚪ Not Marked";
    }
}

            let row = table.insertRow();
            row.insertCell(0).innerText = "P" + periodNo;
            row.insertCell(1).innerText = subjectName;
            row.insertCell(2).innerText = status;
        });
    }

    // 🚪 LOGOUT
    function logout(){
        localStorage.clear();
        window.location.href = "index.html";
    }

    // 🔄 LOAD
    loadStudentAttendance();
}
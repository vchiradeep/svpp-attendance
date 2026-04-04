const API = "http://localhost:3000";

// ✅ GET DATA FROM LOGIN
const roll = localStorage.getItem("studentRoll");
const section = localStorage.getItem("section");

// 🚫 IF NOT LOGGED IN
if(!roll || !section){
    alert("Please login first");
    window.location.href = "studentLogin.html";
}

// ✅ SHOW DETAILS
document.getElementById("roll").innerText = roll;
document.getElementById("section").innerText = section;

let fullData = [];

// 📊 LOAD ATTENDANCE
function loadStudentAttendance(){
    fetch(API + "/attendance")
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
    });
}
// 📊 CHART
const canvas = document.getElementById("attendanceChart");

let chart;

if(canvas){
    const ctx = canvas.getContext("2d");

    chart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Present", "Absent"],
            datasets: [{
                data: [0,0],
                backgroundColor: ["#4CAF50", "#f44336"]
            }]
        }
    });
}

function updateChart(p, a){
    if(chart){
        chart.data.datasets[0].data = [p, a];
        chart.update();
    }
}

// 📅 VIEW BY DATE
function showAttendance(){

    const dateValue = document.getElementById("datePicker").value;
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

   let todayData = fullData.filter(x =>  x.studentName === roll && new Date(x.date).toISOString().split("T")[0] === dateValue
);

    for(let i=1; i<=7; i++){

        let record = todayData[i-1];

        let status = "⚪ Not Marked";

        if(record){
            status = record.status === "Present"
                ? "✅ Present"
                : "❌ Absent";
        }

        let row = table.insertRow();
        row.insertCell(0).innerText = "P" + i;
        row.insertCell(1).innerText = record ? record.subject : "-";
        row.insertCell(2).innerText = status;
    }
}

// 🚪 LOGOUT
function logout(){
    localStorage.clear();
    window.location.href = "index.html";
}

// 🔄 LOAD
loadStudentAttendance();
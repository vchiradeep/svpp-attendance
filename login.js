function login() {
    let roll = document.getElementById("roll").value;
    let section = document.getElementById("section").value;

    // Sample validation
    if (roll === "123" && section === "A") {
       localStorage.setItem("studentRoll", roll);
localStorage.setItem("section", section);
        window.location.href = "student_home.html";
    } else {
        document.getElementById("error").innerText = "Invalid Details!";
    }
}
// 🌐 API BASE
const API = window.location.origin;

// 🔔 TOAST NOTIFICATION
function showToast(message, color="#4caf50") {
    let toast = document.createElement("div");

    toast.innerText = message;
    toast.style.position = "fixed";
    toast.style.top = "20px";
    toast.style.right = "20px";
    toast.style.background = color;
    toast.style.color = "white";
    toast.style.padding = "12px 18px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    toast.style.zIndex = "999";

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ⏳ LOADING
function showLoading(id){
    document.getElementById(id).innerHTML = "⏳ Loading...";
}

function hideLoading(id, content){
    document.getElementById(id).innerHTML = content;
}
function showLoader(){
  let loader = document.getElementById("loader");
  if(loader) loader.style.display = "flex";
}

function hideLoader(){
  let loader = document.getElementById("loader");
  if(loader) loader.style.display = "none";
}
const toggleBtn = document.querySelector(".toggle_btn");
const toggleBtnIcon = document.querySelector(".toggle_btn i");
const dropdownMenu = document.querySelector(".dropdown_menu");

toggleBtn.addEventListener("click", function () {
  dropdownMenu.classList.toggle("open");
});

//typewrite @about
const introText =
  "Hey there! There's not much to say about me, except that I'm really into technology and innovation. I have a strong interest in AI and blockchain. This site is just a little experiment of mine. Nothing too serious, haha.";
const target = document.getElementById("typewriter");
let idx = 0;

function typeWriter() {
  if (idx < introText.length) {
    target.textContent += introText.charAt(idx++);
    setTimeout(typeWriter, 50);
  }
}

// kick it off once the DOM is ready
document.addEventListener("DOMContentLoaded", typeWriter);

//project page
document.querySelectorAll(".more-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".project-card");
    card.classList.toggle("active");
    button.textContent = card.classList.contains("active") ? "Less" : "More";
  });
});

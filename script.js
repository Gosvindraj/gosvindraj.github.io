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

//email js

document
  .getElementById("contact-form")
  .addEventListener("submit", function (event) {
    event.preventDefault(); // stop normal form post

    emailjs
      .sendForm(
        "service_2fltq5k", // ← your Service ID
        "template_uoi0y6r", // ← your Template ID
        this // ← the form element
      )
      .then(
        () => {
          //hide form properly/dynamically
          const form = document.getElementById("contact-form");
          const wrapper = document.getElementById("contact-form-wrapper");
          const title = document.getElementById("form-title");

          const sectionHeight = wrapper.getBoundingClientRect().height;
          wrapper.style.minHeight = sectionHeight + "px";
          form.classList.add("fade-out");
          title.classList.add("fade-out");

          setTimeout(() => {
            form.style.display = "none";
            title.style.display = "none";
            const messageDiv = document.getElementById("response-message");
            messageDiv.className = "response-success fade-in";
            messageDiv.innerHTML =
              "Message sent successfully! <br> I’ll get back to you as soon as possible.";
          }, 500); // match CSS transition duration
        },
        (err) => {
          const messageDiv = document.getElementById("response-message");
          messageDiv.className = "response-error";
          messageDiv.innerHTML = "Send failed: Please try again.";

          // Reset to hidden after animation finishes (4s)
          setTimeout(() => {
            messageDiv.className = "";
            messageDiv.innerHTML = "";
          }, 4000);
        }
      );
  });

/* document.getElementById("test-button").addEventListener("click", () => {
  const messageDiv = document.getElementById("response-message");
  messageDiv.className = "response-error";
  messageDiv.innerHTML = "Send failed: Please try again.";

  // Reset to hidden after animation finishes (4s)
  setTimeout(() => {
    messageDiv.className = "";
    messageDiv.innerHTML = "";
  }, 4000);
}); */

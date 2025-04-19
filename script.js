
    const toggleBtn = document.querySelector('.toggle_btn');
    const toggleBtnIcon = document.querySelector('.toggle_btn i');
    const dropdownMenu = document.querySelector('.dropdown_menu');

    toggleBtn.addEventListener('click', function () {
        dropdownMenu.classList.toggle('open');
    });


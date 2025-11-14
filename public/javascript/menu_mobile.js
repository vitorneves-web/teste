const btnAbrirMenuMobile = document.querySelector('#btn-menu-mobile');
const menuMobile = document.querySelector('#menu-mobile');
const linksMenu = document.querySelectorAll('#menu-mobile a');

// Abre o menu
btnAbrirMenuMobile.addEventListener('click', () => {
  menuMobile.classList.add('abrir-menu');
});

// Fecha o menu clicando fora (opcional, se quiser manter)
menuMobile.addEventListener('click', (e) => {
  if (e.target === menuMobile) {
    menuMobile.classList.remove('abrir-menu');
  }
});

// Fecha o menu ao clicar em um link e redireciona corretamente
linksMenu.forEach(link => {
  link.addEventListener('click', (e) => {
    menuMobile.classList.remove('abrir-menu');
    window.location.href = link.getAttribute('href'); // garante o redirecionamento
  });
});

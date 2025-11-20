// SCRIPT DO CARROSSEL

let index = 0;

const container = document.querySelector(".videos-container");
const videos = document.querySelectorAll(".video");

function updateCarousel() {
    container.style.transform = `translateX(${-index * 100}%)`;
}

document.querySelector(".next").addEventListener("click", () => {
    index = (index + 1) % videos.length;
    updateCarousel();
});

document.querySelector(".prev").addEventListener("click", () => {
    index = (index - 1 + videos.length) % videos.length;
    updateCarousel();
});

// SCRIPT PARA ROLAR ATÉ O QR Code

document.addEventListener("DOMContentLoaded", function () {
    const alvo = document.getElementById("divisor-pixbox");

    // Observa mudanças no container onde o QR aparece
    const observer = new MutationObserver(() => {
        const qr = document.querySelector("#pixBox img");

        // Se uma imagem (QR Code) apareceu → scroll!
        if (qr) {
            alvo.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            observer.disconnect(); // parar de observar (opcional)
        }
    });

    // Observa mudanças dentro da área onde o resultado do PIX é renderizado
    observer.observe(document.getElementById("pixBox"), { childList: true, subtree: true });
});


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




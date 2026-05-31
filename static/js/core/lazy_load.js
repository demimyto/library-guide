// Lazy Load — IntersectionObserver для изображений и фоновых обложек
(function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                
                // Ленивая загрузка img
                if (el.dataset.src) {
                    el.src = el.dataset.src;
                    el.removeAttribute('data-src');
                }
                
                // Ленивая загрузка фонового изображения
                if (el.dataset.bg) {
                    el.style.backgroundImage = `url('${el.dataset.bg}')`;
                    el.removeAttribute('data-bg');
                }
                
                observer.unobserve(el);
            }
        });
    }, {
        rootMargin: '200px'
    });
    
    function observe() {
        document.querySelectorAll('[data-src], [data-bg]').forEach(el => {
            observer.observe(el);
        });
    }
    
    document.addEventListener('DOMContentLoaded', observe);
    window.lazyLoadObserve = observe;
})();
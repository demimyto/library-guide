// Book Ratings Module
// Подгружает рейтинги на карточки книг с кэшированием

const BookRatings = (function() {
    const CACHE_KEY = 'book_ratings_cache';
    const CACHE_DURATION = 30 * 60 * 1000; // 30 минут
    
    function init() {
        loadAllRatings();
    }
    
    function loadAllRatings() {
        const cards = document.querySelectorAll('.book-card-rating[data-book-id]');
        if (cards.length === 0) return;
        
        const bookIds = Array.from(cards).map(card => card.dataset.bookId).join(',');
        
        // Проверяем кэш
        const cached = getFromCache(bookIds);
        if (cached) {
            applyRatings(cards, cached);
            return;
        }
        
        fetch(`/api/books/ratings?ids=${bookIds}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    saveToCache(bookIds, data.ratings);
                    applyRatings(cards, data.ratings);
                }
            })
            .catch(error => console.error('Error loading ratings:', error));
    }
    
    function getFromCache(bookIds) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            
            const cache = JSON.parse(raw);
            if (Date.now() - cache.timestamp > CACHE_DURATION) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            
            // Проверяем, что все нужные книги есть в кэше
            const ids = bookIds.split(',').map(Number);
            const missing = ids.some(id => !(id in cache.ratings));
            if (missing) return null;
            
            return cache.ratings;
        } catch (e) {
            return null;
        }
    }
    
    function saveToCache(bookIds, ratings) {
        // Объединяем с существующим кэшем
        const existing = getFromCache(bookIds) || {};
        const merged = { ...existing, ...ratings };
        
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                ratings: merged
            }));
        } catch (e) {
            // localStorage переполнен — чистим
            localStorage.removeItem(CACHE_KEY);
        }
    }
    
    function applyRatings(cards, ratings) {
        cards.forEach(card => {
            const bookId = parseInt(card.dataset.bookId);
            const ratingData = ratings[bookId];
            const starsEl = card.querySelector('.rating-stars');
            if (ratingData && ratingData.avg > 0) {
                starsEl.innerHTML = renderStars(ratingData.avg);
                setTimeout(() => {
                    starsEl.style.opacity = '1';
                }, 100);
            } else {
                starsEl.style.opacity = '1';
            }
        });
    }
    
    function renderStars(avg) {
        const rounded = Math.round(avg);
        const emojis = ['', '🤮', '☹️', '😐', '😊', '🤩'];
        const emoji = emojis[rounded] || '';
        return avg > 0 ? `${emoji} ${avg.toFixed(1)}` : '';
    }
    
    // Сброс кэша (вызывается принудительно после модерации отзыва)
    function invalidateCache() {
        localStorage.removeItem(CACHE_KEY);
    }
    
    return { init, renderStars, invalidateCache };
})();

document.addEventListener('DOMContentLoaded', function() {
    BookRatings.init();
});
// Review Modal Module

let reviewModal = null;
let currentReviewBookId = null;
let currentReviewPage = 1;
let currentReviewSort = 'newest';
let currentReviewRating = '';
let reviewEditId = null;

function openReviewModalPage(bookId) {
    currentReviewBookId = bookId;
    currentReviewPage = 1;
    currentReviewSort = 'newest';
    currentReviewRating = '';
    reviewEditId = null;
    
    // Сбрасываем фильтры
    document.querySelectorAll('#ratingFilter .btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#ratingFilter .btn[data-rating=""]').classList.add('active');
    document.getElementById('reviewSort').value = 'newest';
    
    // Скрываем форму
    document.getElementById('reviewFormContainer').classList.add('d-none');
    
    // Загружаем отзывы
    loadReviews();
    
    // Показываем кнопку "Написать" если пользователь авторизован и вернул книгу
    checkCanWriteReview(bookId);
    
    if (!reviewModal) {
        reviewModal = new bootstrap.Modal(document.getElementById('reviewModal'));
    }
    
    // Возврат к модалке книги при закрытии
    document.getElementById('reviewModal').addEventListener('hidden.bs.modal', function() {
        if (currentBookId) {
            setTimeout(() => openBookModal(currentBookId), 200);
        }
    }, { once: true });
    
    reviewModal.show();
}

function checkCanWriteReview(bookId) {
    const isAuth = document.body.dataset.userAuthenticated === 'true';
    if (!isAuth) {
        document.getElementById('reviewWriteBtnContainer').style.display = 'none';
        return;
    }
    
    fetch(`/api/can-review/${bookId}`)
        .then(response => response.json())
        .then(data => {
            if (data.can_review) {
                document.getElementById('reviewWriteBtnContainer').style.display = 'block';
                if (data.existing_review) {
                    document.getElementById('btnWriteReview').textContent = '✏️ Редактировать отзыв';
                    reviewEditId = data.review_id;
                } else {
                    document.getElementById('btnWriteReview').textContent = '✏️ Написать отзыв';
                    reviewEditId = null;
                }
            }
        });
}

function loadReviews() {
    const params = new URLSearchParams({
        page: currentReviewPage,
        per_page: 10,
        sort: currentReviewSort
    });
    if (currentReviewRating) params.append('rating', currentReviewRating);
    
    fetch(`/api/book/${currentReviewBookId}/reviews?${params}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderStats(data.stats, data.avg_rating, data.total_reviews);
                renderReviews(data.reviews);
                renderPagination(data);
            }
        });
}

function renderStats(stats, avg, total) {
    const maxCount = Math.max(1, ...Object.values(stats));
    
    let barsHtml = '';
    for (let i = 5; i >= 1; i--) {
        const count = stats[i] || 0;
        const pct = (count / maxCount) * 100;
        barsHtml += `
            <div class="review-stat-bar">
                <span class="bar-label">${['', '🤮', '☹️', '😐', '😊', '🤩'][i]}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="bar-count">${count}</span>
            </div>
        `;
    }
    
    document.getElementById('reviewStats').innerHTML = `
        <div class="review-stats-avg">
            <div class="big-rating">${avg > 0 ? ['', '🤮', '☹️', '😐', '😊', '🤩'][Math.round(avg)] : '—'}</div>
            <div class="rating-value">${avg > 0 ? avg.toFixed(1) : '—'}</div>
            <div class="total">${total} отзывов</div>
        </div>
        <div class="review-stats-bars">
            ${barsHtml}
        </div>
    `;
}

function renderReviews(reviews) {
    const container = document.getElementById('reviewsList');
    
    if (reviews.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">Нет отзывов</p>';
        return;
    }
    
    container.innerHTML = reviews.map(review => `
        <div class="review-item">
            <div class="review-item-header">
                <div>
                    <span class="review-item-user">${escapeHtml(review.username)}</span>
                    <span class="review-item-rating">
                        ${['', '🤮', '☹️', '😐', '😊', '🤩'][review.rating]}
                    </span>
                </div>
                <span class="review-item-date">${review.created_at}</span>
            </div>
            ${review.text ? `<div class="review-item-text">${review.text}</div>` : ''}
            <div class="review-item-actions">
                <button class="vote-btn ${review.user_vote === 'up' ? 'active-up' : ''}" 
                        onclick="voteReview(${review.id}, 'up')" title="Полезно">👍</button>
                <span class="vote-count">${review.upvotes}</span>
                <button class="vote-btn ${review.user_vote === 'down' ? 'active-down' : ''}" 
                        onclick="voteReview(${review.id}, 'down')" title="Не полезно">👎</button>
                <span class="vote-count">${review.downvotes}</span>
            </div>
        </div>
    `).join('');
}

function renderPagination(data) {
    const container = document.getElementById('reviewsPagination');
    if (data.pages <= 1) { container.innerHTML = ''; return; }
    
    let html = '<ul class="pagination pagination-sm mb-0">';
    if (data.page > 1) html += `<li class="page-item"><button class="page-link" onclick="goToReviewPage(${data.page - 1})">«</button></li>`;
    for (let i = 1; i <= data.pages; i++) {
        html += `<li class="page-item ${i === data.page ? 'active' : ''}"><button class="page-link" onclick="goToReviewPage(${i})">${i}</button></li>`;
    }
    if (data.page < data.pages) html += `<li class="page-item"><button class="page-link" onclick="goToReviewPage(${data.page + 1})">»</button></li>`;
    html += '</ul>';
    container.innerHTML = html;
}

function goToReviewPage(page) {
    currentReviewPage = page;
    loadReviews();
}

function voteReview(reviewId, vote) {
    fetch(`/api/review/${reviewId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) loadReviews();
    });
}

// Инициализация событий
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('reviewSort')?.addEventListener('change', function() {
        currentReviewSort = this.value;
        currentReviewPage = 1;
        loadReviews();
    });
    
    document.querySelectorAll('#ratingFilter .btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#ratingFilter .btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentReviewRating = this.dataset.rating;
            currentReviewPage = 1;
            loadReviews();
        });
    });
    
    document.getElementById('btnWriteReview')?.addEventListener('click', function() {
        document.getElementById('reviewFormContainer').classList.remove('d-none');
        document.getElementById('reviewWriteBtnContainer').style.display = 'none';
        
        if (reviewEditId) {
            document.getElementById('reviewFormTitle').textContent = 'Редактировать отзыв';
            // Загрузить существующий отзыв (опционально)
        }
    });
    
    document.getElementById('btnCancelReview')?.addEventListener('click', function() {
        document.getElementById('reviewFormContainer').classList.add('d-none');
        document.getElementById('reviewWriteBtnContainer').style.display = 'block';
        reviewEditId = null;
    });
    
    // Звёзды ввода
    document.querySelectorAll('#starRatingInput span').forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.dataset.rating);
            document.getElementById('reviewRating').value = rating;
            updateStarInput(rating);
        });
        star.addEventListener('mouseenter', function() {
            updateStarInput(parseInt(this.dataset.rating));
        });
    });
    
    document.getElementById('starRatingInput')?.addEventListener('mouseleave', function() {
        updateStarInput(parseInt(document.getElementById('reviewRating').value));
    });
    
    document.getElementById('btnSubmitReview')?.addEventListener('click', function() {
        const rating = parseInt(document.getElementById('reviewRating').value);
        const text = document.getElementById('reviewText').value.trim();
        
        fetch('/api/review/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                book_id: currentReviewBookId,
                rating: rating,
                text: text
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                document.getElementById('reviewFormContainer').classList.add('d-none');
                loadReviews();
            } else {
                showNotification(data.error, 'danger');
            }
        });
    });
    
    // Инициализация звёзд
    updateStarInput(5);
});

function updateStarInput(rating) {
    document.querySelectorAll('#starRatingInput span').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
        const emojis = ['', '🤮', '☹️', '😐', '😊', '🤩'];
        const r = parseInt(s.dataset.rating);
        s.textContent = emojis[r];
        s.style.opacity = r <= rating ? '1' : '0.3';
    });
}
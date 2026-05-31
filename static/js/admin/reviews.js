// Admin Reviews Module

console.log("💬 Admin Reviews Loaded");

const AdminReviews = (function() {
    let currentPage = 1;
    let currentStatus = 'pending';
    let rejectModal = null;
    
    function init() {
        rejectModal = new bootstrap.Modal(document.getElementById('rejectModal'));
        loadReviews();
        bindFilters();
        bindReject();
    }
    
    function loadReviews() {
        fetch(`/admin/api/reviews?status=${currentStatus}&page=${currentPage}&per_page=20`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    renderReviews(data.reviews);
                    renderPagination(data);
                }
            });
    }
    
    function renderReviews(reviews) {
        const container = document.getElementById('adminReviewsList');
        
        if (reviews.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-muted">Нет отзывов</div>';
            return;
        }
        
        container.innerHTML = reviews.map(review => `
            <div class="review-moderation-item p-3 border-bottom">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <strong>${escapeHtml(review.username)}</strong>
                        <span class="text-muted ms-2">о книге</span>
                        <strong>«${escapeHtml(review.book_title)}»</strong>
                    </div>
                    <span class="badge ${statusBadge(review.status)}">${statusText(review.status)}</span>
                </div>
                <div class="mb-2">
                    <span>${['', '🤮', '☹️', '😐', '😊', '🤩'][review.rating]} (${review.rating})</span>
                    <span class="text-muted ms-2 small">${review.created_at}</span>
                </div>
                ${review.text ? `<p class="mb-2">${escapeHtml(review.text)}</p>` : '<p class="text-muted mb-2 fst-italic">Без текста</p>'}
                ${review.rejection_reason ? `<div class="alert alert-danger py-1 px-2 mb-2 small">Причина отклонения: ${escapeHtml(review.rejection_reason)}</div>` : ''}
                ${review.status === 'pending' || review.status === 'edited' ? `
                    <div class="d-flex gap-2">
                        <button class="btn btn-success btn-sm approve-btn" data-id="${review.id}">✓ Одобрить</button>
                        <button class="btn btn-outline-danger btn-sm reject-btn" data-id="${review.id}">✗ Отклонить</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
        
        // Привязка кнопок
        document.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                approveReview(this.dataset.id);
            });
        });
        
        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                openRejectModal(this.dataset.id);
            });
        });
    }
    
    function renderPagination(data) {
        const container = document.getElementById('adminReviewsPagination');
        if (data.pages <= 1) { container.innerHTML = ''; return; }
        
        let html = '<ul class="pagination pagination-sm">';
        if (data.page > 1) html += `<li class="page-item"><button class="page-link" onclick="AdminReviews.goToPage(${data.page - 1})">«</button></li>`;
        for (let i = 1; i <= data.pages; i++) {
            html += `<li class="page-item ${i === data.page ? 'active' : ''}"><button class="page-link" onclick="AdminReviews.goToPage(${i})">${i}</button></li>`;
        }
        if (data.page < data.pages) html += `<li class="page-item"><button class="page-link" onclick="AdminReviews.goToPage(${data.page + 1})">»</button></li>`;
        html += '</ul>';
        container.innerHTML = html;
    }
    
    function approveReview(reviewId) {
        fetch(`/admin/api/review/${reviewId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Отзыв одобрен', 'success');
                loadReviews();
                if (typeof BookRatings !== 'undefined') {
                    BookRatings.invalidateCache();
                }
            }
        });
    }
    
    function openRejectModal(reviewId) {
        document.getElementById('rejectReviewId').value = reviewId;
        document.getElementById('rejectReason').value = '';
        rejectModal.show();
    }
    
    function bindReject() {
        document.getElementById('btnConfirmReject').addEventListener('click', function() {
            const reviewId = document.getElementById('rejectReviewId').value;
            const reason = document.getElementById('rejectReason').value.trim();
            
            if (!reason) {
                alert('Укажите причину отклонения');
                return;
            }
            
            fetch(`/admin/api/review/${reviewId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject', reason })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Отзыв отклонён', 'success');
                    rejectModal.hide();
                    loadReviews();
                    if (typeof BookRatings !== 'undefined') {
                        BookRatings.invalidateCache();
                    }
                }
            });
        });
    }
    
    function bindFilters() {
        document.getElementById('reviewStatusFilter').addEventListener('change', function() {
            currentStatus = this.value;
            currentPage = 1;
            loadReviews();
        });
    }
    
    function statusBadge(status) {
        return {
            'pending': 'bg-warning',
            'edited': 'bg-info',
            'approved': 'bg-success',
            'rejected': 'bg-danger'
        }[status] || 'bg-secondary';
    }
    
    function statusText(status) {
        return {
            'pending': 'Ожидает',
            'edited': 'Изменён',
            'approved': 'Одобрен',
            'rejected': 'Отклонён'
        }[status] || status;
    }
    
    function goToPage(page) {
        currentPage = page;
        loadReviews();
    }

    return { init, goToPage };
})();

document.addEventListener('DOMContentLoaded', function() {
    AdminReviews.init();
});
// profile_notifications.js
// Управление уведомлениями пользователя

let currentPage = 1;

const typeIcons = {
    'confirmed': '✅',
    'taken': '📖',
    'reminder': '⏰',
    'expired': '⚠️',
    'returned': '📚',
    'review_invite': '💬',
    'review_approved': '✅',
    'review_rejected': '❌'
};

function loadNotifications(page = 1) {
    currentPage = page;
    
    fetch(`/api/user/notifications?page=${page}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderNotifications(data.notifications);
                renderPagination(data);
            } else {
                showError('Ошибка загрузки уведомлений');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Ошибка при загрузке');
        });
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    
    if (!notifications.length) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="empty-icon">🔔</div>
                <p>У вас нет уведомлений</p>
                <p class="small">Здесь будут отображаться уведомления о бронированиях</p>
            </div>
        `;
        return;
    }
    
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    
    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.is_read ? 'read' : 'unread'}" 
            data-id="${n.id}"
            data-type="${n.type}"
            data-reservation-id="${n.reservation_id || ''}"
            onclick="handleNotificationClick('${n.type}', ${n.reservation_id || 0})">
            <div class="notification-icon">${typeIcons[n.type] || '🔔'}</div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtml(n.title)}</div>
                <div class="notification-message">${escapeHtml(n.message)}</div>
                <div class="notification-date">${n.created_at}</div>
            </div>
        </div>
    `).join('');
    
    if (unreadIds.length > 0) {
        markAsRead(unreadIds);
    }
}

function renderPagination(data) {
    const container = document.getElementById('pagination');
    if (data.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<ul class="pagination">';
    
    if (data.page > 1) {
        html += `<li class="page-item"><button class="page-link" onclick="loadNotifications(${data.page - 1})">«</button></li>`;
    }
    
    for (let i = 1; i <= data.pages; i++) {
        html += `
            <li class="page-item ${i === data.page ? 'active' : ''}">
                <button class="page-link" onclick="loadNotifications(${i})">${i}</button>
            </li>
        `;
    }
    
    if (data.page < data.pages) {
        html += `<li class="page-item"><button class="page-link" onclick="loadNotifications(${data.page + 1})">»</button></li>`;
    }
    
    html += '</ul>';
    container.innerHTML = html;
}

function handleNotificationClick(type, reservationId) {
    if ((type === 'review_invite' || type === 'review_rejected') && reservationId) {
        fetch(`/api/reservation/${reservationId}/book-id`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const bookId = data.book_id;
                    // Проверяем, что функция существует
                    if (typeof openReviewModalPage === 'function') {
                        openReviewModalPage(bookId);
                    } else if (typeof openReviewModal === 'function') {
                        // fallback на старую функцию
                        openReviewModal(bookId);
                    } else {
                        // Если нет — редирект на главную с якорем
                        window.location.href = '/';
                    }
                }
            })
            .catch(error => console.error('Error:', error));
    }
}

function markAsRead(ids) {
    if (!ids.length) return;
    
    fetch('/api/user/notifications/mark-read', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ ids: ids })
    });
}

function markAllRead() {
    fetch('/api/user/notifications/mark-read', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ ids: [] })
    }).then(() => {
        loadNotifications(currentPage);
        if (typeof updateUnreadCount === 'function') {
            updateUnreadCount();
        }
    });
}

function showError(message) {
    const container = document.getElementById('notificationsList');
    container.innerHTML = `
        <div class="text-center py-5 text-danger">
            <p>❌ ${message}</p>
            <button class="btn btn-sm btn-outline-primary" onclick="loadNotifications(1)">Повторить</button>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    loadNotifications();
    
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllRead);
    }
});
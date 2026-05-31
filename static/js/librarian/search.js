// Librarian Search JavaScript
// Поиск пользователей по номеру заказа и управление их бронями

console.log("👥 Librarian Search Loaded");

// ============================================
// UTILITIES
// ============================================
const LibrarianSearchUtils = {
    setLoading: function(button, loading) {
        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || button.innerHTML;
        }
    },

    getStatusDisplay: function(status) {
        const statuses = {
            'pending': '⏳ Ожидает подтверждения',
            'ready': '✅ Готово к выдаче',
            'taken': '📖 Выдано (на руках)',
            'expired': '⚠️ Просрочено',
            'rejected': '❌ Отклонено',
            'returned': '✔ Завершено',
            'cancelled': '✖ Отменено'
        };
        return statuses[status] || status;
    },

    getStatusClass: function(status) {
        return `status-${status}`;
    }
};

// ============================================
// MAIN MODULE
// ============================================
const LibrarianSearchModule = {
    currentUser: null,
    
    init: function() {
        this.bindEvents();
        loadPendingReservations();
    },
    
    bindEvents: function() {
        const searchBtn = document.getElementById('searchUserBtn');
        const searchInput = document.getElementById('searchOrderInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        const backBtn = document.getElementById('backToSearchBtn');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchUsers());
        }
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchUsers();
                }
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearSearch());
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => this.backToSearch());
        }
    },
    
    searchUsers: function() {
        const query = document.getElementById('searchOrderInput').value.trim();
        
        if (!query || query.length < 4) {
            showNotification('Введите минимум 4 цифры номера заказа', 'warning');
            return;
        }
        
        const searchBtn = document.getElementById('searchUserBtn');
        LibrarianSearchUtils.setLoading(searchBtn, true);
        
        fetch(`/librarian/api/search-user?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.displayUsers(data.users, data.query);
                } else {
                    showNotification(data.error || 'Ошибка поиска', 'danger');
                }
            })
            .catch(error => {
                console.error('Search error:', error);
                showNotification('Ошибка при поиске', 'danger');
            })
            .finally(() => {
                LibrarianSearchUtils.setLoading(searchBtn, false);
            });
    },
    
    displayUsers: function(users, query) {
        const searchSection = document.getElementById('searchResultsSection');
        const usersList = document.getElementById('usersList');
        
        if (!users || users.length === 0) {
            usersList.innerHTML = `
                <div class="alert alert-info text-center">
                    <p class="mb-0">Пользователи с номером заказа "${query}" не найдены</p>
                </div>
            `;
            searchSection.classList.remove('d-none');
            document.getElementById('userReservationsSection').classList.add('d-none');
            return;
        }
        
        let html = '<div class="users-list">';
        users.forEach(user => {
            const blockedBadge = user.is_blocked ? 
                '<span class="user-badge blocked">🔒 Заблокирован</span>' : 
                '<span class="user-badge active">✅ Активен</span>';
            
            html += `
                <div class="user-card" data-user-id="${user.id}" data-user-name="${user.username}">
                    <div class="user-info">
                        <div class="user-avatar">${user.username[0].toUpperCase()}</div>
                        <div class="user-details">
                            <h4>${escapeHtml(user.username)}</h4>
                            <p>${escapeHtml(user.email)}</p>
                            <p class="text-muted small mb-0">Активных броней: ${user.active_reservations_count}</p>
                        </div>
                    </div>
                    <div class="user-status">
                        ${blockedBadge}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        usersList.innerHTML = html;
        searchSection.classList.remove('d-none');
        document.getElementById('userReservationsSection').classList.add('d-none');
        
        // Привязываем обработчики клика по пользователям
        document.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                const userId = card.dataset.userId;
                const userName = card.dataset.userName;
                this.loadUserReservations(userId, userName);
            });
        });
    },
    
    loadUserReservations: function(userId, userName) {        
        fetch(`/librarian/api/user/${userId}/reservations`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.displayUserReservations(data.reservations, userName, userId);
                    this.currentUser = { id: userId, name: userName };
                } else {
                    showNotification(data.error || 'Ошибка загрузки', 'danger');
                }
            })
            .catch(error => {
                console.error('Load reservations error:', error);
                showNotification('Ошибка при загрузке броней', 'danger');
            });
    },
    
    displayUserReservations: function(reservations, userName, userId) {
        const selectedUserInfo = document.getElementById('selectedUserInfo');
        const reservationsList = document.getElementById('reservationsList');
        
        // Информация о пользователе
        selectedUserInfo.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="user-avatar" style="width: 40px; height: 40px; font-size: 1rem;">
                    ${userName[0].toUpperCase()}
                </div>
                <div>
                    <h5 class="mb-0">${escapeHtml(userName)}</h5>
                    <p class="text-muted small mb-0">ID пользователя: ${userId}</p>
                </div>
            </div>
        `;
        
        if (!reservations || reservations.length === 0) {
            reservationsList.innerHTML = `
                <div class="alert alert-info text-center">
                    <p class="mb-0">У пользователя нет бронирований в ваших библиотеках</p>
                </div>
            `;
        } else {
            let html = '';
            reservations.forEach(res => {
                const statusDisplay = LibrarianSearchUtils.getStatusDisplay(res.status);
                const statusClass = LibrarianSearchUtils.getStatusClass(res.status);
                
                html += `
                    <div class="reservation-row" data-reservation-id="${res.id}">
                        <div class="reservation-info">
                            <div>
                                <span class="reservation-number">${escapeHtml(res.reservation_number)}</span>
                                <span class="reservation-status ${statusClass}">${statusDisplay}</span>
                            </div>
                            <div class="reservation-book-title">${escapeHtml(res.book_title)}</div>
                            <div class="reservation-book-author">${escapeHtml(res.book_author)}</div>
                            <div class="reservation-library">📚 ${escapeHtml(res.library_name)}</div>
                            <div class="reservation-dates small text-muted mt-1">
                                Забронировано: ${res.reservation_date}
                                ${res.confirmed_at ? ` | Подтверждено: ${res.confirmed_at}` : ''}
                                ${res.taken_at ? ` | Выдано: ${res.taken_at}` : ''}
                                ${res.returned_at ? ` | Возвращено: ${res.returned_at}` : ''}
                            </div>
                        </div>
                        <div class="reservation-actions" id="actions-${res.id}">
                            ${this.renderActionButtons(res)}
                        </div>
                    </div>
                `;
            });
            reservationsList.innerHTML = html;
            
            // Привязываем обработчики для кнопок действий
            reservations.forEach(res => {
                this.bindActionButtons(res);
            });
        }
        
        // Показываем секцию с бронями
        document.getElementById('searchResultsSection').classList.add('d-none');
        document.getElementById('userReservationsSection').classList.remove('d-none');
    },
    
    renderActionButtons: function(res) {
        let buttons = '';
        
        if (res.can_confirm) {
            buttons += `<button class="btn btn-success btn-sm confirm-btn" data-reservation-id="${res.id}" data-number="${res.reservation_number}">✓ Подтвердить</button>`;
        }
        if (res.can_reject) {
            buttons += `<button class="btn btn-outline-danger btn-sm reject-btn" data-reservation-id="${res.id}" data-number="${res.reservation_number}">✗ Отклонить</button>`;
        }
        if (res.can_take) {
            buttons += `<button class="btn btn-primary btn-sm take-btn" data-reservation-id="${res.id}" data-number="${res.reservation_number}">📖 Выдать книгу</button>`;
        }
        if (res.can_return) {
            buttons += `<button class="btn btn-outline-secondary btn-sm return-btn" data-reservation-id="${res.id}" data-number="${res.reservation_number}">↩️ Вернуть книгу</button>`;
        }
        
        return buttons || '<span class="text-muted small">Нет доступных действий</span>';
    },
    
    bindActionButtons: function(res) {
        const confirmBtn = document.querySelector(`.confirm-btn[data-reservation-id="${res.id}"]`);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmPendingReservation(res.id, res.reservation_number, confirmBtn);
            });
        }
        
        const rejectBtn = document.querySelector(`.reject-btn[data-reservation-id="${res.id}"]`);
        if (rejectBtn) {
            rejectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.rejectPendingReservation(res.id, res.reservation_number, rejectBtn);
            });
        }
        
        const takeBtn = document.querySelector(`.take-btn[data-reservation-id="${res.id}"]`);
        if (takeBtn) {
            takeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.takeReservation(res.id, res.reservation_number, takeBtn);
            });
        }
        
        const returnBtn = document.querySelector(`.return-btn[data-reservation-id="${res.id}"]`);
        if (returnBtn) {
            returnBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.returnReservation(res.id, res.reservation_number, returnBtn);
            });
        }
    },
    
    confirmPendingReservation: function(reservationId, number, button) {
        if (!confirm(`Подтвердить бронь ${number}?`)) return;
        
        LibrarianSearchUtils.setLoading(button, true);
        
        fetch(`/librarian/reservation/${reservationId}/confirm`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            // Сначала снимаем состояние загрузки с кнопки
            LibrarianSearchUtils.setLoading(button, false);
            
            if (data.success) {
                showNotification(data.message, 'success');
                loadPendingReservations();
                if (this.currentUser) {
                    this.loadUserReservations(this.currentUser.id, this.currentUser.name);
                }
                
                // Отправляем уведомление пользователю
                fetch(`/api/notify-user/${reservationId}/confirmed`, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }).catch(e => console.error('Notification error:', e));
            } else {
                throw new Error(data.error);
            }
        })
        .catch(error => {
            LibrarianSearchUtils.setLoading(button, false);
            showNotification(error.message, 'danger');
        });
    },
    
    rejectPendingReservation: function(reservationId, number, button) {
        if (!confirm(`Отклонить бронь ${number}?`)) return;
        
        LibrarianSearchUtils.setLoading(button, true);
        
        fetch(`/librarian/reservation/${reservationId}/reject`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            // Сначала снимаем состояние загрузки с кнопки
            LibrarianSearchUtils.setLoading(button, false);
            
            if (data.success) {
                showNotification(data.message, 'success');
                // Обновляем список ожидающих броней
                loadPendingReservations();
                if (this.currentUser) {
                    this.loadUserReservations(this.currentUser.id, this.currentUser.name);
                }
            } else {
                throw new Error(data.error);
            }
        })
        .catch(error => {
            LibrarianSearchUtils.setLoading(button, false);
            showNotification(error.message, 'danger');
        });
    },
    
    takeReservation: function(reservationId, number, button) {
        if (!confirm(`Выдать книгу по заказу ${number}? Пользователь получит книгу на руки.`)) return;
        
        LibrarianSearchUtils.setLoading(button, true);
        
        fetch(`/librarian/reservation/${reservationId}/take`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            // Снимаем загрузку
            LibrarianSearchUtils.setLoading(button, false);
            
            if (data.success) {
                showNotification(data.message, 'success');
                
                fetch(`/api/notify-user/${reservationId}/taken`, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }).catch(e => console.error('Notification error:', e));
                
                if (this.currentUser) {
                    this.loadUserReservations(this.currentUser.id, this.currentUser.name);
                }
            } else {
                throw new Error(data.error);
            }
        })
        .catch(error => {
            LibrarianSearchUtils.setLoading(button, false);
            showNotification(error.message, 'danger');
        });
    },
    
    returnReservation: function(reservationId, number, button) {
        if (!confirm(`Вернуть книгу по заказу ${number}?`)) return;
        
        LibrarianSearchUtils.setLoading(button, true);
        
        fetch(`/librarian/reservation/${reservationId}/return`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            LibrarianSearchUtils.setLoading(button, false);
            
            if (data.success) {
                showNotification(data.message, 'success');
                if (this.currentUser) {
                    this.loadUserReservations(this.currentUser.id, this.currentUser.name);
                }
            } else {
                throw new Error(data.error);
            }
        })
        .catch(error => {
            LibrarianSearchUtils.setLoading(button, false);
            showNotification(error.message, 'danger');
        });
    },
    
    clearSearch: function() {
        document.getElementById('searchOrderInput').value = '';
        document.getElementById('searchResultsSection').classList.add('d-none');
        document.getElementById('userReservationsSection').classList.add('d-none');
        document.getElementById('usersList').innerHTML = '';
        document.getElementById('reservationsList').innerHTML = '';
        this.currentUser = null;
    },
    
    backToSearch: function() {
        document.getElementById('userReservationsSection').classList.add('d-none');
        document.getElementById('searchResultsSection').classList.remove('d-none');
        this.currentUser = null;
    },
};

// ============================================
// PENDING RESERVATIONS MODULE
// ============================================

function loadPendingReservations() {
    fetch('/librarian/api/pending-reservations')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayPendingReservations(data.reservations);
            }
        })
        .catch(error => console.error('Error loading pending:', error));
}

function displayPendingReservations(reservations) {
    const container = document.getElementById('pendingReservationsList');
    const countSpan = document.getElementById('pendingCount');
    
    if (!container) return;
    
    if (!reservations.length) {
        container.innerHTML = '<div class="text-muted text-center py-3">Нет заявок, ожидающих подтверждения</div>';
        if (countSpan) countSpan.textContent = '0';
        return;
    }
    
    if (countSpan) countSpan.textContent = reservations.length;
    
    let html = '';
    reservations.forEach(res => {
        html += `
            <div class="reservation-row pending-row" data-reservation-id="${res.id}">
                <div class="reservation-info">
                    <span class="reservation-number">${escapeHtml(res.reservation_number)}</span>
                    <div class="reservation-book-title">${escapeHtml(res.book_title)}</div>
                    <div class="reservation-user">👤 ${escapeHtml(res.user_name)}</div>
                    <div class="reservation-library">📚 ${escapeHtml(res.library_name)}</div>
                    <div class="reservation-date">📅 ${res.reservation_date}</div>
                </div>
                <div class="reservation-actions">
                    <button class="btn btn-success btn-sm confirm-pending" data-id="${res.id}" data-number="${res.reservation_number}">✔ Подтвердить</button>
                    <button class="btn btn-outline-danger btn-sm reject-pending" data-id="${res.id}" data-number="${res.reservation_number}">✖ Отклонить</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Привязываем обработчики через существующие методы модуля
    document.querySelectorAll('.confirm-pending').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            LibrarianSearchModule.confirmPendingReservation(btn.dataset.id, btn.dataset.number, btn);
        });
    });
    
    document.querySelectorAll('.reject-pending').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            LibrarianSearchModule.rejectPendingReservation(btn.dataset.id, btn.dataset.number, btn);
        });
    });
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    LibrarianSearchModule.init();
});
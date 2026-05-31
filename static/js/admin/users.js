// Admin Users Management Module

console.log("👥 Admin Users Loaded");

const AdminUsers = (function() {
    // Состояние
    let currentPage = 1;
    let perPage = 20;
    let selectMode = false;
    let selectedUsers = new Set();
    let userDetailModal = null;
    let addUserModal = null;
    let currentSort = 'id';
    let currentSortDir = 'asc';
    
    // ============================================
    // INIT
    // ============================================
    function init() {
        userDetailModal = new bootstrap.Modal(document.getElementById('userDetailModal'));
        addUserModal = new bootstrap.Modal(document.getElementById('addUserModal'));
        loadLibrariesForSelect();
        loadUsers();
        bindSortableHeaders();
        bindFilters();
        bindSelectMode();
        bindEditForm();
        bindAddUserForm();
    }
    
    // ============================================
    // LOAD USERS
    // ============================================
    function loadUsers() {
        const search = document.getElementById('userSearch').value.trim();
        const role = document.getElementById('roleFilter').value;
        const status = document.getElementById('statusFilter').value;
        
        const params = new URLSearchParams({
            q: search,
            role: role,
            status: status,
            page: currentPage,
            per_page: perPage
        });
        
        params.append('sort', currentSort);
        params.append('sort_dir', currentSortDir);
        
        fetch(`/admin/api/users?${params}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    renderTable(data.users);
                    renderPagination(data);
                }
            })
            .catch(error => console.error('Error loading users:', error));
    }

    function bindSortableHeaders() {
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', function() {
                const sort = this.dataset.sort;
                
                if (currentSort === sort) {
                    currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort = sort;
                    currentSortDir = 'asc';
                }
                
                // Обновляем иконки
                document.querySelectorAll('.sortable').forEach(el => {
                    el.classList.remove('asc', 'desc');
                });
                this.classList.add(currentSortDir);
                
                currentPage = 1;
                loadUsers();
            });
        });
    }

    function renderTable(users) {
        const tbody = document.getElementById('usersTableBody');
        
        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-muted">
                        Пользователи не найдены
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = users.map(user => {
            const roleBadge = {
                'user': '<span class="badge bg-primary">Пользователь</span>',
                'librarian': '<span class="badge bg-info">Библиотекарь</span>',
                'admin': '<span class="badge bg-dark">Админ</span>'
            }[user.role] || user.role;
            
            const statusBadge = user.is_blocked
                ? '<span class="badge badge-expired">🔒 Заблокирован</span>'
                : '<span class="badge bg-success">✅ Активен</span>';
            
            const blockedByIcon = user.blocked_by === 'system' ? '🤖' : '👤';
            
            return `
                <tr class="user-row" data-user-id="${user.id}">
                    <td class="select-col ${selectMode ? '' : 'd-none'}">
                        <input type="checkbox" class="user-checkbox" data-user-id="${user.id}" 
                            data-is-blocked="${user.is_blocked}"
                            ${selectedUsers.has(user.id) ? 'checked' : ''}>
                    </td>
                    <td>${user.id}</td>
                    <td>
                        <a href="#" class="user-link" data-user-id="${user.id}">
                            ${escapeHtml(user.username)}
                        </a>
                    </td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge} ${user.is_blocked ? blockedByIcon : ''}</td>
                    <td>
                        <span class="badge bg-warning rounded-pill">${user.active_reservations}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Привязка кликов по пользователю
        document.querySelectorAll('.user-link').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const userId = this.dataset.userId;
                openUserModal(userId);
            });
        });
        
        // Чекбоксы в режиме выбора
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
                const userId = parseInt(this.dataset.userId);
                if (this.checked) {
                    selectedUsers.add(userId);
                } else {
                    selectedUsers.delete(userId);
                }
                updateBlockButton();
            });
        });
    }
    
    function renderPagination(data) {
        const info = document.getElementById('paginationInfo');
        const buttons = document.getElementById('paginationButtons');
        
        const start = (data.page - 1) * perPage + 1;
        const end = Math.min(data.page * perPage, data.total);
        info.textContent = `Показано ${start}-${end} из ${data.total}`;
        
        let html = '<ul class="pagination mb-0">';
        
        if (data.page > 1) {
            html += `<li class="page-item"><button class="page-link" onclick="AdminUsers.goToPage(${data.page - 1})">«</button></li>`;
        }
        
        for (let i = 1; i <= data.pages; i++) {
            html += `
                <li class="page-item ${i === data.page ? 'active' : ''}">
                    <button class="page-link" onclick="AdminUsers.goToPage(${i})">${i}</button>
                </li>
            `;
        }
        
        if (data.page < data.pages) {
            html += `<li class="page-item"><button class="page-link" onclick="AdminUsers.goToPage(${data.page + 1})">»</button></li>`;
        }
        
        html += '</ul>';
        buttons.innerHTML = html;
    }
    
    function goToPage(page) {
        currentPage = page;
        loadUsers();
    }
    
    // ============================================
    // FILTERS
    // ============================================
    function bindFilters() {
        const searchInput = document.getElementById('userSearch');
        const roleFilter = document.getElementById('roleFilter');
        const statusFilter = document.getElementById('statusFilter');
        const perPageSelect = document.getElementById('perPageSelect');
        
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                loadUsers();
            }, 300);
        });
        
        roleFilter.addEventListener('change', () => { currentPage = 1; loadUsers(); });
        statusFilter.addEventListener('change', () => { currentPage = 1; loadUsers(); });
        
        perPageSelect.addEventListener('change', function() {
            perPage = parseInt(this.value);
            currentPage = 1;
            loadUsers();
        });
    }
    
    // ============================================
    // SELECT MODE (блокировка/разблокировка)
    // ============================================
    function bindSelectMode() {
        const btnSelect = document.getElementById('btnSelectMode');
        const btnBlock = document.getElementById('btnBlockSelected');
        const btnCancel = document.getElementById('btnCancelSelect');
        const btnDelete = document.getElementById('btnDeleteSelected');
        
        btnSelect.addEventListener('click', function() {
            selectMode = true;
            selectedUsers.clear();
            loadUsers();
            
            // Показываем колонку с чекбоксами и кнопки
            document.querySelectorAll('.select-col').forEach(col => col.classList.remove('d-none'));
            btnSelect.classList.add('d-none');
            btnBlock.classList.remove('d-none');
            btnDelete.classList.remove('d-none');
            btnCancel.classList.remove('d-none');
            btnBlock.disabled = true;
            btnBlock.textContent = '🔒 Заблокировать/Разблокировать выбранных';
            
            // Добавляем чекбоксы к уже отрисованным строкам
            document.querySelectorAll('.user-row').forEach(row => {
                const td = row.querySelector('.select-col');
                if (td) {
                    td.classList.remove('d-none');
                    // Если чекбокса ещё нет — создаём
                    if (!td.querySelector('.user-checkbox')) {
                        const userId = row.dataset.userId;
                        const isBlocked = row.querySelector('.badge-expired') !== null;
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.className = 'user-checkbox';
                        cb.dataset.userId = userId;
                        cb.dataset.isBlocked = isBlocked;
                        cb.addEventListener('change', function() {
                            if (this.checked) {
                                selectedUsers.add(parseInt(userId));
                            } else {
                                selectedUsers.delete(parseInt(userId));
                            }
                            updateBlockButton();
                        });
                        td.appendChild(cb);
                    }
                }
            });
        });
        
        btnCancel.addEventListener('click', function() {
            selectMode = false;
            selectedUsers.clear();
            loadUsers();
            
            // Скрываем колонку с чекбоксами
            document.querySelectorAll('.select-col').forEach(col => {
                col.classList.add('d-none');
                // Убираем чекбоксы
                const cb = col.querySelector('.user-checkbox');
                if (cb) cb.checked = false;
            });
            
            btnSelect.classList.remove('d-none');
            btnBlock.classList.add('d-none');
            btnDelete.classList.add('d-none');
            btnCancel.classList.add('d-none');
            btnBlock.disabled = true;
        });
        
        btnBlock.addEventListener('click', function() {
            if (selectedUsers.size === 0) return;
            
            let blockCount = 0;
            let unblockCount = 0;
            
            document.querySelectorAll('.user-checkbox:checked').forEach(cb => {
                if (cb.dataset.isBlocked === 'true') {
                    unblockCount++;
                } else {
                    blockCount++;
                }
            });
            
            const message = `Заблокировать: ${blockCount}, разблокировать: ${unblockCount}. Продолжить?`;
            if (!confirm(message)) return;
            
            const btn = btnBlock;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            fetch('/admin/api/users/block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_ids: Array.from(selectedUsers) })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification(data.message, 'success');
                    btnCancel.click();
                    loadUsers();
                }
            })
            .catch(error => showNotification('Ошибка', 'danger'))
            .finally(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        });

        btnDelete.addEventListener('click', function() {
            if (selectedUsers.size === 0) return;
            
            if (!confirm('⚠️ Это действие необратимо! Вы уверены, что хотите удалить выбранных пользователей?')) return;
            
            const btn = btnDelete;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            fetch('/admin/api/users/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_ids: Array.from(selectedUsers) })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification(data.message, 'success');
                    btnCancel.click();
                    loadUsers();
                } else {
                    showNotification(data.error, 'danger');
                }
            })
            .catch(error => showNotification('Ошибка', 'danger'))
            .finally(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        });
    }
    
    function updateBlockButton() {
        const btn = document.getElementById('btnBlockSelected');
        const btnDelete = document.getElementById('btnDeleteSelected');
        
        btn.disabled = selectedUsers.size === 0;
        btnDelete.disabled = selectedUsers.size === 0;
        
        if (selectedUsers.size > 0) {
            const blockCount = Array.from(document.querySelectorAll('.user-checkbox:checked'))
                .filter(cb => cb.dataset.isBlocked === 'false').length;
            const unblockCount = selectedUsers.size - blockCount;
            btn.textContent = `🔒 Заблокировать (${blockCount}) / Разблокировать (${unblockCount})`;
        }
    }
    
    // ============================================
    // USER MODAL
    // ============================================
    function openUserModal(userId) {
        if (selectMode) return;
        
        fetch(`/admin/api/user/${userId}/details`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    renderUserModal(data.user, data.reservations);
                    userDetailModal.show();
                }
            });
    }
    
    function renderUserModal(user, reservations) {
        document.getElementById('modalUserName').textContent = user.username;
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editRole').value = user.role;
        document.getElementById('editPassword').value = '';
        
        // Показать/скрыть и заполнить библиотеки
        const editLibrariesContainer = document.getElementById('editLibrariesContainer');
        if (user.role === 'librarian') {
            editLibrariesContainer.classList.remove('d-none');
            renderLibrariesCheckboxes('editLibrariesList', user.library_ids || []);
        } else {
            editLibrariesContainer.classList.add('d-none');
        }
        
        // Статус с деталями
        let statusHtml = '';
        if (user.is_blocked) {
            const blockedByText = user.blocked_by === 'system' ? 'Система (просрочка)' : 'Администратор';
            const blockedReasonText = user.blocked_reason === 'expired' ? 'Просрочка возврата книги' : 'Ручная блокировка';
            statusHtml = `
                <div class="alert alert-danger">
                    <strong>🔒 Заблокирован</strong><br>
                    <small>Когда: ${user.blocked_at || '—'}</small><br>
                    <small>Кем: ${blockedByText}</small><br>
                    <small>Причина: ${blockedReasonText}</small>
                </div>
            `;
        } else {
            statusHtml = '<div class="alert alert-success">✅ Активен</div>';
        }
        
        document.getElementById('userDetailInfo').innerHTML = statusHtml;
        
        // Активные брони
        const reservationsDiv = document.getElementById('userReservations');
        if (reservations.length === 0) {
            reservationsDiv.innerHTML = '<p class="text-muted">Нет активных броней</p>';
        } else {
            reservationsDiv.innerHTML = reservations.map(res => `
                <div class="reservation-row">
                    <div class="reservation-info">
                        <span class="reservation-number">${escapeHtml(res.reservation_number)}</span>
                        <span class="reservation-status status-${res.status}">${res.status_display}</span>
                        <div class="reservation-book-title">${escapeHtml(res.book_title)}</div>
                        <div class="reservation-book-author">${escapeHtml(res.book_author)}</div>
                        <div class="reservation-library">📚 ${escapeHtml(res.library_name)}</div>
                        <div class="reservation-dates small text-muted">
                            Забронировано: ${res.reservation_date}
                            ${res.taken_at ? ` | Выдано: ${res.taken_at}` : ''}
                            ${res.days_left !== null ? ` | Дней осталось: ${res.days_left}` : ''}
                        </div>
                    </div>
                    <div class="reservation-actions">
                        ${res.can_cancel ? `<button class="btn btn-outline-danger btn-sm cancel-res-btn" data-res-id="${res.id}">✖ Отменить</button>` : ''}
                        ${res.can_return ? `<button class="btn btn-outline-secondary btn-sm return-res-btn" data-res-id="${res.id}">↩ Вернуть</button>` : ''}
                    </div>
                </div>
            `).join('');
            
            // Привязка кнопок
            document.querySelectorAll('.cancel-res-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    cancelReservation(this.dataset.resId);
                });
            });
            
            document.querySelectorAll('.return-res-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    returnReservation(this.dataset.resId);
                });
            });
        }
    }
    
    function cancelReservation(resId) {
        if (!confirm('Отменить бронь?')) return;
        
        fetch(`/librarian/reservation/${resId}/cancel`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Бронь отменена', 'success');
                userDetailModal.hide();
                loadUsers();
            }
        });
    }
    
    function returnReservation(resId) {
        if (!confirm('Вернуть книгу?')) return;
        
        fetch(`/librarian/reservation/${resId}/return`, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                userDetailModal.hide();
                loadUsers();
            }
        });
    }
    
    // ============================================
    // EDIT USER
    // ============================================
    function bindEditForm() {
        const form = document.getElementById('userEditForm');
        const togglePwd = document.getElementById('toggleEditPassword');
        const clearPwd = document.getElementById('clearEditPassword');
        const generatePwd = document.getElementById('generateEditPassword');
        const pwdInput = document.getElementById('editPassword');
        const roleSelect = document.getElementById('editRole');
        const librariesContainer = document.getElementById('editLibrariesContainer');
        
        // Показать/скрыть выбор библиотек при смене роли
        roleSelect.addEventListener('change', function() {
            if (this.value === 'librarian') {
                librariesContainer.classList.remove('d-none');
            } else {
                librariesContainer.classList.add('d-none');
            }
        });
        
        // Показать/скрыть пароль
        togglePwd.addEventListener('click', function() {
            const type = pwdInput.type === 'password' ? 'text' : 'password';
            pwdInput.type = type;
            this.textContent = type === 'password' ? '😑' : '🫣';
        });
        
        // Очистить пароль
        clearPwd.addEventListener('click', function() {
            pwdInput.value = '';
        });
        
        // Сгенерировать пароль
        generatePwd.addEventListener('click', function() {
            fetch('/api/generate-password', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    pwdInput.value = data.password;
                    
                    navigator.clipboard.writeText(data.password).then(() => {
                        showNotification('Пароль скопирован в буфер', 'success');
                    });
                });
        });
        
        // Сохранить
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const userId = document.getElementById('editUserId').value;
            const username = document.getElementById('editUsername').value.trim();
            const email = document.getElementById('editEmail').value.trim();
            const role = roleSelect.value;
            const password = pwdInput.value;
            
            const payload = { username, email, role };
            if (password) payload.password = password;
            payload.library_ids = role === 'librarian' ? getSelectedLibraryIds('editLibrariesList') : [];
            
            fetch(`/admin/api/user/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Пользователь обновлён', 'success');
                    userDetailModal.hide();
                    loadUsers();
                } else {
                    showNotification(data.error, 'danger');
                }
            });
        });
    }
    
    // ============================================
    // ADD USER
    // ============================================
    function bindAddUserForm() {
        const btnAdd = document.getElementById('btnAddUser');
        const form = document.getElementById('addUserForm');
        const togglePwd = document.getElementById('toggleAddPassword');
        const generatePwd = document.getElementById('generateAddPassword');
        const pwdInput = document.getElementById('addPassword');
        const roleSelect = document.getElementById('addRole');
        const librariesContainer = document.getElementById('addLibrariesContainer');
        
        // Открытие модалки
        btnAdd.addEventListener('click', function() {
            document.getElementById('addUsername').value = '';
            document.getElementById('addEmail').value = '';
            document.getElementById('addPassword').value = '';
            roleSelect.value = 'user';
            librariesContainer.classList.add('d-none');
            renderLibrariesCheckboxes('addLibrariesList', []);
            addUserModal.show();
        });
        
        // Показать/скрыть выбор библиотек при смене роли
        roleSelect.addEventListener('change', function() {
            if (this.value === 'librarian') {
                librariesContainer.classList.remove('d-none');
            } else {
                librariesContainer.classList.add('d-none');
            }
        });
        
        // Показать/скрыть пароль
        togglePwd.addEventListener('click', function() {
            const type = pwdInput.type === 'password' ? 'text' : 'password';
            pwdInput.type = type;
            this.textContent = type === 'password' ? '😑' : '🫣';
        });
        
        // Генерация пароля
        generatePwd.addEventListener('click', function() {
            fetch('/api/generate-password', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    pwdInput.value = data.password;
                    
                    navigator.clipboard.writeText(data.password).then(() => {
                        showNotification('Пароль скопирован в буфер', 'success');
                    });
                });
        });
        
        // Отправка формы
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('addUsername').value.trim();
            const email = document.getElementById('addEmail').value.trim();
            const role = roleSelect.value;
            const password = document.getElementById('addPassword').value;
            
            if (!username || !email || !password) {
                showNotification('Заполните все поля', 'warning');
                return;
            }
            
            const btn = form.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            const library_ids = role === 'librarian' ? getSelectedLibraryIds('addLibrariesList') : [];
            
            fetch('/admin/api/user/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, role, password, library_ids })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Пользователь создан', 'success');
                    addUserModal.hide();
                    currentPage = 1;
                    loadUsers();
                } else {
                    showNotification(data.error, 'danger');
                }
            })
            .finally(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        });
    }

    function loadLibrariesForSelect() {
        fetch('/admin/api/libraries/all')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window._allLibraries = data.libraries;
                    renderLibrariesCheckboxes('addLibrariesList', []);
                    renderLibrariesCheckboxes('editLibrariesList', []);
                }
            });
    }

    function renderLibrariesCheckboxes(containerId, selectedIds) {
        const container = document.getElementById(containerId);
        if (!container || !window._allLibraries) return;
        
        container.innerHTML = window._allLibraries.map(lib => `
            <div class="author-checkbox-item">
                <label>
                    <input type="checkbox" class="library-checkbox" value="${lib.id}" 
                        ${selectedIds.includes(lib.id) ? 'checked' : ''}>
                    ${escapeHtml(lib.name)} — ${escapeHtml(lib.address)}
                </label>
            </div>
        `).join('');
    }

    function getSelectedLibraryIds(containerId) {
        const ids = [];
        document.querySelectorAll(`#${containerId} .library-checkbox:checked`).forEach(cb => {
            ids.push(parseInt(cb.value));
        });
        return ids;
    }
    
    return {
        init: init,
        goToPage: goToPage
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    AdminUsers.init();
});
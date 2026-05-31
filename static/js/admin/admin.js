// Modern Admin Panel JavaScript - Modular Architecture
// Using IIFE pattern for encapsulation

console.log("🎯 Admin Panel Loaded");

// ============================================
// GLOBAL UTILITIES MODULE
// ============================================
const AdminUtils = (function() {
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    return {
        formatFileSize: formatFileSize,
        
        setLoading: function(button, loading) {
            if (loading) {
                button.dataset.originalText = button.innerHTML;
                button.disabled = true;
                button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';
            } else {
                button.disabled = false;
                button.innerHTML = button.dataset.originalText || button.innerHTML;
            }
        }
    };
})();

// ============================================
// LIBRARY SELECTS MODULE
// ============================================
const LibrarySelectsModule = (function() {
    function init() {
        const addBookSelect = document.getElementById('add-book-select');
        const addLibrarySelect = document.getElementById('add-library-select');
        const addRelationBtn = document.getElementById('add-relation-btn');
        
        const deleteBookSelect = document.getElementById('delete-book-select');
        const deleteLibrarySelect = document.getElementById('delete-library-select');
        const deleteRelationBtn = document.getElementById('delete-relation-btn');

        if (addBookSelect && addLibrarySelect) {
            addBookSelect.addEventListener('change', function() {
                const bookId = this.value;
                if (!bookId) {
                    resetSelect(addLibrarySelect, '-- Сначала выберите книгу --', true);
                    addRelationBtn.disabled = true;
                    return;
                }
                loadLibraries(bookId, 'without-book', addLibrarySelect, addRelationBtn);
            });

            addLibrarySelect.addEventListener('change', function() {
                addRelationBtn.disabled = !this.value;
            });
        }

        if (deleteBookSelect && deleteLibrarySelect) {
            deleteBookSelect.addEventListener('change', function() {
                const bookId = this.value;
                if (!bookId) {
                    resetSelect(deleteLibrarySelect, '-- Сначала выберите книгу --', true);
                    deleteRelationBtn.disabled = true;
                    return;
                }
                loadLibraries(bookId, 'with-book', deleteLibrarySelect, deleteRelationBtn);
            });

            deleteLibrarySelect.addEventListener('change', function() {
                deleteRelationBtn.disabled = !this.value;
            });
        }
    }
    
    function resetSelect(selectElement, placeholder, disabled) {
        selectElement.innerHTML = `<option value="">${placeholder}</option>`;
        selectElement.disabled = disabled;
    }
    
    function loadLibraries(bookId, type, selectElement, buttonElement) {
        selectElement.innerHTML = '<option value="">Загрузка...</option>';
        selectElement.disabled = false;
        
        fetch(`/admin/api/libraries/${type}/${bookId}`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(libraries => {
                if (libraries.length === 0) {
                    selectElement.innerHTML = `<option value="">Нет доступных библиотек</option>`;
                    buttonElement.disabled = true;
                } else {
                    selectElement.innerHTML = '<option value="">-- Выберите библиотеку --</option>';
                    libraries.forEach(library => {
                        selectElement.innerHTML += `<option value="${library.id}">${library.name} — ${library.address}</option>`;
                    });
                    buttonElement.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                selectElement.innerHTML = '<option value="">Ошибка загрузки</option>';
                buttonElement.disabled = true;
            });
    }
    
    return { init: init };
})();

// ============================================
// COLLAPSE PANELS MODULE
// ============================================
const CollapsePanelsModule = (function() {
    function init() {
        const collapseToggles = document.querySelectorAll('.collapse-toggle');
        
        collapseToggles.forEach(toggle => {
            const targetId = toggle.getAttribute('data-bs-target');
            const targetElement = document.querySelector(targetId);
            const cardElement = targetElement.closest('.card');
            const storageKey = `panel-${targetId}-collapsed`;
            
            const isCollapsed = localStorage.getItem(storageKey) === 'true';
            if (isCollapsed) {
                collapsePanel(targetElement, cardElement, toggle, true);
            }
            
            toggle.addEventListener('click', function() {
                const targetId = this.getAttribute('data-bs-target');
                const targetElement = document.querySelector(targetId);
                const cardElement = targetElement.closest('.card');
                const storageKey = `panel-${targetId}-collapsed`;
                
                if (targetElement.classList.contains('collapsed')) {
                    expandPanel(targetElement, cardElement, this);
                    localStorage.setItem(storageKey, 'false');
                } else {
                    collapsePanel(targetElement, cardElement, this);
                    localStorage.setItem(storageKey, 'true');
                }
                
                setTimeout(updateGlobalToggle, 450);
            });
        });

        createGlobalToggle();
        setTimeout(restoreAllPanelsState, 200);
    }
    
    function collapsePanel(targetElement, cardElement, toggle, instant = false) {
        if (instant) {
            targetElement.style.display = 'none';
            targetElement.classList.add('collapsed');
            cardElement.classList.add('collapsed-card');
            toggle.classList.remove('arrow-up');
            toggle.classList.add('arrow-down');
            return;
        }
        
        targetElement.style.height = targetElement.scrollHeight + 'px';
        targetElement.offsetHeight;
        
        targetElement.style.height = '0';
        targetElement.style.opacity = '0';
        targetElement.style.overflow = 'hidden';
        targetElement.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            targetElement.style.display = 'none';
            targetElement.classList.add('collapsed');
            cardElement.classList.add('collapsed-card');
            toggle.classList.remove('arrow-up');
            toggle.classList.add('arrow-down');
            targetElement.style.height = '';
            targetElement.style.opacity = '';
        }, 300);
    }
    
    function expandPanel(targetElement, cardElement, toggle) {
        targetElement.style.display = 'block';
        const height = targetElement.scrollHeight;
        
        targetElement.style.height = '0';
        targetElement.style.opacity = '0';
        targetElement.style.overflow = 'hidden';
        targetElement.style.transition = 'all 0.3s ease';
        
        targetElement.offsetHeight;
        
        targetElement.style.height = height + 'px';
        targetElement.style.opacity = '1';
        
        setTimeout(() => {
            targetElement.classList.remove('collapsed');
            cardElement.classList.remove('collapsed-card');
            toggle.classList.remove('arrow-down');
            toggle.classList.add('arrow-up');
            targetElement.style.height = '';
            targetElement.style.overflow = '';
            targetElement.style.transition = '';
        }, 300);
    }
    
    function createGlobalToggle() {
        const collapseToggles = document.querySelectorAll('.collapse-toggle');
        const globalToggle = document.getElementById('toggle-all-panels');
        
        if (!globalToggle) return;
        
        function updateButtonText() {
            const collapsedCount = Array.from(collapseToggles).filter(toggle => 
                toggle.classList.contains('arrow-down')
            ).length;
            const totalCount = collapseToggles.length;
            
            if (collapsedCount === totalCount) {
                globalToggle.innerHTML = '<span>⬇️</span> Развернуть все панели';
            } else {
                globalToggle.innerHTML = '<span>⬆️</span> Свернуть все панели';
            }
        }

        globalToggle.addEventListener('click', function() {
            const collapsedCount = Array.from(collapseToggles).filter(toggle => 
                toggle.classList.contains('arrow-down')
            ).length;
            const action = collapsedCount === collapseToggles.length ? 'expand' : 'collapse';
            
            collapseToggles.forEach(toggle => {
                const targetId = toggle.getAttribute('data-bs-target');
                const targetElement = document.querySelector(targetId);
                const cardElement = targetElement.closest('.card');
                
                if (action === 'expand') {
                    expandPanel(targetElement, cardElement, toggle);
                    localStorage.setItem(`panel-${targetId}-collapsed`, 'false');
                } else {
                    collapsePanel(targetElement, cardElement, toggle);
                    localStorage.setItem(`panel-${targetId}-collapsed`, 'true');
                }
            });
            
            setTimeout(updateButtonText, 350);
        });

        window.updateGlobalToggle = updateButtonText;
    }
    
    function restoreAllPanelsState() {
        const collapseToggles = document.querySelectorAll('.collapse-toggle');
        
        collapseToggles.forEach(toggle => {
            const targetId = toggle.getAttribute('data-bs-target');
            const targetElement = document.querySelector(targetId);
            const cardElement = targetElement.closest('.card');
            const storageKey = `panel-${targetId}-collapsed`;
            
            const isCollapsed = localStorage.getItem(storageKey) === 'true';
            
            if (isCollapsed && !targetElement.classList.contains('collapsed')) {
                collapsePanel(targetElement, cardElement, toggle, true);
            } else if (!isCollapsed && targetElement.classList.contains('collapsed')) {
                expandPanel(targetElement, cardElement, toggle);
            }
        });
        
        if (window.updateGlobalToggle) {
            setTimeout(window.updateGlobalToggle, 100);
        }
    }
    
    return { init: init };
})();

// ============================================
// COPIES MANAGEMENT MODULE
// ============================================
const CopiesManagementModule = (function() {
    function init() {
        const librarySelect = document.getElementById('library-select-stats');
        const loadStatsBtn = document.getElementById('load-stats-btn');
        
        if (librarySelect && loadStatsBtn) {
            librarySelect.addEventListener('change', function() {
                loadStatsBtn.disabled = !this.value;
            });
            
            loadStatsBtn.addEventListener('click', function() {
                const libraryId = librarySelect.value;
                if (!libraryId) return;
                loadLibraryDetails(libraryId);
            });
        }
    }
    
    function loadLibraryDetails(libraryId) {
        const loadBtn = document.getElementById('load-stats-btn');
        const originalText = loadBtn.innerHTML;
        
        loadBtn.disabled = true;
        loadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';
        
        fetch(`/admin/api/library/${libraryId}/details`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    document.getElementById('stats-block').classList.remove('d-none');
                    document.getElementById('management-block').classList.remove('d-none');
                    document.getElementById('reservations-block').classList.remove('d-none');
                    document.getElementById('no-data-message').classList.add('d-none');
                    
                    displayLibraryStats(data.data);
                    displayBooksTable(data.data.books);
                    displayReservations(data.data.reservations);
                } else {
                    throw new Error(data.error || 'Неизвестная ошибка');
                }
            })
            .catch(error => {
                showNotification('Ошибка загрузки данных: ' + error.message, 'danger');
            })
            .finally(() => {
                loadBtn.disabled = false;
                loadBtn.innerHTML = originalText;
            });
    }
    
    function displayLibraryStats(data) {
        const stats = data.stats;
        document.getElementById('total-books').textContent = stats.total_books;
        document.getElementById('total-copies').textContent = stats.total_copies;
        document.getElementById('available-copies').textContent = stats.available_copies;
        document.getElementById('reserved-copies').textContent = stats.reserved_copies;
    }
    
    function displayBooksTable(books) {
        const tableBody = document.getElementById('books-table-body');
        
        if (books.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        Нет книг в этой библиотеке
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = '';
            
            books.forEach(book => {
                const row = document.createElement('tr');
                row.id = `book-row-${book.book_id}`;
                
                row.innerHTML = `
                    <td class="fw-medium">${book.title}</td>
                    <td class="text-muted">${book.author}</td>
                    <td><span class="badge bg-primary rounded-pill">${book.total_quantity}</span></td>
                    <td><span class="badge bg-success rounded-pill">${book.available_quantity}</span></td>
                    <td><span class="badge bg-warning rounded-pill">${book.reserved_quantity}</span></td>
                    <td>
                        <div class="input-group">
                            <input type="number" 
                                    class="form-control quantity-input" 
                                    value="${book.total_quantity}" 
                                    min="${book.reserved_quantity}" 
                                    max="100"
                                    data-book-id="${book.book_id}"
                                    data-original-value="${book.total_quantity}">
                            <button class="btn btn-outline-primary update-quantity-btn" 
                                    type="button"
                                    data-book-id="${book.book_id}">
                                Обновить
                            </button>
                        </div>
                        <small class="text-muted d-block mt-1" style="font-size: 0.75rem;">
                            Минимум: ${book.reserved_quantity}
                        </small>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
            
            document.querySelectorAll('.update-quantity-btn').forEach(btn => {
                btn.addEventListener('click', function(event) {
                    event.preventDefault();
                    
                    const bookId = this.getAttribute('data-book-id');
                    const libraryId = document.getElementById('library-select-stats').value;
                    const input = document.querySelector(`.quantity-input[data-book-id="${bookId}"]`);
                    const quantity = parseInt(input.value);
                    const minValue = parseInt(input.getAttribute('min'));
                    
                    if (quantity < minValue) {
                        showNotification(`Нельзя установить меньше ${minValue} (есть активные брони)`, 'warning');
                        input.value = minValue;
                        return;
                    }
                    
                    updateBookQuantity(bookId, libraryId, quantity, input, this);
                });
            });
        }
    }
    
    function displayReservations(reservations) {
        const reservationsBody = document.getElementById('reservations-body');
        
        if (reservations.length === 0) {
            reservationsBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-4">
                        Нет активных броней
                    </td>
                </tr>
            `;
        } else {
            reservationsBody.innerHTML = '';
            
            reservations.forEach(res => {
                const row = document.createElement('tr');
                
                let daysBadge = '';
                if (res.days_text) {
                    if (res.days_text === 'Сегодня') {
                        daysBadge = '<span class="badge bg-danger">Сегодня</span>';
                    } else if (res.days_text.includes('назад')) {
                        daysBadge = `<span class="badge bg-danger">${res.days_text}</span>`;
                    } else if (res.days_left === 1) {
                        daysBadge = '<span class="badge bg-warning">1 день</span>';
                    } else {
                        daysBadge = `<span class="badge bg-info">${res.days_text}</span>`;
                    }
                }
                
                row.innerHTML = `
                    <td class="fw-medium">${res.book_title}</td>
                    <td>${res.user_name}</td>
                    <td class="text-muted">${res.reservation_date}</td>
                    <td>${res.expiry_date} ${daysBadge}</td>
                `;
                
                reservationsBody.appendChild(row);
            });
        }
    }
    
    function updateBookQuantity(bookId, libraryId, quantity, inputElement, buttonElement) {
        const originalButtonText = buttonElement.innerHTML;
        const rowElement = inputElement.closest('tr');
        
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        inputElement.disabled = true;
        
        fetch('/admin/api/book_library/update_quantity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                book_id: parseInt(bookId),
                library_id: parseInt(libraryId),
                quantity: quantity
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Количество обновлено!', 'success');
                updateSingleRow(rowElement, data.data, quantity);
                updateStatsOnly(libraryId);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            showNotification('Ошибка обновления: ' + error.message, 'danger');
            inputElement.value = inputElement.getAttribute('data-original-value') || quantity;
        })
        .finally(() => {
            buttonElement.disabled = false;
            buttonElement.innerHTML = originalButtonText;
            inputElement.disabled = false;
        });
    }
    
    function updateSingleRow(rowElement, data, newQuantity) {
        rowElement.querySelector('td:nth-child(3) .badge').textContent = data.total_quantity;
        rowElement.querySelector('td:nth-child(4) .badge').textContent = data.available_quantity;
        rowElement.querySelector('td:nth-child(5) .badge').textContent = data.reserved_quantity;
        
        const input = rowElement.querySelector('.quantity-input');
        input.setAttribute('min', data.reserved_quantity);
        input.setAttribute('data-original-value', newQuantity);
        
        const hint = rowElement.querySelector('small.text-muted');
        if (hint) {
            hint.textContent = `Минимум: ${data.reserved_quantity}`;
        }
        
        rowElement.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        setTimeout(() => {
            rowElement.style.backgroundColor = '';
        }, 1000);
    }
    
    function updateStatsOnly(libraryId) {
        fetch(`/admin/api/library/${libraryId}/details`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const stats = data.data.stats;
                    document.getElementById('total-books').textContent = stats.total_books;
                    document.getElementById('total-copies').textContent = stats.total_copies;
                    document.getElementById('available-copies').textContent = stats.available_copies;
                    document.getElementById('reserved-copies').textContent = stats.reserved_copies;
                }
            })
            .catch(error => console.error('Ошибка обновления статистики:', error));
    }
    
    return { init: init };
})();

// ============================================
// UNIVERSAL COVER/PHOTO MODAL MODULE
// ============================================
const UniversalCoverModal = (function() {
    let currentFile = null;
    let currentEntityId = null;
    let currentEntityType = 'book';
    let isNewBook = false;
    let modalInstance = null;
    
    function init() {
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('.btn-cover, .btn-author-photo');
            if (!btn) return;
            
            const entityId = btn.dataset.bookId || btn.dataset.authorId;
            const entityName = btn.dataset.bookTitle || btn.dataset.authorName;
            const existingFile = btn.dataset.coverFilename || btn.dataset.photoFilename;
            const entityType = btn.dataset.entityType || 'book';
            
            isNewBook = (entityId === 'new');
            
            openModal(entityId, entityName, existingFile, entityType);
        });
        
        initModalHandlers();
    }
    
    function initModalHandlers() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('coverFileInput');
        const btnSave = document.getElementById('btnSaveCover');
        const btnDelete = document.getElementById('btnDeleteCover');
        const btnReplace = document.getElementById('btnReplaceCover');
        
        if (!dropZone) return;
        
        const coverModal = document.getElementById('coverModal');
        if (coverModal) {
            coverModal.addEventListener('hidden.bs.modal', resetModal);
        }
        
        dropZone.addEventListener('click', (e) => {
            if (e.target.closest('.drop-zone-preview')) return;
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            }, false);
        });
        
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
        
        if (btnSave) btnSave.addEventListener('click', saveFile);
        if (btnDelete) btnDelete.addEventListener('click', deleteFile);
        if (btnReplace) btnReplace.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    function handleFileSelect(file) {
        hideError();
        
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showError('Недопустимый формат. Разрешены: JPG, PNG, WEBP');
            return;
        }
        
        currentFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('previewImage').src = e.target.result;
            document.getElementById('dropZoneContent').style.display = 'none';
            document.getElementById('dropZonePreview').style.display = 'flex';
            document.getElementById('fileInfo').style.display = 'flex';
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = formatFileSize(file.size);
            
            // ИСПРАВЛЕНИЕ: показываем кнопку "Сохранить" и скрываем "Удалить"
            const btnSave = document.getElementById('btnSaveCover');
            const btnDelete = document.getElementById('btnDeleteCover');
            const btnReplace = document.getElementById('btnReplaceCover');
            
            btnSave.disabled = false;
            btnSave.style.display = 'inline-flex';
            btnDelete.style.display = 'none';
            btnReplace.style.display = 'inline-flex';
        };
        reader.readAsDataURL(file);
    }
    
    function openModal(entityId, entityName, existingFile, entityType) {
        currentEntityId = entityId;
        currentEntityType = entityType;
        
        document.getElementById('coverBookTitle').textContent = entityName;
        document.getElementById('coverBookId').value = entityId;
        
        resetModal();
        hideError();
        
        const btnSave = document.getElementById('btnSaveCover');
        const btnDelete = document.getElementById('btnDeleteCover');
        const btnReplace = document.getElementById('btnReplaceCover');
        
        if (existingFile) {
            const folder = entityType === 'author' ? 'authors' : 'covers';
            document.getElementById('previewImage').src = `/static/uploads/${folder}/${existingFile}`;
            document.getElementById('dropZoneContent').style.display = 'none';
            document.getElementById('dropZonePreview').style.display = 'flex';
            document.getElementById('fileInfo').style.display = 'flex';
            document.getElementById('fileName').textContent = entityType === 'author' ? 'Текущее фото' : 'Текущая обложка';
            document.getElementById('fileSize').textContent = '';
            
            // Режим просмотра: скрываем "Сохранить", показываем "Удалить" и "Заменить"
            btnSave.disabled = true;
            btnSave.style.display = 'none';
            btnDelete.style.display = 'inline-flex';
            btnReplace.style.display = 'inline-flex';
        } else {
            // Режим добавления: показываем "Сохранить" (disabled), скрываем "Удалить" и "Заменить"
            btnSave.disabled = true;
            btnSave.style.display = 'inline-flex';
            btnDelete.style.display = 'none';
            btnReplace.style.display = 'none';
        }
        
        modalInstance = new bootstrap.Modal(document.getElementById('coverModal'));
        modalInstance.show();
    }
    
    function resetModal() {
        currentFile = null;
        document.getElementById('coverFileInput').value = '';
        document.getElementById('dropZoneContent').style.display = 'flex';
        document.getElementById('dropZonePreview').style.display = 'none';
        document.getElementById('fileInfo').style.display = 'none';
        
        const btnSave = document.getElementById('btnSaveCover');
        const btnDelete = document.getElementById('btnDeleteCover');
        const btnReplace = document.getElementById('btnReplaceCover');
        
        btnSave.disabled = true;
        btnSave.style.display = 'inline-flex';
        btnDelete.style.display = 'none';
        btnReplace.style.display = 'none';
        
        hideError();
    }
    
    function showError(message) {
        const errorDiv = document.getElementById('coverError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
    
    function hideError() {
        document.getElementById('coverError').style.display = 'none';
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    function saveFile() {
        if (!currentFile) return;
        
        if (isNewBook) {
            saveNewBookCover();
            return;
        }
        
        const btn = document.getElementById('btnSaveCover');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        hideError();
        
        const formData = new FormData();
        formData.append(currentEntityType === 'author' ? 'photo' : 'cover', currentFile);
        
        const endpoint = currentEntityType === 'author' 
            ? `/admin/author/${currentEntityId}/upload_photo`
            : `/admin/book/${currentEntityId}/upload_cover`;
        
        fetch(endpoint, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            return data;
        })
        .then(data => {
            if (data.success) {
                showNotification(currentEntityType === 'author' ? 'Фото сохранено!' : 'Обложка сохранена!', 'success');
                if (modalInstance) modalInstance.hide();
                setTimeout(() => location.reload(), 500);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            showError('Ошибка: ' + error.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }

    function saveNewBookCover() {
        const btn = document.getElementById('btnSaveCover');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        hideError();
        
        const formData = new FormData();
        formData.append('cover', currentFile);
        formData.append('is_new_book', 'true');
        
        fetch('/admin/book/upload_cover_temp', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            return data;
        })
        .then(data => {
            if (data.success) {
                document.getElementById('add-book-cover-filename').value = data.filename;
                
                const preview = document.getElementById('add-book-cover-preview');
                const previewImg = preview.querySelector('img');
                previewImg.src = data.cover_url;
                preview.classList.remove('d-none');
                
                const coverBtn = document.getElementById('add-book-cover-btn');
                coverBtn.innerHTML = '🔄 Заменить обложку';
                coverBtn.dataset.coverFilename = data.filename;
                
                showNotification('Обложка загружена!', 'success');
                if (modalInstance) modalInstance.hide();
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            showError('Ошибка: ' + error.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    function deleteFile() {
        if (!currentEntityId) return;
        
        const confirmMessage = currentEntityType === 'author' 
            ? 'Удалить фото автора?' 
            : 'Удалить обложку?';
        
        if (!confirm(confirmMessage)) return;
        
        const btn = document.getElementById('btnDeleteCover');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Удаление...';
        hideError();
        
        const endpoint = currentEntityType === 'author'
            ? `/admin/author/${currentEntityId}/delete_photo`
            : `/admin/book/${currentEntityId}/delete_cover`;
        
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json'
            }
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            return data;
        })
        .then(data => {
            if (data.success) {
                showNotification(currentEntityType === 'author' ? 'Фото удалено' : 'Обложка удалена', 'success');
                if (modalInstance) modalInstance.hide();
                setTimeout(() => location.reload(), 500);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            console.error('Delete error:', error);
            showError('Ошибка: ' + error.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    return { init: init };
})();

// ============================================
// AUTHORS MODAL MODULE (for admin_panel.html)
// ============================================
const AuthorsModalModule = (function() {
    let authorsModal = null;
    let quickAuthorModal = null;
    let editAuthorModal = null;
    let easyMDE = null;
    
    function init() {
        authorsModal = new bootstrap.Modal(document.getElementById('authorsModal'));
        quickAuthorModal = new bootstrap.Modal(document.getElementById('quickAuthorModal'));
        editAuthorModal = new bootstrap.Modal(document.getElementById('editAuthorModal'));
        
        initAddBookAuthors();
        initEditAuthorsButtons();
        initSaveAuthors();
        initQuickAddAuthor();
        initSaveQuickAuthor();
        initEditAuthorButtons();
        initSaveEditAuthor();
    }
    
    function initAddBookAuthors() {
        const addBookAuthorsBtn = document.getElementById('add-book-authors-btn');
        const addBookForm = document.getElementById('add-book-form');
        
        if (addBookAuthorsBtn) {
            addBookAuthorsBtn.addEventListener('click', function() {
                document.getElementById('modal-mode').value = 'add';
                document.getElementById('modal-book-title').textContent = 'Новая книга';
                document.getElementById('modal-book-id').value = 'new';
                
                document.querySelectorAll('.author-checkbox').forEach(cb => {
                    cb.checked = false;
                });
                
                authorsModal.show();
            });
        }
        
        // ИСПРАВЛЕНИЕ: перехватываем отправку формы добавления книги
        if (addBookForm) {
            addBookForm.addEventListener('submit', function(e) {
                // ВАЖНО: предотвращаем стандартную отправку формы
                e.preventDefault();
                e.stopPropagation();
                
                const submitBtn = addBookForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Добавление...';
                
                const formData = new FormData(addBookForm);
                
                // Получаем выбранных авторов из скрытого поля
                const authorIdsValue = document.getElementById('add-book-author-ids').value;
                if (authorIdsValue) {
                    // Удаляем пустое значение если есть и добавляем правильные ID
                    formData.delete('author_ids');
                    authorIdsValue.split(',').forEach(id => {
                        if (id.trim()) formData.append('author_ids', id.trim());
                    });
                }
                
                // Если авторы не выбраны — берём из текстового поля или показываем ошибку
                const title = formData.get('title');
                const genre = formData.get('genre');
                
                if (!title || !genre) {
                    alert('Заполните название и жанр');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                    return;
                }
                
                fetch(addBookForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: {'X-Requested-With': 'XMLHttpRequest'}
                })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                            throw new Error(`HTTP ${response.status}: ${text}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        // Добавляем новый жанр в список комбобокса
                        const genre = document.getElementById('genreHidden').value;
                        if (genre && typeof GenreCombobox !== 'undefined') {
                            GenreCombobox.addNewGenre(genre);
                        }
                        showNotification(data.message || 'Книга добавлена', 'success');
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        throw new Error(data.error || 'Неизвестная ошибка');
                    }
                })
                .catch(error => {
                    console.error('Add book error:', error);
                    showNotification('Ошибка: ' + error.message, 'danger');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                });
            });
        }
    }
    
    function initEditAuthorsButtons() {
        document.querySelectorAll('.edit-authors-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const bookId = this.dataset.bookId;
                const bookTitle = this.dataset.bookTitle;
                
                document.getElementById('modal-mode').value = 'edit';
                document.getElementById('modal-book-title').textContent = `Книга: ${bookTitle}`;
                document.getElementById('modal-book-id').value = bookId;
                
                const authorIdsField = document.getElementById(`author-ids-${bookId}`);
                const selectedIds = authorIdsField.value ? authorIdsField.value.split(',').map(Number) : [];
                
                document.querySelectorAll('.author-checkbox').forEach(cb => {
                    cb.checked = selectedIds.includes(parseInt(cb.value));
                });
                
                authorsModal.show();
            });
        });
    }
    
    function initSaveAuthors() {
        document.getElementById('save-authors-modal').addEventListener('click', function() {
            const mode = document.getElementById('modal-mode').value;
            const bookId = document.getElementById('modal-book-id').value;
            
            const selectedAuthors = [];
            document.querySelectorAll('.author-checkbox:checked').forEach(cb => {
                selectedAuthors.push(parseInt(cb.value));
            });
            
            if (mode === 'add') {
                const addBookAuthorIds = document.getElementById('add-book-author-ids');
                if (addBookAuthorIds) {
                    addBookAuthorIds.value = selectedAuthors.join(',');
                    
                    fetch('/admin/api/authors/batch', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ids: selectedAuthors})
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            updateSelectedAuthorsPreview(data.authors);
                        }
                    });
                }
            } else {
                const authorIdsField = document.getElementById(`author-ids-${bookId}`);
                if (authorIdsField) {
                    authorIdsField.value = selectedAuthors.join(',');
                    
                    fetch('/admin/api/authors/batch', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ids: selectedAuthors})
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            updateSelectedAuthorsDisplay(bookId, data.authors);
                            
                            const form = document.getElementById(`book-form-${bookId}`);
                            if (form) {
                                const formData = new FormData(form);
                                selectedAuthors.forEach(id => {
                                    formData.append('author_ids', id);
                                });
                                
                                fetch(form.action, {
                                    method: 'POST',
                                    body: formData,
                                    headers: {'X-Requested-With': 'XMLHttpRequest'}
                                })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        showNotification('Авторы обновлены', 'success');
                                    }
                                });
                            }
                        }
                    });
                }
            }
            
            authorsModal.hide();
        });
    }
    
    function initQuickAddAuthor() {
        document.getElementById('modal-quick-add-author').addEventListener('click', function() {
            const bookId = document.getElementById('modal-book-id').value;
            const mode = document.getElementById('modal-mode').value;
            
            authorsModal.hide();
            
            setTimeout(() => {
                document.getElementById('quick-author-target-book').value = bookId;
                document.getElementById('quick-author-mode').value = mode;
                document.getElementById('quick-author-name').value = '';
                document.getElementById('quick-author-bio').value = '';
                quickAuthorModal.show();
            }, 500);
        });
    }
    
    function initSaveQuickAuthor() {
        document.getElementById('quick-author-save').addEventListener('click', function() {
            const name = document.getElementById('quick-author-name').value.trim();
            const bio = document.getElementById('quick-author-bio').value.trim();
            const bookId = document.getElementById('quick-author-target-book').value;
            const mode = document.getElementById('quick-author-mode').value;
            
            if (!name) {
                alert('Введите имя автора');
                return;
            }
            
            const formData = new FormData();
            formData.append('name', name);
            formData.append('bio', bio);
            
            fetch('/admin/author/quick_add', {
                method: 'POST',
                body: formData,
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const checkboxList = document.getElementById('authors-checkbox-list');
                    const newCheckbox = document.createElement('div');
                    newCheckbox.className = 'author-checkbox-item';
                    newCheckbox.innerHTML = `
                        <label>
                            <input type="checkbox" name="modal_author_ids" value="${data.author.id}" class="author-checkbox" checked>
                            ${AdminUtils.escapeHtml(data.author.name)}
                        </label>
                    `;
                    checkboxList.appendChild(newCheckbox);
                    
                    quickAuthorModal.hide();
                    
                    setTimeout(() => {
                        document.getElementById('modal-book-id').value = bookId;
                        document.getElementById('modal-mode').value = mode;
                        authorsModal.show();
                    }, 500);
                    
                    showNotification('Автор добавлен', 'success');
                } else {
                    alert('Ошибка: ' + data.error);
                }
            })
            .catch(error => {
                alert('Ошибка при добавлении автора');
                console.error(error);
            });
        });
    }
    
    function initEditAuthorButtons() {
        document.querySelectorAll('.edit-author-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const authorId = this.dataset.authorId;
                const authorName = this.dataset.authorName;
                const authorBio = this.dataset.authorBio;
                
                document.getElementById('edit-author-id').value = authorId;
                document.getElementById('edit-author-name').value = authorName;
                
                const mde = initEasyMDE();
                mde.value(authorBio);
                
                editAuthorModal.show();
            });
        });
    }
    
    function initSaveEditAuthor() {
        document.getElementById('save-edit-author').addEventListener('click', function() {
            const authorId = document.getElementById('edit-author-id').value;
            const name = document.getElementById('edit-author-name').value.trim();
            const bio = easyMDE ? easyMDE.value() : document.getElementById('edit-author-bio').value.trim();
            
            if (!name) {
                alert('Имя автора обязательно');
                return;
            }
            
            const formData = new FormData();
            formData.append('name', name);
            formData.append('bio', bio);
            
            fetch(`/admin/author/edit/${authorId}`, {
                method: 'POST',
                body: formData,
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Автор обновлен', 'success');
                    editAuthorModal.hide();
                    
                    const row = document.getElementById(`author-row-${authorId}`);
                    if (row) {
                        const nameInput = row.querySelector('input[name="name"]');
                        if (nameInput) nameInput.value = name;
                        
                        const bioPreview = row.querySelector('.bio-preview');
                        if (bioPreview) {
                            bioPreview.textContent = bio.length > 50 ? bio.substring(0, 50) + '...' : bio;
                        }
                    }
                } else {
                    alert('Ошибка: ' + data.error);
                }
            })
            .catch(error => {
                alert('Ошибка при сохранении');
                console.error(error);
            });
        });
    }
    
    function initEasyMDE() {
        if (!easyMDE) {
            const textarea = document.getElementById('edit-author-bio');
            easyMDE = new EasyMDE({
                element: textarea,
                placeholder: "Напишите биографию автора...",
                toolbar: ['bold', 'italic', 'heading', '|', 
                          'quote', 'unordered-list', 'ordered-list', '|',
                          'link', '|', 'preview'],
                spellChecker: false,
                status: false,
                autoDownloadFontAwesome: false,
                hideIcons: ['side-by-side', 'fullscreen'],
                shortcuts: {
                    "togglePreview": null,
                    "toggleSideBySide": null,
                    "toggleFullScreen": null
                }
            });
        }
        return easyMDE;
    }
    
    function updateSelectedAuthorsDisplay(bookId, authors) {
        const container = document.getElementById(`selected-authors-${bookId}`);
        if (!container) return;
        
        if (authors.length === 0) {
            container.innerHTML = '<span class="text-muted">Нет авторов</span>';
            return;
        }
        
        let html = '<div class="selected-authors-tags">';
        authors.slice(0, 2).forEach(author => {
            html += `<span class="author-tag">${AdminUtils.escapeHtml(author.name)}</span>`;
        });
        if (authors.length > 2) {
            html += `<span class="author-tag more">+${authors.length - 2}</span>`;
        }
        html += '</div>';
        
        container.innerHTML = html;
    }
    
    function updateSelectedAuthorsPreview(authors) {
        const addBookSelectedAuthors = document.getElementById('add-book-selected-authors');
        if (!addBookSelectedAuthors) return;
        
        if (authors.length === 0) {
            addBookSelectedAuthors.innerHTML = '';
            return;
        }
        
        let html = '<div class="selected-authors-tags">';
        authors.slice(0, 2).forEach(author => {
            html += `<span class="author-tag">${AdminUtils.escapeHtml(author.name)}</span>`;
        });
        if (authors.length > 2) {
            html += `<span class="author-tag more">+${authors.length - 2}</span>`;
        }
        html += '</div>';
        
        addBookSelectedAuthors.innerHTML = html;
    }
    
    return { init: init };
})();

// ============================================
// AJAX FORMS MODULE
// ============================================
const AjaxFormsModule = (function() {
    function init() {
        document.querySelectorAll('form[method="post"]').forEach(form => {
            if (form.id === 'add-book-form') return;
            if (!form.closest('table')) {
                form.addEventListener('submit', handleFormSubmit);
            }
        });
        
        document.querySelectorAll('form[id^="book-form-"], form[id^="library-form-"]').forEach(form => {
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            
            newForm.addEventListener('submit', function(event) {
                event.preventDefault();
                
                const formData = new FormData(this);
                const formId = this.id;
                const submitButton = document.querySelector(`button[form="${formId}"]`);
                const originalHTML = submitButton.innerHTML;
                
                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                fetch(this.action, {
                    method: 'POST',
                    body: formData,
                    headers: { 
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showNotification(data.message, 'success');
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        throw new Error(data.error || 'Unknown error');
                    }
                })
                .catch(error => {
                    showNotification('Ошибка при сохранении: ' + error.message, 'danger');
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalHTML;
                });
            });
        });
        
        document.addEventListener('click', function(event) {
            const deleteLink = event.target.closest('a[href*="/delete/"]');
            if (deleteLink) {
                handleDeleteClick(event);
            }
        });
    }
    
    function handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        
        fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
            return data;
        }))
        .then(data => {
            if (data.success) {
                showNotification(data.message || 'Успешно сохранено!', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        });
    }
    
    function handleDeleteClick(event) {
        event.preventDefault();
        
        if (!confirm('Вы уверены, что хотите удалить?')) return;
        
        const link = event.target.closest('a');
        const originalText = link.innerHTML;
        
        link.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        link.style.pointerEvents = 'none';
        
        fetch(link.href, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json().then(data => {
            if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
            return data;
        }))
        .then(data => {
            if (data.success) {
                showNotification(data.message || 'Удалено!', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
            link.innerHTML = originalText;
            link.style.pointerEvents = 'auto';
        });
    }
    
    return { init: init };
})();

// ============================================
// MAIN INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    LibrarySelectsModule.init();
    CollapsePanelsModule.init();
    CopiesManagementModule.init();
    UniversalCoverModal.init();
    AjaxFormsModule.init();
    AuthorsModalModule.init();
    GenreCombobox.init('genreInput', 'genreDropdown', 'genreSearch', 'genreHidden', 'genreList');
});
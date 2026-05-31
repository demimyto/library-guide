// Book Modal JavaScript
// Handles book cards, modals, and interactions

let bookModal = null;
let bookAuthorsModal = null;
let editBookModal = null;
let easyMDE = null;
let currentBookId = null;
let isOpeningReserve = false;
let savedSearchQuery = '';
let savedActiveFilter = 'all';
let lastOpenedFrom = null;

document.addEventListener('DOMContentLoaded', function() {
    initBookCards();
    initModals();
    initEditBook();
});

// Initialize click handlers for book cards
function initBookCards() {
    document.querySelectorAll('.book-card-new').forEach(card => {
        if (card._clickHandler) {
            card.removeEventListener('click', card._clickHandler);
        }
        
        const handler = function(e) {
            if (e.target.closest('.book-card-author-link')) {
                return;
            }
            const bookId = this.dataset.bookId;
            
            let source = 'catalog';
            if (window.location.pathname.includes('/author/')) {
                source = 'catalog';
            } else if (document.getElementById('searchModal')) {
                const searchModalEl = document.getElementById('searchModal');
                if (searchModalEl && searchModalEl.classList.contains('show')) {
                    source = 'search';
                }
            }
            
            openBookModal(bookId, source);
        };
        
        card._clickHandler = handler;
        card.addEventListener('click', handler);
    });
}

// Initialize Bootstrap modals
function initModals() {
    const bookModalEl = document.getElementById('bookModal');
    const bookAuthorsModalEl = document.getElementById('bookAuthorsModal');
    const editBookModalEl = document.getElementById('editBookModal');
    
    if (bookModalEl) {
        bookModal = new bootstrap.Modal(bookModalEl);
    }
    if (bookAuthorsModalEl) {
        bookAuthorsModal = new bootstrap.Modal(bookAuthorsModalEl);
    }
    if (editBookModalEl) {
        editBookModal = new bootstrap.Modal(editBookModalEl);
    }
}

// Open book modal
function openBookModal(bookId, source = 'catalog') {
    const isAuthenticated = document.body.dataset.userAuthenticated === 'true';
    
    if (!isAuthenticated) {
        window.location.href = '/login';
        return;
    }
    
    currentBookId = bookId;
    isOpeningReserve = false;
    lastOpenedFrom = source;
    
    fetch(`/api/book/${bookId}`)
        .then(response => response.json())
        .then(data => {
            renderBookModal(data);
            bookModal.show();
        })
        .catch(error => {
            console.error('Error loading book:', error);
            showNotification('Ошибка загрузки книги', 'danger');
        });
}

// Render book modal content
function renderBookModal(book) {
    const content = document.getElementById('bookModalContent');
    const isAdmin = document.body.dataset.userAdmin === 'true';
    
    let authorsHtml = '';
    if (book.authors && book.authors.length > 0) {
        const authorsCount = book.authors.length;
        const firstAuthor = book.authors[0];
        const secondAuthor = authorsCount >= 2 ? book.authors[1] : null;
        
        let avatarsHtml = '';
        
        const firstPhotoUrl = firstAuthor.photo 
            ? `/static/uploads/authors/${firstAuthor.photo}`
            : null;
        avatarsHtml += `
            <a href="/author/${firstAuthor.id}" class="author-avatar-link" onclick="event.stopPropagation()">
                ${firstPhotoUrl 
                    ? `<img src="${firstPhotoUrl}" alt="${escapeHtml(firstAuthor.name)}" class="author-avatar-inline">`
                    : `<div class="author-avatar-placeholder-inline"><span>${firstAuthor.name[0].toUpperCase()}</span></div>`
                }
            </a>
        `;
        
        if (secondAuthor) {
            const secondPhotoUrl = secondAuthor.photo 
                ? `/static/uploads/authors/${secondAuthor.photo}`
                : null;
            avatarsHtml += `
                <a href="/author/${secondAuthor.id}" class="author-avatar-link" onclick="event.stopPropagation()">
                    ${secondPhotoUrl 
                        ? `<img src="${secondPhotoUrl}" alt="${escapeHtml(secondAuthor.name)}" class="author-avatar-inline">`
                        : `<div class="author-avatar-placeholder-inline"><span>${secondAuthor.name[0].toUpperCase()}</span></div>`
                    }
                </a>
            `;
        }
        
        let namesHtml = '';
        if (authorsCount === 1) {
            namesHtml = `
                <a href="/author/${firstAuthor.id}" class="book-modal-author-name" onclick="event.stopPropagation()">
                    ${escapeHtml(firstAuthor.name)}
                </a>
            `;
        } else if (authorsCount === 2) {
            namesHtml = `
                <a href="/author/${firstAuthor.id}" class="book-modal-author-name" onclick="event.stopPropagation()">
                    ${escapeHtml(firstAuthor.name)}
                </a>
                <span style="color: var(--slate-500); margin: 0 4px;">и</span>
                <a href="/author/${secondAuthor.id}" class="book-modal-author-name" onclick="event.stopPropagation()">
                    ${escapeHtml(secondAuthor.name)}
                </a>
            `;
        } else {
            namesHtml = `
                <a href="/author/${firstAuthor.id}" class="book-modal-author-name" onclick="event.stopPropagation()">
                    ${escapeHtml(firstAuthor.name)}
                </a>
                <span class="book-modal-more-authors" onclick="showAllAuthors(${book.id})">и ещё ${authorsCount - 1}</span>
            `;
        }
        
        const label = authorsCount === 1 ? 'Автор:' : 'Авторы:';
        
        authorsHtml = `
            <div class="book-modal-authors-section">
                <span class="book-modal-authors-label">${label}</span>
                <div class="book-modal-authors-content">
                    <div class="author-avatars-group">
                        ${avatarsHtml}
                    </div>
                    <div class="author-names-group">
                        ${namesHtml}
                    </div>
                </div>
            </div>
        `;
    }
    
    let librariesHtml = '';
    if (book.libraries && book.libraries.length > 0) {
        const visibleLibraries = book.libraries.slice(0, 3);
        const hiddenCount = book.libraries.length - 3;
        
        librariesHtml = '<div class="book-modal-libraries">';
        
        visibleLibraries.forEach(lib => {
            librariesHtml += `<span class="library-badge-small">${escapeHtml(lib.name)}</span>`;
        });
        
        if (hiddenCount > 0) {
            librariesHtml += `<span class="library-badge-small more">+${hiddenCount}</span>`;
        }
        
        librariesHtml += '</div>';
    }
    
    const editButton = isAdmin 
        ? `<button type="button" class="btn-edit-book" onclick="openEditBookModal(${book.id})" title="Редактировать">✏️</button>`
        : '';
    
    content.innerHTML = `
        <div class="book-modal-left">
            <div class="book-cover-container" style="height: 450px;">
                ${book.cover 
                    ? `
                        <div class="book-cover-bg" style="background-image: url('/static/uploads/covers/${book.cover}')"></div>
                        <img src="/static/uploads/covers/${book.cover}" alt="${escapeHtml(book.title)}">
                    `
                    : '<div class="cover-placeholder-full">📚</div>'
                }
            </div>
            <button type="button" class="btn btn-primary btn-reserve-full" onclick="openReserveModal(${book.id})">
                Забронировать
            </button>
        </div>
        <div class="book-modal-right">
            <div class="book-modal-header">
                <h2 class="book-modal-title">${escapeHtml(book.title)}</h2>
                ${editButton}
            </div>
            
            <!-- Авторы -->
            ${authorsHtml}
            
            <!-- Рейтинг -->
            <div class="book-modal-rating" id="bookModalRating">
                <span class="book-modal-label">Рейтинг:</span>
                <span class="rating-stars-large" id="modalRatingStars">—</span>
                <span class="rating-text" id="modalRatingText"></span>
            </div>

            <!-- Жанр -->
            <div class="book-modal-genre-wrapper">
                <span class="book-modal-genre-label">Жанр:</span>
                <span class="book-modal-genre">${escapeHtml(book.genre)}</span>
            </div>
            
            <!-- Библиотеки -->
            ${librariesHtml ? `
                <div class="book-modal-libraries-wrapper">
                    <span class="book-modal-label">Доступно в библиотеках:</span>
                    <span class="book-modal-libraries">${librariesHtml}</span>
                </div>
            ` : ''}
            
            <!-- Описание -->
            <div class="book-modal-description ${book.description ? '' : 'empty'}">
                ${book.description_html || 'Нет описания'}
            </div>
        </div>
    `;
    loadBookRating(book.id);
}

function loadBookRating(bookId) {
    fetch(`/api/books/ratings?ids=${bookId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.ratings[bookId]) {
                const rating = data.ratings[bookId];
                const starsEl = document.getElementById('modalRatingStars');
                const textEl = document.getElementById('modalRatingText');
                
                if (starsEl && rating.avg > 0) {
                    starsEl.textContent = BookRatings.renderStars(rating.avg);
                    starsEl.style.color = 'var(--slate-800)';
                    starsEl.style.fontWeight = '600';
                    starsEl.style.fontSize = '1rem';
                    starsEl.style.cursor = 'pointer';
                    starsEl.title = 'Посмотреть отзывы';
                    starsEl.onclick = function() { openReviewModal(bookId); };
                    
                    if (textEl) {
                        textEl.textContent = `${rating.total} 💬`;
                    }
                } else if (starsEl) {
                    starsEl.textContent = 'Нет оценок';
                }
            }
        });
}

function openReviewModal(bookId) {
    // Закрываем модалку книги
    window._redirectingFromBook = true;
    if (bookModal) bookModal.hide();
    
    // Открываем модалку отзывов
    setTimeout(() => {
        if (typeof openReviewModalPage === 'function') {
            openReviewModalPage(bookId);
        }
    }, 200);
}

// Show all authors in separate modal
function showAllAuthors(bookId) {
    if (bookModal) {
        bookModal.hide();
    }
    
    fetch(`/api/book/${bookId}`)
        .then(response => response.json())
        .then(data => {
            const listContainer = document.getElementById('bookAuthorsList');
            
            let html = '';
            data.authors.forEach(author => {
                const photoUrl = author.photo 
                    ? `/static/uploads/authors/${author.photo}`
                    : null;
                
                html += `
                    <a href="/author/${author.id}" class="author-list-item">
                        ${photoUrl 
                            ? `<img src="${photoUrl}" alt="${escapeHtml(author.name)}" class="author-list-avatar">`
                            : `<div class="author-list-avatar-placeholder">${author.name[0].toUpperCase()}</div>`
                        }
                        <div class="author-list-info">
                            <div class="author-list-name">${escapeHtml(author.name)}</div>
                            <div class="author-list-books">${author.books_count || 0} книг</div>
                        </div>
                    </a>
                `;
            });
            
            listContainer.innerHTML = html;
            
            const authorsModalEl = document.getElementById('bookAuthorsModal');
            authorsModalEl.addEventListener('hidden.bs.modal', function reopenBookModal() {
                authorsModalEl.removeEventListener('hidden.bs.modal', reopenBookModal);
                if (currentBookId) {
                    openBookModal(currentBookId);
                }
            }, { once: true });
            
            bookAuthorsModal.show();
        });
}

// Close authors modal
function closeAuthorsModal() {
    if (bookAuthorsModal) {
        bookAuthorsModal.hide();
    }
}

// Open edit book modal (admin only)
function openEditBookModal(bookId) {
    // Закрываем модалку книги перед открытием редактирования
    window._redirectingFromBook = true;
    if (bookModal) {
        bookModal.hide();
    }
    
    fetch(`/api/book/${bookId}`)
        .then(response => response.json())
        .then(data => {
            console.log('API response:', data);
            console.log('Description from API:', data.description);

            document.getElementById('edit-book-id').value = data.id;
            document.getElementById('edit-book-title').value = data.title;
            
            // Показываем модалку сразу
            editBookModal.show();
            
            // Инициализируем EasyMDE ПОСЛЕ показа модалки
            setTimeout(() => {
                initOrUpdateEasyMDE(data.description || '');
            }, 200);
        });
    
    // При закрытии редактирования — возвращаемся к модалке книги
    const editModalEl = document.getElementById('editBookModal');
    editModalEl.addEventListener('hidden.bs.modal', function reopenBookModal() {
        editModalEl.removeEventListener('hidden.bs.modal', reopenBookModal);
        if (currentBookId) {
            openBookModal(currentBookId);
        }
    }, { once: true });
}

// Отдельная функция для инициализации/обновления EasyMDE
function initOrUpdateEasyMDE(description) {
    const textarea = document.getElementById('edit-book-description');
    if (!textarea) {
        console.error('Textarea #edit-book-description not found');
        return;
    }
    
    // Если EasyMDE уже существует — уничтожаем его
    if (easyMDE) {
        easyMDE.toTextArea();
        easyMDE = null;
    }
    
    // Создаем новый экземпляр
    easyMDE = new EasyMDE({
        element: textarea,
        placeholder: "Введите описание книги...",
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
        },
        initialValue: description  // Устанавливаем значение при инициализации
    });
    
    // Принудительно обновляем
    easyMDE.codemirror.refresh();
    
    console.log('EasyMDE initialized with description:', description);
}

// Initialize EasyMDE for book editing
function initEditBook() {
    const saveBtn = document.getElementById('save-edit-book');
    if (!saveBtn) return;
    
    saveBtn.addEventListener('click', function() {
        const bookId = document.getElementById('edit-book-id').value;
        const title = document.getElementById('edit-book-title').value.trim();
        const description = easyMDE ? easyMDE.value() : document.getElementById('edit-book-description').value.trim();
        
        if (!title) {
            alert('Название книги обязательно');
            return;
        }
        
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        
        const btn = this;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        fetch(`/admin/book/edit/${bookId}`, {
            method: 'POST',
            body: formData,
            headers: {'X-Requested-With': 'XMLHttpRequest'}
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Книга обновлена', 'success');
                editBookModal.hide();
                // Refresh book modal
                openBookModal(bookId);
            } else {
                throw new Error(data.error || 'Ошибка при сохранении');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    });
}

// Helper functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    // Simple markdown rendering or use existing function
    if (typeof render_safe_markdown !== 'undefined') {
        return render_safe_markdown(text);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function showNotification(message, type) {
    if (typeof AdminUtils !== 'undefined' && AdminUtils.showNotification) {
        AdminUtils.showNotification(message, type);
    } else {
        alert(message);
    }
}

// Open reserve modal (existing functionality)
function openReserveModal(bookId) {
    // Устанавливаем флаг, что мы открываем бронирование
    isOpeningReserve = true;
    
    // Закрываем модалку книги
    if (bookModal) {
        bookModal.hide();
    }
    
    // Загружаем модалку бронирования
    fetch(`/get_reserve_modal/${bookId}`)
        .then(response => response.text())
        .then(html => {
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = html;
            document.body.appendChild(modalContainer);
            
            const modalElement = document.getElementById(`reserveModal${bookId}`);
            if (modalElement) {
                const bsModal = new bootstrap.Modal(modalElement);
                bsModal.show();
                
                // При закрытии бронирования — возвращаемся к модалке книги
                modalElement.addEventListener('hidden.bs.modal', function() {
                    modalContainer.remove();
                    
                    // Сбрасываем флаг и возвращаем модалку книги
                    isOpeningReserve = false;
                    setTimeout(() => {
                        if (currentBookId) {
                            openBookModal(currentBookId);
                        }
                    }, 200);
                }, { once: true });
            }
        })
        .catch(error => {
            console.error('Error loading reserve modal:', error);
            isOpeningReserve = false;
            // В случае ошибки — возвращаем поиск
            reopenSearchModal();
        });
}

// Обработчик закрытия bookModal
document.addEventListener('DOMContentLoaded', function() {
    const bookModalEl = document.getElementById('bookModal');
    if (bookModalEl) {
        bookModalEl.addEventListener('hidden.bs.modal', function() {
            if (window._redirectingFromBook) {
                window._redirectingFromBook = false;
                return;
            }
            if (!isOpeningReserve) {
                if (lastOpenedFrom === 'search') {
                    reopenSearchModal();
                }
            }
            isOpeningReserve = false;
            lastOpenedFrom = null;
        });
    }
});

// Функция для возврата к поиску
function reopenSearchModal() {
    const searchModalEl = document.getElementById('searchModal');
    if (!searchModalEl) return;
    
    const searchModal = bootstrap.Modal.getInstance(searchModalEl) || new bootstrap.Modal(searchModalEl);
    
    // Восстанавливаем состояние поиска
    if (savedSearchQuery) {
        document.getElementById('searchInput').value = savedSearchQuery;
    }
    
    // Восстанавливаем фильтр
    const filterTabs = document.querySelectorAll('#searchFilterTabs .filter-tab');
    filterTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.filter === savedActiveFilter) {
            tab.classList.add('active');
        }
    });
    currentFilter = savedActiveFilter;
    
    // Показываем модалку
    searchModal.show();
    
    // Перезагружаем результаты
    performSearch();
}
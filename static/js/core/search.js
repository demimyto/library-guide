// Функция для получения статуса авторизации
function isUserAuthenticated() {
    return document.body.dataset.userAuthenticated === 'true';
}

document.addEventListener('DOMContentLoaded', function() {
    // Элементы
    const searchModal = document.getElementById('searchModal');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const filterTabs = document.querySelectorAll('#searchFilterTabs .filter-tab');
    const searchContext = document.getElementById('searchContext');
    
    let currentFilter = 'all';
    let searchTimeout;
    let currentContext = {};
    
    // Загружаем контекст из URL при открытии модалки
    searchModal.addEventListener('show.bs.modal', function() {
        const urlParams = new URLSearchParams(window.location.search);
        currentContext = {
            author: urlParams.get('author') || '',
            genre: urlParams.get('genre') || '',
            library: urlParams.get('library') || ''
        };
        updateContextChips();
        
        // Если есть поисковый запрос, подставляем его
        const searchQuery = urlParams.get('q') || '';
        if (searchQuery) {
            searchInput.value = searchQuery;
            performSearch();
        }
    });
    
    // Переключение фильтров
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            performSearch();
        });
    });
    
    // Поиск с debounce
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    });
    
    // Обработка Enter
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearchAndRedirect();
        }
    });
    
    // Функция поиска
    function performSearch() {
        const query = searchInput.value.trim();
        const resultsContainer = document.getElementById('searchResults');
        
        if (query.length < 2) {
            if (resultsContainer) {
                resultsContainer.innerHTML = `
                    <div class="text-center text-muted py-4">
                        Введите минимум 2 символа
                    </div>
                `;
            }
            return;
        }
        
        if (resultsContainer) {
            const currentHeight = resultsContainer.offsetHeight;
            resultsContainer.style.minHeight = currentHeight > 100 ? currentHeight + 'px' : '200px';
            resultsContainer.innerHTML = `
                <div class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                </div>
            `;
        }
        
        // Формируем URL с контекстом
        const params = new URLSearchParams({
            q: query,
            filter: currentFilter
        });
        
        // Добавляем контекст, если есть
        if (currentContext.author) {
            params.append('author', currentContext.author);
        }
        if (currentContext.genre) {
            params.append('genre', currentContext.genre);
        }
        if (currentContext.library) {
            params.append('library', currentContext.library);
        }
        
        fetch(`/api/search?${params}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Ошибка сервера');
                }
                return response.json();
            })
            .then(data => {
                displayResults(data);
            })
            .catch(error => {
                console.error('Search error:', error);
                if (resultsContainer) {
                    resultsContainer.innerHTML = `
                        <div class="alert alert-danger">
                            Ошибка при поиске: ${error.message}
                        </div>
                    `;
                }
            });
    }
    
    // Функция поиска с редиректом (при Enter)
    function performSearchAndRedirect() {
        const query = searchInput.value.trim();
        if (!query) return;
        
        const params = new URLSearchParams({
            q: query,
            filter: currentFilter
        });
        
        // Добавляем контекст в URL
        if (currentContext.author) {
            params.append('author', currentContext.author);
        }
        if (currentContext.genre) {
            params.append('genre', currentContext.genre);
        }
        if (currentContext.library) {
            params.append('library', currentContext.library);
        }
        
        window.location.href = `/?${params}`;
    }
    
    // Отображение результатов
    // Отображение результатов
    function displayResults(data) {
        const resultsContainer = document.getElementById('searchResults');
        
        if (!resultsContainer) return;
        
        if (data.authors.length === 0 && data.books.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-search-results">
                    <div class="empty-icon">🔍</div>
                    <p>Ничего не найдено</p>
                    <p class="text-muted small">Попробуйте изменить запрос или фильтр</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="results-list">';
        
        // Сначала выводим авторов
        data.authors.forEach(author => {
            const photoUrl = author.photo_filename 
                ? `/static/uploads/authors/${author.photo_filename}`
                : null;
            
            html += `
                <div class="search-result-item search-result-author" 
                    data-author-id="${author.id}"
                    onclick="handleSearchResultClick('author', ${author.id})"
                    style="cursor: pointer;">
                    <div class="result-avatar">
                        ${photoUrl 
                            ? `<img src="${photoUrl}" alt="${escapeHtml(author.name)}" class="author-avatar-oval">`
                            : `<div class="author-avatar-placeholder-sm">${author.name[0].toUpperCase()}</div>`
                        }
                    </div>
                    <div class="result-info">
                        <h4>${escapeHtml(author.name)}</h4>
                        <p class="result-meta">
                            <span class="result-type">Автор</span>
                            <span class="text-muted">${author.books_count} книг(и)</span>
                        </p>
                    </div>
                </div>
            `;
        });
        
        // Книги
        data.books.forEach(book => {
            const coverUrl = book.cover_filename
                ? `/static/uploads/covers/${book.cover_filename}`
                : null;
            
            const authorsHtml = book.authors.map(a => escapeHtml(a.name)).join(', ');
            
            let librariesHtml = '';
            if (book.available_libraries && book.available_libraries.length > 0) {
                librariesHtml = `
                    <div class="result-libraries">
                        ${book.available_libraries.map(lib => 
                            `<span class="library-badge">${escapeHtml(lib.name)}</span>`
                        ).join('')}
                        ${book.total_libraries > 2 ? `<span class="library-badge more">+${book.total_libraries - 2}</span>` : ''}
                    </div>
                `;
            }
            
            html += `
                <div class="search-result-item" 
                    data-book-id="${book.id}"
                    onclick="handleSearchResultClick('book', ${book.id})"
                    style="cursor: pointer;">
                    <div class="result-cover">
                        ${coverUrl
                            ? `<img src="${coverUrl}" alt="${escapeHtml(book.title)}" loading="lazy">`
                            : `<div class="cover-placeholder-sm">📚</div>`
                        }
                    </div>
                    <div class="result-info">
                        <h4>${escapeHtml(book.title)}</h4>
                        <p class="result-author">${authorsHtml}</p>
                        <div class="result-meta">
                            <span class="result-genre">${escapeHtml(book.genre)}</span>
                            ${book.available ? 
                                `<span class="result-available">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <path d="M8 12l2 2 6-6"></path>
                                    </svg>
                                    Доступно
                                </span>` : 
                                `<span class="result-unavailable">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="15" y1="9" x2="9" y2="15"></line>
                                        <line x1="9" y1="9" x2="15" y2="15"></line>
                                    </svg>
                                    Нет в наличии
                                </span>`
                            }
                        </div>
                        ${librariesHtml}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Добавляем кнопку "Показать все результаты" если результатов много
        if (data.books.length === 20 || (data.authors.length + data.books.length) >= 20) {
            html += `
                <div class="text-center mt-3">
                    <button class="btn btn-outline-primary btn-sm" onclick="performSearchAndRedirect()">
                        Показать все результаты в каталоге
                    </button>
                </div>
            `;
        }
        
        resultsContainer.innerHTML = html;

        if (window.lazyLoadObserve) window.lazyLoadObserve();
    }

    // Обработчик клика по результату поиска
    window.handleSearchResultClick = function(type, id) {
        const isAuthenticated = document.body.dataset.userAuthenticated === 'true';
        
        if (type === 'author') {
            window.location.href = `/author/${id}`;
        } else if (type === 'book') {
            if (!isAuthenticated) {
                window.location.href = '/login';
            } else {
                const searchModalEl = document.getElementById('searchModal');
                const searchModal = bootstrap.Modal.getInstance(searchModalEl);
                
                // Сохраняем состояние поиска
                savedSearchQuery = document.getElementById('searchInput').value;
                savedActiveFilter = document.querySelector('#searchFilterTabs .filter-tab.active')?.dataset.filter || 'all';
                
                // Закрываем поиск
                searchModal.hide();
                
                // Открываем модалку книги
                if (typeof openBookModal === 'function') {
                    openBookModal(id, 'search');
                }
            }
        }
    };

    // Функция экранирования HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Обновление чипсов контекста
    function updateContextChips() {
        let html = '';
        
        if (currentContext.author) {
            html += `
                <span class="context-chip">
                    Автор: ${escapeHtml(currentContext.author)}
                    <button onclick="removeContext('author')" class="chip-close">×</button>
                </span>
            `;
        }
        if (currentContext.genre) {
            html += `
                <span class="context-chip">
                    Жанр: ${escapeHtml(currentContext.genre)}
                    <button onclick="removeContext('genre')" class="chip-close">×</button>
                </span>
            `;
        }
        if (currentContext.library) {
            html += `
                <span class="context-chip">
                    Библиотека: ${escapeHtml(currentContext.library)}
                    <button onclick="removeContext('library')" class="chip-close">×</button>
                </span>
            `;
        }
        
        searchContext.innerHTML = html;
    }
    
    // Удаление контекста
    window.removeContext = function(type) {
        delete currentContext[type];
        updateContextChips();
        performSearch();
        
        // Обновляем URL без перезагрузки
        const url = new URL(window.location);
        url.searchParams.delete(type);
        window.history.pushState({}, '', url);
    };
});

// Слушаем событие логина (если используется AJAX-логин)
document.addEventListener('userLoggedIn', function() {
    // Обновляем data-атрибут (нужно будет установить на сервере)
    document.body.dataset.userAuthenticated = 'true';
});

// Если используется обычная форма логина с редиректом,
// то при загрузке страницы после логина data-атрибут уже будет правильным
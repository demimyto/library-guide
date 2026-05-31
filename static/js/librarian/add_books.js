// Librarian Add Books Module
// Управление модалками поиска и создания книг для библиотекаря

console.log("📚 Librarian Add Books Module Loaded");

const LibrarianAddBooks = (function() {
    // Модалки
    let searchModal = null;
    let createBookModal = null;
    let coverModal = null;
    let authorsModal = null;
    let quickAuthorModal = null;
    let easyMDE = null;
    
    // Состояние
    let selectedBooks = {};  // { bookId: { title, author, cover, quantity } }
    let newlyCreatedBookId = null;
    let librarianLibraries = [];
    let searchTimeout = null;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        initModals();
        initSearchInput();
        initCreateBookButton();
        initBackToSearchButton();
        initSaveBookButton();
        initAddSelectedButton();
        initCoverUpload();
        initAuthorsSelection();
        initGenreCombobox();
    }
    
    function initModals() {
        const searchEl = document.getElementById('librarianAddBooksModal');
        const createEl = document.getElementById('librarianCreateBookModal');
        const coverEl = document.getElementById('coverModal');
        const authorsEl = document.getElementById('authorsModal');
        const quickEl = document.getElementById('quickAuthorModal');
        
        if (searchEl) searchModal = new bootstrap.Modal(searchEl);
        if (createEl) createBookModal = new bootstrap.Modal(createEl);
        if (coverEl) coverModal = new bootstrap.Modal(coverEl);
        if (authorsEl) authorsModal = new bootstrap.Modal(authorsEl);
        if (quickEl) quickAuthorModal = new bootstrap.Modal(quickEl);
    }
    
    // ============================================
    // OPEN SEARCH MODAL (вызывается из кнопки "Добавить книгу")
    // ============================================
    function openSearchModal() {
        loadLibrarianLibraries();
        
        selectedBooks = {};
        newlyCreatedBookId = null;
        document.getElementById('librarianBookSearch').value = '';
        document.getElementById('selectedBooksPanel').style.display = 'none';
        document.getElementById('btnAddSelectedBooks').disabled = true;
        updateSelectedBooksList();
        
        if (searchModal) searchModal.show();
        
        setTimeout(() => searchBooks(''), 300);
    }
    
    function loadLibrarianLibraries() {
        const container = document.getElementById('librarySelectContainer');
        const select = document.getElementById('targetLibrarySelect');
        
        if (!container || !select) return;
        
        fetch('/librarian/api/my-libraries')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.libraries.length > 0) {
                    librarianLibraries = data.libraries;
                    
                    if (librarianLibraries.length > 1) {
                        container.style.display = 'block';
                        select.innerHTML = '<option value="">-- Выберите библиотеку --</option>' +
                            librarianLibraries.map(lib => 
                                `<option value="${lib.id}">${escapeHtml(lib.name)} — ${escapeHtml(lib.address)}</option>`
                            ).join('');
                        select.value = librarianLibraries[0].id;
                        
                        select.addEventListener('change', function() {
                            const query = document.getElementById('librarianBookSearch').value.trim();
                            searchBooks(query);
                            updateSelectedBooksList();
                        });
                    } else {
                        container.style.display = 'none';
                    }
                    
                    updateSelectedBooksList();
                }
            })
            .catch(error => console.error('Error loading libraries:', error));
    }
    
    function getSelectedLibraryId() {
        if (librarianLibraries.length === 1) {
            return librarianLibraries[0].id;
        }
        const select = document.getElementById('targetLibrarySelect');
        return select ? select.value : null;
    }
    
    // ============================================
    // SEARCH
    // ============================================
    function initSearchInput() {
        const input = document.getElementById('librarianBookSearch');
        if (!input) return;
        
        input.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const query = this.value.trim();
            searchTimeout = setTimeout(() => searchBooks(query), 300);
        });
    }
    
    function searchBooks(query) {
        const grid = document.getElementById('librarianBooksGrid');
        
        // Показываем спиннер
        grid.innerHTML = `
            <div class="text-center w-100 py-5 empty-grid-message">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        `;
        
        const startTime = Date.now();
        const libraryId = getSelectedLibraryId();
        let url = `/librarian/api/search-books?q=${encodeURIComponent(query)}`;
        if (libraryId) {
            url += `&library_id=${libraryId}`;
        }
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Минимальное время показа спиннера — 400 мс
                    const elapsed = Date.now() - startTime;
                    const delay = Math.max(0, 400 - elapsed);
                    
                    setTimeout(() => {
                        renderBookGrid(data.books);
                    }, delay);
                }
            })
            .catch(error => {
                console.error('Search error:', error);
            });
    }
    
    function renderBookGrid(books) {
        const grid = document.getElementById('librarianBooksGrid');
        
        if (!books || books.length === 0) {
            grid.innerHTML = `
                <div class="text-center text-muted w-100 py-5 empty-grid-message">
                    <p>Книги не найдены</p>
                    <p class="small">Попробуйте изменить запрос или создайте новую книгу</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = books.map((book, index) => {
            const isSelected = book.id in selectedBooks;
            const isNewlyCreated = book.id === newlyCreatedBookId;
            let cardClass = 'book-card-select';
            if (isNewlyCreated) cardClass += ' newly-created';
            else if (isSelected) cardClass += ' selected';
            
            const coverUrl = book.cover_filename 
                ? `/static/uploads/covers/${book.cover_filename}`
                : null;
            
            return `
                <div class="book-card-new ${cardClass}" 
                    data-book-id="${book.id}"
                    style="animation: fadeInCard 0.3s ease ${index * 0.03}s both;">
                    <input type="checkbox" 
                        class="book-checkbox" 
                        data-book-id="${book.id}"
                        ${isSelected ? 'checked' : ''}
                        onchange="LibrarianAddBooks.toggleBook(${book.id}, this.checked, '${escapeHtml(book.title)}', '${escapeHtml(book.author)}', '${book.cover_filename || ''}')">
                    <div class="book-cover-container" onclick="this.parentElement.querySelector('.book-checkbox').click()">
                        ${coverUrl 
                            ? `
                                <div class="book-cover-bg" style="background-image: url('${coverUrl}')"></div>
                                <img src="${coverUrl}" alt="${escapeHtml(book.title)}" loading="lazy">
                            `
                            : '<div class="cover-placeholder-full">📚</div>'
                        }
                    </div>
                    <div class="book-card-info">
                        <h3 class="book-card-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
                        <p class="book-card-authors">${escapeHtml(book.author)}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        // Ленивая загрузка обложек
        if (window.lazyLoadObserve) window.lazyLoadObserve();
        
        // Сбрасываем флаг после рендера
        if (newlyCreatedBookId && !(newlyCreatedBookId in selectedBooks)) {
            newlyCreatedBookId = null;
        }
    }
    
    function toggleBook(bookId, isChecked, title, author, coverFilename) {
        if (isChecked) {
            selectedBooks[bookId] = {
                title: title,
                author: author,
                cover: coverFilename,
                quantity: 1
            };
        } else {
            delete selectedBooks[bookId];
        }
        
        updateSelectedBooksList();
        updateBookCardHighlight();
    }
    
    function updateBookCardHighlight() {
        document.querySelectorAll('#librarianBooksGrid .book-card-select').forEach(card => {
            const bookId = parseInt(card.dataset.bookId);
            if (bookId in selectedBooks) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }
    
    function updateSelectedBooksList() {
        const panel = document.getElementById('selectedBooksPanel');
        const list = document.getElementById('selectedBooksList');
        const addBtn = document.getElementById('btnAddSelectedBooks');
        const selectedCount = Object.keys(selectedBooks).length;
        
        if (selectedCount === 0) {
            panel.style.display = 'none';
            addBtn.disabled = true;
            return;
        }
        
        panel.style.display = 'block';
        addBtn.disabled = !getSelectedLibraryId();
        
        list.innerHTML = Object.entries(selectedBooks).map(([bookId, book]) => {
            const coverUrl = book.cover ? `/static/uploads/covers/${book.cover}` : null;
            return `
                <div class="selected-book-item" data-book-id="${bookId}">
                    <div class="selected-book-info">
                        <div class="selected-book-cover">
                            ${coverUrl 
                                ? `<img src="${coverUrl}" alt="${escapeHtml(book.title)}">`
                                : '<span class="cover-placeholder-xs">📚</span>'
                            }
                        </div>
                        <div class="selected-book-details">
                            <div class="selected-book-title">${escapeHtml(book.title)}</div>
                            <div class="selected-book-author">${escapeHtml(book.author)}</div>
                        </div>
                    </div>
                    <div class="selected-book-quantity">
                        <label class="form-label mb-0" style="font-size: 0.75rem;">Кол-во:</label>
                        <input type="number" 
                               class="form-control form-control-sm" 
                               value="${book.quantity}" 
                               min="1" 
                               max="100"
                               onchange="LibrarianAddBooks.updateQuantity(${bookId}, this.value)">
                    </div>
                    <button class="selected-book-remove" onclick="LibrarianAddBooks.removeBook(${bookId})" title="Убрать">
                        ✕
                    </button>
                </div>
            `;
        }).join('');
    }
    
    function updateQuantity(bookId, value) {
        const qty = parseInt(value) || 1;
        if (selectedBooks[bookId]) {
            selectedBooks[bookId].quantity = Math.max(1, Math.min(100, qty));
        }
    }
    
    function removeBook(bookId) {
        delete selectedBooks[bookId];
        updateSelectedBooksList();
        updateBookCardHighlight();
        
        // Обновляем чекбокс в сетке
        const checkbox = document.querySelector(`.book-checkbox[data-book-id="${bookId}"]`);
        if (checkbox) checkbox.checked = false;
    }
    
    // ============================================
    // ADD SELECTED BOOKS
    // ============================================
    function initAddSelectedButton() {
        const btn = document.getElementById('btnAddSelectedBooks');
        if (!btn) return;
        
        btn.addEventListener('click', addSelectedBooks);
    }
    
    function addSelectedBooks() {
        const libraryId = getSelectedLibraryId();
        
        if (!libraryId) {
            showNotification('Выберите библиотеку', 'warning');
            return;
        }
        
        const bookIds = Object.keys(selectedBooks);
        if (bookIds.length === 0) {
            showNotification('Выберите хотя бы одну книгу', 'warning');
            return;
        }
        
        const btn = document.getElementById('btnAddSelectedBooks');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Добавление...';
        
        const payload = bookIds.map(id => ({
            book_id: parseInt(id),
            library_id: parseInt(libraryId),
            quantity: selectedBooks[id].quantity
        }));
        
        fetch('/librarian/api/add-books', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ books: payload })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const count = data.added || bookIds.length;
                showNotification(`Добавлено книг: ${count}`, 'success');
                
                if (searchModal) searchModal.hide();
                
                // Обновляем дашборд если есть функция
                if (typeof loadPendingReservations === 'function') {
                    setTimeout(loadPendingReservations, 500);
                }
            } else {
                throw new Error(data.error || 'Ошибка при добавлении');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    // ============================================
    // CREATE NEW BOOK
    // ============================================
    function initCreateBookButton() {
        const btn = document.getElementById('btnCreateNewBook');
        if (!btn) return;
        
        btn.addEventListener('click', openCreateBookModal);
    }
    
    function openCreateBookModal() {
        // Скрываем модалку поиска
        if (searchModal) searchModal.hide();
        
        // Очищаем форму
        document.getElementById('librarian-create-book-form').reset();
        document.getElementById('librarianGenreHidden').value = '';
        document.getElementById('librarianGenreInput').value = '';
        document.getElementById('librarian-author-ids').value = '';
        document.getElementById('librarian-cover-filename').value = '';
        document.getElementById('librarian-selected-authors').innerHTML = '<span class="text-muted">Авторы не выбраны</span>';
        
        const coverPreview = document.getElementById('librarian-cover-preview');
        if (coverPreview) coverPreview.classList.add('d-none');
        
        // Показываем модалку создания
        setTimeout(() => {
            if (createBookModal) createBookModal.show();
        }, 200);
    }
    
    function initBackToSearchButton() {
        const btn = document.getElementById('librarian-back-to-search');
        if (!btn) return;
        
        btn.addEventListener('click', function() {
            if (createBookModal) createBookModal.hide();
            
            setTimeout(() => {
                // Обновляем поиск и показываем модалку поиска
                const query = document.getElementById('librarianBookSearch').value.trim();
                if (query) {
                    searchBooks(query);
                }
                if (searchModal) searchModal.show();
            }, 200);
        });
    }
    
    function initSaveBookButton() {
        const btn = document.getElementById('librarian-save-book');
        if (!btn) return;
        
        btn.addEventListener('click', saveNewBook);
    }
    
    function saveNewBook() {
        const form = document.getElementById('librarian-create-book-form');
        const title = form.querySelector('[name="title"]').value.trim();
        const genre = document.getElementById('librarianGenreHidden').value.trim();
        const authorIds = document.getElementById('librarian-author-ids').value;
        
        if (!title) {
            showNotification('Введите название книги', 'warning');
            return;
        }
        
        if (!genre) {
            showNotification('Выберите жанр', 'warning');
            return;
        }
        
        if (!authorIds) {
            showNotification('Выберите хотя бы одного автора', 'warning');
            return;
        }
        
        const btn = document.getElementById('librarian-save-book');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Создание...';
        
        const formData = new FormData(form);
        
        // Добавляем описание из EasyMDE если есть
        if (easyMDE) {
            formData.set('description', easyMDE.value());
        }
        
        // Удаляем author_ids и добавляем правильные
        formData.delete('author_ids');
        authorIds.split(',').forEach(id => {
            if (id.trim()) formData.append('author_ids', id.trim());
        });
        
        fetch('/librarian/book/add', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Добавляем новый жанр в комбобокс
                if (typeof GenreCombobox !== 'undefined') {
                    GenreCombobox.addNewGenre(genre);
                }
                
                showNotification('Книга создана!', 'success');
                
                // Запоминаем ID новой книги
                newlyCreatedBookId = data.book_id;
                
                // Автоматически выбираем новую книгу
                const bookTitle = form.querySelector('[name="title"]').value.trim();
                const firstAuthorName = document.querySelector('#librarian-selected-authors .author-tag')?.textContent || 'Автор';
                selectedBooks[newlyCreatedBookId] = {
                    title: bookTitle,
                    author: firstAuthorName,
                    cover: formData.get('cover_filename') || '',
                    quantity: 1
                };
                
                // Закрываем модалку создания
                if (createBookModal) createBookModal.hide();
                
                // Обновляем поиск — показываем новую книгу первой
                const query = document.getElementById('librarianBookSearch').value.trim();
                setTimeout(() => {
                    if (searchModal) searchModal.show();
                    if (query) {
                        searchBooksWithNewBook(query, newlyCreatedBookId);
                    } else {
                        searchBooksWithNewBook('', newlyCreatedBookId);
                    }
                }, 200);
            } else {
                throw new Error(data.error || 'Ошибка при создании книги');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    function searchBooksWithNewBook(query, newBookId) {
        const grid = document.getElementById('librarianBooksGrid');
        grid.innerHTML = `
            <div class="text-center w-100 py-5">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        `;
        
        const libraryId = getSelectedLibraryId();
        let url = `/librarian/api/search-books?q=${encodeURIComponent(query)}`;
        if (libraryId) {
            url += `&library_id=${libraryId}`;
        }
        // Передаём ID новой книги чтобы она была в выдаче
        if (newBookId) {
            url += `&include_id=${newBookId}`;
        }
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    renderBookGrid(data.books);
                    updateSelectedBooksList();
                }
            });
    }
    
    // ============================================
    // COVER UPLOAD (используем существующую модалку)
    // ============================================
    function initCoverUpload() {
        const uploadBtn = document.getElementById('librarian-upload-cover-btn');
        if (!uploadBtn) return;

        uploadBtn.addEventListener('click', function() {
            // Скрываем модалку создания книги
            if (createBookModal) createBookModal.hide();
            
            // Сбрасываем модалку обложки
            resetCoverModalForLibrarian();
            
            // Показываем модалку обложки
            setTimeout(() => {
                if (coverModal) coverModal.show();
            }, 300);
        });

        // Вешаем обработчики на дроп-зону и файловый инпут ОДИН раз
        bindCoverModalHandlers();
    }

    // Отдельная функция для привязки обработчиков (вызывается один раз)
    let coverHandlersBound = false;

    function bindCoverModalHandlers() {
        if (coverHandlersBound) return;
        coverHandlersBound = true;
        
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('coverFileInput');
        
        if (!dropZone || !fileInput) return;
        
        // Клик по дроп-зоне открывает проводник
        dropZone.addEventListener('click', function(e) {
            if (!e.target.closest('.drop-zone-preview')) {
                fileInput.click();
            }
        });
        
        // Выбор файла через проводник
        fileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files.length > 0) {
                handleCoverFileForLibrarian(e.target.files[0]);
            }
        });
        
        // Drag & Drop
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleCoverFileForLibrarian(files[0]);
            }
        });
        
        // Кнопка "Сохранить"
        const saveBtn = document.getElementById('btnSaveCover');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const currentFile = window._librarianCoverFile;
                if (!currentFile) {
                    showCoverErrorForLibrarian('Выберите файл');
                    return;
                }
                
                const btn = this;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
                
                const formData = new FormData();
                formData.append('cover', currentFile);
                
                fetch('/admin/book/upload_cover_temp', {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: formData,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        document.getElementById('librarian-cover-filename').value = data.filename;
                        
                        const preview = document.getElementById('librarian-cover-preview');
                        const img = preview.querySelector('img');
                        img.src = data.cover_url;
                        preview.classList.remove('d-none');
                        
                        const uploadButton = document.getElementById('librarian-upload-cover-btn');
                        if (uploadButton) uploadButton.textContent = '🔄 Заменить обложку';
                        
                        if (coverModal) coverModal.hide();
                        showNotification('Обложка загружена', 'success');
                        
                        setTimeout(() => {
                            if (createBookModal) createBookModal.show();
                        }, 300);
                    } else {
                        throw new Error(data.error || 'Ошибка загрузки');
                    }
                })
                .catch(error => {
                    showCoverErrorForLibrarian(error.message);
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                });
            });
        }
        
        // При закрытии модалки обложки — возврат к созданию книги
        const coverModalEl = document.getElementById('coverModal');
        if (coverModalEl) {
            coverModalEl.addEventListener('hidden.bs.modal', function() {
                setTimeout(() => {
                    if (createBookModal && !isAuthorsModalOpen()) {
                        createBookModal.show();
                    }
                }, 300);
            });
        }
    }

    function handleCoverFileForLibrarian(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showCoverErrorForLibrarian('Недопустимый формат. Разрешены: JPG, PNG, WEBP');
            return;
        }
        
        window._librarianCoverFile = file;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('previewImage').src = e.target.result;
            document.getElementById('dropZoneContent').style.display = 'none';
            document.getElementById('dropZonePreview').style.display = 'flex';
            document.getElementById('fileInfo').style.display = 'flex';
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = formatFileSize(file.size);
            document.getElementById('btnSaveCover').disabled = false;
            document.getElementById('btnDeleteCover').style.display = 'none';
            document.getElementById('btnReplaceCover').style.display = 'none';
            hideCoverErrorForLibrarian();
        };
        reader.readAsDataURL(file);
    }

    function resetCoverModalForLibrarian() {
        window._librarianCoverFile = null;
        document.getElementById('coverFileInput').value = '';
        document.getElementById('dropZoneContent').style.display = 'flex';
        document.getElementById('dropZonePreview').style.display = 'none';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('btnSaveCover').disabled = true;
        document.getElementById('btnDeleteCover').style.display = 'none';
        document.getElementById('btnReplaceCover').style.display = 'none';
        hideCoverErrorForLibrarian();
    }

    function showCoverErrorForLibrarian(message) {
        const errorDiv = document.getElementById('coverError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function hideCoverErrorForLibrarian() {
        const errorDiv = document.getElementById('coverError');
        if (errorDiv) errorDiv.style.display = 'none';
    }

    function isAuthorsModalOpen() {
        const el = document.getElementById('authorsModal');
        return el && el.classList.contains('show');
    }

    // Вспомогательная функция обработки выбранного файла
    function handleCoverFileSelect(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showCoverError('Недопустимый формат. Разрешены: JPG, PNG, WEBP');
            return;
        }

        hideCoverError();

        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImg = document.getElementById('previewImage');
            const dropZoneContent = document.getElementById('dropZoneContent');
            const dropZonePreview = document.getElementById('dropZonePreview');
            const fileInfo = document.getElementById('fileInfo');
            const fileName = document.getElementById('fileName');
            const fileSize = document.getElementById('fileSize');
            const btnSave = document.getElementById('btnSaveCover');

            if (previewImg) previewImg.src = e.target.result;
            if (dropZoneContent) dropZoneContent.style.display = 'none';
            if (dropZonePreview) dropZonePreview.style.display = 'flex';
            if (fileInfo) fileInfo.style.display = 'flex';
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.style.display = 'inline-flex';
            }
        };
        reader.readAsDataURL(file);
    }

    // Вспомогательные функции для модалки обложки
    function resetCoverModal() {
        const dropZoneContent = document.getElementById('dropZoneContent');
        const dropZonePreview = document.getElementById('dropZonePreview');
        const fileInfo = document.getElementById('fileInfo');
        const btnSave = document.getElementById('btnSaveCover');
        const btnDelete = document.getElementById('btnDeleteCover');
        const btnReplace = document.getElementById('btnReplaceCover');
        const fileInput = window._coverFileInput || document.getElementById('coverFileInput');

        if (dropZoneContent) dropZoneContent.style.display = 'flex';
        if (dropZonePreview) dropZonePreview.style.display = 'none';
        if (fileInfo) fileInfo.style.display = 'none';
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.style.display = 'inline-flex';
        }
        if (btnDelete) btnDelete.style.display = 'none';
        if (btnReplace) btnReplace.style.display = 'none';
        if (fileInput) fileInput.value = '';

        hideCoverError();
    }

    function showCoverError(message) {
        const errorDiv = document.getElementById('coverError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function hideCoverError() {
        const errorDiv = document.getElementById('coverError');
        if (errorDiv) errorDiv.style.display = 'none';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // ============================================
    // AUTHORS SELECTION (используем существующую модалку)
    // ============================================
    function initAuthorsSelection() {
        const selectBtn = document.getElementById('librarian-select-authors-btn');
        if (!selectBtn) return;

        selectBtn.addEventListener('click', function() {
            document.getElementById('modal-mode').value = 'add';
            document.getElementById('modal-book-title').textContent = 'Новая книга';
            document.getElementById('modal-book-id').value = 'new';
            document.querySelectorAll('.author-checkbox').forEach(cb => cb.checked = false);
            
            if (createBookModal) createBookModal.hide();
            
            setTimeout(() => {
                if (authorsModal) authorsModal.show();
            }, 300);
        });

        // Привязка кнопок внутри модалки авторов (один раз)
        bindAuthorsModalButtons();
    }

    let authorsButtonsBound = false;

    function bindAuthorsModalButtons() {
        let quickAuthorSaved = false;
        if (authorsButtonsBound) return;
        authorsButtonsBound = true;
        
        // Кнопка "Сохранить"
        const saveBtn = document.getElementById('save-authors-modal');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const selected = [];
                document.querySelectorAll('.author-checkbox:checked').forEach(cb => {
                    selected.push(parseInt(cb.value));
                });
                
                document.getElementById('librarian-author-ids').value = selected.join(',');
                updateLibrarianSelectedAuthors(selected);
                
                if (authorsModal) authorsModal.hide();
                
                setTimeout(() => {
                    if (createBookModal) createBookModal.show();
                }, 300);
            });
        }
        
        // Кнопка "+ Новый автор"
        const quickAddBtn = document.getElementById('modal-quick-add-author');
        if (quickAddBtn) {
            quickAddBtn.addEventListener('click', function() {
                window._openingQuickAuthor = true;
                if (authorsModal) authorsModal.hide();
                
                setTimeout(() => {
                    document.getElementById('quick-author-name').value = '';
                    document.getElementById('quick-author-bio').value = '';
                    if (quickAuthorModal) quickAuthorModal.show();
                }, 300);
            });
        }
        
        // Кнопка сохранения быстрого автора
        const quickSaveBtn = document.getElementById('quick-author-save');
        if (quickSaveBtn) {
            quickSaveBtn.addEventListener('click', function() {
                const name = document.getElementById('quick-author-name')?.value?.trim();
                
                if (!name) {
                    alert('Введите имя автора');
                    return;
                }
                
                const formData = new FormData();
                formData.append('name', name);
                formData.append('bio', document.getElementById('quick-author-bio')?.value?.trim() || '');
                
                fetch('/admin/author/quick_add', {
                    method: 'POST',
                    body: formData,
                    credentials: 'same-origin',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Добавляем в список чекбоксов
                        const list = document.getElementById('authors-checkbox-list');
                        if (list) {
                            const newItem = document.createElement('div');
                            newItem.className = 'author-checkbox-item';
                            newItem.innerHTML = `
                                <label>
                                    <input type="checkbox" name="modal_author_ids" value="${data.author.id}" class="author-checkbox" checked>
                                    ${escapeHtml(data.author.name)}
                                </label>
                            `;
                            list.appendChild(newItem);
                        }
                        
                        // Добавляем к выбранным
                        const field = document.getElementById('librarian-author-ids');
                        const currentIds = field?.value ? field.value.split(',').map(Number) : [];
                        currentIds.push(data.author.id);
                        if (field) field.value = currentIds.join(',');
                        updateLibrarianSelectedAuthors(currentIds);
                        
                        quickAuthorSaved = true;
                        if (quickAuthorModal) quickAuthorModal.hide();
                        
                        setTimeout(() => {
                            if (authorsModal) authorsModal.show();
                        }, 300);
                        
                        showNotification('Автор добавлен', 'success');
                    }
                })
                .catch(error => showNotification('Ошибка', 'danger'));
            });
        }
        
        // Возврат из быстрого добавления при закрытии
        const quickModalEl = document.getElementById('quickAuthorModal');
        if (quickModalEl && !quickModalEl._librarianQuickCloseBound) {
            quickModalEl._librarianQuickCloseBound = true;
            quickModalEl.addEventListener('hidden.bs.modal', function() {
                if (quickAuthorSaved) {
                    quickAuthorSaved = false;
                    setTimeout(() => {
                        if (authorsModal) authorsModal.show();
                    }, 300);
                } else {
                    // Закрыли без сохранения — возвращаемся к созданию книги
                    setTimeout(() => {
                        if (createBookModal) createBookModal.show();
                    }, 300);
                }
            });
        }
        
        // Возврат из модалки авторов при закрытии
        const authorsModalEl = document.getElementById('authorsModal');
        if (authorsModalEl && !authorsModalEl._librarianCloseBound) {
            authorsModalEl._librarianCloseBound = true;
            authorsModalEl.addEventListener('hidden.bs.modal', function() {
                // Не показываем createBookModal если переходим к быстрому добавлению автора
                if (window._openingQuickAuthor) {
                    window._openingQuickAuthor = false;
                    return;
                }
                setTimeout(() => {
                    if (createBookModal && !isCoverModalOpen()) {
                        createBookModal.show();
                    }
                }, 300);
            });
        }
    }

    function isCoverModalOpen() {
        const el = document.getElementById('coverModal');
        return el && el.classList.contains('show');
    }
    
    function updateLibrarianSelectedAuthors(authorIds) {
        const container = document.getElementById('librarian-selected-authors');
        
        if (!authorIds.length) {
            container.innerHTML = '<span class="text-muted">Авторы не выбраны</span>';
            return;
        }
        
        fetch('/admin/api/authors/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: authorIds })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.authors) {
                let html = '<div class="selected-authors-tags">';
                data.authors.slice(0, 2).forEach(a => {
                    html += `<span class="author-tag">${escapeHtml(a.name)}</span>`;
                });
                if (data.authors.length > 2) {
                    html += `<span class="author-tag more">+${data.authors.length - 2}</span>`;
                }
                html += '</div>';
                container.innerHTML = html;
            }
        });
    }
    
    // ============================================
    // GENRE COMBOBOX
    // ============================================
    function initGenreCombobox() {
        if (typeof GenreCombobox !== 'undefined') {
            GenreCombobox.init(
                'librarianGenreInput',
                'librarianGenreDropdown',
                'librarianGenreSearch',
                'librarianGenreHidden',
                'librarianGenreList'
            );
        }
        
        // EasyMDE для описания
        const textarea = document.getElementById('librarianBookDescription');
        if (textarea && typeof EasyMDE !== 'undefined') {
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
                minHeight: '150px'
            });
        }
    }
    
    // ============================================
    // PUBLIC API
    // ============================================
    return {
        init: init,
        openSearchModal: openSearchModal,
        toggleBook: toggleBook,
        updateQuantity: updateQuantity,
        removeBook: removeBook
    };
})();

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    LibrarianAddBooks.init();
});
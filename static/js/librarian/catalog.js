// Librarian Catalog JavaScript

console.log("📚 Librarian Catalog Loaded");

// ============================================
// GLOBAL UTILITIES
// ============================================
const Utils = {
    showNotification: function(message, type = 'success') {
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        const bgClass = type === 'success' ? 'bg-success' : (type === 'danger' ? 'bg-danger' : 'bg-warning');
        const icon = type === 'success' ? '✓' : (type === 'danger' ? '✕' : '⚠');
        const toastId = 'toast-' + Date.now();

        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center ${bgClass} text-white border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <span class="me-2">${icon}</span>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 5000 });
        toast.show();
        
        toastElement.addEventListener('hidden.bs.toast', function() {
            this.remove();
        });
    }
};

// ============================================
// LIBRARY FILTER MODULE
// ============================================
const FilterModule = {
    init: function() {
        const filter = document.getElementById('libraryFilter');
        if (filter) {
            filter.addEventListener('change', (e) => {
                this.filterBooks(e.target.value);
            });
        }
    },

    filterBooks: function(libraryId) {
        const cards = document.querySelectorAll('.book-card-new');
        
        cards.forEach(card => {
            if (!libraryId) {
                card.style.display = '';
                return;
            }

            // Проверяем, есть ли книга в выбранной библиотеке
            const bookId = card.dataset.bookId;
            this.checkBookInLibrary(bookId, libraryId).then(isInLibrary => {
                card.style.display = isInLibrary ? '' : 'none';
            });
        });
    },

    checkBookInLibrary: async function(bookId, libraryId) {
        try {
            const response = await fetch(`/librarian/library/${libraryId}/stats`);
            const data = await response.json();
            if (data.success) {
                return data.books.some(b => b.book_id == bookId);
            }
            return false;
        } catch (error) {
            console.error('Error checking library:', error);
            return true; // Показываем если ошибка
        }
    }
};

// ============================================
// BOOK CARDS MODULE
// ============================================
const BookCardsModule = {
    init: function() {
        // Инициализация кликов по карточкам книг
        document.querySelectorAll('.book-card-new').forEach(card => {
            card.addEventListener('click', function(e) {
                // Не открываем модалку если клик по ссылке автора
                if (e.target.closest('.book-card-author-link')) {
                    return;
                }
                
                const bookId = this.dataset.bookId;
                if (typeof openBookModal === 'function') {
                    openBookModal(bookId);
                }
            });
        });
    }
};

// ============================================
// SEARCH CONTEXT MODULE
// ============================================
const SearchContextModule = {
    init: function() {
        // Переопределяем поиск для ограничения библиотеками библиотекаря
        const searchModal = document.getElementById('searchModal');
        if (searchModal) {
            searchModal.addEventListener('show.bs.modal', () => {
                this.setLibraryContext();
            });
        }
    },

    setLibraryContext: function() {
        // Добавляем контекст библиотек в поиск
        const libraries = this.getLibrariesFromPage();
        if (libraries.length > 0) {
            // Сохраняем в data-атрибут для использования в search.js
            document.body.dataset.librarianLibraries = JSON.stringify(libraries);
        }
    },

    getLibrariesFromPage: function() {
        // Получаем ID библиотек из фильтра или data-атрибутов
        const filter = document.getElementById('libraryFilter');
        if (filter) {
            return Array.from(filter.options)
                .filter(opt => opt.value)
                .map(opt => parseInt(opt.value));
        }
        return [];
    }
};

// ============================================
// USER MENU
// ============================================
const UserMenuModule = {
    init: function() {
        const menuButton = document.getElementById('userMenuButton');
        const menuDropdown = document.getElementById('userMenuDropdown');
        
        if (menuButton && menuDropdown) {
            menuButton.addEventListener('click', function(e) {
                e.stopPropagation();
                menuDropdown.classList.toggle('show');
            });
            
            document.addEventListener('click', function(e) {
                if (!menuButton.contains(e.target) && !menuDropdown.contains(e.target)) {
                    menuDropdown.classList.remove('show');
                }
            });
            
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    menuDropdown.classList.remove('show');
                }
            });
        }
    }
};

// ============================================
// MAIN INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    FilterModule.init();
    BookCardsModule.init();
    SearchContextModule.init();
    UserMenuModule.init();
});
// Genre Combobox Module
// Переиспользуемый модуль для выпадающего списка жанров с поиском

const GenreCombobox = (function() {
    let allGenres = [];
    
    function init(inputId, dropdownId, searchId, hiddenId, listId) {
        loadGenres();
        initEvents(inputId, dropdownId, searchId, hiddenId, listId);
    }
    
    function loadGenres() {
        fetch('/api/genres')
            .then(response => response.json())
            .then(data => {
                allGenres = data;
            })
            .catch(error => console.error('Error loading genres:', error));
    }
    
    function initEvents(inputId, dropdownId, searchId, hiddenId, listId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        const searchInput = document.getElementById(searchId);
        const hiddenField = document.getElementById(hiddenId);
        const list = document.getElementById(listId);
        
        if (!input) return;
        
        // Показываем dropdown при фокусе
        input.addEventListener('focus', () => {
            renderGenreList(allGenres, listId, inputId, hiddenId, dropdownId);
            dropdown.style.display = 'block';
            if (searchInput) searchInput.value = '';
        });
        
        // Скрываем при клике вне
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        // Поиск по жанрам
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filtered = allGenres.filter(g => g.toLowerCase().includes(query));
                renderGenreList(filtered, listId, inputId, hiddenId, dropdownId);
            });
        }
        
        // Ручной ввод
        input.addEventListener('input', () => {
            hiddenField.value = input.value;
            const query = input.value.toLowerCase();
            const filtered = allGenres.filter(g => g.toLowerCase().includes(query));
            renderGenreList(filtered, listId, inputId, hiddenId, dropdownId);
            dropdown.style.display = 'block';
        });
    }
    
    function renderGenreList(genres, listId, inputId, hiddenId, dropdownId) {
        const genreList = document.getElementById(listId);
        if (!genreList) return;
        
        if (!genres || genres.length === 0) {
            genreList.innerHTML = '<div class="genre-empty">Жанры не найдены</div>';
            return;
        }
        
        genreList.innerHTML = genres.map(g => 
            `<div class="genre-item" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</div>`
        ).join('');
        
        // Привязываем обработчики
        document.querySelectorAll(`#${listId} .genre-item`).forEach(item => {
            item.addEventListener('click', () => {
                const input = document.getElementById(inputId);
                const hiddenField = document.getElementById(hiddenId);
                const dropdown = document.getElementById(dropdownId);
                
                input.value = item.dataset.genre;
                hiddenField.value = item.dataset.genre;
                dropdown.style.display = 'none';
                
                input.classList.remove('is-invalid');
            });
        });
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Добавляем новый жанр в список
    function addNewGenre(genre) {
        if (genre && !allGenres.includes(genre)) {
            allGenres.push(genre);
            allGenres.sort();
        }
    }
    
    return { init, addNewGenre };
})();
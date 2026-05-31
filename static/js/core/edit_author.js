// Общий модуль редактирования автора через EasyMDE
// Работает на: author.html, admin_authors.html

(function() {
    'use strict';
    
    let editAuthorModal = null;
    let easyMDE = null;
    
    // Инициализация при загрузке DOM
    document.addEventListener('DOMContentLoaded', function() {
        const modalElement = document.getElementById('editAuthorModal');
        if (!modalElement) return;
        
        editAuthorModal = new bootstrap.Modal(modalElement);
        
        // Очистка при закрытии
        modalElement.addEventListener('hidden.bs.modal', function() {
            destroyEasyMDE();
        });
        
        // Привязка кнопок редактирования
        bindEditButtons();
        
        // Привязка кнопки сохранения
        const saveBtn = document.getElementById('save-edit-author');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveAuthor);
        }
    });
    
    function bindEditButtons() {
        document.querySelectorAll('.edit-author-btn, .edit-author-from-page').forEach(btn => {
            btn.addEventListener('click', function() {
                const authorId = this.dataset.authorId;
                const authorName = this.dataset.authorName;
                let authorBio = this.dataset.authorBio || '';
                
                // Декодируем экранированные переносы строк
                authorBio = authorBio.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                
                document.getElementById('edit-author-id').value = authorId;
                document.getElementById('edit-author-name').value = authorName;
                
                editAuthorModal.show();
                
                // Инициализируем редактор ПОСЛЕ показа модалки
                setTimeout(() => {
                    initEasyMDE(authorBio);
                }, 150);
            });
        });
    }
    
    function initEasyMDE(initialValue) {
        const textarea = document.getElementById('edit-author-bio');
        if (!textarea) return null;
        
        // Уничтожаем предыдущий экземпляр
        destroyEasyMDE();
        
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
            },
            autoRefresh: { delay: 300 },
            initialValue: initialValue || ''
        });
        
        // Принудительно обновляем размеры после инициализации
        setTimeout(() => {
            if (easyMDE && easyMDE.codemirror) {
                easyMDE.codemirror.refresh();
            }
        }, 100);
        
        return easyMDE;
    }
    
    function destroyEasyMDE() {
        if (easyMDE) {
            easyMDE.toTextArea();
            easyMDE = null;
        }
    }
    
    function saveAuthor() {
        const authorId = document.getElementById('edit-author-id').value;
        const name = document.getElementById('edit-author-name').value.trim();
        const bio = easyMDE ? easyMDE.value() : '';
        
        if (!name) {
            alert('Имя автора обязательно');
            return;
        }
        
        const btn = document.getElementById('save-edit-author');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохранение...';
        
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
                
                // Обновляем UI в зависимости от страницы
                updateAuthorUI(authorId, name, bio);
                
                // Перезагружаем если на странице автора
                if (document.querySelector('.author-header')) {
                    setTimeout(() => location.reload(), 500);
                }
            } else {
                throw new Error(data.error || 'Ошибка при сохранении');
            }
        })
        .catch(error => {
            showNotification(error.message, 'danger');
            console.error(error);
        })
        .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
        });
    }
    
    function updateAuthorUI(authorId, name, bio) {
        // Обновление в таблице admin_authors.html
        const row = document.getElementById(`author-row-${authorId}`);
        if (row) {
            const nameInput = row.querySelector('input[name="name"]');
            if (nameInput) nameInput.value = name;
            
            const bioCell = row.querySelector('.author-bio-preview');
            if (bioCell) {
                if (bio) {
                    bioCell.innerHTML = `<span class="bio-preview">${escapeHtml(bio.substring(0, 50))}${bio.length > 50 ? '...' : ''}</span>`;
                } else {
                    bioCell.innerHTML = '<span class="text-muted">Нет биографии</span>';
                }
            }
            
            // Обновляем data-атрибуты кнопки редактирования
            const editBtn = row.querySelector('.edit-author-btn');
            if (editBtn) {
                editBtn.dataset.authorName = name;
                editBtn.dataset.authorBio = bio.replace(/\n/g, '\\n').replace(/"/g, '\\"');
            }
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showNotification(message, type) {
        if (typeof AdminUtils !== 'undefined' && AdminUtils.showNotification) {
            AdminUtils.showNotification(message, type);
            return;
        }
        
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        const bgClass = type === 'success' ? 'bg-success' : 'bg-danger';
        const icon = type === 'success' ? '✓' : '✕';
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
})();
// Author Page JavaScript
// Handles editing author from the public author page

console.log("👤 Author Page Loaded");

// ============================================
// AUTHOR PAGE EDIT MODULE
// ============================================
const AuthorPageEditModule = (function() {
    let editAuthorModal = null;
    let easyMDE = null;
    
    function init() {
        const editBtn = document.querySelector('.edit-author-from-page');
        if (!editBtn) return;
        
        initModal();
        initEditButton();
        initSaveButton();
    }
    
    function initModal() {
        const modalElement = document.getElementById('editAuthorModal');
        if (modalElement) {
            editAuthorModal = new bootstrap.Modal(modalElement);
        }
    }
    
    function initEditButton() {
        document.querySelectorAll('.edit-author-from-page').forEach(btn => {
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
    
    function initSaveButton() {
        const saveBtn = document.getElementById('save-edit-author');
        if (!saveBtn) return;
        
        saveBtn.addEventListener('click', function() {
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
            
            const btn = this;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохранение...';
            
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
                    
                    setTimeout(() => location.reload(), 500);
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
        });
    }
    
    function initEasyMDE() {
        if (!easyMDE) {
            const textarea = document.getElementById('edit-author-bio');
            if (!textarea) return null;
            
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
    
    function showNotification(message, type = 'success') {
        if (typeof showNotification === 'function' && showNotification !== arguments.callee) {
            showNotification(message, type);
        } else if (typeof AdminUtils !== 'undefined' && AdminUtils.showNotification) {
            AdminUtils.showNotification(message, type);
        } else {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show position-fixed`;
            alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
            alertDiv.innerHTML = `
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            document.body.appendChild(alertDiv);
            
            setTimeout(() => {
                alertDiv.remove();
            }, 5000);
        }
    }
    
    return { init: init };
})();

// ============================================
// RESERVATION MODALS MODULE
// ============================================
const ReservationModalsModule = (function() {
    function init() {
        // Bootstrap модалки инициализируются автоматически
    }
    
    return { init: init };
})();

// ============================================
// MAIN INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    AuthorPageEditModule.init();
    ReservationModalsModule.init();
});
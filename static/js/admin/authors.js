// Admin Authors Page JavaScript
// Только специфичный функционал, общий в edit_author.js

document.addEventListener('DOMContentLoaded', function() {
    'use strict';
    
    initAddAuthorForm();
    initDeleteButtons();
    initPhotoButtons();
    initAjaxForms();
    
    function initAddAuthorForm() {
        const form = document.getElementById('add-author-form');
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification(data.message || 'Автор добавлен', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error(data.error || 'Ошибка');
                }
            })
            .catch(error => {
                showNotification(error.message, 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            });
        });
    }
    
    function initDeleteButtons() {
        document.querySelectorAll('.delete-author').forEach(btn => {
            btn.addEventListener('click', function() {
                const authorId = this.dataset.authorId;
                const authorName = this.dataset.authorName;
                const booksCount = parseInt(this.dataset.booksCount);
                
                if (booksCount > 0) {
                    alert(`У автора "${authorName}" есть ${booksCount} книг. Удаление невозможно.`);
                    return;
                }
                
                if (!confirm(`Удалить автора "${authorName}"?`)) return;
                
                const originalText = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                fetch(`/admin/author/delete/${authorId}`, {
                    method: 'POST',
                    headers: {'X-Requested-With': 'XMLHttpRequest'}
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showNotification('Автор удален', 'success');
                        document.getElementById(`author-row-${authorId}`).remove();
                    } else {
                        throw new Error(data.error || 'Ошибка при удалении');
                    }
                })
                .catch(error => {
                    showNotification(error.message, 'danger');
                    this.disabled = false;
                    this.innerHTML = originalText;
                });
            });
        });
    }
    
    function initPhotoButtons() {
        let coverModal = null;
        let currentFile = null;
        
        const coverModalEl = document.getElementById('coverModal');
        if (coverModalEl) {
            coverModal = new bootstrap.Modal(coverModalEl);
        }
        
        document.querySelectorAll('.btn-author-photo').forEach(btn => {
            btn.addEventListener('click', function() {
                const authorId = this.dataset.authorId;
                const authorName = this.dataset.authorName;
                const photoFilename = this.dataset.photoFilename || '';
                
                document.getElementById('coverBookTitle').textContent = authorName;
                document.getElementById('coverBookId').value = authorId;
                
                currentFile = null;
                resetCoverModal();
                
                if (photoFilename) {
                    const previewImg = document.getElementById('previewImage');
                    if (previewImg) {
                        previewImg.src = `/static/uploads/authors/${photoFilename}`;
                        document.getElementById('dropZoneContent').style.display = 'none';
                        document.getElementById('dropZonePreview').style.display = 'flex';
                        document.getElementById('fileInfo').style.display = 'flex';
                        document.getElementById('fileName').textContent = 'Текущее фото';
                        document.getElementById('fileSize').textContent = '';
                        
                        document.getElementById('btnSaveCover').style.display = 'none';
                        document.getElementById('btnDeleteCover').style.display = 'inline-flex';
                        document.getElementById('btnReplaceCover').style.display = 'inline-flex';
                    }
                }
                
                if (coverModal) coverModal.show();
            });
        });
        
        // Cover modal handlers
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('coverFileInput');
        
        if (dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });
            
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
            
            dropZone.addEventListener('click', (e) => {
                if (e.target.closest('.drop-zone-preview')) return;
                fileInput.click();
            });
            
            dropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt.files.length > 0) handleCoverFile(dt.files[0]);
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) handleCoverFile(e.target.files[0]);
            });
        }
        
        const btnSave = document.getElementById('btnSaveCover');
        const btnDelete = document.getElementById('btnDeleteCover');
        const btnReplace = document.getElementById('btnReplaceCover');
        
        if (btnSave) btnSave.addEventListener('click', saveAuthorPhoto);
        if (btnDelete) btnDelete.addEventListener('click', deleteAuthorPhoto);
        if (btnReplace) btnReplace.addEventListener('click', () => fileInput.click());
        
        function handleCoverFile(file) {
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showCoverError('Недопустимый формат. Разрешены: JPG, PNG, WEBP');
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
                
                document.getElementById('btnSaveCover').disabled = false;
                document.getElementById('btnSaveCover').style.display = 'inline-flex';
                document.getElementById('btnDeleteCover').style.display = 'none';
                document.getElementById('btnReplaceCover').style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
        
        function saveAuthorPhoto() {
            const authorId = document.getElementById('coverBookId').value;
            
            if (!currentFile || !authorId) {
                showCoverError('Файл не выбран');
                return;
            }
            
            const btn = document.getElementById('btnSaveCover');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохранение...';
            
            const formData = new FormData();
            formData.append('photo', currentFile, currentFile.name);
            
            fetch(`/admin/author/${authorId}/upload_photo`, {
                method: 'POST',
                body: formData,
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Фото сохранено!', 'success');
                    coverModal.hide();
                    setTimeout(() => location.reload(), 500);
                } else {
                    throw new Error(data.error || 'Ошибка сервера');
                }
            })
            .catch(error => {
                showCoverError('Ошибка: ' + error.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        }
        
        function deleteAuthorPhoto() {
            const authorId = document.getElementById('coverBookId').value;
            
            if (!confirm('Удалить фото автора?')) return;
            
            const btn = document.getElementById('btnDeleteCover');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            fetch(`/admin/author/${authorId}/delete_photo`, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Фото удалено', 'success');
                    coverModal.hide();
                    setTimeout(() => location.reload(), 500);
                } else {
                    throw new Error(data.error || 'Ошибка');
                }
            })
            .catch(error => {
                showCoverError('Ошибка: ' + error.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            });
        }
        
        function resetCoverModal() {
            currentFile = null;
            document.getElementById('coverFileInput').value = '';
            document.getElementById('dropZoneContent').style.display = 'flex';
            document.getElementById('dropZonePreview').style.display = 'none';
            document.getElementById('fileInfo').style.display = 'none';
            document.getElementById('btnSaveCover').disabled = true;
            document.getElementById('btnSaveCover').style.display = 'inline-flex';
            document.getElementById('btnDeleteCover').style.display = 'none';
            document.getElementById('btnReplaceCover').style.display = 'none';
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
    }
    
    function initAjaxForms() {
        document.querySelectorAll('form[id^="author-form-"]').forEach(form => {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                const submitBtn = document.querySelector(`button[form="${this.id}"]`);
                const originalText = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                fetch(this.action, {
                    method: 'POST',
                    body: new FormData(this),
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showNotification(data.message || 'Сохранено', 'success');
                    } else {
                        throw new Error(data.error || 'Ошибка');
                    }
                })
                .catch(error => {
                    showNotification(error.message, 'danger');
                })
                .finally(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                });
            });
        });
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
});
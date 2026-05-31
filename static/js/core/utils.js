// Shared Utilities
// Единые функции для всего приложения

function showNotification(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    const bgClasses = {
        success: 'bg-success',
        danger: 'bg-danger',
        warning: 'bg-warning',
        info: 'bg-info'
    };
    const icons = {
        success: '✔',
        danger: '✖',
        warning: '⚠',
        info: 'ℹ'
    };
    
    const bgClass = bgClasses[type] || 'bg-info';
    const icon = icons[type] || 'ℹ';
    const toastId = 'toast-' + Date.now();
    
    toastContainer.insertAdjacentHTML('beforeend', `
        <div id="${toastId}" class="toast align-items-center ${bgClass} text-white border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body"><span class="me-2">${icon}</span>${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `);
    
    const toast = new bootstrap.Toast(document.getElementById(toastId), {
        autohide: true,
        delay: 3000
    });
    toast.show();
    
    setTimeout(() => {
        const el = document.getElementById(toastId);
        if (el) el.remove();
    }, 3500);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
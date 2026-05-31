// register.js — клиентская валидация регистрации

document.addEventListener('DOMContentLoaded', function() {
    // Элементы формы
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm_password');
    const registerForm = document.getElementById('registerForm');
    const submitBtn = document.getElementById('submitBtn');
    
    // Элементы для отображения статуса
    const usernameStatus = document.getElementById('usernameStatus');
    const emailStatus = document.getElementById('emailStatus');
    const passwordStatus = document.getElementById('passwordStatus');
    const confirmStatus = document.getElementById('confirmStatus');
    const emailErrorMessage = document.getElementById('emailErrorMessage');
    
    // Элементы для индикатора сложности пароля
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    const generateBtn = document.getElementById('generatePasswordBtn');
    const togglePasswordBtn = document.getElementById('togglePassword');
    
    // Состояние валидации
    let validationState = {
        username: false,
        email: false,
        password: false,
        confirm: false
    };
    
    let emailCheckTimeout = null;
    let lastCheckedEmail = '';
    
    // ============================================
    // Валидация имени пользователя
    // ============================================
    if (usernameInput) {
        // Начальное состояние — поле пустое, нет обводки
        usernameInput.classList.remove('is-valid', 'is-invalid');
        usernameStatus.innerHTML = '';
        
        usernameInput.addEventListener('input', function() {
            const value = this.value.trim();
            
            if (value.length === 0) {
                // Пустое поле — нет обводки, нет иконки
                usernameStatus.innerHTML = '';
                usernameInput.classList.remove('is-valid', 'is-invalid');
                validationState.username = false;
                updateSubmitButton();
                return;
            }
            
            const isValid = value.length >= 3;
            
            validationState.username = isValid;
            updateSubmitButton();
            
            if (isValid) {
                usernameStatus.innerHTML = '✔';
                usernameStatus.className = 'validation-icon valid';
                usernameInput.classList.remove('is-invalid');
                usernameInput.classList.add('is-valid');
            } else {
                usernameStatus.innerHTML = '✖';
                usernameStatus.className = 'validation-icon invalid';
                usernameInput.classList.add('is-invalid');
                usernameInput.classList.remove('is-valid');
            }
        });
    }
    
    // ============================================
    // Валидация email (с проверкой MX через API)
    // ============================================
    if (emailInput) {
        // Начальное состояние
        emailInput.classList.remove('is-valid', 'is-invalid');
        emailStatus.innerHTML = '';
        if (emailErrorMessage) emailErrorMessage.textContent = '';
        
        emailInput.addEventListener('input', function() {
            const email = this.value.trim();
            
            // Очищаем предыдущий таймаут
            if (emailCheckTimeout) clearTimeout(emailCheckTimeout);
            
            // Очищаем сообщение об ошибке при изменении
            if (emailErrorMessage) emailErrorMessage.textContent = '';
            
            if (email.length === 0) {
                // Пустое поле — нет обводки, нет иконки
                emailStatus.innerHTML = '';
                emailStatus.className = 'validation-icon';
                emailInput.classList.remove('is-valid', 'is-invalid');
                validationState.email = false;
                updateSubmitButton();
                lastCheckedEmail = '';
                return;
            }
            
            // Базовая проверка формата
            const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
            if (!emailRegex.test(email)) {
                emailStatus.innerHTML = '✖';
                emailStatus.className = 'validation-icon invalid';
                emailInput.classList.add('is-invalid');
                emailInput.classList.remove('is-valid');
                validationState.email = false;
                if (emailErrorMessage) emailErrorMessage.textContent = 'Неверный формат email';
                updateSubmitButton();
                return;
            }
            
            // Показываем индикатор загрузки
            emailStatus.innerHTML = '🔄';
            emailStatus.className = 'validation-icon loading';
            
            // Отправляем запрос на сервер для проверки MX
            emailCheckTimeout = setTimeout(() => {
                fetch('/api/check-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ email: email })
                })
                .then(response => response.json())
                .then(data => {
                    lastCheckedEmail = email;
                    
                    if (data.valid) {
                        emailStatus.innerHTML = '✔';
                        emailStatus.className = 'validation-icon valid';
                        emailInput.classList.add('is-valid');
                        emailInput.classList.remove('is-invalid');
                        if (emailErrorMessage) emailErrorMessage.textContent = '';
                        validationState.email = true;
                    } else {
                        emailStatus.innerHTML = '✖';
                        emailStatus.className = 'validation-icon invalid';
                        emailInput.classList.add('is-invalid');
                        emailInput.classList.remove('is-valid');
                        validationState.email = false;
                        
                        // Показываем сообщение об ошибке на русском
                        let errorMessage = data.message;
                        // Переводим сообщения на русский
                        if (errorMessage.includes('domain does not exist')) {
                            errorMessage = 'Домен не существует';
                        } else if (errorMessage.includes('no MX record')) {
                            errorMessage = 'Домен не имеет почтового сервера';
                        } else if (errorMessage.includes('already registered')) {
                            errorMessage = 'Этот email уже зарегистрирован';
                        }
                        if (emailErrorMessage) emailErrorMessage.textContent = errorMessage;
                    }
                    updateSubmitButton();
                })
                .catch(error => {
                    console.error('Email check error:', error);
                    // При ошибке сети всё равно разрешаем регистрацию
                    emailStatus.innerHTML = '⚠️';
                    emailStatus.className = 'validation-icon warning';
                    validationState.email = true;
                    updateSubmitButton();
                });
            }, 500);
        });
        
        // Очищаем сообщение при фокусе
        emailInput.addEventListener('focus', function() {
            if (emailErrorMessage) emailErrorMessage.textContent = '';
        });
    }
    
    // ============================================
    // Проверка сложности пароля
    // ============================================
    if (passwordInput) {
        // Начальное состояние
        passwordInput.classList.remove('is-valid', 'is-invalid');
        passwordStatus.innerHTML = '';
        
        passwordInput.addEventListener('input', function() {
            const password = this.value;
            
            if (password.length === 0) {
                // Пустое поле — нет обводки, нет иконки
                passwordStatus.innerHTML = '';
                passwordStatus.className = 'validation-icon';
                passwordInput.classList.remove('is-valid', 'is-invalid');
                validationState.password = false;
                updateSubmitButton();
                updateStrengthMeter('', 0);
                return;
            }
            
            // Проверка сложности пароля
            const result = checkPasswordStrength(password);
            
            if (result.isValid) {
                passwordStatus.innerHTML = '✔';
                passwordStatus.className = 'validation-icon valid';
                passwordInput.classList.add('is-valid');
                passwordInput.classList.remove('is-invalid');
                validationState.password = true;
            } else {
                passwordStatus.innerHTML = '✖';
                passwordStatus.className = 'validation-icon invalid';
                passwordInput.classList.add('is-invalid');
                passwordInput.classList.remove('is-valid');
                validationState.password = false;
            }
            
            updateStrengthMeter(result.message, result.score);
            updateSubmitButton();
        });
    }
    
    function checkPasswordStrength(password) {
        let score = 0;
        let messages = [];
        
        if (password.length >= 8) {
            score += 25;
        } else {
            messages.push('8+ символов');
        }
        
        if (/[A-Z]/.test(password)) {
            score += 25;
        } else {
            messages.push('заглавная буква');
        }
        
        if (/[a-z]/.test(password)) {
            score += 25;
        } else {
            messages.push('строчная буква');
        }
        
        if (/\d/.test(password)) {
            score += 15;
        } else {
            messages.push('цифра');
        }
        
        if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
            score += 10;
        } else {
            messages.push('спецсимвол');
        }
        
        const isValid = (password.length >= 8 && 
                        /[A-Z]/.test(password) &&
                        /[a-z]/.test(password) &&
                        /\d/.test(password) &&
                        /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password));
        
        let message;
        if (password.length === 0) {
            message = '';
        } else if (isValid) {
            message = '✔ Надёжный пароль';
        } else {
            message = `Требуется: ${messages.join(', ')}`;
        }
        
        return { isValid, message, score };
    }
    
    function updateStrengthMeter(message, score) {
        if (!strengthBar) return;
        
        let color;
        if (score >= 80) {
            color = '#10b981';
        } else if (score >= 60) {
            color = '#84cc16';
        } else if (score >= 40) {
            color = '#eab308';
        } else if (score >= 20) {
            color = '#f97316';
        } else {
            color = '#ef4444';
        }
        
        strengthBar.style.width = `${score}%`;
        strengthBar.style.backgroundColor = color;
        
        if (strengthText) {
            strengthText.textContent = message;
            if (message && message.includes('Надёжный')) {
                strengthText.style.color = '#10b981';
            } else if (message && message.includes('Требуется')) {
                strengthText.style.color = '#ef4444';
            } else {
                strengthText.style.color = '';
            }
        }
    }
    
    // ============================================
    // Подтверждение пароля
    // ============================================
    if (confirmInput) {
        // Начальное состояние
        confirmInput.classList.remove('is-valid', 'is-invalid');
        confirmStatus.innerHTML = '';
        
        confirmInput.addEventListener('input', function() {
            const password = passwordInput ? passwordInput.value : '';
            const confirm = this.value;
            
            if (confirm.length === 0) {
                // Пустое поле — нет обводки, нет иконки
                confirmStatus.innerHTML = '';
                confirmStatus.className = 'validation-icon';
                confirmInput.classList.remove('is-valid', 'is-invalid');
                validationState.confirm = false;
                updateSubmitButton();
                return;
            }
            
            if (confirm === password && password.length > 0) {
                confirmStatus.innerHTML = '✔';
                confirmStatus.className = 'validation-icon valid';
                confirmInput.classList.add('is-valid');
                confirmInput.classList.remove('is-invalid');
                validationState.confirm = true;
            } else {
                confirmStatus.innerHTML = '✖';
                confirmStatus.className = 'validation-icon invalid';
                confirmInput.classList.add('is-invalid');
                confirmInput.classList.remove('is-valid');
                validationState.confirm = false;
            }
            
            updateSubmitButton();
        });
    }
    
    // ============================================
    // Генератор пароля
    // ============================================
    if (generateBtn && passwordInput) {
        generateBtn.addEventListener('click', function() {
            fetch('/api/generate-password', {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.password) {
                    passwordInput.value = data.password;
                    // Триггерим событие input для обновления валидации
                    passwordInput.dispatchEvent(new Event('input'));
                    
                    // Копируем в буфер обмена
                    navigator.clipboard.writeText(data.password).then(() => {
                        showToast('Пароль скопирован в буфер обмена', 'success');
                    }).catch(() => {
                        showToast('Пароль сгенерирован', 'success');
                    });
                    
                    // Если есть поле подтверждения, очищаем его
                    if (confirmInput) {
                        confirmInput.value = '';
                        confirmInput.dispatchEvent(new Event('input'));
                    }
                }
            })
            .catch(error => {
                console.error('Generate password error:', error);
                showToast('Ошибка генерации пароля', 'danger');
            });
        });
    }
    
    // ============================================
    // Показ/скрытие пароля
    // ============================================
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', function() {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            this.textContent = type === 'password' ? '😑' : '🫣';
        });
    }
    
    // ============================================
    // Обновление кнопки отправки
    // ============================================
    function updateSubmitButton() {
        const allValid = validationState.username && 
                         validationState.email && 
                         validationState.password && 
                         validationState.confirm;
        
        if (submitBtn) {
            submitBtn.disabled = !allValid;
        }
    }
    
    // ============================================
    // Toast уведомления
    // ============================================
    function showToast(message, type) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        const bgClass = type === 'success' ? 'bg-success' : 
                       (type === 'danger' ? 'bg-danger' : 'bg-warning');
        const icon = type === 'success' ? '✔' : (type === 'danger' ? '✖' : '⚠️');
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
        const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 3000 });
        toast.show();
        
        toastElement.addEventListener('hidden.bs.toast', function() {
            this.remove();
        });
    }
    
    // Инициализация — проверяем начальное состояние кнопки
    updateSubmitButton();
});
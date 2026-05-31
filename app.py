import os
import uuid
import io
import base64
import random
import string
import markdown
import bleach
import re
import dns.resolver
from email_validator import validate_email, EmailNotValidError
from markupsafe import Markup
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, UserMixin, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from PIL import Image
from utils.time_utils import now as get_now
from datetime import datetime, timedelta, timezone
from config import Config
from sqlalchemy import func
from sqlalchemy.orm import selectinload

app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

UPLOAD_FOLDER = 'static/uploads/covers'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB
TARGET_WIDTH = 300
TARGET_HEIGHT = 450

book_authors = db.Table('book_authors',
    db.Column('book_id', db.Integer, db.ForeignKey('book.id'), primary_key=True),
    db.Column('author_id', db.Integer, db.ForeignKey('author.id'), primary_key=True)
)

class ReservationStatus:
    PENDING = 'pending'
    READY = 'ready'
    REJECTED = 'rejected'
    TAKEN = 'taken'
    RETURNED = 'returned'
    EXPIRED = 'expired'
    CANCELLED = 'cancelled'

class Author(db.Model):
    __tablename__ = 'author'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    bio = db.Column(db.Text, nullable=True)
    photo_filename = db.Column(db.String(200), nullable=True)
    
    books = db.relationship('Book', secondary=book_authors, 
                           backref=db.backref('authors', lazy='select'), 
                           lazy='select')

class Book(db.Model):
    __tablename__ = 'book'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    author = db.Column(db.String(100), nullable=False)
    genre = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text, nullable=True)
    cover_filename = db.Column(db.String(200), nullable=True)
    libraries = db.relationship('Library', secondary='book_library', backref='books')

class Library(db.Model):
    __tablename__ = 'library'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), nullable=False)

class BookLibrary(db.Model):
    __tablename__ = 'book_library'
    book_id = db.Column(db.Integer, db.ForeignKey('book.id'), primary_key=True)
    library_id = db.Column(db.Integer, db.ForeignKey('library.id'), primary_key=True)
    quantity = db.Column(db.Integer, default=1)

class LibrarianLibrary(db.Model):
    __tablename__ = 'librarian_libraries'
    
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    library_id = db.Column(db.Integer, db.ForeignKey('library.id'), primary_key=True)
    assigned_at = db.Column(db.DateTime, default=get_now)
    
    user = db.relationship('User', foreign_keys=[user_id], backref='librarian_libraries')
    library = db.relationship('Library', backref='librarians')

class User(UserMixin, db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    role = db.Column(db.String(20), default='user')
    is_blocked = db.Column(db.Boolean, default=False)
    blocked_at = db.Column(db.DateTime, nullable=True)
    blocked_by = db.Column(db.String(20), nullable=True)
    blocked_reason = db.Column(db.String(50), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.role == 'admin'

    def is_librarian(self):
        return self.role == 'librarian'
    
    def is_staff(self):
        """Админ или библиотекарь"""
        return self.role in ('admin', 'librarian')
    
    def get_managed_libraries(self):
        """Возвращает список библиотек, где пользователь — библиотекарь или админ"""
        if self.is_admin():
            return Library.query.all()
        elif self.is_librarian():
            return [ll.library for ll in self.librarian_libraries]
        return []
    
    def can_manage_library(self, library_id):
        """Проверяет, может ли пользователь управлять конкретной библиотекой"""
        if self.is_admin():
            return True
        if self.is_librarian():
            return any(ll.library_id == library_id for ll in self.librarian_libraries)
        return False
    
    def is_blocked_user(self):
        """Проверка, заблокирован ли пользователь"""
        return self.is_blocked
    
    def get_active_reservations_count(self):
        """Количество активных броней (PENDING, READY, TAKEN)"""
        return BookReservation.query.filter(
            BookReservation.user_id == self.id,
            BookReservation.status.in_(['pending', 'ready', 'taken'])
        ).count()

class BookReservation(db.Model):
    __tablename__ = 'book_reservation'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('book.id'), nullable=False)
    library_id = db.Column(db.Integer, db.ForeignKey('library.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reservation_date = db.Column(db.DateTime, default=get_now)
    expiry_date = db.Column(db.DateTime, nullable=False)
    reservation_number = db.Column(db.String(20), unique=True, nullable=False)
    status = db.Column(db.String(20), default='pending')
    
    confirmed_at = db.Column(db.DateTime, nullable=True)
    taken_at = db.Column(db.DateTime, nullable=True)
    returned_at = db.Column(db.DateTime, nullable=True)

    book = db.relationship('Book', backref='reservations')
    library = db.relationship('Library', backref='reservations')
    user = db.relationship('User', backref='reservations')

    @property
    def return_date(self):
        if self.taken_at:
            return self.taken_at + timedelta(days=30)
        return None

    @property
    def days_left(self):
        if not self.taken_at:
            return None
        return (self.return_date - get_now()).days

class UserNotification(db.Model):
    __tablename__ = 'user_notification'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    reservation_id = db.Column(db.Integer, db.ForeignKey('book_reservation.id'), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=get_now)
    
    user = db.relationship('User', backref='notifications')
    reservation = db.relationship('BookReservation', backref='notifications')

class Review(db.Model):
    __tablename__ = 'review'
    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('book.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='pending')
    rejection_reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_now)
    updated_at = db.Column(db.DateTime, nullable=True)
    
    book = db.relationship('Book', backref='reviews')
    user = db.relationship('User', backref='reviews')
    
    __table_args__ = (
        db.UniqueConstraint('book_id', 'user_id', name='uq_review_book_user'),
    )

class ReviewVote(db.Model):
    __tablename__ = 'review_vote'
    id = db.Column(db.Integer, primary_key=True)
    review_id = db.Column(db.Integer, db.ForeignKey('review.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    vote = db.Column(db.String(4), nullable=False)
    created_at = db.Column(db.DateTime, default=get_now)
    
    review = db.relationship('Review', backref='votes')
    user = db.relationship('User')
    
    __table_args__ = (
        db.UniqueConstraint('review_id', 'user_id', name='uq_review_vote_review_user'),
    )

# --- Вспомогательные функции ---
def get_available_libraries_for_book(book_id):
    book = db.session.get(Book, book_id)
    if not book:
        return []
    
    available_libraries = []
    
    for library in book.libraries:
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library.id
        ).first()
        
        if not book_library:
            continue
        
        # Учитываем все НЕзавершённые брони
        active_count = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library.id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if active_count < book_library.quantity:
            available_libraries.append(library)
    
    return available_libraries

def is_book_available_in_any_library(book_id):
    """Проверить, доступна ли книга для бронирования в любой библиотеке"""
    book = db.session.get(Book, book_id)
    if not book:
        return False
    
    for library in book.libraries:
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library.id
        ).first()
        
        if not book_library:
            continue
            
        active_reservation_count = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library.id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if active_reservation_count < book_library.quantity:
            return True
    
    return False

def get_libraries_without_book(book_id):
    """Получить библиотеки, с которыми книга НЕ связана"""
    book = db.session.get(Book, book_id)
    if not book:
        return []
    
    # Все библиотеки минус те, с которыми книга уже связана
    all_libraries = Library.query.all()
    linked_library_ids = [lib.id for lib in book.libraries]
    
    return [lib for lib in all_libraries if lib.id not in linked_library_ids]

def get_libraries_with_book(book_id):
    """Получить библиотеки, с которыми книга связана"""
    book = db.session.get(Book, book_id)
    if not book:
        return []
    
    return book.libraries

def update_expired_reservations():
    """Автоматически освобождает просроченные брони (статус taken → expired)"""
    now = get_now()
    thirty_days_ago = now - timedelta(days=30)
    
    # Находим брони со статусом 'taken', у которых taken_at старше 7 дней
    expired_reservations = BookReservation.query.filter(
        BookReservation.status == 'taken',
        BookReservation.taken_at < thirty_days_ago
    ).all()
    
    for reservation in expired_reservations:
        reservation.status = 'expired'
        # Блокируем пользователя
        user = reservation.user
        if not user.is_blocked:
            user.is_blocked = True
            user.blocked_at = now
            user.blocked_by = 'system'
            user.blocked_reason = 'expired'
        print(f"Бронь {reservation.reservation_number} помечена как expired, пользователь {user.username} заблокирован")
    
    if expired_reservations:
        db.session.commit()
        print(f"Помечено как просроченные: {len(expired_reservations)} броней")
    
    return len(expired_reservations)

def generate_reservation_number():
    """Генерирует уникальный номер заказа: LIB-250309-123456"""
    date_part = get_now().strftime('%y%m%d') 
    random_part = ''.join([str(random.randint(0, 9)) for _ in range(6)]) 
    return f"LIB-{date_part}-{random_part}"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def optimize_image(file_storage, max_size=MAX_FILE_SIZE):
    """
    Оптимизирует изображение: ресайз и сжатие до max_size
    Возвращает BytesIO с оптимизированным изображением
    """
    img = Image.open(file_storage)
    
    # Конвертируем в RGB если нужно
    if img.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode in ('RGBA', 'LA'):
            background.paste(img, mask=img.split()[-1])
        else:
            background.paste(img)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Ресайз с сохранением пропорций
    img.thumbnail((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
    
    # Пробуем разные качества пока не уложимся в max_size
    quality = 85
    output = io.BytesIO()
    
    while True:
        output.seek(0)
        output.truncate(0)
        img.save(output, 'JPEG', quality=quality, optimize=True)
        
        if output.tell() <= max_size or quality <= 20:
            break
        quality -= 5
    
    output.seek(0)
    return output

def render_safe_markdown(text):
    """Безопасно конвертирует Markdown в HTML"""
    if not text:
        return ''
    
    try:
        allowed_tags = [
            'strong', 'em', 'u', 'b', 'i', 
            'ol', 'ul', 'li', 
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'a', 'blockquote', 'code', 'pre',
            'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'br', 'p'
        ]
        allowed_attrs = {
            'a': ['href', 'title', 'target'],
            '*': ['class']
        }
        
        html = markdown.markdown(text, extensions=['extra', 'nl2br', 'sane_lists'])
        clean_html = bleach.clean(html, tags=allowed_tags, attributes=allowed_attrs, strip=True, strip_comments=True)
        return Markup(bleach.linkify(clean_html))
    except Exception as e:
        print(f"Ошибка рендеринга Markdown: {e}")
        from markupsafe import escape
        return escape(text)

def validate_email_format(email):
    """
    Проверка формата email и MX-записи домена
    Возвращает: (is_valid, message, normalized_email)
    """
    # Проверка формата
    try:
        valid = validate_email(email)
        normalized_email = valid.email  # нормализованный email
    except EmailNotValidError as e:
        return False, str(e), None
    
    # Проверка MX-записи
    domain = normalized_email.split('@')[1]
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        if not mx_records:
            return False, "Домен не имеет почтового сервера (нет MX-записи)", None
        return True, "OK", normalized_email
    except dns.resolver.NoAnswer:
        return False, "Домен не имеет почтового сервера (нет MX-записи)", None
    except dns.resolver.NXDOMAIN:
        return False, "Домен не существует", None
    except Exception as e:
        # В случае ошибки DNS (таймаут и т.п.) пропускаем проверку MX
        # чтобы не блокировать регистрацию из-за временных проблем
        print(f"⚠️ MX check failed for {domain}: {e}")
        return True, "OK (MX check skipped)", normalized_email

def validate_password_strength(password):
    """
    Проверка сложности пароля
    Возвращает: (is_valid, message, score) где score 0-100
    """
    score = 0
    messages = []
    
    # Длина
    if len(password) >= 8:
        score += 25
    else:
        messages.append("минимум 8 символов")
    
    # Заглавные буквы
    if re.search(r'[A-Z]', password):
        score += 25
    else:
        messages.append("хотя бы одна заглавная буква")
    
    # Строчные буквы
    if re.search(r'[a-z]', password):
        score += 25
    else:
        messages.append("хотя бы одна строчная буква")
    
    # Цифры
    if re.search(r'\d', password):
        score += 15
    else:
        messages.append("хотя бы одна цифра")
    
    # Спецсимволы
    if re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]', password):
        score += 10
    else:
        messages.append("хотя бы один спецсимвол (!@#$%^&* и т.д.)")
    
    is_valid = (len(password) >= 8 and 
                re.search(r'[A-Z]', password) and
                re.search(r'[a-z]', password) and
                re.search(r'\d', password) and
                re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]', password))
    
    message = ", ".join(messages) if messages else "Надёжный пароль"
    
    return is_valid, message, score

def generate_strong_password(length=14):
    """
    Генерация надёжного пароля
    """
    import random
    import string
    
    # Обязательные символы
    uppercase = random.choice(string.ascii_uppercase)
    lowercase = random.choice(string.ascii_lowercase)
    digit = random.choice(string.digits)
    special = random.choice('!@#$%^&*()_+-=[]{}|;:,.<>?')
    
    # Остальные символы
    all_chars = string.ascii_letters + string.digits + '!@#$%^&*()_+-=[]{}|;:,.<>?'
    remaining = ''.join(random.choices(all_chars, k=length - 4))
    
    # Перемешиваем
    password_list = list(uppercase + lowercase + digit + special + remaining)
    random.shuffle(password_list)
    
    return ''.join(password_list)

def check_and_update_expired_reservations():
    """
    Проверяет брони со статусом TAKEN, у которых прошло более 7 дней.
    Меняет статус на EXPIRED и блокирует пользователя.
    Возвращает количество обработанных просрочек.
    """
    thirty_days_ago = get_now() - timedelta(days=30)
    
    # Находим просроченные выданные книги
    expired_reservations = BookReservation.query.filter(
        BookReservation.status == 'taken',
        BookReservation.taken_at < thirty_days_ago
    ).all()
    
    count = 0
    for reservation in expired_reservations:
        reservation.status = 'expired'
        
        # Блокируем пользователя
        user = reservation.user
        if not user.is_blocked:
            user.is_blocked = True
            user.blocked_at = get_now()
            user.blocked_by = 'system'
            user.blocked_reason = 'expired'
        
        count += 1
        print(f"🔴 Бронь {reservation.reservation_number} просрочена, пользователь {user.username} заблокирован")
    
    if count > 0:
        db.session.commit()
        print(f"✅ Обработано просроченных броней: {count}")
    
    return count

def get_status_display(status):
    """Отображение статуса на русском"""
    statuses = {
        'pending': '⏳ Ожидает подтверждения',
        'ready': '✅ Готово к выдаче',
        'rejected': '❌ Отклонено',
        'taken': '📖 Выдано (на руках)',
        'returned': '✔ Завершено',
        'expired': '⚠️ Просрочено',
        'cancelled': '✖ Отменено'
    }
    return statuses.get(status, status)

def create_notification(user_id, type, title, message, reservation_id=None):
    """Создаёт уведомление в БД"""
    notification = UserNotification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        reservation_id=reservation_id
    )
    db.session.add(notification)
    db.session.commit()
    return notification

@app.context_processor
def utility_processor():
    """Добавляем функции в контекст всех шаблонов"""
    def get_available_copies_count(book_id, library_id):
        """Получить количество доступных экземпляров книги в конкретной библиотеке"""
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library_id
        ).first()

        if not book_library:
            return 0

        # Учитываем все НЕзавершённые брони (pending, ready, taken, expired)
        active_count = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()

        return max(0, book_library.quantity - active_count)
    
    # Добавляем функцию для проверки доступности книги (для истории)
    def is_book_available(book_id):
        """Проверить, доступна ли книга хотя бы в одной библиотеке"""
        book = db.session.get(Book, book_id)
        if not book:
            return False
        
        for library in book.libraries:
            if get_available_copies_count(book_id, library.id) > 0:
                return True
        return False

    def file_version(filepath):
        """Возвращает путь и версию для cache busting"""
        if not filepath:
            return filepath, None
        try:
            full_path = os.path.join(app.root_path, 'static', filepath)
            if os.path.exists(full_path):
                mtime = os.path.getmtime(full_path)
                return filepath, int(mtime)
        except:
            pass
        return filepath, None
    
    return dict(
        get_available_copies_count=get_available_copies_count,
        is_book_available=is_book_available,
        timezone=timezone,
        render_safe_markdown=render_safe_markdown,
        file_version=file_version
    )

# Добавим API endpoints для динамической загрузки библиотек
@app.route('/admin/api/libraries/without-book/<int:book_id>')
@login_required
def api_libraries_without_book(book_id):
    """API для получения библиотек, с которыми книга не связана"""
    libraries = get_libraries_without_book(book_id)
    libraries_data = [{'id': lib.id, 'name': lib.name, 'address': lib.address} for lib in libraries]
    return jsonify(libraries_data)

@app.route('/admin/api/libraries/with-book/<int:book_id>')
@login_required
def api_libraries_with_book(book_id):
    """API для получения библиотек, с которыми книга связана"""
    libraries = get_libraries_with_book(book_id)
    libraries_data = [{'id': lib.id, 'name': lib.name, 'address': lib.address} for lib in libraries]
    return jsonify(libraries_data)

# --- Новые API endpoints для управления количеством ---
@app.route('/admin/api/library/<int:library_id>/details')
@login_required
def get_library_details(library_id):
    """Получить детальную информацию о библиотеке (экземпляры книг)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        # Сначала освобождаем просроченные брони
        update_expired_reservations()
        
        # Получаем все связи для библиотеки
        relations = BookLibrary.query.filter_by(library_id=library_id).all()
        
        books_data = []
        for rel in relations:
            book = db.session.get(Book, rel.book_id)
            
            if not book:
                continue
            
            active_reservations_count = BookReservation.query.filter(
                BookReservation.book_id == rel.book_id,
                BookReservation.library_id == library_id,
                BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
            ).count()
            
            available_quantity = max(0, rel.quantity - active_reservations_count)
            
            books_data.append({
                'book_id': book.id,
                'title': book.title,
                'author': book.author,
                'total_quantity': rel.quantity,
                'available_quantity': available_quantity,
                'reserved_quantity': active_reservations_count,
                'active_reservations': active_reservations_count
            })
        
        # Получаем активные брони для отображения (pending, ready, taken, expired)
        reservations = BookReservation.query.filter(
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).join(Book).join(User).all()
        
        reservations_data = []
        now = get_now()

        for res in reservations:
            if not res.book or not res.user:
                continue
            
            # Для выданных книг используем return_date (дата выдачи + 30 дней)
            # Для невыданных — expiry_date (дата бронирования + 30 дней)
            if res.status == 'taken' and res.taken_at:
                return_date = res.return_date
                if return_date:
                    target_date = return_date
                else:
                    target_date = res.expiry_date
            else:
                target_date = res.expiry_date
            
            target_date_aware = target_date.replace(tzinfo=now.tzinfo)
            delta = (target_date_aware - now).days
            if delta >= 0:
                days_left = delta
                days_text = f"{delta} дн." if delta > 0 else "Сегодня"
            else:
                days_left = abs(delta)
                days_text = f"{abs(delta)} дн. назад"

            reservation_date_aware = res.reservation_date.replace(tzinfo=now.tzinfo)

            reservations_data.append({
                'book_title': res.book.title,
                'user_name': res.user.username,
                'reservation_number': res.reservation_number,
                'reservation_date': reservation_date_aware.strftime('%d.%m.%Y %H:%M'),
                'expiry_date': target_date_aware.strftime('%d.%m.%Y %H:%M'),
                'days_left': days_left,
                'days_text': days_text
            })
        
        total_books = len(books_data)
        total_copies = sum(b['total_quantity'] for b in books_data) if books_data else 0
        total_available = sum(b['available_quantity'] for b in books_data) if books_data else 0
        total_reserved = total_copies - total_available
        
        return jsonify({
            'success': True,
            'data': {
                'books': books_data,
                'reservations': reservations_data,
                'stats': {
                    'total_books': total_books,
                    'total_copies': total_copies,
                    'available_copies': total_available,
                    'reserved_copies': total_reserved,
                    'active_reservations': len(reservations_data)
                }
            }
        })
        
    except Exception as e:
        import traceback
        print(f"❌ Ошибка в get_library_details: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': f"Внутренняя ошибка сервера: {str(e)}"}), 500
    
@app.route('/admin/api/book_library/update_quantity', methods=['POST'])
@login_required
def update_book_library_quantity():
    """Обновить количество экземпляров книги в библиотеке"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        book_id = request.json.get('book_id')
        library_id = request.json.get('library_id')
        new_quantity = int(request.json.get('quantity'))
        
        if new_quantity < 0:
            return jsonify({'success': False, 'error': 'Количество не может быть отрицательным'}), 400
        
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library_id
        ).first()
        
        if not book_library:
            return jsonify({'success': False, 'error': 'Связь не найдена'}), 404
        
        # Проверяем, что новое количество не меньше активных броней (pending, ready, taken, expired)
        active_reservations = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if new_quantity < active_reservations:
            return jsonify({
                'success': False, 
                'error': f'Нельзя установить меньше {active_reservations} (есть активные брони)'
            }), 400
        
        book_library.quantity = new_quantity
        db.session.commit()
        
        available_quantity = max(0, new_quantity - active_reservations)
        
        return jsonify({
            'success': True,
            'message': 'Количество обновлено',
            'data': {
                'total_quantity': new_quantity,
                'available_quantity': available_quantity,
                'reserved_quantity': active_reservations
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/book_library/stats/<int:library_id>')
@login_required
def get_library_book_stats(library_id):
    """Получить статистику по книгам в библиотеке"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        relations = BookLibrary.query.filter_by(library_id=library_id).all()
        
        total_books = 0
        total_copies = 0
        available_copies = 0
        
        books_data = []
        for rel in relations:
            book = db.session.get(Book, rel.book_id)
            if not book:
                continue
            
            # Считаем активные брони (pending, ready, taken, expired)
            active_reservations = BookReservation.query.filter(
                BookReservation.book_id == rel.book_id,
                BookReservation.library_id == library_id,
                BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
            ).count()
            
            available_quantity = max(0, rel.quantity - active_reservations)
            
            total_books += 1
            total_copies += rel.quantity
            available_copies += available_quantity
            
            books_data.append({
                'book_id': book.id,
                'title': book.title,
                'author': book.author,
                'quantity': rel.quantity,
                'available_quantity': available_quantity,
                'reserved': active_reservations
            })
        
        return jsonify({
            'success': True,
            'data': {
                'library_id': library_id,
                'stats': {
                    'total_books': total_books,
                    'total_copies': total_copies,
                    'available_copies': available_copies,
                    'reserved_copies': total_copies - available_copies
                },
                'books': books_data
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

@app.route('/', methods=['GET', 'POST'])
def index():
    search_query = request.args.get('q', '').strip()
    filter_type = request.args.get('filter', 'all')
    
    query = Book.query.options(selectinload(Book.authors))
    
    if search_query:
        if filter_type == 'title':
            query = query.filter(Book.title.ilike(f'%{search_query}%'))
        elif filter_type == 'author':
            query = query.join(Book.authors).filter(Author.name.ilike(f'%{search_query}%')).distinct()
        elif filter_type == 'genre':
            query = query.filter(Book.genre.ilike(f'%{search_query}%'))
        else:
            query = query.outerjoin(Book.authors).filter(
                db.or_(
                    Book.title.ilike(f'%{search_query}%'),
                    Book.author.ilike(f'%{search_query}%'),
                    Author.name.ilike(f'%{search_query}%'),
                    Book.genre.ilike(f'%{search_query}%'),
                    Book.description.ilike(f'%{search_query}%')
                )
            ).distinct()
    
    books = query.all()
    
    book_availability = {}
    for book in books:
        available_libraries = get_available_libraries_for_book(book.id)
        book_availability[book.id] = {
            'available_libraries': available_libraries,
            'is_available': len(available_libraries) > 0
        }
    
    return render_template('index.html', books=books, book_availability=book_availability)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        
        # Валидация имени пользователя
        if not username or len(username) < 3:
            flash('Имя пользователя должно содержать минимум 3 символа', 'error')
            return redirect(url_for('register'))
        
        if User.query.filter_by(username=username).first():
            flash('Этот логин уже занят', 'error')
            return redirect(url_for('register'))
        
        # Валидация email (формат + MX)
        is_valid_email, email_message, normalized_email = validate_email_format(email)
        if not is_valid_email:
            flash(f'Некорректный email: {email_message}', 'error')
            return redirect(url_for('register'))
        
        if User.query.filter_by(email=normalized_email).first():
            flash('Этот email уже зарегистрирован', 'error')
            return redirect(url_for('register'))
        
        # Проверка пароля
        if password != confirm_password:
            flash('Пароли не совпадают', 'error')
            return redirect(url_for('register'))
        
        is_valid_password, password_message, password_score = validate_password_strength(password)
        if not is_valid_password:
            flash(f'Пароль слишком слабый: {password_message}', 'error')
            return redirect(url_for('register'))
        
        # Создаём пользователя (активен сразу, без подтверждения email)
        user = User(username=username, email=normalized_email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        flash('Регистрация успешна! Теперь вы можете войти.', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                response_data = {'success': True}
                
                # Редирект в зависимости от роли
                if user.is_admin():
                    response_data['redirect'] = url_for('admin_panel')
                elif user.is_librarian():
                    response_data['redirect'] = url_for('librarian_dashboard')
                else:
                    response_data['redirect'] = url_for('index')
                
                response = jsonify(response_data)
                response.set_cookie('user_authenticated', 'true')
                return response
            
            # Для обычных запросов - редирект
            if user.is_admin():
                return redirect(url_for('admin_panel'))
            elif user.is_librarian():
                return redirect(url_for('librarian_dashboard'))
            else:
                return redirect(url_for('index'))
            
        # Обработка ошибок для AJAX
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': 'Неверные данные для входа'})
        
        flash('Неверные данные для входа', 'error')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

# --- Маршруты администратора ---

@app.route('/admin')
@login_required
def admin_panel():
    if current_user.is_librarian() and not current_user.is_admin():
        return redirect(url_for('librarian_dashboard'))
    if not current_user.is_admin():
        flash('Доступ запрещен. Требуются права администратора.', 'error')
        return redirect(url_for('index'))
    return redirect(url_for('admin_fund'))

@app.route('/admin/fund')
@login_required
def admin_fund():
    if current_user.is_librarian() and not current_user.is_admin():
        return redirect(url_for('librarian_dashboard'))
    if not current_user.is_admin():
        flash('Доступ запрещен. Требуются права администратора.', 'error')
        return redirect(url_for('index'))
    
    books = Book.query.options(selectinload(Book.authors)).all()
    libraries = Library.query.all()
    all_authors = Author.query.options(selectinload(Author.books).selectinload(Book.authors)).order_by(Author.name).all()
    
    return render_template('admin/fund.html', 
                         books=books, 
                         libraries=libraries,
                         all_authors=all_authors)

@app.route('/admin/users')
@login_required
def admin_users():
    if not current_user.is_admin():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    return render_template('admin/users.html')

@app.route('/admin/stats')
@login_required
def admin_stats():
    if not current_user.is_admin():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    return render_template('admin/stats.html')

@app.route('/admin/book/upload_cover_temp', methods=['POST'])
@login_required
def upload_cover_temp():
    """Временная загрузка обложки для новой книги"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        if 'cover' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        
        file = request.files['cover']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Недопустимый формат (разрешены: JPG, PNG, WEBP)'}), 400
        
        optimized = optimize_image(file)
        
        ext = 'jpg'
        filename = f"temp_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        with open(filepath, 'wb') as f:
            f.write(optimized.read())
        
        return jsonify({
            'success': True,
            'message': 'Обложка сохранена',
            'filename': filename,
            'cover_url': url_for('static', filename=f'uploads/covers/{filename}')
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/admin/book/add', methods=['POST'])
@login_required
def add_book():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        title = request.form.get('title')
        genre = request.form.get('genre')
        description = request.form.get('description')
        cover_filename = request.form.get('cover_filename')
        author_ids = request.form.getlist('author_ids')
        
        if not title or not genre:
            return jsonify({'success': False, 'error': 'Название и жанр обязательны'}), 400
        
        author_name = 'Неизвестный автор'
        if author_ids:
            first_author = db.session.get(Author, int(author_ids[0]))
            if first_author:
                author_name = first_author.name
        
        book = Book(
            title=title, 
            genre=genre, 
            author=author_name, 
            description=description,
            cover_filename=cover_filename
        )
        db.session.add(book)
        db.session.flush()
        
        if cover_filename and cover_filename.startswith('temp_'):
            old_filepath = os.path.join(UPLOAD_FOLDER, cover_filename)
            new_filename = f"{book.id}_{uuid.uuid4().hex[:8]}.jpg"
            new_filepath = os.path.join(UPLOAD_FOLDER, new_filename)
            
            if os.path.exists(old_filepath):
                os.rename(old_filepath, new_filepath)
                book.cover_filename = new_filename
        
        if author_ids:
            for author_id in author_ids:
                if author_id.strip():
                    author = db.session.get(Author, int(author_id))
                    if author:
                        book.authors.append(author)
        
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Книга успешно добавлена'})
        
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)}), 500
        flash(f'Ошибка при добавлении книги: {str(e)}')
        return redirect(url_for('admin_panel'))

@app.route('/admin/book/delete/<int:book_id>')
@login_required
def delete_book(book_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        book = db.get_or_404(Book, book_id)
        
        active_reservations = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if active_reservations > 0:
            error_msg = 'Нельзя удалить книгу: она забронирована пользователями'
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': error_msg}), 400
            flash(error_msg, 'error')
            return redirect(url_for('admin_panel'))
        
        if book.cover_filename:
            cover_path = os.path.join(UPLOAD_FOLDER, book.cover_filename)
            if os.path.exists(cover_path):
                try:
                    os.remove(cover_path)
                    print(f"🗑️ Удалён файл обложки: {book.cover_filename}")
                except Exception as e:
                    print(f"⚠️ Ошибка при удалении файла обложки: {e}")
        
        inactive_reservations = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.status.in_(['expired', 'returned', 'rejected', 'cancelled'])
        ).all()
        
        for reservation in inactive_reservations:
            db.session.delete(reservation)
        
        db.session.delete(book)
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Книга успешно удалена'})
        
        flash('Книга успешно удалена', 'success')
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при удалении книги: {str(e)}', 'error')
        return redirect(url_for('admin_panel'))

@app.route('/admin/book/edit/<int:book_id>', methods=['POST'])
@login_required
def edit_book(book_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        book = db.get_or_404(Book, book_id)
        
        if 'title' in request.form:
            book.title = request.form['title']
        if 'genre' in request.form:
            book.genre = request.form['genre']
        if 'description' in request.form:
            book.description = request.form['description']
        
        if 'author_ids' in request.form:
            author_ids_raw = request.form.getlist('author_ids')
            author_ids = []

            for raw_id in author_ids_raw:
                for single_id in raw_id.split(','):
                    single_id = single_id.strip()
                    if single_id:
                        try:
                            author_ids.append(int(single_id))
                        except ValueError:
                            continue

            if author_ids:
                book.authors = []
                for author_id in set(author_ids):
                    author = db.session.get(Author, author_id)
                    if author:
                        book.authors.append(author)
                first_author = book.authors[0] if book.authors else None
                if first_author:
                    book.author = first_author.name
            else:
                book.author = request.form.get('author', book.author)
        
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Книга успешно обновлена'})
        
        flash('Книга успешно обновлена!', 'success')
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при обновлении книги: {str(e)}', 'error')
        return redirect(url_for('admin_panel'))

@app.route('/admin/book/<int:book_id>/upload_cover', methods=['POST'])
@login_required
def upload_cover(book_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    book = db.get_or_404(Book, book_id)
    
    try:
        if 'cover' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        
        file = request.files['cover']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Недопустимый формат (разрешены: JPG, PNG, WEBP)'}), 400
        
        optimized = optimize_image(file)
        
        if book.cover_filename:
            old_path = os.path.join(UPLOAD_FOLDER, book.cover_filename)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                    print(f"🗑️ Удалён старый файл обложки: {book.cover_filename}")
                except Exception as e:
                    print(f"⚠️ Ошибка при удалении старого файла: {e}")
        
        ext = 'jpg'
        filename = f"{book_id}_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        with open(filepath, 'wb') as f:
            f.write(optimized.read())
        
        book.cover_filename = filename
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Обложка сохранена',
            'cover_url': url_for('static', filename=f'uploads/covers/{filename}')
        })
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error uploading cover: {str(e)}')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500

@app.route('/admin/book/<int:book_id>/delete_cover', methods=['POST'])
@login_required
def delete_cover(book_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    book = db.get_or_404(Book, book_id)
    
    try:
        if not book.cover_filename:
            return jsonify({'success': False, 'error': 'У книги нет обложки'}), 400
        
        # Удаляем файл
        filepath = os.path.join(UPLOAD_FOLDER, book.cover_filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # Обновляем БД
        book.cover_filename = None
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Обложка удалена'})
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error deleting cover: {str(e)}')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500

@app.route('/admin/library/add', methods=['POST'])
@login_required
def add_library():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    try:
        name = request.form['name']
        address = request.form['address']
        library = Library(name=name, address=address)
        db.session.add(library)
        db.session.commit()
        
        # Для AJAX запросов возвращаем успешный ответ
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Библиотека успешно добавлена'})
        
        return redirect(url_for('admin_panel'))
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при добавлении библиотеки: {str(e)}')
        return redirect(url_for('admin_panel'))

@app.route('/admin/library/delete/<int:library_id>')
@login_required
def delete_library(library_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        # Проверяем наличие активных броней в этой библиотеке (pending, ready, taken, expired)
        active_reservations = BookReservation.query.filter(
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if active_reservations > 0:
            error_msg = 'Нельзя удалить библиотеку: в ней есть забронированные книги'
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': error_msg}), 400
            flash(error_msg, 'error')
            return redirect(url_for('admin_panel'))
        
        library = db.get_or_404(Library, library_id)
        db.session.delete(library)
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Библиотека успешно удалена'})
        
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при удалении библиотеки: {str(e)}')
        return redirect(url_for('admin_panel'))

@app.route('/admin/library/edit/<int:library_id>', methods=['POST'])
@login_required
def edit_library(library_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    try:
        library = db.get_or_404(Library, library_id)
        library.name = request.form['name']
        library.address = request.form['address']
        db.session.commit()
        
        # Для AJAX запросов возвращаем JSON ответ
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Библиотека успешно обновлена'})
        
        # Для обычных POST запросов (форм в таблицах) - редирект с flash сообщением
        flash('Библиотека успешно обновлена!', 'success')
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        # Для AJAX запросов
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        
        # Для обычных POST запросов
        flash(f'Ошибка при обновлении библиотеки: {str(e)}', 'error')
        return redirect(url_for('admin_panel'))

@app.route('/admin/book_library/add', methods=['POST'])
@login_required
def add_book_library():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    try:
        book_id = request.form['book_id']
        library_id = request.form['library_id']
        
        # Проверяем, не существует ли уже такая связь
        existing = BookLibrary.query.filter_by(book_id=book_id, library_id=library_id).first()
        if existing:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'success': False, 'error': 'Связь уже существует'})
            flash('Связь уже существует')
            return redirect(url_for('admin_panel'))
            
        bl = BookLibrary(book_id=book_id, library_id=library_id)
        db.session.add(bl)
        db.session.commit()
        
        # Для AJAX запросов возвращаем успешный ответ
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Связь успешно добавлена'})
        
        return redirect(url_for('admin_panel'))
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при добавлении связи: {str(e)}')
        return redirect(url_for('admin_panel'))

@app.route('/admin/book_library/delete', methods=['POST'])
@login_required
def delete_book_library():
    """Удалить связь между книгой и библиотекой"""
    print(f"🔍 DELETE BOOK_LIBRARY CALLED")  # Отладка
    print(f"Form data: {request.form}")  # Отладка
    
    if not current_user.is_admin():
        print(f"⛔ Access denied - not admin")  # Отладка
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        book_id = request.form.get('book_id')
        library_id = request.form.get('library_id')
        
        print(f"📚 Attempting to delete link: book_id={book_id}, library_id={library_id}")  # Отладка
        
        if not book_id or not library_id:
            print(f"⛔ Missing book_id or library_id")  # Отладка
            return jsonify({'success': False, 'error': 'Отсутствуют ID книги или библиотеки'}), 400
        
        # Находим связь
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library_id
        ).first()
        
        if not book_library:
            print(f"⛔ Link not found")  # Отладка
            return jsonify({'success': False, 'error': 'Связь не найдена'}), 404
        
        # ПРОВЕРЯЕМ НАЛИЧИЕ АКТИВНЫХ БРОНЕЙ В ЭТОЙ БИБЛИОТЕКЕ ДЛЯ ЭТОЙ КНИГИ
        active_reservations = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        print(f"🔍 Active reservations found: {active_reservations}")  # Отладка
        
        if active_reservations > 0:
            error_msg = f'Нельзя удалить связь: есть {active_reservations} активных бронирований в этой библиотеке'
            print(f"⛔ {error_msg}")  # Отладка
            return jsonify({'success': False, 'error': 'Нельзя удалить связь: книга забронирована в этой библиотеке'}), 400
        
        # Удаляем связь
        db.session.delete(book_library)
        db.session.commit()
        print(f"✅ Link deleted successfully")  # Отладка
        
        # Для AJAX запросов
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Связь успешно удалена'})
        
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Exception: {str(e)}")  # Отладка
        import traceback
        traceback.print_exc()  # Отладка
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка при удалении связи: {str(e)}')
        return redirect(url_for('admin_panel'))

@app.route('/admin/authors')
@login_required
def admin_authors():
    if not current_user.is_admin():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    
    authors = Author.query.options(selectinload(Author.books).selectinload(Book.authors)).order_by(Author.id.asc()).all()
    return render_template('admin/authors.html', authors=authors)

@app.route('/admin/author/add', methods=['POST'])
@login_required
def add_author():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        name = request.form.get('name', '').strip()
        bio = request.form.get('bio', '').strip()
        
        if not name:
            return jsonify({'success': False, 'error': 'Имя автора обязательно'}), 400
        
        # Проверяем, нет ли уже такого автора
        existing = Author.query.filter_by(name=name).first()
        if existing:
            return jsonify({'success': False, 'error': 'Автор с таким именем уже существует'}), 400
        
        author = Author(name=name, bio=bio)
        db.session.add(author)
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({
                'success': True, 
                'message': 'Автор добавлен',
                'author': {'id': author.id, 'name': author.name}
            })
        
        flash('Автор успешно добавлен', 'success')
        return redirect(url_for('admin_authors'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка: {str(e)}', 'error')
        return redirect(url_for('admin_authors'))

@app.route('/admin/author/edit/<int:author_id>', methods=['POST'])
@login_required
def edit_author(author_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        author = db.get_or_404(Author, author_id)
        author.name = request.form.get('name', '').strip()
        author.bio = request.form.get('bio', '').strip()
        
        db.session.commit()
        
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': True, 'message': 'Автор обновлен'})
        
        flash('Автор обновлен', 'success')
        return redirect(url_for('admin_authors'))
        
    except Exception as e:
        db.session.rollback()
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': str(e)})
        flash(f'Ошибка: {str(e)}', 'error')
        return redirect(url_for('admin_authors'))

@app.route('/admin/author/delete/<int:author_id>', methods=['POST'])
@login_required
def delete_author(author_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        author = db.get_or_404(Author, author_id)
        
        # Проверяем, есть ли у автора книги
        if len(author.books) > 0:
            return jsonify({
                'success': False, 
                'error': 'Нельзя удалить автора, у которого есть книги. Сначала удалите или переназначьте книги.'
            }), 400
        
        db.session.delete(author)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Автор удален'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/author/<int:author_id>/upload_photo', methods=['POST'])
@login_required
def upload_author_photo(author_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    author = db.get_or_404(Author, author_id)
    
    try:
        if 'photo' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        
        file = request.files['photo']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        
        # Проверяем расширение
        allowed_extensions = {'png', 'jpg', 'jpeg', 'webp'}
        if not ('.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return jsonify({'success': False, 'error': 'Недопустимый формат. Разрешены: JPG, PNG, WEBP'}), 400
        
        # Оптимизируем изображение
        optimized = optimize_image(file, max_size=1024*1024)  # 1MB для фото автора
        
        # Удаляем старую фотографию
        if author.photo_filename:
            old_path = os.path.join('static/uploads/authors', author.photo_filename)
            if os.path.exists(old_path):
                os.remove(old_path)
        
        # Сохраняем новую
        import uuid
        ext = 'jpg'
        filename = f"author_{author_id}_{uuid.uuid4().hex[:8]}.{ext}"
        
        upload_folder = os.path.join('static/uploads/authors')
        os.makedirs(upload_folder, exist_ok=True)
        
        filepath = os.path.join(upload_folder, filename)
        with open(filepath, 'wb') as f:
            f.write(optimized.read())
        
        author.photo_filename = filename
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Фото сохранено',
            'photo_url': url_for('static', filename=f'uploads/authors/{filename}')
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/author/<int:author_id>/delete_photo', methods=['POST'])
@login_required
def delete_author_photo(author_id):
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        author = db.get_or_404(Author, author_id)
        
        if author.photo_filename:
            # Удаляем файл
            filepath = os.path.join('static/uploads/authors', author.photo_filename)
            if os.path.exists(filepath):
                os.remove(filepath)
            
            author.photo_filename = None
            db.session.commit()
        
        return jsonify({'success': True, 'message': 'Фото удалено'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/author/quick_add', methods=['POST'])
@login_required
def quick_add_author():
    """Быстрое добавление автора при редактировании книги"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        name = request.form.get('name', '').strip()
        bio = request.form.get('bio', '').strip()
        
        if not name:
            return jsonify({'success': False, 'error': 'Имя обязательно'}), 400
        
        # Проверяем, нет ли уже такого
        existing = Author.query.filter_by(name=name).first()
        if existing:
            return jsonify({
                'success': True,
                'author': {'id': existing.id, 'name': existing.name},
                'message': 'Автор уже существует'
            })
        
        author = Author(name=name, bio=bio)
        db.session.add(author)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'author': {'id': author.id, 'name': author.name},
            'message': 'Автор добавлен'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/authors/batch', methods=['POST'])
@login_required
def get_authors_batch():
    """Получить информацию о нескольких авторах по их ID"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    try:
        data = request.get_json()
        author_ids = data.get('ids', [])
        
        authors = Author.query.options(selectinload(Author.books).selectinload(Book.authors)).filter(Author.id.in_(author_ids)).all()
        
        return jsonify({
            'success': True,
            'authors': [{'id': a.id, 'name': a.name} for a in authors]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/admin/api/users')
@login_required
def admin_api_users():
    """Список пользователей с поиском, фильтрацией и пагинацией"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    # Параметры
    search = request.args.get('q', '').strip()
    role_filter = request.args.get('role', '')
    status_filter = request.args.get('status', '')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    sort = request.args.get('sort', 'id')
    sort_dir = request.args.get('sort_dir', 'asc')
    
    # Базовый запрос
    query = User.query
    
    # Поиск по логину и email
    if search:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search}%'),
                User.email.ilike(f'%{search}%')
            )
        )
    
    # Фильтр по роли
    if role_filter and role_filter in ('user', 'librarian', 'admin'):
        query = query.filter(User.role == role_filter)
    
    # Фильтр по статусу
    if status_filter == 'active':
        query = query.filter(User.is_blocked == False)
    elif status_filter == 'blocked':
        query = query.filter(User.is_blocked == True)
    
    # Сортировка
    allowed_sorts = ['id', 'username', 'email', 'role', 'is_blocked', 'active_reservations']

    if sort == 'active_reservations':
        # Подзапрос для сортировки по активным броням
        from sqlalchemy import func
        active_count = db.session.query(
            BookReservation.user_id,
            func.count(BookReservation.id).label('cnt')
        ).filter(
            BookReservation.status.in_(['pending', 'ready', 'taken'])
        ).group_by(BookReservation.user_id).subquery()
        
        query = query.outerjoin(active_count, User.id == active_count.c.user_id)
        sort_column = func.coalesce(active_count.c.cnt, 0)
    elif sort in allowed_sorts:
        sort_column = getattr(User, sort)
    else:
        sort_column = User.id

    if sort_dir == 'desc':
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    
    # Пагинация
    total = query.count()
    users = query.offset((page - 1) * per_page).limit(per_page).all()
    
    users_data = []
    for user in users:
        users_data.append({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'is_blocked': user.is_blocked,
            'blocked_at': user.blocked_at.strftime('%d.%m.%Y %H:%M') if user.blocked_at else None,
            'blocked_by': user.blocked_by,
            'blocked_reason': user.blocked_reason,
            'active_reservations': BookReservation.query.filter(
                BookReservation.user_id == user.id,
                BookReservation.status.in_(['pending', 'ready', 'taken'])
            ).count()
        })
    
    return jsonify({
        'success': True,
        'users': users_data,
        'total': total,
        'pages': max(1, (total + per_page - 1) // per_page),
        'page': page
    })

@app.route('/admin/api/user/<int:user_id>', methods=['POST'])
@login_required
def admin_api_edit_user(user_id):
    """Редактирование пользователя (логин, email, роль, пароль)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400
    
    # Логин
    if 'username' in data and data['username'].strip():
        new_username = data['username'].strip()
        if new_username != user.username:
            existing = User.query.filter_by(username=new_username).first()
            if existing:
                return jsonify({'success': False, 'error': 'Логин уже занят'}), 400
            user.username = new_username
    
    # Email
    if 'email' in data and data['email'].strip():
        new_email = data['email'].strip()
        if new_email != user.email:
            # Валидация
            is_valid, email_message, normalized_email = validate_email_format(new_email)
            if not is_valid:
                return jsonify({'success': False, 'error': f'Некорректный email: {email_message}'}), 400
            
            existing = User.query.filter_by(email=normalized_email).first()
            if existing:
                return jsonify({'success': False, 'error': 'Email уже занят'}), 400
            
            user.email = normalized_email
    
    # Роль
    if 'role' in data and data['role'] in ('user', 'librarian', 'admin'):
        old_role = user.role
        new_role = data['role']
        user.role = new_role
        
        # Если роль сменилась с librarian — удаляем все связи
        if old_role == 'librarian' and new_role != 'librarian':
            LibrarianLibrary.query.filter_by(user_id=user_id).delete()
        
        # Если роль стала librarian — обновляем связи
        if new_role == 'librarian' and 'library_ids' in data:
            # Удаляем старые связи
            LibrarianLibrary.query.filter_by(user_id=user_id).delete()
            # Создаём новые
            for lib_id in data['library_ids']:
                ll = LibrarianLibrary(user_id=user_id, library_id=lib_id)
                db.session.add(ll)
    
    # Пароль (если передан — устанавливаем новый)
    if 'password' in data and data['password'].strip():
        password = data['password'].strip()
        is_valid, password_message, password_score = validate_password_strength(password)
        if not is_valid:
            return jsonify({'success': False, 'error': f'Слабый пароль: {password_message}'}), 400
        user.set_password(password)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'Пользователь обновлён'
    })

@app.route('/admin/api/users/block', methods=['POST'])
@login_required
def admin_api_block_users():
    """Массовая блокировка/разблокировка пользователей"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    if not data or 'user_ids' not in data:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400
    
    user_ids = data['user_ids']
    if not user_ids:
        return jsonify({'success': False, 'error': 'Список пользователей пуст'}), 400
    
    now = get_now()
    blocked_count = 0
    unblocked_count = 0
    
    for user_id in user_ids:
        user = db.session.get(User, user_id)
        if not user:
            continue
        
        if user.is_blocked:
            # Разблокировка
            user.is_blocked = False
            user.blocked_at = None
            user.blocked_by = None
            user.blocked_reason = None
            unblocked_count += 1
        else:
            # Блокировка
            user.is_blocked = True
            user.blocked_at = now
            user.blocked_by = 'admin'
            user.blocked_reason = 'manual'
            blocked_count += 1
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'blocked': blocked_count,
        'unblocked': unblocked_count,
        'message': f'Заблокировано: {blocked_count}, разблокировано: {unblocked_count}'
    })

@app.route('/admin/api/user/<int:user_id>/details')
@login_required
def admin_api_user_details(user_id):
    """Детали пользователя + активные брони"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404
    
    # Активные брони
    reservations = BookReservation.query.filter(
        BookReservation.user_id == user_id,
        BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
    ).order_by(BookReservation.reservation_date.desc()).all()
    
    reservations_data = []
    for res in reservations:
        days_left = None
        if res.taken_at:
            days_left = max(0, 30 - (get_now() - res.taken_at).days)
        
        reservations_data.append({
            'id': res.id,
            'reservation_number': res.reservation_number,
            'book_title': res.book.title,
            'book_author': res.book.author,
            'library_name': res.library.name,
            'status': res.status,
            'status_display': get_status_display(res.status),
            'reservation_date': res.reservation_date.strftime('%d.%m.%Y %H:%M'),
            'taken_at': res.taken_at.strftime('%d.%m.%Y %H:%M') if res.taken_at else None,
            'days_left': days_left,
            'can_cancel': res.status in ('pending', 'ready'),
            'can_return': res.status in ('taken', 'expired')
        })
    
    return jsonify({
        'success': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role,
            'is_blocked': user.is_blocked,
            'blocked_at': user.blocked_at.strftime('%d.%m.%Y %H:%M') if user.blocked_at else None,
            'blocked_by': user.blocked_by,
            'blocked_reason': user.blocked_reason,
            'active_reservations_count': user.get_active_reservations_count(),
            'library_ids': [ll.library_id for ll in user.librarian_libraries]
        },
        'reservations': reservations_data
    })

@app.route('/admin/api/user/add', methods=['POST'])
@login_required
def admin_api_add_user():
    """Создание нового пользователя администратором"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400
    
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', 'user')
    library_ids = data.get('library_ids', [])
    
    # Валидация логина
    if not username or len(username) < 3:
        return jsonify({'success': False, 'error': 'Логин должен содержать минимум 3 символа'}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': 'Логин уже занят'}), 400
    
    # Валидация email
    is_valid, email_message, normalized_email = validate_email_format(email)
    if not is_valid:
        return jsonify({'success': False, 'error': f'Некорректный email: {email_message}'}), 400
    
    if User.query.filter_by(email=normalized_email).first():
        return jsonify({'success': False, 'error': 'Email уже занят'}), 400
    
    # Валидация роли
    if role not in ('user', 'librarian', 'admin'):
        return jsonify({'success': False, 'error': 'Недопустимая роль'}), 400
    
    # Валидация пароля
    is_valid_pwd, pwd_message, _ = validate_password_strength(password)
    if not is_valid_pwd:
        return jsonify({'success': False, 'error': f'Слабый пароль: {pwd_message}'}), 400
    
    # Создаём пользователя
    user = User(username=username, email=normalized_email, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    
    # Привязка к библиотекам для библиотекаря
    if role == 'librarian' and library_ids:
        for lib_id in library_ids:
            library = db.session.get(Library, lib_id)
            if library:
                ll = LibrarianLibrary(user_id=user.id, library_id=lib_id)
                db.session.add(ll)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'Пользователь создан',
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role
        }
    })

@app.route('/admin/api/users/delete', methods=['POST'])
@login_required
def admin_api_delete_users():
    """Массовое удаление пользователей"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    if not data or 'user_ids' not in data:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400
    
    user_ids = data['user_ids']
    if not user_ids:
        return jsonify({'success': False, 'error': 'Список пользователей пуст'}), 400
    
    # Нельзя удалить самого себя
    if current_user.id in user_ids:
        return jsonify({'success': False, 'error': 'Нельзя удалить самого себя'}), 400
    
    blocked_users = []
    has_active_reservations = []
    
    for user_id in user_ids:
        user = db.session.get(User, user_id)
        if not user:
            continue
        
        # Проверяем активные брони (pending, ready, taken, expired)
        active = BookReservation.query.filter(
            BookReservation.user_id == user_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        if active > 0:
            has_active_reservations.append({
                'id': user.id,
                'username': user.username,
                'active_count': active
            })
            continue
        
        # Удаляем неактивные брони пользователя
        BookReservation.query.filter_by(user_id=user_id).delete()
        
        # Удаляем уведомления пользователя
        UserNotification.query.filter_by(user_id=user_id).delete()
        
        # Удаляем связи библиотекарь-библиотека
        LibrarianLibrary.query.filter_by(user_id=user_id).delete()
        
        db.session.delete(user)
    
    db.session.commit()
    
    if has_active_reservations:
        names = ', '.join([u['username'] for u in has_active_reservations])
        return jsonify({
            'success': False,
            'error': f'Нельзя удалить пользователей с активными бронями: {names}',
            'blocked_users': has_active_reservations
        }), 400
    
    return jsonify({
        'success': True,
        'message': f'Удалено пользователей: {len(user_ids)}'
    })

@app.route('/admin/api/stats')
@login_required
def admin_api_stats():
    """Статистика для админ-панели"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    # Книги по жанрам (круговая диаграмма)
    genres = db.session.query(
        Book.genre, func.count(Book.id).label('count')
    ).group_by(Book.genre).order_by(func.count(Book.id).desc()).all()
    
    genres_data = [{'genre': g[0], 'count': g[1]} for g in genres]
    
    # Бронирования по месяцам (столбчатая диаграмма) — за последние 12 месяцев
    now = get_now()
    months_data = []
    for i in range(11, -1, -1):
        month_start = now.replace(day=1) - timedelta(days=30 * i)
        month_start = month_start.replace(day=1)
        if i == 0:
            month_end = now
        else:
            if month_start.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1, day=1) - timedelta(days=1)
        
        count = BookReservation.query.filter(
            BookReservation.reservation_date >= month_start,
            BookReservation.reservation_date <= month_end
        ).count()
        
        months_data.append({
            'month': month_start.strftime('%Y-%m'),
            'label': month_start.strftime('%b %Y'),
            'count': count
        })
    
    # Топ-10 самых бронируемых книг
    top_books = db.session.query(
        Book.title, func.count(BookReservation.id).label('count')
    ).join(BookReservation).group_by(Book.id).order_by(
        func.count(BookReservation.id).desc()
    ).limit(10).all()
    
    top_books_data = [{'title': b[0][:50], 'count': b[1]} for b in top_books]
    
    # Топ-5 должников (по просрочкам и невозвратам)
    top_debtors = db.session.query(
        User.username,
        func.count(BookReservation.id).label('count')
    ).join(BookReservation).filter(
        BookReservation.status.in_(['expired'])
    ).group_by(User.id).order_by(
        func.count(BookReservation.id).desc()
    ).limit(5).all()
    
    top_debtors_data = [{'username': d[0], 'expired_count': d[1]} for d in top_debtors]
    
    # Также добавим должников с просроченными, которые ещё не возвращены (taken, но просрочены)
    overdue_taken = db.session.query(
        User.username,
        func.count(BookReservation.id).label('count')
    ).join(BookReservation).filter(
        BookReservation.status == 'taken',
        BookReservation.taken_at < (now - timedelta(days=30))
    ).group_by(User.id).order_by(
        func.count(BookReservation.id).desc()
    ).limit(5).all()
    
    for d in overdue_taken:
        # Проверяем, нет ли уже такого пользователя
        existing = next((x for x in top_debtors_data if x['username'] == d[0]), None)
        if existing:
            existing['expired_count'] += d[1]
        else:
            top_debtors_data.append({'username': d[0], 'expired_count': d[1]})
    
    # Сортируем по убыванию и берём топ-5
    top_debtors_data.sort(key=lambda x: x['expired_count'], reverse=True)
    top_debtors_data = top_debtors_data[:5]
    
    # Среднее время возврата (в днях)
    avg_return = db.session.query(
        func.avg(
            func.extract('epoch', BookReservation.returned_at) - 
            func.extract('epoch', BookReservation.taken_at)
        )
    ).filter(
        BookReservation.status == 'returned',
        BookReservation.taken_at != None,
        BookReservation.returned_at != None
    ).scalar()
    
    avg_return_days = round(avg_return / 86400, 1) if avg_return else 0  # перевод секунд в дни
    
    # Общая статистика
    total_books = Book.query.count()
    total_libraries = Library.query.count()
    total_users = User.query.count()
    total_reservations = BookReservation.query.count()
    active_reservations = BookReservation.query.filter(
        BookReservation.status.in_(['pending', 'ready', 'taken'])
    ).count()
    
    return jsonify({
        'success': True,
        'data': {
            'genres': genres_data,
            'months': months_data,
            'top_books': top_books_data,
            'top_debtors': top_debtors_data,
            'avg_return_days': avg_return_days,
            'total_stats': {
                'books': total_books,
                'libraries': total_libraries,
                'users': total_users,
                'total_reservations': total_reservations,
                'active_reservations': active_reservations
            }
        }
    })

@app.route('/admin/api/libraries/all')
@login_required
def admin_api_libraries_all():
    """Список всех библиотек (id, name, address)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    libraries = Library.query.order_by(Library.name).all()
    return jsonify({
        'success': True,
        'libraries': [{'id': lib.id, 'name': lib.name, 'address': lib.address} for lib in libraries]
    })

# ============================================
# ОТЗЫВЫ
# ============================================

@app.route('/api/review/add', methods=['POST'])
@login_required
def api_add_review():
    """Добавление или редактирование отзыва"""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Нет данных'}), 400
    
    book_id = data.get('book_id')
    rating = data.get('rating')
    text = data.get('text', '').strip()
    
    if not book_id or not rating:
        return jsonify({'success': False, 'error': 'Укажите книгу и оценку'}), 400
    
    if rating < 1 or rating > 5:
        return jsonify({'success': False, 'error': 'Оценка должна быть от 1 до 5'}), 400
    
    # Проверяем, что пользователь возвращал эту книгу
    returned = BookReservation.query.filter(
        BookReservation.user_id == current_user.id,
        BookReservation.book_id == book_id,
        BookReservation.status == 'returned'
    ).first()
    
    if not returned:
        return jsonify({'success': False, 'error': 'Вы не можете оставить отзыв на эту книгу'}), 403
    
    # Проверяем, есть ли уже отзыв
    existing = Review.query.filter_by(book_id=book_id, user_id=current_user.id).first()
    
    if existing:
        # Редактирование
        existing.rating = rating
        existing.text = text if text else None
        existing.status = 'edited'
        existing.rejection_reason = None
        existing.updated_at = get_now()
        message = 'Отзыв обновлён и отправлен на модерацию'
    else:
        # Новый отзыв
        review = Review(
            book_id=book_id,
            user_id=current_user.id,
            rating=rating,
            text=text if text else None,
            status='pending'
        )
        db.session.add(review)
        message = 'Отзыв отправлен на модерацию'
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': message})

@app.route('/api/book/<int:book_id>/reviews')
def api_get_reviews(book_id):
    """Получить отзывы на книгу с пагинацией, фильтрацией и сортировкой"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    sort = request.args.get('sort', 'newest')  # newest, oldest, useful, positive, negative
    rating_filter = request.args.get('rating', type=int)  # 1-5
    
    # Базовый запрос — только одобренные
    query = Review.query.filter(
        Review.book_id == book_id,
        Review.status == 'approved'
    )
    
    # Фильтр по оценке
    if rating_filter and 1 <= rating_filter <= 5:
        query = query.filter(Review.rating == rating_filter)
    
    # Сортировка
    if sort == 'oldest':
        query = query.order_by(Review.created_at.asc())
    elif sort == 'useful':
        query = query.outerjoin(ReviewVote).group_by(Review.id).order_by(
            db.func.count(db.case((ReviewVote.vote == 'up', 1))).desc()
        )
    elif sort == 'positive':
        query = query.order_by(Review.rating.desc())
    elif sort == 'negative':
        query = query.order_by(Review.rating.asc())
    else:  # newest
        query = query.order_by(Review.created_at.desc())
    
    total = query.count()
    reviews = query.offset((page - 1) * per_page).limit(per_page).all()
    
    # Статистика по оценкам
    stats = db.session.query(
        Review.rating, db.func.count(Review.id)
    ).filter(
        Review.book_id == book_id,
        Review.status == 'approved'
    ).group_by(Review.rating).all()
    
    rating_stats = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r, c in stats:
        rating_stats[r] = c
    
    total_reviews = sum(rating_stats.values())
    avg_rating = round(sum(r * c for r, c in rating_stats.items()) / total_reviews, 1) if total_reviews > 0 else 0
    
    reviews_data = []
    for review in reviews:
        upvotes = ReviewVote.query.filter_by(review_id=review.id, vote='up').count()
        downvotes = ReviewVote.query.filter_by(review_id=review.id, vote='down').count()
        
        # Проверяем, голосовал ли текущий пользователь
        user_vote = None
        if current_user.is_authenticated:
            vote_obj = ReviewVote.query.filter_by(
                review_id=review.id, user_id=current_user.id
            ).first()
            if vote_obj:
                user_vote = vote_obj.vote
        
        reviews_data.append({
            'id': review.id,
            'username': review.user.username,
            'rating': review.rating,
            'text': review.text,
            'created_at': review.created_at.strftime('%d.%m.%Y %H:%M'),
            'upvotes': upvotes,
            'downvotes': downvotes,
            'user_vote': user_vote
        })
    
    return jsonify({
        'success': True,
        'reviews': reviews_data,
        'total': total,
        'pages': max(1, (total + per_page - 1) // per_page),
        'page': page,
        'stats': rating_stats,
        'avg_rating': avg_rating,
        'total_reviews': total_reviews
    })

@app.route('/api/review/<int:review_id>/vote', methods=['POST'])
@login_required
def api_vote_review(review_id):
    """Лайк / дизлайк / отмена голоса"""
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'success': False, 'error': 'Отзыв не найден'}), 404
    
    data = request.get_json()
    vote = data.get('vote')  # 'up', 'down', None (отмена)
    
    existing = ReviewVote.query.filter_by(
        review_id=review_id, user_id=current_user.id
    ).first()
    
    if existing:
        if vote is None or vote == existing.vote:
            # Отмена голоса
            db.session.delete(existing)
        else:
            # Смена голоса
            existing.vote = vote
    else:
        if vote in ('up', 'down'):
            new_vote = ReviewVote(
                review_id=review_id,
                user_id=current_user.id,
                vote=vote
            )
            db.session.add(new_vote)
    
    db.session.commit()
    
    # Возвращаем обновлённые счётчики
    upvotes = ReviewVote.query.filter_by(review_id=review_id, vote='up').count()
    downvotes = ReviewVote.query.filter_by(review_id=review_id, vote='down').count()
    
    return jsonify({
        'success': True,
        'upvotes': upvotes,
        'downvotes': downvotes,
        'user_vote': vote
    })

@app.route('/admin/api/reviews')
@login_required
def admin_api_reviews():
    """Список отзывов для модерации"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    status_filter = request.args.get('status', 'pending')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = Review.query.options(
        db.joinedload(Review.book),
        db.joinedload(Review.user)
    )
    
    if status_filter in ('pending', 'approved', 'rejected', 'edited'):
        query = query.filter(Review.status == status_filter)
    
    query = query.order_by(Review.created_at.desc())
    
    total = query.count()
    reviews = query.offset((page - 1) * per_page).limit(per_page).all()
    
    reviews_data = []
    for review in reviews:
        reviews_data.append({
            'id': review.id,
            'book_title': review.book.title,
            'username': review.user.username,
            'rating': review.rating,
            'text': review.text,
            'status': review.status,
            'rejection_reason': review.rejection_reason,
            'created_at': review.created_at.strftime('%d.%m.%Y %H:%M')
        })
    
    return jsonify({
        'success': True,
        'reviews': reviews_data,
        'total': total,
        'pages': max(1, (total + per_page - 1) // per_page),
        'page': page
    })

@app.route('/admin/api/review/<int:review_id>', methods=['PUT'])
@login_required
def admin_api_review_action(review_id):
    """Одобрить или отклонить отзыв"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({'success': False, 'error': 'Отзыв не найден'}), 404
    
    data = request.get_json()
    action = data.get('action')  # 'approve' или 'reject'
    reason = data.get('reason', '').strip()
    
    if action == 'approve':
        review.status = 'approved'
        review.rejection_reason = None
        
        create_notification(
            user_id=review.user_id,
            type='review_approved',
            title='✅ Отзыв опубликован',
            message=f'Ваш отзыв на книгу "{review.book.title}" прошёл модерацию и опубликован.'
        )
    elif action == 'reject':
        if not reason:
            return jsonify({'success': False, 'error': 'Укажите причину отклонения'}), 400
        
        review.status = 'rejected'
        review.rejection_reason = reason
        
        create_notification(
            user_id=review.user_id,
            type='review_rejected',
            title='❌ Отзыв отклонён',
            message=f'Ваш отзыв на книгу "{review.book.title}" не прошёл модерацию. Причина: {reason}'
        )
    else:
        return jsonify({'success': False, 'error': 'Неверное действие'}), 400
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Статус обновлён'})

@app.route('/admin/reviews')
@login_required
def admin_reviews():
    if not current_user.is_admin():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    return render_template('admin/reviews.html')

@app.route('/api/reservation/<int:reservation_id>/book-id')
@login_required
def api_reservation_book_id(reservation_id):
    """Получить book_id по reservation_id"""
    reservation = db.get_or_404(BookReservation, reservation_id)
    if reservation.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    return jsonify({'success': True, 'book_id': reservation.book_id})

@app.route('/api/books/ratings')
def api_books_ratings():
    """Получить рейтинги для списка книг"""
    ids_param = request.args.get('ids', '')
    if not ids_param:
        return jsonify({'success': False, 'error': 'Нет ID'}), 400
    
    book_ids = [int(x) for x in ids_param.split(',') if x.strip().isdigit()]
    
    ratings = {}
    for book_id in book_ids:
        stats = db.session.query(
            Review.rating, func.count(Review.id)
        ).filter(
            Review.book_id == book_id,
            Review.status == 'approved'
        ).group_by(Review.rating).all()
        
        total = sum(c for _, c in stats)
        if total > 0:
            avg = round(sum(r * c for r, c in stats) / total, 1)
            ratings[book_id] = {'avg': avg, 'total': total}
        else:
            ratings[book_id] = {'avg': 0, 'total': 0}
    
    return jsonify({'success': True, 'ratings': ratings})

@app.route('/api/can-review/<int:book_id>')
@login_required
def api_can_review(book_id):
    """Проверить, может ли пользователь оставить отзыв"""
    returned = BookReservation.query.filter(
        BookReservation.user_id == current_user.id,
        BookReservation.book_id == book_id,
        BookReservation.status == 'returned'
    ).first()
    
    if not returned:
        return jsonify({'can_review': False})
    
    existing = Review.query.filter_by(book_id=book_id, user_id=current_user.id).first()
    
    return jsonify({
        'can_review': True,
        'existing_review': existing is not None,
        'review_id': existing.id if existing else None
    })

@app.route('/api/my-reviews')
@login_required
def api_my_reviews():
    """Отзывы текущего пользователя"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    query = Review.query.filter_by(user_id=current_user.id).order_by(Review.created_at.desc())
    
    total = query.count()
    reviews = query.offset((page - 1) * per_page).limit(per_page).all()
    
    reviews_data = []
    for review in reviews:
        reviews_data.append({
            'id': review.id,
            'book_id': review.book_id,
            'book_title': review.book.title,
            'book_cover': review.book.cover_filename,
            'rating': review.rating,
            'text': review.text,
            'status': review.status,
            'status_display': {
                'pending': '⏳ На модерации',
                'edited': '🔄 На модерации',
                'approved': '✅ Опубликован',
                'rejected': '❌ Отклонён'
            }.get(review.status, review.status),
            'rejection_reason': review.rejection_reason,
            'created_at': review.created_at.strftime('%d.%m.%Y'),
            'can_edit': review.status in ('rejected', 'approved')
        })
    
    return jsonify({
        'success': True,
        'reviews': reviews_data,
        'total': total,
        'pages': max(1, (total + per_page - 1) // per_page),
        'page': page
    })

# ============================================
# РОУТЫ БИБЛИОТЕКАРЯ (Librarian)
# ============================================

@app.route('/librarian')
@login_required
def librarian_dashboard():
    """Главная страница библиотекаря с активными бронями"""
    if not current_user.is_staff():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    
    libraries = current_user.get_managed_libraries()
    library_ids = [lib.id for lib in libraries]
    
    if not libraries:
        flash('Вы не назначены ни в одну библиотеку', 'warning')
        return redirect(url_for('index'))
    
    # Активные брони в библиотеках библиотекаря (pending, ready, taken, expired)
    active_reservations = BookReservation.query.filter(
        BookReservation.library_id.in_(library_ids),
        BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
    ).join(Book).join(User).order_by(BookReservation.reservation_date.desc()).all()
    
    now = get_now()

    all_authors = Author.query.options(selectinload(Author.books).selectinload(Book.authors)).order_by(Author.name).all()
    return render_template('librarian/dashboard.html',
                        libraries=libraries,
                        active_reservations=active_reservations,
                        now=now,
                        all_authors=all_authors)

@app.route('/librarian/api/reservations')
@login_required
def librarian_api_reservations():
    """API: список броней для DataTable/обновления в реальном времени"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    library_ids = [lib.id for lib in current_user.get_managed_libraries()]
    
    if not library_ids:
        return jsonify({'success': False, 'error': 'Нет назначенных библиотек'}), 400
    
    specific_library = request.args.get('library_id', type=int)
    if specific_library and specific_library in library_ids:
        library_ids = [specific_library]
    
    reservations = BookReservation.query.filter(
        BookReservation.library_id.in_(library_ids),
        BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
    ).join(Book).join(User).join(Library).all()
    
    now = get_now()
    data = []
    for res in reservations:
        if res.status == 'taken' and res.taken_at:
            days_left = max(0, 30 - (now - res.taken_at).days)
        else:
            days_left = None
        
        data.append({
            'id': res.id,
            'reservation_number': res.reservation_number,
            'book_title': res.book.title,
            'book_author': res.book.author,
            'user_name': res.user.username,
            'library_name': res.library.name,
            'reservation_date': res.reservation_date.strftime('%d.%m.%Y %H:%M'),
            'expiry_date': res.expiry_date.strftime('%d.%m.%Y'),
            'days_left': days_left
        })
    
    return jsonify({'success': True, 'data': data})

@app.route('/librarian/api/reservation/search/<search_query>')
@login_required
def librarian_search_reservation(search_query):
    """Поиск брони по последним 6 цифрам номера"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    library_ids = [lib.id for lib in current_user.get_managed_libraries()]
    
    query = search_query.strip()
    now = get_now()
    
    if query.isdigit() and len(query) <= 6:
        reservations = BookReservation.query.filter(
            BookReservation.library_id.in_(library_ids),
            BookReservation.reservation_number.like(f'%-{query}'),
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).join(Book).join(User).join(Library).all()
    else:
        reservations = BookReservation.query.filter(
            BookReservation.library_id.in_(library_ids),
            BookReservation.reservation_number.ilike(f'%{query}%'),
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).join(Book).join(User).join(Library).all()
    
    data = []
    for res in reservations:
        if res.status == 'taken' and res.taken_at:
            days_left = max(0, 30 - (now - res.taken_at).days)
        else:
            days_left = None
        
        data.append({
            'id': res.id,
            'reservation_number': res.reservation_number,
            'book_title': res.book.title,
            'book_author': res.book.author,
            'user_name': res.user.username,
            'library_name': res.library.name,
            'reservation_date': res.reservation_date.strftime('%d.%m.%Y %H:%M'),
            'expiry_date': res.expiry_date.strftime('%d.%m.%Y'),
            'days_left': days_left
        })
    
    return jsonify({'success': True, 'data': data, 'count': len(data)})

@app.route('/librarian/api/pending-reservations')
@login_required
def api_pending_reservations():
    """Получить все брони со статусом 'pending' в библиотеках библиотекаря"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    library_ids = [lib.id for lib in current_user.get_managed_libraries()]
    
    if not library_ids:
        return jsonify({'success': True, 'reservations': []})
    
    reservations = BookReservation.query.filter(
        BookReservation.library_id.in_(library_ids),
        BookReservation.status == 'pending'
    ).order_by(BookReservation.reservation_date.asc()).all()
    
    data = []
    for res in reservations:
        data.append({
            'id': res.id,
            'reservation_number': res.reservation_number,
            'book_title': res.book.title,
            'user_name': res.user.username,
            'library_name': res.library.name,
            'reservation_date': res.reservation_date.strftime('%d.%m.%Y %H:%M')
        })
    
    return jsonify({'success': True, 'reservations': data})

@app.route('/librarian/reservation/<int:reservation_id>/complete', methods=['POST'])
@login_required
def librarian_complete_reservation(reservation_id):
    """Выдать книгу (завершить бронирование) - меняет статус с ready на taken"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Бронь в другой библиотеке'}), 403
    
    if reservation.status != 'ready':
        return jsonify({'success': False, 'error': f'Нельзя выдать книгу в статусе {reservation.status}'}), 400
    
    reservation.status = 'taken'
    reservation.taken_at = get_now()
    db.session.commit()
    
    return jsonify({
        'success': True, 
        'message': f'Книга выдана по заказу {reservation.reservation_number}'
    })

@app.route('/librarian/reservation/<int:reservation_id>/cancel', methods=['POST'])
@login_required
def librarian_cancel_reservation(reservation_id):
    """Отменить бронирование от имени библиотекаря - только для статуса pending"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Бронь в другой библиотеке'}), 403
    
    if reservation.status != 'pending':
        return jsonify({'success': False, 'error': f'Нельзя отменить бронь в статусе {reservation.status}'}), 400
    
    reservation.status = 'cancelled'
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': f'Бронь {reservation.reservation_number} отменена'
    })

@app.route('/librarian/book/add', methods=['POST'])
@login_required
def librarian_add_book():
    """Добавление новой книги библиотекарем (только POST через модалку)"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    libraries = current_user.get_managed_libraries()
    
    if not libraries:
        return jsonify({'success': False, 'error': 'Вы не назначены ни в одну библиотеку'}), 400
    
    try:
        title = request.form.get('title')
        genre = request.form.get('genre')
        description = request.form.get('description')
        cover_filename = request.form.get('cover_filename')
        author_ids = request.form.getlist('author_ids')
        quantity = request.form.get('quantity', type=int, default=1)
        
        if not title or not genre:
            return jsonify({'success': False, 'error': 'Название и жанр обязательны'}), 400
        
        # Автоматически берём библиотеку библиотекаря
        library_id = libraries[0].id
        
        # Если библиотекарь явно указал библиотеку — используем её
        form_library_id = request.form.get('library_id', type=int)
        if form_library_id and current_user.can_manage_library(form_library_id):
            library_id = form_library_id
        
        author_name = 'Неизвестный автор'
        if author_ids:
            first_author = db.session.get(Author, int(author_ids[0]))
            if first_author:
                author_name = first_author.name
        
        book = Book(
            title=title,
            genre=genre,
            author=author_name,
            description=description,
            cover_filename=cover_filename
        )
        db.session.add(book)
        db.session.flush()
        
        if cover_filename and cover_filename.startswith('temp_'):
            old_filepath = os.path.join(UPLOAD_FOLDER, cover_filename)
            new_filename = f"{book.id}_{uuid.uuid4().hex[:8]}.jpg"
            new_filepath = os.path.join(UPLOAD_FOLDER, new_filename)
            
            if os.path.exists(old_filepath):
                os.rename(old_filepath, new_filepath)
                book.cover_filename = new_filename
        
        if author_ids:
            for author_id in author_ids:
                if author_id.strip():
                    author = db.session.get(Author, int(author_id))
                    if author:
                        book.authors.append(author)
        
        # Создаём связь с библиотекой ТОЛЬКО при не-AJAX запросе
        if library_id and request.headers.get('X-Requested-With') != 'XMLHttpRequest':
            book_library = BookLibrary(
                book_id=book.id,
                library_id=library_id,
                quantity=max(1, quantity or 1)
            )
            db.session.add(book_library)
        
        db.session.commit()
        
        return jsonify({
            'success': True, 
            'message': 'Книга добавлена',
            'book_id': book.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/librarian/library/<int:library_id>/stats')
@login_required
def librarian_library_stats(library_id):
    """Статистика и управление экземплярами конкретной библиотеки"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    if not current_user.can_manage_library(library_id):
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    library = db.get_or_404(Library, library_id)
    relations = BookLibrary.query.filter_by(library_id=library_id).all()
    
    books_data = []
    for rel in relations:
        book = db.session.get(Book, rel.book_id)
        if not book:
            continue
        
        active_reservations = BookReservation.query.filter(
            BookReservation.book_id == rel.book_id,
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
        ).count()
        
        books_data.append({
            'book_id': book.id,
            'title': book.title,
            'author': book.author,
            'total_quantity': rel.quantity,
            'available_quantity': max(0, rel.quantity - active_reservations),
            'reserved_quantity': active_reservations
        })
    
    return jsonify({
        'success': True,
        'library': {'id': library.id, 'name': library.name},
        'books': books_data,
        'stats': {
            'total_books': len(books_data),
            'total_copies': sum(b['total_quantity'] for b in books_data),
            'available_copies': sum(b['available_quantity'] for b in books_data)
        }
    })

@app.route('/librarian/catalog')
@login_required
def librarian_catalog():
    """Каталог книг в библиотеках библиотекаря"""
    if not current_user.is_staff():
        flash('Доступ запрещен', 'error')
        return redirect(url_for('index'))
    
    libraries = current_user.get_managed_libraries()
    library_ids = [lib.id for lib in libraries]
    
    book_libraries = BookLibrary.query.filter(
        BookLibrary.library_id.in_(library_ids)
    ).all()
    
    book_ids = list(set([bl.book_id for bl in book_libraries]))
    books = Book.query.options(selectinload(Book.authors), selectinload(Book.libraries)).filter(Book.id.in_(book_ids)).all()
    
    book_availability = {}
    for book in books:
        available_libs = []
        for lib in book.libraries:
            if lib.id in library_ids:
                bl = BookLibrary.query.filter_by(book_id=book.id, library_id=lib.id).first()
                active = BookReservation.query.filter(
                    BookReservation.book_id == book.id,
                    BookReservation.library_id == lib.id,
                    BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
                ).count()
                if bl and active < bl.quantity:
                    available_libs.append(lib)
        
        book_availability[book.id] = {
            'available_libraries': available_libs,
            'is_available': len(available_libs) > 0
        }
    
    return render_template('librarian/catalog.html',
                         books=books,
                         book_availability=book_availability,
                         libraries=libraries)

@app.route('/librarian/api/search-user', methods=['GET'])
@login_required
def librarian_api_search_user():
    """Поиск пользователя по последним 6 цифрам номера заказа"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    query = request.args.get('q', '').strip()
    
    if not query or len(query) < 4:
        return jsonify({'success': False, 'error': 'Введите минимум 4 цифры номера заказа'}), 400
    
    reservations = BookReservation.query.filter(
        BookReservation.reservation_number.like(f'%-{query}'),
        BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
    ).all()
    
    users_data = {}
    for res in reservations:
        user = res.user
        if user.id not in users_data:
            library_ids = [lib.id for lib in current_user.get_managed_libraries()]
            user_active_reservations = BookReservation.query.filter(
                BookReservation.user_id == user.id,
                BookReservation.library_id.in_(library_ids),
                BookReservation.status.in_(['pending', 'ready', 'taken'])
            ).count()
            
            users_data[user.id] = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_blocked': user.is_blocked,
                'active_reservations_count': user_active_reservations,
                'reservation_number': res.reservation_number  # номер для поиска
            }
    
    return jsonify({
        'success': True,
        'users': list(users_data.values()),
        'query': query
    })

@app.route('/librarian/api/user/<int:user_id>/reservations')
@login_required
def librarian_api_user_reservations(user_id):
    """Получить все брони пользователя в библиотеках библиотекаря"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    library_ids = [lib.id for lib in current_user.get_managed_libraries()]
    
    reservations = BookReservation.query.filter(
        BookReservation.user_id == user_id,
        BookReservation.library_id.in_(library_ids)
    ).order_by(BookReservation.reservation_date.desc()).all()
    
    data = []
    for res in reservations:
        data.append({
            'id': res.id,
            'reservation_number': res.reservation_number,
            'book_title': res.book.title,
            'book_author': res.book.author,
            'library_name': res.library.name,
            'status': res.status,
            'status_display': get_status_display(res.status),
            'reservation_date': res.reservation_date.strftime('%d.%m.%Y %H:%M'),
            'confirmed_at': res.confirmed_at.strftime('%d.%m.%Y %H:%M') if res.confirmed_at else None,
            'taken_at': res.taken_at.strftime('%d.%m.%Y %H:%M') if res.taken_at else None,
            'returned_at': res.returned_at.strftime('%d.%m.%Y %H:%M') if res.returned_at else None,
            'can_confirm': res.status == 'pending',
            'can_reject': res.status == 'pending',
            'can_take': res.status == 'ready',
            'can_return': res.status in ['taken', 'expired']
        })
    
    return jsonify({'success': True, 'reservations': data})

@app.route('/librarian/reservation/<int:reservation_id>/confirm', methods=['POST'])
@login_required
def librarian_confirm_reservation(reservation_id):
    """Подтвердить бронь: PENDING → READY"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    if reservation.status != 'pending':
        return jsonify({'success': False, 'error': f'Нельзя подтвердить бронь в статусе {reservation.status}'}), 400
    
    reservation.status = 'ready'
    reservation.confirmed_at = get_now()
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Бронь {reservation.reservation_number} подтверждена'})

@app.route('/librarian/reservation/<int:reservation_id>/reject', methods=['POST'])
@login_required
def librarian_reject_reservation(reservation_id):
    """Отклонить бронь: PENDING → REJECTED"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    if reservation.status != 'pending':
        return jsonify({'success': False, 'error': f'Нельзя отклонить бронь в статусе {reservation.status}'}), 400
    
    reservation.status = 'rejected'
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Бронь {reservation.reservation_number} отклонена'})

@app.route('/librarian/reservation/<int:reservation_id>/take', methods=['POST'])
@login_required
def librarian_take_reservation(reservation_id):
    """Выдать книгу: READY → TAKEN"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    if reservation.status != 'ready':
        return jsonify({'success': False, 'error': f'Нельзя выдать книгу в статусе {reservation.status}'}), 400
    
    reservation.status = 'taken'
    reservation.taken_at = get_now()
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Книга выдана по заказу {reservation.reservation_number}'})

@app.route('/librarian/reservation/<int:reservation_id>/return', methods=['POST'])
@login_required
def librarian_return_reservation(reservation_id):
    """Вернуть книгу: TAKEN/EXPIRED → RETURNED, снимаем блокировку"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if not current_user.can_manage_library(reservation.library_id):
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    if reservation.status not in ['taken', 'expired']:
        return jsonify({'success': False, 'error': f'Нельзя вернуть книгу в статусе {reservation.status}'}), 400
    
    was_expired = reservation.status == 'expired'
    reservation.status = 'returned'
    reservation.returned_at = get_now()
    
    user = reservation.user
    if user.is_blocked:
        user.is_blocked = False
        user.blocked_at = None
    
    db.session.commit()

    create_notification(
        user_id=reservation.user_id,
        type='review_invite',
        title='📖 Как вам книга?',
        message=f'Вы вернули книгу "{reservation.book.title}". Расскажите, поделитесь эмоциями, чтобы помочь другим читателям с выбором!',
        reservation_id=reservation_id
    )
    
    message = f'Книга возвращена по заказу {reservation.reservation_number}'
    if was_expired:
        message += '. Блокировка пользователя снята.'
    
    return jsonify({'success': True, 'message': message})

@app.route('/librarian/api/my-libraries')
@login_required
def librarian_api_my_libraries():
    """Получить список библиотек, назначенных библиотекарю"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    libraries = current_user.get_managed_libraries()
    
    return jsonify({
        'success': True,
        'libraries': [
            {'id': lib.id, 'name': lib.name, 'address': lib.address}
            for lib in libraries
        ]
    })

@app.route('/librarian/api/search-books')
@login_required
def librarian_api_search_books():
    """
    Поиск книг, которых ещё нет в библиотеке библиотекаря.
    Параметры:
        q - поисковый запрос (по названию)
        library_id - ID библиотеки (если не указан, ищет по всем библиотекам библиотекаря)
        include_id - ID книги, которую нужно включить в выдачу (новосозданная книга)
    """
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    query = request.args.get('q', '').strip()
    library_id = request.args.get('library_id', type=int)
    include_id = request.args.get('include_id', type=int)
    
    # Если библиотека не указана — берём все библиотеки библиотекаря
    managed_libraries = current_user.get_managed_libraries()
    managed_library_ids = [lib.id for lib in managed_libraries]
    
    if library_id and library_id not in managed_library_ids:
        return jsonify({'success': False, 'error': 'Нет доступа к этой библиотеке'}), 403
    
    # Находим книги, которых нет в выбранной библиотеке (или во всех)
    target_library_ids = [library_id] if library_id else managed_library_ids
    
    # ID книг, которые уже есть в целевых библиотеках
    existing_book_ids = set()
    for lid in target_library_ids:
        relations = BookLibrary.query.filter_by(library_id=lid).all()
        for rel in relations:
            existing_book_ids.add(rel.book_id)
    
    # Базовый запрос — все книги, которых нет в библиотеке
    books_query = Book.query.options(selectinload(Book.authors))
    
    if query:
        books_query = books_query.filter(Book.title.ilike(f'%{query}%'))
    
    # Исключаем книги, которые уже есть в библиотеке
    # Но включаем newly created book если указана
    if include_id:
        books_query = books_query.filter(
            db.or_(
                ~Book.id.in_(existing_book_ids),
                Book.id == include_id
            )
        )
    else:
        books_query = books_query.filter(~Book.id.in_(existing_book_ids))
    
    books = books_query.order_by(Book.title).limit(50).all()
    
    # Если есть include_id и книга уже была в existing_book_ids,
    # добавим её первой в выдачу
    result_books = []
    if include_id:
        new_book = db.session.get(Book, include_id)
        if new_book and new_book not in books:
            result_books.append(new_book)
    
    result_books.extend(books)
    
    return jsonify({
        'success': True,
        'books': [
            {
                'id': book.id,
                'title': book.title,
                'author': book.author,
                'genre': book.genre,
                'cover_filename': book.cover_filename
            }
            for book in result_books
        ]
    })

@app.route('/librarian/api/add-books', methods=['POST'])
@login_required
def librarian_api_add_books():
    """
    Массовое добавление книг в библиотеку библиотекаря.
    Тело запроса: { books: [{ book_id, library_id, quantity }, ...] }
    """
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    if not data or 'books' not in data:
        return jsonify({'success': False, 'error': 'Неверный формат данных'}), 400
    
    books_to_add = data['books']
    if not books_to_add:
        return jsonify({'success': False, 'error': 'Список книг пуст'}), 400
    
    managed_library_ids = [lib.id for lib in current_user.get_managed_libraries()]
    added_count = 0
    
    for item in books_to_add:
        book_id = item.get('book_id')
        library_id = item.get('library_id')
        quantity = max(1, min(100, item.get('quantity', 1)))
        
        if not book_id or not library_id:
            continue
        
        if library_id not in managed_library_ids:
            continue
        
        # Проверяем, существует ли книга
        book = db.session.get(Book, book_id)
        if not book:
            continue
        
        # Проверяем, есть ли уже связь
        existing = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library_id
        ).first()
        
        if existing:
            # Увеличиваем количество
            existing.quantity += quantity
        else:
            # Создаём новую связь
            book_library = BookLibrary(
                book_id=book_id,
                library_id=library_id,
                quantity=quantity
            )
            db.session.add(book_library)
        
        added_count += 1
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'added': added_count,
        'message': f'Добавлено книг: {added_count}'
    })

@app.route('/reserve/<int:book_id>', methods=['POST'])
@login_required
def reserve_book(book_id):
    library_id = request.form.get('library_id')
    
    if not library_id:
        flash('Пожалуйста, выберите библиотеку', 'error')
        return redirect(url_for('index'))
    
    try:
        if current_user.is_blocked_user():
            flash('Вы заблокированы за просрочку возврата книги. Обратитесь в библиотеку.', 'error')
            return redirect(url_for('index'))
        
        active_count = current_user.get_active_reservations_count()
        if active_count >= 3:
            flash(f'У вас уже есть {active_count} активных бронирований. Максимум - 3.', 'error')
            return redirect(url_for('index'))
        
        book_library = BookLibrary.query.filter_by(
            book_id=book_id,
            library_id=library_id
        ).first()
        
        if not book_library:
            flash('Книга не найдена в этой библиотеке', 'error')
            return redirect(url_for('index'))
        
        active_reservation_count = BookReservation.query.filter(
            BookReservation.book_id == book_id,
            BookReservation.library_id == library_id,
            BookReservation.status.in_(['pending', 'ready', 'taken'])
        ).count()
        
        if active_reservation_count >= book_library.quantity:
            flash('Нет доступных экземпляров в выбранной библиотеке', 'error')
            return redirect(url_for('index'))
        
        reservation_number = generate_reservation_number()
        
        now = get_now()
        reservation = BookReservation(
            book_id=book_id,
            library_id=int(library_id),
            user_id=current_user.id,
            reservation_number=reservation_number,
            status='pending',
            reservation_date=now,
            expiry_date=now + timedelta(days=30)
        )
        
        db.session.add(reservation)
        db.session.commit()
        
        flash(f'Заявка на бронирование создана! Номер заказа: {reservation_number}. Ожидайте подтверждения библиотекаря.', 'success')
        return redirect(url_for('profile'))
        
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка при бронировании: {str(e)}', 'error')
        return redirect(url_for('index'))

@app.route('/cancel_reservation/<int:reservation_id>', methods=['POST'])
@login_required
def cancel_reservation(reservation_id):
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    if reservation.user_id != current_user.id:
        return jsonify({'success': False, 'error': 'Это не ваша бронь'}), 403
    
    if reservation.status != 'pending':
        return jsonify({'success': False, 'error': 'Нельзя отменить подтверждённую или выданную бронь'}), 400
    
    reservation.status = 'cancelled'
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Бронь отменена'})

@app.route('/profile')
@login_required
def profile():
    now = get_now()
    
    taken_reservations = BookReservation.query.filter(
        BookReservation.user_id == current_user.id,
        BookReservation.status == 'taken',
        BookReservation.taken_at != None
    ).all()

    for res in taken_reservations:
        days_left = 30 - (now - res.taken_at).days
        
        if days_left in (1, 3):
            existing = UserNotification.query.filter_by(
                user_id=current_user.id,
                reservation_id=res.id,
                type='reminder'
            ).first()
            if not existing:
                if days_left == 1:
                    message = f'Завтра истекает срок возврата книги "{res.book.title}". Пожалуйста, верните книгу в библиотеку {res.library.name}.'
                else:
                    message = f'Через 3 дня истекает срок возврата книги "{res.book.title}". Пожалуйста, верните книгу в библиотеку {res.library.name}.'
                
                create_notification(
                    user_id=current_user.id,
                    type='reminder',
                    title='⏰ Напоминание о возврате',
                    message=message,
                    reservation_id=res.id
                )

    active = BookReservation.query.filter(
        BookReservation.user_id == current_user.id,
        BookReservation.status.in_(['pending', 'ready', 'taken', 'expired'])
    ).order_by(BookReservation.reservation_date.desc()).all()

    for res in active:
        if res.taken_at:
            res.taken_at_iso = res.taken_at.isoformat()

    history = BookReservation.query.filter(
        BookReservation.user_id == current_user.id,
        BookReservation.status.in_(['returned', 'rejected', 'cancelled', 'completed'])
    ).order_by(BookReservation.reservation_date.desc()).limit(50).all()

    return render_template(
        'profile.html',
        active=active,
        history=history
    )

@app.route('/profile/notifications')
@login_required
def profile_notifications():
    """Страница со всеми уведомлениями пользователя"""
    return render_template('profile_notifications.html')

@app.route('/get_reserve_modal/<int:book_id>')
@login_required
def get_reserve_modal(book_id):
    """Возвращает HTML модального окна для бронирования книги"""
    book = db.get_or_404(Book, book_id)
    
    available_libraries = get_available_libraries_for_book(book_id)
    
    book_availability = {
        book.id: {
            'available_libraries': available_libraries,
            'is_available': len(available_libraries) > 0
        }
    }

    return render_template('modals/_reserve_modal.html', 
                        book=book, 
                        book_availability=book_availability)

@app.route('/api/search')
def api_search():
    """API для поиска книг и авторов"""
    query = request.args.get('q', '').strip()
    filter_type = request.args.get('filter', 'all')
    context_author = request.args.get('author', '')
    context_genre = request.args.get('genre', '')
    context_library = request.args.get('library', '')
    
    if not query or len(query) < 2:
        return jsonify({
            'query': query,
            'authors': [],
            'books': [],
            'count': 0
        })
    
    results = {
        'query': query,
        'authors': [],
        'books': [],
        'count': 0
    }
    
    if filter_type in ('all', 'author'):
        authors_query = Author.query.filter(Author.name.ilike(f'%{query}%')).limit(5)
        
        for author in authors_query:
            results['authors'].append({
                'id': author.id,
                'name': author.name,
                'photo_filename': author.photo_filename,
                'books_count': len(author.books)
            })
    
    books_query = Book.query
    
    if context_author:
        books_query = books_query.join(Book.authors).filter(Author.name.ilike(f'%{context_author}%')).distinct()
    if context_genre:
        books_query = books_query.filter(Book.genre.ilike(f'%{context_genre}%'))
    
    if filter_type == 'title':
        books_query = books_query.filter(Book.title.ilike(f'%{query}%'))
    elif filter_type == 'author':
        books_query = books_query.join(Book.authors).filter(Author.name.ilike(f'%{query}%'))
        books_query = books_query.distinct()
    elif filter_type == 'genre':
        books_query = books_query.filter(Book.genre.ilike(f'%{query}%'))
    elif filter_type == 'library':
        books_query = books_query.join(Book.libraries).filter(Library.name.ilike(f'%{query}%'))
    else:
        books_query = books_query.outerjoin(Book.authors).filter(
            db.or_(
                Book.title.ilike(f'%{query}%'),
                Book.author.ilike(f'%{query}%'),
                Author.name.ilike(f'%{query}%'),
                Book.genre.ilike(f'%{query}%'),
                Book.description.ilike(f'%{query}%')
            )
        ).distinct()
    
    books = books_query.limit(20).all()
    
    for book in books:
        available_libraries = get_available_libraries_for_book(book.id)
        
        authors_list = []
        for author in book.authors:
            authors_list.append({
                'id': author.id,
                'name': author.name
            })
        
        if not authors_list and book.author:
            authors_list = [{'id': None, 'name': book.author}]
        
        results['books'].append({
            'id': book.id,
            'title': book.title,
            'authors': authors_list,
            'genre': book.genre,
            'cover_filename': book.cover_filename,
            'available': len(available_libraries) > 0,
            'available_libraries': [{'id': lib.id, 'name': lib.name} for lib in available_libraries[:2]],
            'total_libraries': len(available_libraries)
        })
    
    results['count'] = len(results['authors']) + len(results['books'])
    
    return jsonify(results)

@app.route('/api/book/<int:book_id>')
def api_book_details(book_id):
    """API для получения детальной информации о книге"""
    book = db.get_or_404(Book, book_id)
    
    # Получаем авторов с фото
    authors_data = []
    for author in book.authors:
        authors_data.append({
            'id': author.id,
            'name': author.name,
            'photo': author.photo_filename,
            'books_count': len(author.books)
        })
    
    # Если нет связанных авторов — используем текстовое поле
    if not authors_data and book.author:
        # Создаём "виртуального" автора из текстового поля
        authors_data = [{
            'id': None,
            'name': book.author,
            'photo': None,
            'books_count': 0
        }]
    
    # Получаем доступные библиотеки
    available_libraries = get_available_libraries_for_book(book_id)
    libraries_data = [{
        'id': lib.id,
        'name': lib.name,
        'address': lib.address
    } for lib in available_libraries]

    return jsonify({
        'id': book.id,
        'title': book.title,
        'genre': book.genre,
        'description': book.description,
        'description_html': str(render_safe_markdown(book.description)) if book.description else '',
        'cover': book.cover_filename,
        'authors': authors_data,
        'libraries': libraries_data
    })

@app.route('/api/check-auth')
def check_auth():
    """Проверка авторизации пользователя"""
    return jsonify({
        'authenticated': current_user.is_authenticated,
        'user': current_user.username if current_user.is_authenticated else None
    })

@app.route('/api/check-email', methods=['POST'])
def api_check_email():
    """
    API для проверки email (формат + MX-запись)
    Используется клиентской валидацией в реальном времени
    """
    data = request.get_json()
    email = data.get('email', '').strip()
    
    if not email:
        return jsonify({'valid': False, 'message': 'Введите email'})
    
    # Проверка формата и MX
    is_valid, message, normalized = validate_email_format(email)
    
    # Переводим сообщения на русский для клиента
    if not is_valid:
        if 'does not exist' in message or 'NoAnswer' in message:
            message = 'Домен не существует или не имеет почтового сервера'
        elif 'MX' in message:
            message = 'Домен не имеет почтового сервера'
        else:
            message = message  # оставляем как есть
    
    # Дополнительно проверяем уникальность
    is_unique = True
    if is_valid:
        existing_user = User.query.filter_by(email=normalized).first()
        if existing_user:
            is_valid = False
            message = 'Этот email уже зарегистрирован'
            is_unique = False
    
    return jsonify({
        'valid': is_valid,
        'message': message if not is_valid else 'OK',
        'normalized': normalized if is_valid else None,
        'is_unique': is_unique
    })

@app.route('/author/<int:author_id>')
def author_page(author_id):
    author = db.get_or_404(Author, author_id)
    books = author.books  # все книги автора
    
    # Проверяем доступность книг
    book_availability = {}
    for book in books:
        available_libraries = get_available_libraries_for_book(book.id)
        book_availability[book.id] = {
            'available_libraries': available_libraries,
            'is_available': len(available_libraries) > 0
        }
    
    return render_template('author.html', 
                         author=author, 
                         books=books,
                         book_availability=book_availability)

@app.route('/api/generate-password', methods=['POST'])
def api_generate_password():
    """Генерация надёжного пароля"""
    password = generate_strong_password(14)
    return jsonify({'password': password})

@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/static/uploads/'):
        response.headers['Cache-Control'] = 'public, max-age=3600'
    return response

with app.app_context():
    try:
        count = check_and_update_expired_reservations()
        if count > 0:
            print(f"✅ При запуске обработано просроченных броней: {count}")
    except Exception as e:
        print(f"⚠️ Ошибка при проверке просрочек: {e}")

# ============================================
# API ДЛЯ УВЕДОМЛЕНИЙ ПОЛЬЗОВАТЕЛЕЙ
# ============================================

@app.route('/api/user/notifications')
@login_required
def api_user_notifications():
    """Получить все уведомления пользователя (с пагинацией)"""
    page = request.args.get('page', 1, type=int)
    per_page = 20
    
    notifications = UserNotification.query.filter_by(
        user_id=current_user.id
    ).order_by(UserNotification.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return jsonify({
        'success': True,
        'notifications': [{
            'id': n.id,
            'type': n.type,
            'title': n.title,
            'message': n.message,
            'is_read': n.is_read,
            'created_at': n.created_at.strftime('%d.%m.%Y %H:%M'),
            'reservation_id': n.reservation_id
        } for n in notifications.items],
        'total': notifications.total,
        'page': page,
        'pages': notifications.pages
    })

@app.route('/api/user/notifications/mark-read', methods=['POST'])
@login_required
def api_mark_notifications_read():
    """Отметить уведомления как прочитанные"""
    data = request.get_json() or {}
    notification_ids = data.get('ids', [])
    
    if notification_ids:
        UserNotification.query.filter(
            UserNotification.id.in_(notification_ids),
            UserNotification.user_id == current_user.id
        ).update({'is_read': True}, synchronize_session=False)
    else:
        # Если ids пустой — отметить все как прочитанные
        UserNotification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).update({'is_read': True}, synchronize_session=False)
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/user/notifications/unread-count')
@login_required
def api_unread_notifications_count():
    """Получить количество непрочитанных уведомлений"""
    count = UserNotification.query.filter_by(
        user_id=current_user.id,
        is_read=False
    ).count()
    return jsonify({'success': True, 'count': count})

@app.route('/api/notify-user/<int:reservation_id>/confirmed', methods=['POST'])
@login_required
def notify_user_confirmed(reservation_id):
    """Отправляет уведомление пользователю о подтверждении брони"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    create_notification(
        user_id=reservation.user_id,
        type='confirmed',
        title='✅ Бронь подтверждена',
        message=f'Ваша бронь {reservation.reservation_number} подтверждена! Книгу "{reservation.book.title}" можно забрать в библиотеке {reservation.library.name}.',
        reservation_id=reservation_id
    )
    
    return jsonify({'success': True})

@app.route('/api/notify-user/<int:reservation_id>/taken', methods=['POST'])
@login_required
def notify_user_taken(reservation_id):
    """Отправляет уведомление пользователю о выдаче книги"""
    if not current_user.is_staff():
        return jsonify({'success': False, 'error': 'Доступ запрещен'}), 403
    
    reservation = db.get_or_404(BookReservation, reservation_id)
    
    return_date = (reservation.taken_at + timedelta(days=30)).strftime('%d.%m.%Y')
    
    create_notification(
        user_id=reservation.user_id,
        type='taken',
        title='📖 Книга выдана',
        message=f'Книга "{reservation.book.title}" выдана вам на руки. Приятного чтения! Не забудьте вернуть до {return_date}.',
        reservation_id=reservation_id
    )
    
    return jsonify({'success': True})

@app.route('/api/genres')
def api_get_genres():
    """Получить список всех уникальных жанров"""
    genres = db.session.query(Book.genre).distinct().order_by(Book.genre).all()
    # Фильтруем None и пустые строки
    result = [g[0] for g in genres if g[0] and g[0].strip()]
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=False)
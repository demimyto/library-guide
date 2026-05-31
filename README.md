<div align="center">

# 📚 Справочная библиотека

**Система управления библиотечным фондом с бронированием книг, отзывами и рейтингом**

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-2.0%2B-black?logo=flask)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-316192?logo=postgresql)](https://postgresql.org)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?logo=bootstrap)](https://getbootstrap.com)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4-FF6384?logo=chartdotjs)](https://www.chartjs.org)
[![EasyMDE](https://img.shields.io/badge/EasyMDE-2.18-1d3557?logo=markdown)](https://github.com/Ionaru/easy-markdown-editor)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[📖 Описание](#-описание) • [✨ Возможности](#-возможности) • [🚀 Установка](#-установка) • [📡 API](#-api) • [📁 Структура](#-структура-проекта)

</div>

---

## 📖 Описание

Веб-приложение для автоматизации работы библиотеки. Поддерживает три роли пользователей — **Читатель**, **Библиотекарь** и **Администратор** — с разграничением прав доступа.

### 🛠 Стек технологий

| Слой | Технологии |
|------|-----------|
| **Бэкенд** | Flask, SQLAlchemy, Flask-Login |
| **Фронтенд** | Bootstrap 5, Vanilla JS, Chart.js, EasyMDE |
| **База данных** | PostgreSQL |
| **Время** | UTC+3 (Europe/Moscow) |

---

## ✨ Возможности

### 👤 Читатель
- 🔍 Поиск книг по названию, автору, жанру и библиотеке
- 📖 Бронирование книг с выбором конкретной библиотеки
- 🏠 Личный кабинет с активными бронями, историей и уведомлениями
- ⭐ Отзывы и рейтинг после возврата (эмодзи: 🤮 ☹️ 😐 😊 🤩)
- 👍👎 Лайки и дизлайки на отзывы

### 📚 Библиотекарь
- 📋 Панель управления бронированиями (подтверждение, выдача, возврат)
- 🔎 Поиск пользователей по номеру заказа
- ➕ Добавление книг в фонд через модальный поиск
- 📝 Создание новых книг с обложкой, жанром и авторами

### ⚡ Администратор
- 🗄️ CRUD для книг, авторов, библиотек и пользователей
- 🔒 Массовые операции: блокировка, разблокировка, удаление
- 🛡️ Модерация отзывов
- 📊 Статистика с графиками (Chart.js): книги по жанрам, бронирования по месяцам, топ книг, топ должников
- 📤 Экспорт статистики в CSV

---

## 🚀 Установка

### Предварительные требования
- Python 3.10+
- PostgreSQL 14+

### Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone https://github.com/demimyto/library_guide.git
cd library_guide

# 2. Создать и активировать виртуальное окружение
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

# 3. Установить зависимости
pip install -r requirements.txt

# 4. Настроить переменные окружения
cp config.example.py config.py
# Отредактировать config.py: указать DATABASE_URL и SECRET_KEY

# 5. Инициализировать базу данных
flask db upgrade

# 6. Запустить приложение
python app.py
```

Приложение будет доступно по адресу: `http://localhost:5000`

---

## ⚙️ Переменные окружения

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `DATABASE_URL` | Строка подключения к PostgreSQL | `postgresql://user:pass@localhost/library` |
| `SECRET_KEY` | Секретный ключ для сессий | `your-secret-key-here` |
| `FLASK_ENV` | Режим работы | `development` / `production` |

---

## 📡 API

### Публичное API

| Метод | Эндпоинт | Описание |
|:-----:|----------|----------|
| `GET` | `/api/genres` | Список жанров |
| `GET` | `/api/books/ratings?ids=...` | Рейтинги книг (batch) |
| `GET` | `/api/book/<id>/reviews` | Отзывы с пагинацией |
| `POST` | `/api/review/add` | Добавить отзыв |
| `POST` | `/api/review/<id>/vote` | Голос за/против отзыва |

### Админ API

| Метод | Эндпоинт | Описание |
|:-----:|----------|----------|
| `GET` | `/admin/api/users` | Список пользователей |
| `POST` | `/admin/api/users/block` | Блокировка / разблокировка |
| `POST` | `/admin/api/users/delete` | Удаление пользователя |
| `GET` | `/admin/api/reviews` | Модерация отзывов |
| `GET` | `/admin/api/stats` | Статистика для графиков |

### API библиотекаря

| Метод | Эндпоинт | Описание |
|:-----:|----------|----------|
| `GET` | `/librarian/api/pending-reservations` | Ожидающие брони |
| `POST` | `/librarian/api/add-books` | Добавление книг в фонд |

> **Примечание:** Все AJAX-запросы должны содержать заголовок `X-Requested-With: XMLHttpRequest`.

---

## 📁 Структура проекта

```
library_guide/
├── app.py                        # Точка входа
├── config.py                     # Конфигурация
├── models.py                     # Модели SQLAlchemy
├── utils/
│   └── time_utils.py             # get_now() — UTC+3
├── static/
│   ├── css/
│   │   └── style.css             # Единый файл стилей
│   ├── js/
│   │   ├── core/                 # Общие модули
│   │   │   ├── utils.js          # Уведомления, escapeHtml
│   │   │   ├── search.js         # Поиск книг
│   │   │   ├── genre_combobox.js # Комбобокс жанров
│   │   │   ├── book_ratings.js   # Рейтинг на карточках
│   │   │   ├── book_modal.js     # Модалка книги
│   │   │   ├── review_modal.js   # Модалка отзывов
│   │   │   ├── lazy_load.js      # Ленивая загрузка обложек
│   │   │   ├── author.js         # Страница автора
│   │   │   └── edit_author.js    # Редактор (EasyMDE)
│   │   ├── admin/                # Админ-панель
│   │   │   ├── admin.js          # Управление фондом
│   │   │   ├── users.js          # Пользователи
│   │   │   ├── reviews.js        # Модерация
│   │   │   ├── authors.js        # Авторы
│   │   │   └── stats.js          # Статистика (Chart.js)
│   │   ├── librarian/            # Библиотекарь
│   │   │   ├── search.js         # Поиск по заказу
│   │   │   ├── add_books.js      # Добавление книг
│   │   │   └── catalog.js        # Каталог
│   │   └── user/                 # Пользователь
│   │       ├── register.js       # Регистрация
│   │       └── profile_notifications.js
│   └── uploads/
│       ├── authors/              # Фото авторов
│       └── covers/               # Обложки книг
├── templates/
│   ├── base.html                 # Базовый шаблон
│   ├── index.html                # Каталог
│   ├── author.html               # Автор
│   ├── profile.html              # ЛК
│   ├── login.html / register.html
│   ├── admin/                    # Шаблоны админки
│   ├── librarian/                # Шаблоны библиотекаря
│   └── modals/                   # 14 модальных окон
└── requirements.txt
```

---

## 🧩 Правила разработки

- 🎨 **Стили:** всё в `static/css/style.css`. Новые CSS-файлы не создавать.
- 🪟 **Модалки:** `{% include 'modals/_name.html' %}`, вне контейнеров с `position: relative`.
- 🕐 **Время:** `from utils.time_utils import now as get_now` (UTC+3, offset-naive).
- 📡 **AJAX:** обязательный заголовок `X-Requested-With: XMLHttpRequest`.
- 🔔 **Уведомления:** единая функция `showNotification()` из `js/core/utils.js`.
- ⭐ **Рейтинг:** эмодзи через `BookRatings.renderStars()`.
- 📅 **Срок выдачи:** 30 дней, напоминания за 3 и 1 день.
- 🎨 **CSS-переменные:** `--slate-*`, `--accent-*`, `--success`, `--danger`, `--warning`.

---

## 🤝 Участие в проекте

1. Форкните репозиторий
2. Создайте ветку: `git checkout -b feature/amazing-feature`
3. Закоммитьте изменения: `git commit -m 'Add amazing feature'`
4. Запушьте: `git push origin feature/amazing-feature`
5. Откройте Pull Request

---

## 📄 Лицензия

Распространяется под лицензией MIT. См. файл [LICENSE](LICENSE).

---

<div align="center">

**[⬆️ Наверх](#-справочная-библиотека)**

Made with ❤️ and ☕

</div>

from datetime import datetime
from zoneinfo import ZoneInfo

APP_TIMEZONE = ZoneInfo("Europe/Moscow")  # UTC+3

def now():
    """Текущее время приложения (UTC+3)"""
    return datetime.now(APP_TIMEZONE).replace(tzinfo=None)
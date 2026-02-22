from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUser(AbstractUser):
    """Полностью переопределенная модель пользователя"""

    # Дополнительные поля
    patronymic = models.CharField('Отчество', max_length=150, blank=True)
    phone = models.CharField('Телефон', max_length=20, blank=True)
    telegram_id = models.CharField('Telegram ID', max_length=100, blank=True,
                                   help_text='@username или номер телефона')

    # Информация о должности
    department = models.CharField('Отдел', max_length=100, blank=True)
    position = models.CharField('Должность', max_length=100, blank=True)

    # Настройки уведомлений
    notification_days = models.PositiveIntegerField('Упреждение (дней)', default=7,
                                                    help_text='За сколько дней напоминать об истечении')
    notify_by_email = models.BooleanField('Уведомлять по email', default=True)
    notify_by_telegram = models.BooleanField('Уведомлять в Telegram', default=False)

    # Информация об организации
    organization_name = models.CharField('Название организации', max_length=200, blank=True)
    organization_inn = models.CharField('ИНН', max_length=12, blank=True)
    organization_address = models.TextField('Адрес организации', blank=True)

    # Настройки интерфейса
    items_per_page = models.PositiveIntegerField('Элементов на странице', default=25)
    default_view = models.CharField('Вид по умолчанию', max_length=20, default='tree',
                                    choices=[('tree', 'Дерево'), ('list', 'Список')])

    class Meta:
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'

    def __str__(self):
        return self.get_full_name() or self.username

    def get_full_name(self):
        """Полное имя с отчеством"""
        if self.first_name and self.last_name and self.patronymic:
            return f"{self.last_name} {self.first_name} {self.patronymic}"
        elif self.first_name and self.last_name:
            return f"{self.last_name} {self.first_name}"
        return self.username

    def should_notify(self, expiry_date):
        """Проверить, нужно ли уведомлять о дате"""
        if not expiry_date:
            return False
        days_left = (expiry_date - timezone.now()).days
        return 0 <= days_left <= self.notification_days
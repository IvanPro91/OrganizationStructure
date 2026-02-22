# core/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone


class ObjectType(models.Model):
    """Типы объектов (Офис, Компьютер, Лицензия и т.д.)"""
    FIELD_TYPES = [
        ('text', 'Текст'),
        ('number', 'Число'),
        ('datetime', 'Дата/время'),
        ('checkbox', 'Чекбокс'),
        ('textarea', 'Многострочный текст'),
    ]

    name = models.CharField('Название типа', max_length=50)
    icon = models.CharField('Иконка', max_length=50, default='bi-folder')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Тип объекта'
        verbose_name_plural = 'Типы объектов'

    def __str__(self):
        return self.name


class ObjectField(models.Model):
    """Динамические поля для типов объектов"""
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, related_name='fields')
    name = models.CharField('Название поля', max_length=50)
    field_type = models.CharField('Тип поля', max_length=20, choices=ObjectType.FIELD_TYPES)
    required = models.BooleanField('Обязательное', default=False)
    order = models.PositiveIntegerField('Порядок', default=0)

    class Meta:
        verbose_name = 'Поле объекта'
        verbose_name_plural = 'Поля объектов'
        ordering = ['order']

    def __str__(self):
        return f"{self.object_type.name}.{self.name}"


class OrganizationObject(models.Model):
    """Базовый объект организации"""
    STATUS_CHOICES = [
        ('working', 'Работает'),
        ('repair', 'В ремонте'),
        ('written_off', 'Списан'),
        ('reserved', 'В резерве'),
    ]

    object_type = models.ForeignKey(ObjectType, on_delete=models.PROTECT, verbose_name='Тип объекта')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField('Название', max_length=200)
    status = models.CharField('Статус', max_length=20, choices=STATUS_CHOICES, default='working')
    created_at = models.DateTimeField('Создан', auto_now_add=True)
    updated_at = models.DateTimeField('Обновлен', auto_now=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name='Ответственный',
        related_name='owned_objects'
    )

    class Meta:
        verbose_name = 'Объект организации'
        verbose_name_plural = 'Объекты организации'

    def __str__(self):
        return f"{self.name} ({self.object_type.name})"

    def get_field_value(self, field_name):
        try:
            return self.field_values.get(field__name=field_name).value
        except ObjectFieldValue.DoesNotExist:
            return None


class ObjectFieldValue(models.Model):
    """Значения динамических полей для объектов"""
    object = models.ForeignKey(OrganizationObject, on_delete=models.CASCADE, related_name='field_values')
    field = models.ForeignKey(ObjectField, on_delete=models.CASCADE)
    value_text = models.TextField('Текст', blank=True)
    value_number = models.FloatField('Число', null=True, blank=True)
    value_datetime = models.DateTimeField('Дата/время', null=True, blank=True)
    value_boolean = models.BooleanField('Да/Нет', default=False)

    class Meta:
        verbose_name = 'Значение поля'
        verbose_name_plural = 'Значения полей'
        unique_together = ['object', 'field']
        indexes = [
            models.Index(fields=['object', 'field']),
        ]

    def __str__(self):
        return f"{self.object.name} - {self.field.name}: {self.get_value()}"

    def get_value(self):
        """Получить значение в зависимости от типа поля"""
        if self.field.field_type == 'number':
            return self.value_number
        elif self.field.field_type == 'datetime':
            return self.value_datetime
        elif self.field.field_type == 'checkbox':
            return self.value_boolean
        else:
            return self.value_text

    def set_value(self, val):
        """Установить значение в зависимости от типа поля"""
        if self.field.field_type == 'number':
            self.value_number = float(val) if val not in (None, '') else None
        elif self.field.field_type == 'datetime':
            self.value_datetime = val
        elif self.field.field_type == 'checkbox':
            self.value_boolean = bool(val) if val not in (None, '') else False
        else:
            self.value_text = str(val) if val is not None else ''


class StatusHistory(models.Model):
    """История изменения статусов"""
    object = models.ForeignKey(OrganizationObject, on_delete=models.CASCADE, related_name='status_history')
    status = models.CharField('Статус', max_length=20, choices=OrganizationObject.STATUS_CHOICES)
    changed_at = models.DateTimeField('Дата изменения', default=timezone.now)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    comment = models.TextField('Комментарий', blank=True)

    class Meta:
        verbose_name = 'История статуса'
        verbose_name_plural = 'Истории статусов'
        ordering = ['-changed_at']


class LicenseAttachment(models.Model):
    """Прикрепленные файлы к лицензиям"""
    license_object = models.ForeignKey(
        OrganizationObject,
        on_delete=models.CASCADE,
        related_name='attachments',
        limit_choices_to={'object_type__name': 'Лицензия ПО'}
    )
    file = models.FileField('Файл', upload_to='licenses/%Y/%m/')
    name = models.CharField('Название', max_length=255)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class ObjectLicense(models.Model):
    """Связь между объектами и лицензиями"""
    object = models.ForeignKey(OrganizationObject, on_delete=models.CASCADE, related_name='linked_licenses')
    license = models.ForeignKey(
        OrganizationObject,
        on_delete=models.CASCADE,
        related_name='used_by',
        limit_choices_to={'object_type__name': 'Лицензия ПО'}
    )
    installed_at = models.DateTimeField('Установлена', default=timezone.now)
    installed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField('Активна', default=True)

    class Meta:
        verbose_name = 'Лицензия объекта'
        verbose_name_plural = 'Лицензии объектов'
        unique_together = ['object', 'license']
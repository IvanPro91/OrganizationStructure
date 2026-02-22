from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    """Админка для кастомного пользователя"""

    list_display = ('username', 'email', 'get_full_name', 'department', 'position', 'is_staff')
    list_filter = ('is_staff', 'is_superuser', 'is_active', 'department')
    search_fields = ('username', 'first_name', 'last_name', 'patronymic', 'email', 'phone')

    fieldsets = UserAdmin.fieldsets + (
        ('Дополнительная информация', {
            'fields': ('patronymic', 'phone', 'telegram_id', 'department', 'position')
        }),
        ('Настройки уведомлений', {
            'fields': ('notification_days', 'notify_by_email', 'notify_by_telegram')
        }),
        ('Информация об организации', {
            'fields': ('organization_name', 'organization_inn', 'organization_address')
        }),
        ('Настройки интерфейса', {
            'fields': ('items_per_page', 'default_view')
        }),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Дополнительная информация', {
            'fields': ('first_name', 'last_name', 'patronymic', 'email', 'phone', 'telegram_id',
                       'department', 'position')
        }),
    )
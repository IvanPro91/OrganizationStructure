# core/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    ObjectType, ObjectField, OrganizationObject,
    ObjectFieldValue, StatusHistory, LicenseAttachment,
    ObjectLicense
)


@admin.register(ObjectType)
class ObjectTypeAdmin(admin.ModelAdmin):
    """Админка для типов объектов"""
    list_display = ('name', 'icon', 'fields_count', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name',)
    ordering = ('name',)

    def fields_count(self, obj):
        return obj.fields.count()

    fields_count.short_description = 'Кол-во полей'
    fields_count.admin_order_field = 'fields'


@admin.register(ObjectField)
class ObjectFieldAdmin(admin.ModelAdmin):
    """Админка для полей объектов"""
    list_display = ('name', 'object_type', 'field_type', 'required', 'order')
    list_filter = ('object_type', 'field_type', 'required')
    search_fields = ('name', 'object_type__name')
    ordering = ('object_type', 'order')
    list_editable = ('order', 'required')


class ObjectFieldValueInline(admin.TabularInline):
    """Инлайн для значений полей"""
    model = ObjectFieldValue
    extra = 0
    readonly_fields = ('field',)
    fields = ('field', 'value_text', 'value_number', 'value_datetime', 'value_boolean')

    def has_add_permission(self, request, obj=None):
        return False


class StatusHistoryInline(admin.TabularInline):
    """Инлайн для истории статусов"""
    model = StatusHistory
    extra = 0
    readonly_fields = ('changed_at', 'changed_by')
    fields = ('status', 'comment', 'changed_at', 'changed_by')
    ordering = ('-changed_at',)


class ObjectLicenseInline(admin.TabularInline):
    """Инлайн для лицензий объекта"""
    model = ObjectLicense
    fk_name = 'object'
    extra = 0
    autocomplete_fields = ('license',)
    fields = ('license', 'installed_at', 'installed_by', 'is_active')


@admin.register(OrganizationObject)
class OrganizationObjectAdmin(admin.ModelAdmin):
    """Админка для объектов организации"""
    list_display = ('name', 'object_type', 'parent_link', 'status', 'owner','created_at')
    list_filter = ('object_type', 'status', 'created_at')
    search_fields = ('name', 'owner__username', 'owner__email')
    autocomplete_fields = ('parent', 'owner')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'object_type', 'parent', 'status')
        }),
        ('Ответственный', {
            'fields': ('owner',),
            'classes': ('wide',)
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    inlines = [ObjectFieldValueInline, StatusHistoryInline, ObjectLicenseInline]

    def parent_link(self, obj):
        if obj.parent:
            return format_html(
                '<a href="{}">{}</a>',
                f'/admin/core/organizationobject/{obj.parent.id}/change/',
                obj.parent.name
            )
        return '-'

    parent_link.short_description = 'Родитель'


@admin.register(ObjectFieldValue)
class ObjectFieldValueAdmin(admin.ModelAdmin):
    """Админка для значений полей"""
    list_display = ('object_link', 'field', 'get_value_preview', 'updated_at')
    list_filter = ('field__object_type', 'field')
    search_fields = ('object__name', 'value_text')
    readonly_fields = ('object', 'field', 'get_value_preview')
    fieldsets = (
        ('Основное', {
            'fields': ('object', 'field')
        }),
        ('Значение', {
            'fields': ('value_text', 'value_number', 'value_datetime', 'value_boolean')
        }),
    )

    def object_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            f'/admin/core/organizationobject/{obj.object.id}/change/',
            obj.object.name
        )

    object_link.short_description = 'Объект'

    def get_value_preview(self, obj):
        value = obj.get_value()
        if value is None:
            return '-'
        if len(str(value)) > 50:
            return str(value)[:50] + '...'
        return str(value)

    get_value_preview.short_description = 'Значение'

    def updated_at(self, obj):
        return obj.object.updated_at

    updated_at.short_description = 'Обновлено'

    def has_add_permission(self, request):
        return False


@admin.register(StatusHistory)
class StatusHistoryAdmin(admin.ModelAdmin):
    """Админка для истории статусов"""
    list_display = ('object_link', 'status', 'changed_at', 'changed_by', 'comment_preview')
    list_filter = ('status', 'changed_at')
    search_fields = ('object__name', 'comment')
    readonly_fields = ('object', 'changed_at', 'changed_by')
    ordering = ('-changed_at',)

    def object_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            f'/admin/core/organizationobject/{obj.object.id}/change/',
            obj.object.name
        )

    object_link.short_description = 'Объект'

    def comment_preview(self, obj):
        if obj.comment and len(obj.comment) > 50:
            return obj.comment[:50] + '...'
        return obj.comment

    comment_preview.short_description = 'Комментарий'

    def has_add_permission(self, request):
        return False


@admin.register(LicenseAttachment)
class LicenseAttachmentAdmin(admin.ModelAdmin):
    """Админка для файлов лицензий"""
    list_display = ('name', 'license_object_link', 'uploaded_by', 'uploaded_at', 'file_size')
    list_filter = ('uploaded_at', 'uploaded_by')
    search_fields = ('name', 'license_object__name')
    readonly_fields = ('uploaded_at', 'file_preview')

    def license_object_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            f'/admin/core/organizationobject/{obj.license_object.id}/change/',
            obj.license_object.name
        )

    license_object_link.short_description = 'Лицензия'

    def file_size(self, obj):
        if obj.file:
            size = obj.file.size
            if size < 1024:
                return f"{size} B"
            elif size < 1024 * 1024:
                return f"{size / 1024:.1f} KB"
            else:
                return f"{size / (1024 * 1024):.1f} MB"
        return '-'

    file_size.short_description = 'Размер'

    def file_preview(self, obj):
        if obj.file:
            return format_html(
                '<a href="{}" target="_blank">Просмотреть файл</a>',
                obj.file.url
            )
        return '-'

    file_preview.short_description = 'Просмотр'


@admin.register(ObjectLicense)
class ObjectLicenseAdmin(admin.ModelAdmin):
    """Админка для связей объектов с лицензиями"""
    list_display = ('object_link', 'license_link', 'installed_at', 'installed_by', 'is_active')
    list_filter = ('is_active', 'installed_at')
    search_fields = ('object__name', 'license__name')
    autocomplete_fields = ('object', 'license', 'installed_by')

    def object_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            f'/admin/core/organizationobject/{obj.object.id}/change/',
            obj.object.name
        )

    object_link.short_description = 'Объект'

    def license_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            f'/admin/core/organizationobject/{obj.license.id}/change/',
            obj.license.name
        )

    license_link.short_description = 'Лицензия'
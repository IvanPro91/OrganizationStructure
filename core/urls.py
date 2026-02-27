from django.urls import path
from . import views
from .views_api import (
    CreateObjectAPIView, ObjectDetailAPIView,
    DeleteObjectAPIView, UpdateObjectAPIView,
    CheckExpiringAPIView, ObjectTypesAPIView,
    TreeAPIView, MoveObjectAPIView,
    ObjectLicensesAPIView, ObjectHistoryAPIView,
    ObjectAttachmentsAPIView,
    ExportDataAPIView, TreeNodeStateAPIView,
    UploadObjectAttachmentAPIView, DownloadObjectAttachmentAPIView,
    DeleteObjectAttachmentAPIView, LicenseAttachmentsAPIView,
    UploadLicenseAttachmentAPIView,
    DeleteLicenseAttachmentAPIView, DownloadLicenseAttachmentAPIView
)

app_name = 'core'

urlpatterns = [
    # HTML страницы
    path('', views.DashboardView.as_view(), name='dashboard'),
    path('table/', views.TableView.as_view(), name='table'),
    path('export/excel/', views.ExportExcelView.as_view(), name='export-excel'),

    # API для дерева объектов
    path('api/object-types/', ObjectTypesAPIView.as_view(), name='api-object-types'),
    path('api/tree/', TreeAPIView.as_view(), name='api-tree'),
    path('api/object/create/', CreateObjectAPIView.as_view(), name='api-object-create'),
    path('api/object/<int:pk>/', ObjectDetailAPIView.as_view(), name='api-object-detail'),
    path('api/object/<int:pk>/delete/', DeleteObjectAPIView.as_view(), name='api-object-delete'),
    path('api/object/<int:pk>/update/', UpdateObjectAPIView.as_view(), name='api-object-update'),
    path('api/object/<int:pk>/move/', MoveObjectAPIView.as_view(), name='api-object-move'),

    # Дополнительные данные объекта
    path('api/object/<int:pk>/licenses/', ObjectLicensesAPIView.as_view(), name='api-object-licenses'),
    path('api/object/<int:pk>/history/', ObjectHistoryAPIView.as_view(), name='api-object-history'),
    path('api/object/<int:pk>/toggle-expand/', TreeNodeStateAPIView.as_view(), name='toggle-expand'),

    # Общие файлы (для любых объектов)
    path('api/object/<int:pk>/attachments/', ObjectAttachmentsAPIView.as_view(), name='object-attachments'),
    path('api/object/<int:pk>/upload/', UploadObjectAttachmentAPIView.as_view(), name='upload-attachment'),
    path('api/attachment/<int:pk>/download/', DownloadObjectAttachmentAPIView.as_view(), name='download-attachment'),
    path('api/attachment/<int:pk>/delete/', DeleteObjectAttachmentAPIView.as_view(), name='delete-attachment'),

    # Файлы лицензий (только для типа "Лицензия ПО")
    path('api/object/<int:pk>/license-attachments/', LicenseAttachmentsAPIView.as_view(), name='license-attachments'),
    path('api/object/<int:pk>/upload-license/', UploadLicenseAttachmentAPIView.as_view(), name='upload-license'),
    path('api/license-attachment/<int:pk>/download/', DownloadLicenseAttachmentAPIView.as_view(), name='download-license'),
    path('api/license-attachment/<int:pk>/delete/', DeleteLicenseAttachmentAPIView.as_view(), name='delete-license'),

    # Инструменты
    path('api/check-expiring/', CheckExpiringAPIView.as_view(), name='api-check-expiring'),
    path('api/export/', ExportDataAPIView.as_view(), name='api-export'),
]
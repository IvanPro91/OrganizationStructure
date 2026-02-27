# core/urls.py
from django.urls import path
from . import views
from .views_api import (
    CreateObjectAPIView, ObjectDetailAPIView,
    DeleteObjectAPIView, UpdateObjectAPIView,
    CheckExpiringAPIView, ObjectTypesAPIView,
    TreeAPIView, MoveObjectAPIView,
    ObjectLicensesAPIView, ObjectHistoryAPIView,
    ObjectAttachmentsAPIView, UploadAttachmentAPIView,
    DownloadAttachmentAPIView, DeleteAttachmentAPIView,
    ExportDataAPIView, TreeNodeStateAPIView
)

app_name = 'core'

urlpatterns = [
    path('', views.DashboardView.as_view(), name='dashboard'),
    path('table/', views.TableView.as_view(), name='table'),
    path('export/excel/', views.ExportExcelView.as_view(), name='export-excel'),

    # API для дерева
    path('api/object-types/', ObjectTypesAPIView.as_view(), name='api-object-types'),
    path('api/tree/', TreeAPIView.as_view(), name='api-tree'),
    path('api/object/create/', CreateObjectAPIView.as_view(), name='api-object-create'),
    path('api/object/<int:pk>/', ObjectDetailAPIView.as_view(), name='api-object-detail'),
    path('api/object/<int:pk>/delete/', DeleteObjectAPIView.as_view(), name='api-object-delete'),
    path('api/object/<int:pk>/update/', UpdateObjectAPIView.as_view(), name='api-object-update'),
    path('api/object/<int:pk>/move/', MoveObjectAPIView.as_view(), name='api-object-move'),

    # API для дополнительных данных
    path('api/object/<int:pk>/licenses/', ObjectLicensesAPIView.as_view(), name='api-object-licenses'),
    path('api/object/<int:pk>/history/', ObjectHistoryAPIView.as_view(), name='api-object-history'),
    path('api/object/<int:pk>/attachments/', ObjectAttachmentsAPIView.as_view(), name='api-object-attachments'),
    path('api/object/<int:pk>/upload/', UploadAttachmentAPIView.as_view(), name='api-object-upload'),
    path('api/attachment/<int:pk>/download/', DownloadAttachmentAPIView.as_view(), name='api-attachment-download'),
    path('api/attachment/<int:pk>/delete/', DeleteAttachmentAPIView.as_view(), name='api-attachment-delete'),
    path('api/object/<int:pk>/toggle-expand/', TreeNodeStateAPIView.as_view(), name='toggle-expand'),

    # Инструменты
    path('api/check-expiring/', CheckExpiringAPIView.as_view(), name='api-check-expiring'),
    path('api/export/', ExportDataAPIView.as_view(), name='api-export'),
]
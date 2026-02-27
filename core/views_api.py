# core/views_api.py
import json

import openpyxl
from django.http import JsonResponse, HttpResponse, FileResponse
from django.views import View
from django.contrib.auth.mixins import LoginRequiredMixin
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import timedelta

from openpyxl.styles import Font, PatternFill, Side, Alignment, Border
from openpyxl.utils import get_column_letter

from .models import OrganizationObject, ObjectType, ObjectField, ObjectFieldValue, StatusHistory, LicenseAttachment, \
    ObjectLicense
import csv


@method_decorator(csrf_exempt, name='dispatch')
class ObjectTypesAPIView(LoginRequiredMixin, View):
    """API для получения всех типов объектов"""

    def get(self, request):
        types = ObjectType.objects.all()
        data = [{
            'id': t.id,
            'name': t.name,
            'icon': t.icon,
            'fields': [{'name': f.name, 'type': f.field_type, 'required': f.required}
                       for f in t.fields.all()]
        } for t in types]
        return JsonResponse({str(t['id']): t for t in data})


@method_decorator(csrf_exempt, name='dispatch')
class TreeAPIView(LoginRequiredMixin, View):
    """API для получения дерева объектов"""

    def get(self, request):
        def build_tree(obj):
            # Сортируем детей по полю order
            sorted_children = obj.children.all().order_by('order', 'name')

            return {
                'id': obj.id,
                'name': obj.name,
                'type_id': obj.object_type_id,
                'type_name': obj.object_type.name,
                'icon': obj.object_type.icon,
                'status': obj.status,
                'order': obj.order,
                'is_expanded': obj.is_expanded,  # Добавляем состояние раскрытия
                'children': [build_tree(child) for child in sorted_children]
            }

        # Сортируем корневые элементы
        roots = OrganizationObject.objects.filter(
            parent=None
        ).select_related('object_type').prefetch_related('children').order_by('order', 'name')

        data = [build_tree(root) for root in roots]
        return JsonResponse(data, safe=False)


@method_decorator(csrf_exempt, name='dispatch')
class TreeNodeStateAPIView(LoginRequiredMixin, View):
    """API для сохранения состояния раскрытия узла"""

    def post(self, request, pk):
        try:
            data = json.loads(request.body)
            is_expanded = data.get('is_expanded', False)

            obj = OrganizationObject.objects.get(pk=pk)
            obj.is_expanded = is_expanded
            obj.save(update_fields=['is_expanded'])

            return JsonResponse({
                'success': True,
                'id': obj.id,
                'is_expanded': obj.is_expanded
            })

        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class CreateObjectAPIView(LoginRequiredMixin, View):
    """API для создания нового объекта"""

    def post(self, request):
        try:
            data = json.loads(request.body)
            type_id = data.get('type_id')
            parent_id = data.get('parent_id')

            if not type_id:
                return JsonResponse({'error': 'type_id is required'}, status=400)

            object_type = ObjectType.objects.get(id=type_id)

            # Создаем объект
            obj = OrganizationObject.objects.create(
                name=f"Новый {object_type.name}",
                object_type=object_type,
                parent_id=parent_id if parent_id else None,
                owner=request.user
            )

            # Создаем пустые значения для всех полей типа
            for field in object_type.fields.all():
                field_value = ObjectFieldValue.objects.create(
                    object=obj,
                    field=field
                )
                # Устанавливаем начальные значения
                if field.field_type == 'checkbox':
                    field_value.value_boolean = False
                elif field.field_type == 'number':
                    field_value.value_number = None
                elif field.field_type == 'datetime':
                    field_value.value_datetime = None
                else:
                    field_value.value_text = ''
                field_value.save()

            # Запись в историю статусов
            StatusHistory.objects.create(
                object=obj,
                status=obj.status,
                changed_by=request.user,
                comment='Объект создан'
            )

            return JsonResponse({
                'id': obj.id,
                'name': obj.name,
                'type_id': object_type.id,
                'type_name': object_type.name,
                'icon': object_type.icon,
                'status': 'success'
            })

        except ObjectType.DoesNotExist:
            return JsonResponse({'error': 'Object type not found'}, status=404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class ObjectDetailAPIView(LoginRequiredMixin, View):
    """API для получения деталей объекта"""

    def get(self, request, pk):
        try:
            obj = OrganizationObject.objects.select_related('object_type').prefetch_related(
                'field_values__field', 'status_history'
            ).get(pk=pk)

            # Динамические поля
            fields = []
            field_values_dict = {fv.field_id: fv for fv in obj.field_values.all()}

            for field in obj.object_type.fields.all():
                value_obj = field_values_dict.get(field.id)

                if value_obj:
                    if field.field_type == 'number':
                        value = value_obj.value_number
                    elif field.field_type == 'datetime':
                        value = value_obj.value_datetime.isoformat() if value_obj.value_datetime else None
                    elif field.field_type == 'checkbox':
                        value = value_obj.value_boolean
                    else:
                        value = value_obj.value_text
                else:
                    value = None

                fields.append({
                    'id': field.id,
                    'name': field.name,
                    'type': field.field_type,
                    'required': field.required,
                    'value': value
                })

            # История статусов
            status_history = list(
                obj.status_history.values('status', 'changed_at', 'comment').order_by('-changed_at')[:5])
            for item in status_history:
                item['changed_at'] = item['changed_at'].isoformat() if item['changed_at'] else None

            data = {
                'id': obj.id,
                'name': obj.name,
                'type': obj.object_type.name,
                'type_id': obj.object_type_id,
                'status': obj.status,
                'status_display': obj.get_status_display(),
                'status_history': status_history,
                'fields': fields,
            }

            return JsonResponse(data)

        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class DeleteObjectAPIView(LoginRequiredMixin, View):
    """API для удаления объекта"""

    def delete(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            obj.delete()
            return JsonResponse({'status': 'deleted'})
        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class UpdateObjectAPIView(LoginRequiredMixin, View):
    """API для обновления объекта"""

    def post(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            data = json.loads(request.body)

            # Обновление основных полей
            if '_name' in data:
                obj.name = data['_name']

            if 'status' in data:
                old_status = obj.status
                new_status = data['status']
                if old_status != new_status:
                    obj.status = new_status
                    StatusHistory.objects.create(
                        object=obj,
                        status=new_status,
                        changed_by=request.user,
                        comment=data.get('status_comment', 'Статус изменен через API')
                    )

            if 'parent_id' in data:
                # Если parent_id приходит как строка 'null' или None
                if data['parent_id'] in (None, 'null', ''):
                    obj.parent = None
                else:
                    try:
                        obj.parent_id = int(data['parent_id'])
                    except (ValueError, TypeError):
                        obj.parent = None

            obj.save()

            # Обновление динамических полей
            field_values_dict = {fv.field_id: fv for fv in obj.field_values.all()}

            for field in obj.object_type.fields.all():
                if field.name in data:
                    value_obj = field_values_dict.get(field.id)
                    if not value_obj:
                        value_obj = ObjectFieldValue.objects.create(
                            object=obj,
                            field=field
                        )

                    # Устанавливаем значение в зависимости от типа поля
                    val = data[field.name]

                    if field.field_type == 'number':
                        value_obj.value_number = float(val) if val not in (None, '') else None
                    elif field.field_type == 'datetime':
                        value_obj.value_datetime = val if val else None
                    elif field.field_type == 'checkbox':
                        value_obj.value_boolean = bool(val) if val is not None else False
                    else:  # text, textarea
                        value_obj.value_text = str(val) if val is not None else ''

                    value_obj.save()

            return JsonResponse({'status': 'updated'})

        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class MoveObjectAPIView(LoginRequiredMixin, View):
    """API для перемещения объекта с сохранением позиции"""

    def post(self, request, pk):
        try:
            data = json.loads(request.body)
            parent_id = data.get('parent_id')
            old_parent_id = data.get('old_parent_id')
            new_position = data.get('position')

            obj = OrganizationObject.objects.get(pk=pk)

            # Обработка специальных значений
            if parent_id in (None, 'null', '#'):
                parent_id = None
            if old_parent_id in (None, 'null', '#'):
                old_parent_id = None

            print(f"Moving object {pk}: old_parent={old_parent_id}, new_parent={parent_id}, position={new_position}")

            # Если перемещение внутри того же родителя
            if old_parent_id == parent_id:
                # Получаем всех siblings, исключая текущий объект
                siblings = list(OrganizationObject.objects.filter(
                    parent_id=parent_id
                ).exclude(id=obj.id).order_by('order', 'name', 'id'))

                # Вставляем объект на новую позицию
                siblings.insert(new_position, obj)

                # Перенумеровываем
                for index, sibling in enumerate(siblings):
                    if sibling.order != index:
                        sibling.order = index
                        sibling.save(update_fields=['order'])

                comment = f'Изменен порядок в пределах {obj.parent.name if obj.parent else "корня"}'

            else:
                # Перемещение между разными родителями
                # Сохраняем старый родитель для последующей перенумерации
                old_parent = obj.parent_id

                # Обновляем родителя
                if parent_id is None:
                    obj.parent = None
                    comment = 'Объект перемещен в корень'
                else:
                    try:
                        target = OrganizationObject.objects.get(pk=parent_id)
                        obj.parent = target
                        comment = f'Объект перемещен в {target.name}'
                    except OrganizationObject.DoesNotExist:
                        return JsonResponse({'error': 'Target object not found'}, status=404)

                # Сохраняем объект
                obj.save()

                # Перенумеровываем старого родителя
                if old_parent is not None:
                    self.reorder_siblings(old_parent)

                # Получаем siblings нового родителя и вставляем на нужную позицию
                new_siblings = list(OrganizationObject.objects.filter(
                    parent_id=parent_id
                ).exclude(id=obj.id).order_by('order', 'name', 'id'))

                # Вставляем объект на нужную позицию
                new_siblings.insert(new_position, obj)

                # Перенумеровываем нового родителя
                for index, sibling in enumerate(new_siblings):
                    if sibling.order != index:
                        sibling.order = index
                        sibling.save(update_fields=['order'])

            # Запись в историю
            StatusHistory.objects.create(
                object=obj,
                status=obj.status,
                changed_by=request.user,
                comment=comment
            )

            return JsonResponse({
                'status': 'moved',
                'new_parent_id': parent_id,
                'new_position': new_position
            })

        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)

    def reorder_siblings(self, parent_id):
        """Перенумеровать порядок сортировки у всех siblings"""
        siblings = OrganizationObject.objects.filter(parent_id=parent_id).order_by('order', 'name', 'id')

        for index, sibling in enumerate(siblings):
            if sibling.order != index:
                sibling.order = index
                sibling.save(update_fields=['order'])

        print(f"Reordered {siblings.count()} siblings for parent {parent_id}")



@method_decorator(csrf_exempt, name='dispatch')
class ObjectLicensesAPIView(LoginRequiredMixin, View):
    """API для получения лицензий объекта"""

    def get(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            licenses = []
            for link in obj.linked_licenses.filter(is_active=True):
                lic = link.license
                licenses.append({
                    'id': lic.id,
                    'name': lic.name,
                    'license_number': lic.get_field_value('Номер лицензии'),
                    'expiry_date': lic.get_field_value('Срок действия')
                })
            return JsonResponse(licenses, safe=False)
        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)


@method_decorator(csrf_exempt, name='dispatch')
class ObjectHistoryAPIView(LoginRequiredMixin, View):
    """API для получения истории объекта"""

    def get(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            history = []
            for h in obj.status_history.all().order_by('-changed_at')[:20]:
                history.append({
                    'status': h.status,
                    'status_display': h.get_status_display(),
                    'changed_at': h.changed_at.strftime('%d.%m.%Y %H:%M'),
                    'changed_by': h.changed_by.get_full_name() if h.changed_by else 'Система',
                    'comment': h.comment
                })
            return JsonResponse(history, safe=False)
        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)


@method_decorator(csrf_exempt, name='dispatch')
class ObjectAttachmentsAPIView(LoginRequiredMixin, View):
    """API для получения файлов объекта"""

    def get(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            attachments = []
            for att in obj.attachments.all():
                attachments.append({
                    'id': att.id,
                    'name': att.name,
                    'size': att.file.size if att.file else 0,
                    'uploaded_at': att.uploaded_at.strftime('%d.%m.%Y'),
                    'uploaded_by': att.uploaded_by.get_full_name() if att.uploaded_by else 'Неизвестно'
                })
            return JsonResponse(attachments, safe=False)
        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)


@method_decorator(csrf_exempt, name='dispatch')
class UploadAttachmentAPIView(LoginRequiredMixin, View):
    """API для загрузки файла"""

    def post(self, request, pk):
        try:
            obj = OrganizationObject.objects.get(pk=pk)
            file = request.FILES.get('file')

            if not file:
                return JsonResponse({'error': 'No file provided'}, status=400)

            attachment = LicenseAttachment.objects.create(
                license_object=obj,
                file=file,
                name=file.name,
                uploaded_by=request.user
            )

            return JsonResponse({
                'id': attachment.id,
                'name': attachment.name,
                'status': 'uploaded'
            })

        except OrganizationObject.DoesNotExist:
            return JsonResponse({'error': 'Object not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class DownloadAttachmentAPIView(LoginRequiredMixin, View):
    """API для скачивания файла"""

    def get(self, request, pk):
        try:
            attachment = LicenseAttachment.objects.get(pk=pk)
            response = FileResponse(attachment.file, as_attachment=True)
            response['Content-Disposition'] = f'attachment; filename="{attachment.name}"'
            return response
        except LicenseAttachment.DoesNotExist:
            return JsonResponse({'error': 'Attachment not found'}, status=404)


@method_decorator(csrf_exempt, name='dispatch')
class DeleteAttachmentAPIView(LoginRequiredMixin, View):
    """API для удаления файла"""

    def delete(self, request, pk):
        try:
            attachment = LicenseAttachment.objects.get(pk=pk)
            attachment.file.delete()
            attachment.delete()
            return JsonResponse({'status': 'deleted'})
        except LicenseAttachment.DoesNotExist:
            return JsonResponse({'error': 'Attachment not found'}, status=404)


@method_decorator(csrf_exempt, name='dispatch')
class CheckExpiringAPIView(LoginRequiredMixin, View):
    """API для проверки истекающих объектов"""

    def get(self, request):
        try:
            days = getattr(request.user, 'notification_days', 7)
            now = timezone.now()
            expiry_limit = now + timedelta(days=days)

            expiring = OrganizationObject.objects.filter(
            ).values('id', 'name')

            # Преобразуем даты в строки для JSON
            result = []
            for item in expiring:
                result.append({
                    'id': item['id'],
                    'name': item['name'],
                    'expiry_date': item['expiry_date'].isoformat() if item['expiry_date'] else None,
                    'days_left': (item['expiry_date'] - now).days if item['expiry_date'] else None
                })

            return JsonResponse(result, safe=False)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class ExportDataAPIView(LoginRequiredMixin, View):
    """API для экспорта данных"""

    def get(self, request):
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="objects_export.csv"'
        response.write('\ufeff')  # Добавляем BOM для UTF-8 в Excel

        writer = csv.writer(response)
        writer.writerow(
            ['ID', 'Название', 'Тип', 'Статус', 'Родитель', 'Дата создания', 'Дата обновления'])

        for obj in OrganizationObject.objects.all().select_related('object_type', 'parent'):
            writer.writerow([
                obj.id,
                obj.name,
                obj.object_type.name,
                obj.get_status_display(),
                obj.parent.name if obj.parent else '',
                obj.created_at.strftime('%d.%m.%Y %H:%M'),
                obj.updated_at.strftime('%d.%m.%Y %H:%M'),
            ])

        return response

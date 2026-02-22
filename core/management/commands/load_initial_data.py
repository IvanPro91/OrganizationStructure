# core/management/commands/load_initial_data.py
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.db import connection
from django.apps import apps
import os


class Command(BaseCommand):
    help = 'Загружает начальные данные из фикстуры'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Принудительно перезаписать данные, даже если они уже существуют',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Начинаю загрузку начальных данных...'))

        # Получаем модели ДО проверки условий
        ObjectType = apps.get_model('core', 'ObjectType')
        ObjectField = apps.get_model('core', 'ObjectField')
        ObjectFieldValue = apps.get_model('core', 'ObjectFieldValue')
        StatusHistory = apps.get_model('core', 'StatusHistory')
        ObjectLicense = apps.get_model('core', 'ObjectLicense')
        LicenseAttachment = apps.get_model('core', 'LicenseAttachment')
        OrganizationObject = apps.get_model('core', 'OrganizationObject')

        existing_count = ObjectType.objects.count()

        if existing_count > 0 and not options['force']:
            self.stdout.write(
                self.style.WARNING(f'В базе уже есть {existing_count} типов объектов. '
                                   f'Используйте --force для принудительной перезаписи.')
            )
            return

        # Путь к фикстуре
        fixture_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'fixtures',
            'initial_data.json'
        )

        if not os.path.exists(fixture_path):
            self.stdout.write(
                self.style.ERROR(f'❌ Файл фикстуры не найден: {fixture_path}')
            )
            return

        try:
            # Очищаем существующие данные если нужно
            if options['force'] and existing_count > 0:
                self.stdout.write('Очищаю существующие данные...')

                # Отключаем проверку внешних ключей для SQLite
                if connection.vendor == 'sqlite':
                    cursor = connection.cursor()
                    cursor.execute('PRAGMA foreign_keys = OFF;')

                # Удаляем в правильном порядке из-за внешних ключей
                ObjectFieldValue.objects.all().delete()
                StatusHistory.objects.all().delete()
                ObjectLicense.objects.all().delete()
                LicenseAttachment.objects.all().delete()
                OrganizationObject.objects.all().delete()
                ObjectField.objects.all().delete()
                ObjectType.objects.all().delete()

                if connection.vendor == 'sqlite':
                    cursor = connection.cursor()
                    cursor.execute('PRAGMA foreign_keys = ON;')

                self.stdout.write(self.style.SUCCESS('✅ Существующие данные очищены'))

            # Загружаем фикстуру
            self.stdout.write('Загружаю данные из фикстуры...')
            call_command('loaddata', 'initial_data.json', app='core')

            # Получаем обновленные счетчики
            object_types_count = ObjectType.objects.count()
            object_fields_count = ObjectField.objects.count()

            self.stdout.write(self.style.SUCCESS('✅ Данные успешно загружены!'))
            self.stdout.write(f'   - Типов объектов: {object_types_count}')
            self.stdout.write(f'   - Полей объектов: {object_fields_count}')

        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'❌ Ошибка при загрузке данных: {str(e)}')
            )
            import traceback
            traceback.print_exc()
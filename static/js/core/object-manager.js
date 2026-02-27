class ObjectManager {
    constructor() {
        this.selectedObjectId = null;
        this.pendingParentId = null;
        this.selectedTypeId = null;
        this.contextTargetId = null;
        this.objectTypes = {};
        this.csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
        this.currentTab = 'properties';
        this.treeInstance = null;

        this.init();
    }

    init() {
        this.loadObjectTypes();
        this.bindEvents();
        this.initTree();
        this.initTabs();
    }

    // ========== МЕТОДЫ ЗАГРУЗКИ ТИПОВ ==========
    loadObjectTypes() {
        $.ajax({
            url: '/api/object-types/',
            method: 'GET',
            success: (data) => {
                this.objectTypes = data;
                this.renderTypeSelector();
            },
            error: () => {
                console.error('Failed to load object types');
            }
        });
    }

    renderTypeSelector() {
        const grid = $('#typeSelectorGrid');
        grid.empty();

        Object.values(this.objectTypes).forEach(type => {
            const card = $(`
                <div class="type-card" data-type-id="${type.id}">
                    <i class="${type.icon} text-3xl text-gray-600"></i>
                    <div class="font-medium mt-1">${type.name}</div>
                </div>
            `);

            card.click(() => {
                $('.type-card').removeClass('selected');
                card.addClass('selected');
                this.selectedTypeId = type.id;
                $('#confirmTypeSelect').prop('disabled', false);
            });

            grid.append(card);
        });
    }

    // ========== МЕТОД ПРЕОБРАЗОВАНИЯ ДАННЫХ ==========
    convertToJsTreeFormat(data) {
    const convertNode = (node) => {
        // Определяем иконку в зависимости от типа
        let icon = node.icon || 'bi-folder';
        if (icon && !icon.startsWith('bi ')) {
            icon = 'bi ' + icon;
        }

        return {
            id: node.id.toString(),
            text: node.name,
            icon: icon,
            type: node.type_name,
            state: {
                opened: node.is_expanded || false,  // Используем is_expanded из БД
                selected: false,
                disabled: false
            },
            li_attr: {
                'data-type-id': node.type_id,
                'data-type-name': node.type_name,
                'data-status': node.status,
                'data-expanded': node.is_expanded || false
            },
            a_attr: {
                'href': '#',
                'data-id': node.id
            },
            original: {
                id: node.id,
                name: node.name,
                type_id: node.type_id,
                type_name: node.type_name,
                icon: icon,
                status: node.status,
                is_expanded: node.is_expanded || false
            },
            children: node.children && node.children.length > 0
                ? node.children.map(child => convertNode(child))
                : []
            };
        };

        if (Array.isArray(data)) {
            return data.map(node => convertNode(node));
        } else if (data && typeof data === 'object') {
            return [convertNode(data)];
        }
        return [];
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ДЕРЕВА ==========
    initTree() {
        $('#treeContainer').jstree({
            'core': {
                'data': {
                    'url': '/api/tree/',
                    'dataType': 'json',
                    'data': (node) => {
                        return { 'id': node.id === '#' ? null : node.id };
                    },
                    'dataFilter': (data) => {
                        try {
                            // Парсим полученные данные
                            const jsonData = JSON.parse(data);
                            console.log('Raw API data:', jsonData);

                            // Преобразуем в формат jsTree
                            const convertedData = this.convertToJsTreeFormat(jsonData);
                            console.log('Converted data:', convertedData);

                            return JSON.stringify(convertedData);
                        } catch (e) {
                            console.error('Error converting data:', e);
                            return '[]';
                        }
                    }
                },
                'check_callback': true,
                'themes': {
                    'name': 'default',
                    'dots': true,
                    'icons': true,
                    'stripes': false
                },
                'multiple': false,
                'animation': 200
            },
            'plugins': ['dnd', 'contextmenu', 'search', 'types', 'wholerow'],
            'dnd': {
                'copy': false,
                'touch': true,
                'large_drop_target': true,
                'large_drag_target': true
            },
            'contextmenu': {
                'items': (node) => this.customContextMenu(node)
            },
            'types': {
                'default': {
                    'icon': 'bi bi-folder'
                }
            },
            'search': {
                'show_only_matches': true,
                'show_only_matches_children': false
            }
        });

        // Обработчики событий jsTree (только здесь, не дублировать!)
        this.initTreeEvents();
    }

    initTreeEvents() {
        // Обработка готовности дерева
        $('#treeContainer').on('ready.jstree', (e, data) => {
            this.treeInstance = data.instance;
            console.log('jsTree ready');

            // Получаем все узлы
            const allNodes = this.treeInstance.get_json('#', { flat: true });
            console.log('All nodes with states:', allNodes.map(n => ({
                id: n.id,
                text: n.text,
                opened: n.state.opened
            })));
        });

        // Обработка открытия узла
        $('#treeContainer').on('open_node.jstree', (e, data) => {
            const nodeId = data.node.id;
            console.log('Node opened:', nodeId);

            // Отправляем на сервер, что узел раскрыт
            $.ajax({
                url: `/api/object/${nodeId}/toggle-expand/`,
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ is_expanded: true })
            });
        });

        // Обработка закрытия узла
        $('#treeContainer').on('close_node.jstree', (e, data) => {
            const nodeId = data.node.id;
            console.log('Node closed:', nodeId);

            // Отправляем на сервер, что узел свернут
            $.ajax({
                url: `/api/object/${nodeId}/toggle-expand/`,
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ is_expanded: false })
            });
        });


        // Обработка выбора узла
        $('#treeContainer').on('select_node.jstree', (e, data) => {
            const node = data.node;
            this.selectedObjectId = node.id;
            $('#selectedObjectPath').text(node.text);

            // Получаем тип из оригинальных данных
            const typeName = node.original?.type_name || node.type || 'Объект';
            $('#objectTypeTitle').html(`Свойства <span class="text-sm text-gray-500 ml-2">(${typeName})</span>`);

            this.loadObjectData(node.id);
        });

        // Обработка открытия/закрытия узла
        $('#treeContainer').on('open_node.jstree close_node.jstree', (e, data) => {
            // Можно сохранять состояние в localStorage
            const nodeId = data.node.id;
            const isOpen = data.node.state.opened;
            console.log(`Node ${nodeId} is now ${isOpen ? 'open' : 'closed'}`);
        });

        // Обработка перемещения узла
        $('#treeContainer').on('move_node.jstree', (e, data) => {
            if (!data.node || data.node.id === '#') return;

            const nodeId = data.node.id;
            const newParentId = data.parent;
            const oldParentId = data.old_parent;
            const position = data.position;

            // Если новый родитель '#', значит перемещаем в корень
            const targetId = newParentId === '#' ? null : newParentId;
            const oldParent = oldParentId === '#' ? null : oldParentId;


            $.ajax({
                url: `/api/object/${nodeId}/move/`,
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    parent_id: targetId,
                    old_parent_id: oldParent,
                    position: position
                }),
                success: (response) => {
                    this.showToast('Объект перемещен');
                    // Принудительно обновляем дерево, чтобы получить правильный порядок
                    this.treeInstance.refresh();
                },
                error: (xhr) => {
                    this.showToast(xhr.responseJSON?.error || 'Ошибка перемещения', true);
                    // Откатываем перемещение в дереве
                    this.treeInstance.refresh();
                },
            });
        });
    }

    // ========== КАСТОМНОЕ КОНТЕКСТНОЕ МЕНЮ ==========
    customContextMenu(node) {
        const items = {
            'AddChild': {
                'label': 'Добавить дочерний',
                'icon': 'bi bi-plus-square',
                'action': () => this.showCreateModal(node.id)
            },
            'Rename': {
                'label': 'Переименовать',
                'icon': 'bi bi-pencil',
                'action': () => {
                    this.treeInstance.edit(node);
                }
            },
            'ChangeStatus': {
                'label': 'Изменить статус',
                'icon': 'bi bi-arrow-repeat',
                'action': () => {
                    this.contextTargetId = node.id;
                    this.showStatusModal();
                }
            },
            'Transfer': {
                'label': 'Перенести',
                'icon': 'bi bi-arrow-left-right',
                'action': () => {
                    this.contextTargetId = node.id;
                    this.showTransferModal();
                }
            },
            'Delete': {
                'label': 'Удалить',
                'icon': 'bi bi-trash',
                'action': () => {
                    this.contextTargetId = node.id;
                    $('#confirmMessage').text('Удалить объект и всех его потомков?');
                    $('#confirmModal').data('target-id', node.id);
                    $('#confirmModal').removeClass('hidden');
                }
            }
        };
        return items;
    }

    showCreateModal(parentId) {
        this.pendingParentId = parentId;
        this.selectedTypeId = null;

        $('.type-card').removeClass('selected');
        $('#confirmTypeSelect').prop('disabled', true);
        $('#typeSelectorTitle').text(parentId === null ? 'Выберите тип корневого объекта' : 'Выберите тип дочернего объекта');
        $('#typeSelectorModal').removeClass('hidden');
    }

    // ========== БИНДИНГ СОБЫТИЙ ==========
    bindEvents() {
        // Создание объектов
        $('#addRootBtn, #menuNewRoot, #emptyAddBtn').click(() => this.showCreateModal(null));
        $('#confirmTypeSelect').click(() => this.createObject());
        $('#cancelTypeSelect').click(() => $('#typeSelectorModal').addClass('hidden'));

        // Управление
        $('#confirmYes').click(() => this.executeDelete());
        $('#confirmNo').click(() => $('#confirmModal').addClass('hidden'));

        // Статус
        $('#quickStatusBtn').click(() => this.showStatusModal());
        $('#saveStatusBtn').click(() => this.updateStatus());
        $('#cancelStatusBtn').click(() => $('#statusModal').addClass('hidden'));

        // Перенос
        $('#quickTransferBtn').click(() => this.showTransferModal());
        $('#saveTransferBtn').click(() => this.executeTransfer());
        $('#cancelTransferBtn').click(() => $('#transferModal').addClass('hidden'));

        // Сохранение
        $('#saveObjectBtn, #menuSave').click(() => this.saveObject());

        // Поля
        $('#addFieldBtn, #menuAddField').click(() => this.showAddFieldModal());
        $('#removeFieldBtn, #menuRemoveField').click(() => this.removeLastField());
        $('#addFieldConfirm').click(() => this.addField());
        $('#cancelFieldBtn').click(() => $('#fieldModal').addClass('hidden'));

        // Настройки
        $('#settingsBtn').click(() => this.showSettings());
        $('#saveSettingsBtn').click(() => this.saveSettings());
        $('#closeSettingsBtn, #cancelSettingsBtn').click(() => $('#settingsModal').addClass('hidden'));

        // Инструменты
        $('#menuCheckExpiry, #checkExpiryBtn').click(() => this.checkExpiring());
        $('#menuExit').click(() => this.logout());
        $('#menuAbout').click(() => this.showAbout());
        $('#menuLoadExample').click(() => this.loadExample());
        $('#menuExport').click(() => this.exportData());

        // Поиск
        $('#searchInput').on('input', (e) => {
            if (this.treeInstance) {
                this.treeInstance.search(e.target.value);
            }
        });

        // Фильтр по типу
        $('#filterType').change((e) => {
            if (!this.treeInstance) return;

            const typeId = e.target.value;
            if (typeId) {
                this.treeInstance.show_all();
                this.treeInstance.hide_all();
                // Показываем только узлы с нужным типом
                $(`.tree-node[data-type-id="${typeId}"]`).each((_, node) => {
                    this.treeInstance.show_node(node.id);
                });
            } else {
                this.treeInstance.show_all();
            }
        });

        // Развернуть/свернуть все
        $('#expandAllBtn, #menuExpandAll').click(() => {
            if (this.treeInstance) this.treeInstance.open_all();
        });
        $('#collapseAllBtn, #menuCollapseAll').click(() => {
            if (this.treeInstance) this.treeInstance.close_all();
        });

        $('#menuTableView').click(() => {
            window.location.href = '/table/';
        });

        $('#menuExportExcel').click(() => {
            window.location.href = '/export/excel/';
        });

        // Закрытие модалок
        $('.cancel-btn, #cancelTypeSelect, #cancelFieldBtn, #cancelStatusBtn, #cancelTransferBtn, #cancelSettingsBtn, #closeSettingsBtn')
            .click((e) => this.closeModal(e));
    }



    createObject() {
        if (!this.selectedTypeId) {
            this.showToast('Выберите тип объекта', true);
            return;
        }

        $.ajax({
            url: '/api/object/create/',
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                type_id: this.selectedTypeId,
                parent_id: this.pendingParentId
            }),
            success: (data) => {
                this.showToast('Объект создан');
                $('#typeSelectorModal').addClass('hidden');

                // Преобразуем данные для jsTree
                const newNode = {
                    id: data.id.toString(),
                    text: data.name,
                    icon: data.icon || 'bi bi-folder',
                    type: data.type_name,
                    li_attr: {
                        'data-type-id': data.type_id,
                        'data-type-name': data.type_name
                    },
                    original: {
                        id: data.id,
                        name: data.name,
                        type_id: data.type_id,
                        type_name: data.type_name,
                        icon: data.icon
                    },
                    children: []
                };

                if (this.pendingParentId) {
                    // Добавляем как дочерний
                    this.treeInstance.create_node(this.pendingParentId, newNode, 'last');
                    this.treeInstance.open_node(this.pendingParentId);
                } else {
                    // Добавляем как корневой
                    this.treeInstance.create_node('#', newNode, 'last');
                }

                this.treeInstance.select_node(data.id.toString());
            },
            error: (xhr) => {
                const errorMsg = xhr.responseJSON?.error || 'Ошибка при создании объекта';
                this.showToast(errorMsg, true);
            }
        });
    }

    // ========== УДАЛЕНИЕ ОБЪЕКТА ==========
    executeDelete() {
        const targetId = $('#confirmModal').data('target-id');

        $.ajax({
            url: `/api/object/${targetId}/delete/`,
            method: 'DELETE',
            headers: {
                'X-CSRFToken': this.csrfToken,
                'Content-Type': 'application/json'
            },
            success: () => {
                this.showToast('Объект удалён');
                this.treeInstance.delete_node(targetId);

                if (this.selectedObjectId === targetId) {
                    this.selectedObjectId = null;
                    $('#selectedObjectPath').text('—');
                    $('#dynamicFieldsContainer').html('<p class="text-gray-500 text-center py-4">Выберите объект для редактирования</p>');
                }

                $('#confirmModal').addClass('hidden');
            },
            error: (xhr) => {
                const errorMsg = xhr.responseJSON?.error || 'Ошибка при удалении';
                this.showToast(errorMsg, true);
                $('#confirmModal').addClass('hidden');
            }
        });
    }

    // ========== МЕТОДЫ ЗАГРУЗКИ ДАННЫХ ==========
    loadObjectData(objectId) {
        $.ajax({
            url: `/api/object/${objectId}/`,
            method: 'GET',
            headers: { 'X-CSRFToken': this.csrfToken },
            success: (data) => this.renderEditor(data),
            error: () => this.renderEditorFallback(objectId)
        });
    }

    renderEditor(data) {
        const container = $('#dynamicFieldsContainer');
        container.empty();

        container.append(this.createField('Отображаемое имя', 'text', data.name, '_name'));
        if (data.fields && data.fields.length) {
            data.fields.forEach(field => {
                container.append(this.createField(field.name, field.type, field.value, field.name));
            });
        }
    }

    renderEditorFallback(objectId) {
        $('#dynamicFieldsContainer').html(`
            <div class="flex flex-col border-b pb-3 mb-2">
                <label class="text-sm font-medium text-gray-700 mb-1">Отображаемое имя <span class="field-type-badge">текст</span></label>
                <input type="text" class="w-full border border-gray-300 shadow-sm px-2 py-1" value="Объект ${objectId}" data-field="_name">
            </div>
        `);
    }

    createField(label, type, value, fieldName) {
        const div = $('<div>').addClass('flex flex-col');

        const labelEl = $('<label>')
            .addClass('text-sm font-medium text-gray-700 mb-1')
            .html(`${label} <span class="field-type-badge">${type}</span>`);

        let input;
        if (type === 'checkbox') {
            input = $('<input>')
                .attr('type', 'checkbox')
                .addClass('border border-gray-300 text-blue-600 shadow-sm')
                .prop('checked', value === true);
        } else if (type === 'textarea') {
            input = $('<textarea>')
                .addClass('w-full border border-gray-300 shadow-sm px-2 py-1 text-sm')
                .val(value || '');
        } else if (type === 'datetime-local' || type === 'datetime') {
            input = $('<input>')
                .attr('type', 'datetime-local')
                .addClass('w-full border border-gray-300 shadow-sm px-2 py-1 text-sm')
                .val(value || '');
        } else {
            input = $('<input>')
                .attr('type', type === 'number' ? 'number' : 'text')
                .addClass('w-full border border-gray-300 shadow-sm px-2 py-1 text-sm')
                .val(value || '');
        }

        input.attr('data-field', fieldName);

        return div.append(labelEl, input);
    }

    // ========== МЕТОДЫ ДЛЯ СТАТУСА ==========
    showStatusModal() {
        const targetId = this.contextTargetId || this.selectedObjectId;
        if (targetId) {
            $('#statusModal').data('target-id', targetId);
            $('#statusModal').removeClass('hidden');
        } else {
            this.showToast('Выберите объект', true);
        }
    }

    updateStatus() {
        const targetId = $('#statusModal').data('target-id');
        const newStatus = $('#newStatus').val();
        const statusDate = $('#statusDate').val();

        if (!statusDate) {
            this.showToast('Выберите дату', true);
            return;
        }

        $.ajax({
            url: `/api/object/${targetId}/update/`,
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                status: newStatus,
                status_comment: `Статус изменен на ${newStatus} с ${statusDate}`
            }),
            success: () => {
                this.showToast('Статус обновлён');
                $('#statusModal').addClass('hidden');
                if (targetId === this.selectedObjectId) {
                    this.loadObjectData(targetId);
                }
            },
            error: (xhr) => {
                this.showToast(xhr.responseJSON?.error || 'Ошибка', true);
            }
        });
    }

    // ========== МЕТОДЫ ДЛЯ ПЕРЕНОСА ==========
    // ========== МЕТОДЫ ДЛЯ ПЕРЕНОСА ==========
showTransferModal() {
    const targetId = this.contextTargetId || this.selectedObjectId;
    if (!targetId) {
        this.showToast('Выберите объект', true);
        return;
    }

    const select = $('#newParentSelect');
    select.empty().append('<option value="">— выберите —</option>');

    // Получаем все узлы из дерева
    const nodes = this.treeInstance.get_json('#', { flat: true });

    nodes.forEach(node => {
        if (node.id !== targetId) {
            const typeName = this.getNodeTypeName(node);
            select.append(`<option value="${node.id}">${node.text} (${typeName})</option>`);
        }
    });

    // Если нет доступных родительских объектов
    if (select.find('option').length === 1) { // Только заглушка
        select.append('<option value="" disabled>Нет доступных объектов для переноса</option>');
    }

    $('#transferModal').data('target-id', targetId);
    $('#transferModal').removeClass('hidden');
}

executeTransfer() {
    const targetId = $('#transferModal').data('target-id');
    const newParentId = $('#newParentSelect').val();

    if (!newParentId) {
        this.showToast('Выберите нового родителя', true);
        return;
    }

    $.ajax({
        url: `/api/object/${targetId}/update/`,
        method: 'POST',
        headers: {
            'X-CSRFToken': this.csrfToken,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ parent_id: newParentId }),
        success: () => {
            this.showToast('Объект перенесён');
            $('#transferModal').addClass('hidden');
            this.treeInstance.move_node(targetId, newParentId, 'last');

            // Обновляем выделение если нужно
            if (this.selectedObjectId === targetId) {
                this.treeInstance.select_node(targetId);
            }
        },
        error: (xhr) => {
            const errorMsg = xhr.responseJSON?.error || 'Ошибка при переносе';
            this.showToast(errorMsg, true);
            console.error('Transfer error:', xhr.responseJSON);
        }
    });
}

// Вспомогательный метод для получения типа узла
getNodeTypeName(node) {
    if (!node) return 'Объект';

    // Пробуем получить из разных мест
    if (node.original && node.original.type_name) {
        return node.original.type_name;
    }
    if (node.li_attr && node.li_attr['data-type-name']) {
        return node.li_attr['data-type-name'];
    }
    if (node.type) {
        return node.type;
    }
    return 'Объект';
}

    // ========== СОХРАНЕНИЕ ОБЪЕКТА ==========
    saveObject() {
        if (!this.selectedObjectId) {
            this.showToast('Выберите объект', true);
            return;
        }

        const data = {};
        $('#dynamicFieldsContainer input, #dynamicFieldsContainer textarea, #dynamicFieldsContainer select').each((_, el) => {
            const $el = $(el);
            const fieldName = $el.data('field');
            if (fieldName) {
                if ($el.attr('type') === 'checkbox') {
                    data[fieldName] = $el.is(':checked');
                } else if ($el.attr('type') === 'number') {
                    data[fieldName] = $el.val() ? parseFloat($el.val()) : null;
                } else if ($el.attr('type') === 'datetime-local') {
                    data[fieldName] = $el.val() || null;
                } else {
                    data[fieldName] = $el.val() || '';
                }
            }
        });

        $.ajax({
            url: `/api/object/${this.selectedObjectId}/update/`,
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(data),
            success: () => {
                this.showToast('Изменения сохранены');
                if (data._name) {
                    this.treeInstance.rename_node(this.selectedObjectId, data._name);
                    $('#selectedObjectPath').text(data._name);
                }
            },
            error: (xhr) => {
                this.showToast(xhr.responseJSON?.error || 'Ошибка', true);
            }
        });
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
    initTabs() {
        $('.tab-editor').click((e) => {
            const tab = $(e.currentTarget).data('tab');
            this.switchTab(tab);
        });
    }

    switchTab(tab) {
        this.currentTab = tab;
        $('.tab-editor').removeClass('active text-blue-600 border-blue-600').addClass('text-gray-500');
        $(`.tab-editor[data-tab="${tab}"]`).addClass('active text-blue-600 border-blue-600').removeClass('text-gray-500');

        if (!this.selectedObjectId) {
            $('#dynamicFieldsContainer').html(`<div class="text-center py-12"><p class="text-gray-400">Выберите объект</p></div>`);
            return;
        }

        switch(tab) {
            case 'properties':
                this.loadObjectData(this.selectedObjectId);
                break;
            case 'licenses':
                this.loadLicenses(this.selectedObjectId);
                break;
            case 'history':
                this.loadHistory(this.selectedObjectId);
                break;
            case 'attachments':
                this.loadAttachments(this.selectedObjectId);
                break;
        }
    }
loadLicenses(objectId) {
    $.ajax({
        url: `/api/object/${objectId}/licenses/`,
        success: (data) => {
            const container = $('#dynamicFieldsContainer');
            container.empty();

            if (!data || data.length === 0) {
                container.html(`
                    <div class="text-center py-12">
                        <i class="bi bi-award text-gray-300 text-4xl"></i>
                        <p class="text-gray-400 text-sm mt-3">Нет прикрепленных лицензий</p>
                        <button class="mt-3 text-blue-600 text-xs hover:underline" id="attachLicenseBtn">
                            <i class="bi bi-plus-circle"></i> Прикрепить лицензию
                        </button>
                    </div>
                `);
                return;
            }

            // Сетка для лицензий
            const grid = $('<div class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>');
            data.forEach(lic => {
                const card = $(`
                    <div class="border border-gray-200 rounded-none p-4 hover:shadow-md transition bg-white">
                        <div class="flex items-start gap-3">
                            <i class="bi bi-award text-blue-500 text-xl"></i>
                            <div class="flex-1">
                                <div class="font-medium text-gray-800">${lic.name}</div>
                                <div class="text-xs text-gray-500 mt-1">${lic.license_number || 'Нет номера'}</div>
                                <div class="flex justify-between items-center mt-2">
                                    <span class="text-xs ${this.isExpiring(lic.expiry_date) ? 'text-red-600 font-medium' : 'text-gray-500'}">
                                        <i class="bi bi-calendar3 mr-1"></i>${lic.expiry_date ? new Date(lic.expiry_date).toLocaleDateString() : 'бессрочно'}
                                    </span>
                                    <button class="text-blue-600 hover:text-blue-800 text-xs detach-license" data-id="${lic.id}">
                                        <i class="bi bi-dash-circle"></i> Открепить
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
                grid.append(card);
            });
            container.append(grid);

            // Обработчик для кнопки "Прикрепить лицензию"
            $('#attachLicenseBtn').click(() => {
                this.showAttachLicenseModal(objectId);
            });
        },
        error: () => {
            $('#dynamicFieldsContainer').html('<div class="text-center py-12 text-red-500">Ошибка загрузки лицензий</div>');
        }
    });
}

loadHistory(objectId) {
    $.ajax({
        url: `/api/object/${objectId}/history/`,
        success: (data) => {
            const container = $('#dynamicFieldsContainer');
            container.empty();

            if (!data || data.length === 0) {
                container.html(`
                    <div class="text-center py-12">
                        <i class="bi bi-clock-history text-gray-300 text-4xl"></i>
                        <p class="text-gray-400 text-sm mt-3">История изменений пуста</p>
                    </div>
                `);
                return;
            }

            // Хронологическая лента
            const timeline = $('<div class="space-y-4"></div>');
            data.forEach(item => {
                const statusColor = this.getStatusColor(item.status);
                const entry = $(`
                    <div class="flex gap-4 p-4 border-l-4 ${statusColor} bg-white border border-gray-200 shadow-sm">
                        <div class="flex-shrink-0">
                            <div class="text-sm font-medium text-gray-700">${item.changed_at}</div>
                            <div class="text-xs text-gray-500">${item.changed_by || 'Система'}</div>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-none 
                                    ${item.status === 'working' ? 'bg-green-100 text-green-800' : 
                                      item.status === 'repair' ? 'bg-yellow-100 text-yellow-800' : 
                                      item.status === 'written_off' ? 'bg-red-100 text-red-800' : 
                                      'bg-gray-100 text-gray-800'}">
                                    ${item.status_display}
                                </span>
                            </div>
                            ${item.comment ? `<p class="text-sm text-gray-600 mt-2">${item.comment}</p>` : ''}
                        </div>
                    </div>
                `);
                timeline.append(entry);
            });
            container.append(timeline);
        },
        error: () => {
            $('#dynamicFieldsContainer').html('<div class="text-center py-12 text-red-500">Ошибка загрузки истории</div>');
        }
    });
}

loadAttachments(objectId) {
    $.ajax({
        url: `/api/object/${objectId}/attachments/`,
        success: (data) => {
            const container = $('#dynamicFieldsContainer');
            container.empty();

            if (!data || data.length === 0) {
                container.html(`
                    <div class="text-center py-12">
                        <i class="bi bi-files text-gray-300 text-4xl"></i>
                        <p class="text-gray-400 text-sm mt-3">Нет прикрепленных файлов</p>
                        <button class="mt-3 text-blue-600 text-xs hover:underline" id="uploadFileBtn">
                            <i class="bi bi-upload"></i> Загрузить файл
                        </button>
                    </div>
                `);
                return;
            }

            const list = $('<div class="space-y-2"></div>');
            data.forEach(file => {
                const fileIcon = this.getFileIcon(file.name);
                const fileSize = this.formatFileSize(file.size);
                const row = $(`
                    <div class="flex items-center justify-between p-3 border border-gray-200 bg-white hover:bg-gray-50 transition">
                        <div class="flex items-center gap-3">
                            <i class="bi ${fileIcon} text-gray-500 text-xl"></i>
                            <div>
                                <div class="text-sm font-medium text-gray-800">${file.name}</div>
                                <div class="text-xs text-gray-500">Загружен ${file.uploaded_at} ${file.uploaded_by ? `пользователем ${file.uploaded_by}` : ''}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400">${fileSize}</span>
                            <button class="text-blue-600 hover:text-blue-800 download-file" data-id="${file.id}">
                                <i class="bi bi-download"></i>
                            </button>
                            <button class="text-red-600 hover:text-red-800 delete-file" data-id="${file.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `);
                list.append(row);
            });
            container.append(list);

            // Обработчики для кнопок скачивания и удаления
            $('.download-file').click((e) => {
                const fileId = $(e.currentTarget).data('id');
                this.downloadFile(fileId);
            });
            $('.delete-file').click((e) => {
                const fileId = $(e.currentTarget).data('id');
                this.deleteFile(fileId, objectId);
            });
            $('#uploadFileBtn').click(() => {
                this.showUploadModal(objectId);
            });
        },
        error: () => {
            $('#dynamicFieldsContainer').html('<div class="text-center py-12 text-red-500">Ошибка загрузки файлов</div>');
        }
    });
}

// Вспомогательный метод для проверки истечения
isExpiring(dateString) {
    if (!dateString) return false;
    const daysLeft = Math.ceil((new Date(dateString) - new Date()) / (1000*60*60*24));
    return daysLeft <= 7 && daysLeft >= 0;
}

// Метод для получения цвета статуса
getStatusColor(status) {
    const colors = {
        'working': 'border-green-500',
        'repair': 'border-yellow-500',
        'written_off': 'border-red-500',
        'reserved': 'border-blue-500'
    };
    return colors[status] || 'border-gray-500';
}

// Иконка файла по расширению
getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'bi-file-pdf',
        'doc': 'bi-file-word',
        'docx': 'bi-file-word',
        'xls': 'bi-file-excel',
        'xlsx': 'bi-file-excel',
        'jpg': 'bi-file-image',
        'png': 'bi-file-image',
        'txt': 'bi-file-text',
        'zip': 'bi-file-zip',
        'rar': 'bi-file-zip'
    };
    return icons[ext] || 'bi-file-earmark';
}

// Форматирование размера файла
formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

// Заглушки для действий (можно реализовать позже)
showAttachLicenseModal(objectId) {
    this.showToast('Функция прикрепления лицензии будет доступна позже');
}

showUploadModal(objectId) {
    this.showToast('Функция загрузки файлов будет доступна позже');
}

downloadFile(fileId) {
    window.location.href = `/api/attachment/${fileId}/download/`;
}

deleteFile(fileId, objectId) {
    if (confirm('Удалить файл?')) {
        $.ajax({
            url: `/api/attachment/${fileId}/delete/`,
            method: 'DELETE',
            headers: { 'X-CSRFToken': this.csrfToken },
            success: () => {
                this.showToast('Файл удален');
                this.loadAttachments(objectId); // перезагрузить список
            },
            error: (xhr) => {
                this.showToast(xhr.responseJSON?.error || 'Ошибка удаления', true);
            }
        });
    }
}
    showAddFieldModal() {
        if (!IS_ADMIN) {
            this.showToast('Только для администратора', true);
            return;
        }
        $('#fieldModal').removeClass('hidden');
    }

    removeLastField() {
        if (!IS_ADMIN) {
            this.showToast('Только для администратора', true);
            return;
        }
        this.showToast('Поле удалено');
    }

    addField() {
        this.showToast('Поле добавлено');
        $('#fieldModal').addClass('hidden');
    }

    showSettings() {
        $('#settingsModal').removeClass('hidden');
        $('.tab-button:first').click();
    }

    saveSettings() {
        this.showToast('Настройки сохранены');
        $('#settingsModal').addClass('hidden');
    }

    checkExpiring() {
        $.ajax({
            url: '/api/check-expiring/',
            success: (data) => {
                if (data.length) {
                    alert('Истекают: ' + data.map(i => i.name).join(', '));
                } else {
                    this.showToast('Просрочек нет');
                }
            }
        });
    }

    logout() {
        window.location.href = '/accounts/logout/';
    }

    showAbout() {
        alert('LicenseFlow v1.0\nСистема управления лицензиями');
    }

    loadExample() {
        this.showToast('Демо-данные загружены');
    }

    exportData() {
        window.location.href = '/api/export/';
    }

    closeModal(e) {
        $(e.currentTarget).closest('.fixed').addClass('hidden');
    }

    showToast(message, isError = false) {
        const toast = $('#toast');
        toast.text(message);
        toast.css('background', isError ? '#991b1b' : '#1e293b');
        toast.addClass('show');
        setTimeout(() => toast.removeClass('show'), 3000);
    }
}

// Инициализация
$(document).ready(() => {
    window.objectManager = new ObjectManager();
});
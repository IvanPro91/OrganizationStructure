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
        this.currentUploadObjectId = null;
        this.loaderElement = null;

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
                    opened: node.is_expanded || false,
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
                            const jsonData = JSON.parse(data);
                            const convertedData = this.convertToJsTreeFormat(jsonData);
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

        this.initTreeEvents();
    }

    initTreeEvents() {
        $('#treeContainer').on('ready.jstree', (e, data) => {
            this.treeInstance = data.instance;
            console.log('jsTree ready');
        });

        $('#treeContainer').on('open_node.jstree', (e, data) => {
            const nodeId = data.node.id;
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

        $('#treeContainer').on('close_node.jstree', (e, data) => {
            const nodeId = data.node.id;
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

        $('#treeContainer').on('select_node.jstree', (e, data) => {
            const node = data.node;
            this.selectedObjectId = node.id;
            $('#selectedObjectPath').text(node.text);

            const typeName = node.original?.type_name || node.type || 'Объект';
            $('#objectTypeTitle').html(`Свойства <span class="text-sm text-gray-500 ml-2">(${typeName})</span>`);

            this.loadObjectData(node.id);
        });

        $('#treeContainer').on('move_node.jstree', (e, data) => {
            if (!data.node || data.node.id === '#') return;

            const nodeId = data.node.id;
            const newParentId = data.parent;
            const oldParentId = data.old_parent;
            const position = data.position;

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
                    this.treeInstance.refresh();
                },
                error: (xhr) => {
                    this.showToast(xhr.responseJSON?.error || 'Ошибка перемещения', true);
                    this.treeInstance.refresh();
                }
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

        // Добавим обработчики для новых модальных окон
        $('#closePreviewBtn, #previewModal .cancel-btn').click(() => {
            $('#previewModal').addClass('hidden');
        });

        // Закрытие по клику на фон
        $('#uploadModal, #previewModal').click((e) => {
            if ($(e.target).is('#uploadModal, #previewModal')) {
                $(e.target).addClass('hidden');
            }
        });
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
                    this.treeInstance.create_node(this.pendingParentId, newNode, 'last');
                    this.treeInstance.open_node(this.pendingParentId);
                } else {
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
    showTransferModal() {
        const targetId = this.contextTargetId || this.selectedObjectId;
        if (!targetId) {
            this.showToast('Выберите объект', true);
            return;
        }

        const select = $('#newParentSelect');
        select.empty().append('<option value="">— выберите —</option>');

        const nodes = this.treeInstance.get_json('#', { flat: true });

        nodes.forEach(node => {
            if (node.id !== targetId) {
                const typeName = this.getNodeTypeName(node);
                select.append(`<option value="${node.id}">${node.text} (${typeName})</option>`);
            }
        });

        if (select.find('option').length === 1) {
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

    getNodeTypeName(node) {
        if (!node) return 'Объект';

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
                this.loadLicenses(this.selectedObjectId); // Всегда загружает файлы лицензий
                break;
            case 'history':
                this.loadHistory(this.selectedObjectId);
                break;
            case 'attachments':
                this.loadAttachments(this.selectedObjectId); // Всегда загружает общие файлы
                break;
        }
    }

    loadLicenses(objectId) {
        $.ajax({
            url: `/api/object/${objectId}/license-attachments/`,
            success: (data) => {
                const container = $('#dynamicFieldsContainer');
                container.empty();

                if (!data || data.length === 0) {
                    container.html(`
                        <div class="text-center py-12">
                            <i class="bi bi-award text-gray-300 text-4xl"></i>
                            <p class="text-gray-400 text-sm mt-3">Нет прикрепленных файлов лицензий</p>
                            <button class="mt-3 text-blue-600 text-xs hover:underline" id="attachLicenseBtn">
                                <i class="bi bi-plus-circle"></i> Прикрепить файл лицензии
                            </button>
                        </div>
                    `);
                } else {
                    const grid = $('<div class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>');
                    data.forEach(file => {
                        const fileIcon = this.getFileIcon(file.name);
                        const previewBtn = file.is_previewable
                            ? `<button class="text-green-600 hover:text-green-800 preview-license-file" data-id="${file.id}" data-name="${file.name}" title="Предпросмотр">
                                   <i class="bi bi-eye"></i>
                               </button>`
                            : '';

                        const card = $(`
                            <div class="border border-gray-200 rounded-none p-4 hover:shadow-md transition bg-white">
                                <div class="flex items-start gap-3">
                                    <i class="bi ${fileIcon} text-blue-500 text-xl"></i>
                                    <div class="flex-1 min-w-0"> <!-- Добавлен min-w-0 -->
                                        <div class="font-medium text-gray-800 truncate" title="${file.name}">${file.name}</div>
                                        <div class="text-xs text-gray-500 mt-1">
                                            ${file.size_formatted} • Загружен ${file.uploaded_at}
                                        </div>
                                        <div class="flex justify-end items-center gap-2 mt-2">
                                            ${previewBtn}
                                            <button class="text-blue-600 hover:text-blue-800 text-xs download-license-file" data-id="${file.id}">
                                                <i class="bi bi-download"></i> Скачать
                                            </button>
                                            <button class="text-red-600 hover:text-red-800 text-xs delete-license-file" data-id="${file.id}">
                                                <i class="bi bi-trash"></i> Удалить
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `);
                        grid.append(card);
                    });
                    container.append(grid);

                    container.append(`
                        <div class="mt-4 text-center">
                            <button class="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm" id="attachLicenseBtn">
                                <i class="bi bi-plus-circle mr-1"></i> Прикрепить еще файл
                            </button>
                        </div>
                    `);
                }

                // Обработчики
                $('.preview-license-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    const fileName = $(e.currentTarget).data('name');
                    this.previewLicenseFile(fileId, fileName);
                });

                $('.download-license-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    this.downloadLicenseFile(fileId);
                });

                $('.delete-license-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    this.deleteLicenseFile(fileId, objectId);
                });

                $('#attachLicenseBtn').click(() => {
                    this.showLicenseUploadModal(objectId);
                });
            },
            error: () => {
                $('#dynamicFieldsContainer').html('<div class="text-center py-12 text-red-500">Ошибка загрузки файлов лицензий</div>');
            }
        });
    }

    showLicenseUploadModal(objectId) {
        this.currentUploadObjectId = objectId;

        // Сброс формы
        $('#fileInput').val('');
        $('#fileLabel').text('Выберите файл...');
        $('#filePreview').addClass('hidden');
        $('#uploadSubmitBtn').prop('disabled', true);

        // Настраиваем модальное окно для лицензий
        $('#uploadModal .modal-title').text('Загрузка файла лицензии');
        $('#uploadModal .file-limits').text('Максимальный размер: 10MB. Разрешены: PDF, JPG, PNG, GIF');

        $('#uploadModal').data('upload-type', 'license');
        $('#uploadModal').data('object-id', objectId);
        $('#uploadModal').removeClass('hidden');

        // Обработчик выбора файла
        $('#fileInput').off('change').on('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                $('#fileLabel').text(file.name);
                $('#fileName').text(file.name);
                $('#fileSize').text(this.formatFileSize(file.size));
                $('#filePreview').removeClass('hidden');

                // Проверка для лицензий
                const ext = file.name.split('.').pop().toLowerCase();
                const allowedExt = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

                if (!allowedExt.includes(ext)) {
                    this.showToast('Для лицензий разрешены только PDF и изображения', true);
                    $('#uploadSubmitBtn').prop('disabled', true);
                } else if (file.size > 10 * 1024 * 1024) {
                    this.showToast('Файл слишком большой (максимум 10MB)', true);
                    $('#uploadSubmitBtn').prop('disabled', true);
                } else {
                    $('#uploadSubmitBtn').prop('disabled', false);
                }
            }
        });

        // Обработчик отправки
        $('#uploadForm').off('submit').on('submit', (e) => {
            e.preventDefault();
            this.uploadLicenseFile(objectId);
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
                } else {
                    const list = $('<div class="space-y-2"></div>');
                    data.forEach(file => {
                        const fileIcon = this.getFileIcon(file.name);
                        const previewBtn = file.is_previewable
                            ? `<button class="text-green-600 hover:text-green-800 preview-file" data-id="${file.id}" data-name="${file.name}" title="Предпросмотр">
                                   <i class="bi bi-eye"></i>
                               </button>`
                            : '';

                        const row = $(`
                            <div class="flex items-center justify-between p-3 border border-gray-200 bg-white hover:bg-gray-50 transition">
                                <div class="flex items-center gap-3 min-w-0 flex-1"> <!-- Добавлены min-w-0 и flex-1 -->
                                    <i class="bi ${fileIcon} text-gray-500 text-xl flex-shrink-0"></i> <!-- flex-shrink-0 чтобы иконка не сжималась -->
                                    <div class="min-w-0"> <!-- Добавлен min-w-0 -->
                                        <div class="text-sm font-medium text-gray-800 truncate" title="${file.name}">${file.name}</div>
                                        <div class="text-xs text-gray-500 truncate"> <!-- Добавлен truncate -->
                                            Загружен ${file.uploaded_at} ${file.uploaded_by ? `пользователем ${file.uploaded_by}` : ''}
                                            • ${file.size_formatted}
                                        </div>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3 flex-shrink-0"> <!-- flex-shrink-0 чтобы кнопки не сжимались -->
                                    ${previewBtn}
                                    <button class="text-blue-600 hover:text-blue-800 download-file" data-id="${file.id}" title="Скачать">
                                        <i class="bi bi-download"></i>
                                    </button>
                                    <button class="text-red-600 hover:text-red-800 delete-file" data-id="${file.id}" title="Удалить">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `);
                        list.append(row);
                    });
                    container.append(list);

                    container.append(`
                        <div class="mt-4 text-center">
                            <button class="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm" id="uploadFileBtn">
                                <i class="bi bi-upload mr-1"></i> Загрузить новый файл
                            </button>
                        </div>
                    `);
                }

                $('#uploadFileBtn').click(() => {
                    this.showFileUploadModal(objectId);
                });

                $('.download-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    this.downloadFile(fileId);
                });

                $('.preview-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    const fileName = $(e.currentTarget).data('name');
                    this.previewFileInModal(fileId, fileName);
                });

                $('.delete-file').click((e) => {
                    const fileId = $(e.currentTarget).data('id');
                    this.deleteFile(fileId, objectId);
                });
            },
            error: () => {
                $('#dynamicFieldsContainer').html('<div class="text-center py-12 text-red-500">Ошибка загрузки файлов</div>');
            }
        });
    }

    showFileUploadModal(objectId) {
        this.currentUploadObjectId = objectId;

        // Сброс формы
        $('#fileInput').val('');
        $('#fileLabel').text('Выберите файл...');
        $('#filePreview').addClass('hidden');
        $('#uploadSubmitBtn').prop('disabled', true);

        // Настраиваем модальное окно для общих файлов
        $('#uploadModal .modal-title').text('Загрузка файла');
        $('#uploadModal .file-limits').text('Максимальный размер: 50MB. Любые файлы');

        $('#uploadModal').data('upload-type', 'general');
        $('#uploadModal').data('object-id', objectId);
        $('#uploadModal').removeClass('hidden');

        // Обработчик выбора файла
        $('#fileInput').off('change').on('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                $('#fileLabel').text(file.name);
                $('#fileName').text(file.name);
                $('#fileSize').text(this.formatFileSize(file.size));
                $('#filePreview').removeClass('hidden');

                // Проверка для общих файлов (только размер)
                if (file.size > 50 * 1024 * 1024) {
                    this.showToast('Файл слишком большой (максимум 50MB)', true);
                    $('#uploadSubmitBtn').prop('disabled', true);
                } else {
                    $('#uploadSubmitBtn').prop('disabled', false);
                }
            }
        });

        // Обработчик отправки
        $('#uploadForm').off('submit').on('submit', (e) => {
            e.preventDefault();
            this.uploadGeneralFile(objectId);
        });
    }

    uploadGeneralFile(objectId) {
        const fileInput = $('#fileInput')[0];
        if (!fileInput.files || !fileInput.files[0]) {
            this.showToast('Выберите файл', true);
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        this.showLoader(true);

        $.ajax({
            url: `/api/object/${objectId}/upload/`,
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.showToast('Файл успешно загружен');
                $('#uploadModal').addClass('hidden');
                this.loadAttachments(objectId); // Перезагружаем список общих файлов
            },
            error: (xhr) => {
                const errorMsg = xhr.responseJSON?.error || 'Ошибка при загрузке файла';
                this.showToast(errorMsg, true);
            },
            complete: () => {
                this.showLoader(false);
            }
        });
    }

    uploadFile(objectId) {
        const fileInput = $('#fileInput')[0];
        if (!fileInput.files || !fileInput.files[0]) {
            this.showToast('Выберите файл', true);
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        const isLicense = $('#uploadModal').data('is-license');
        const url = isLicense
            ? `/api/object/${objectId}/upload-license/`
            : `/api/object/${objectId}/upload/`;

        this.showLoader(true);

        $.ajax({
            url: url,
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.showToast('Файл успешно загружен');
                $('#uploadModal').addClass('hidden');

                // Перезагружаем соответствующую вкладку
                if (isLicense) {
                    this.loadLicenses(objectId);
                } else {
                    this.loadAttachments(objectId);
                }
            },
            error: (xhr) => {
                const errorMsg = xhr.responseJSON?.error || 'Ошибка при загрузке файла';
                this.showToast(errorMsg, true);
            },
            complete: () => {
                this.showLoader(false);
            }
        });
    }

    downloadFile(fileId) {
        window.location.href = `/api/attachment/${fileId}/download/`;
    }

    previewFileInModal(fileId, fileName) {
        $('#previewTitle').text(fileName);

        const content = $('#previewContent');
        content.empty();

        const ext = fileName.split('.').pop().toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
            content.html(`
                <div class="flex items-center justify-center h-full">
                    <img src="/api/attachment/${fileId}/download/?preview=true" 
                         class="max-w-full max-h-[70vh] object-contain" 
                         alt="${fileName}">
                </div>
            `);
        } else if (ext === 'pdf') {
            content.html(`
                <embed src="/api/attachment/${fileId}/download/?preview=true" 
                       type="application/pdf" 
                       width="100%" 
                       height="700px" />
            `);
        } else if (ext === 'txt' || ext === 'json') {
            $.ajax({
                url: `/api/attachment/${fileId}/download/?preview=true`,
                method: 'GET',
                success: (data) => {
                    content.html(`
                        <pre class="bg-white p-4 rounded border overflow-auto max-h-[70vh] text-sm">${data}</pre>
                    `);
                },
                error: () => {
                    content.html('<div class="text-red-500">Не удалось загрузить файл для предпросмотра</div>');
                }
            });
        } else {
            content.html(`
                <div class="text-center py-12">
                    <i class="bi bi-file-earmark-x text-6xl text-gray-300"></i>
                    <p class="text-gray-500 mt-4">Предпросмотр для этого типа файлов недоступен</p>
                    <button class="mt-4 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700" 
                            onclick="window.location.href='/api/attachment/${fileId}/download/'">
                        <i class="bi bi-download mr-1"></i> Скачать файл
                    </button>
                </div>
            `);
        }

        $('#downloadFromPreview').attr('href', `/api/attachment/${fileId}/download/`);
        $('#previewModal').removeClass('hidden');
    }

    deleteFile(fileId, objectId) {
        if (confirm('Удалить файл?')) {
            $.ajax({
                url: `/api/attachment/${fileId}/delete/`,
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken },
                success: () => {
                    this.showToast('Файл удален');
                    this.loadAttachments(objectId);
                },
                error: (xhr) => {
                    this.showToast(xhr.responseJSON?.error || 'Ошибка удаления', true);
                }
            });
        }
    }


    uploadLicenseFile(objectId) {
        const fileInput = $('#fileInput')[0];
        if (!fileInput.files || !fileInput.files[0]) {
            this.showToast('Выберите файл', true);
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        this.showLoader(true);

        $.ajax({
            url: `/api/object/${objectId}/upload-license/`,
            method: 'POST',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.showToast('Файл лицензии успешно загружен');
                $('#uploadModal').addClass('hidden');
                this.loadLicenses(objectId); // Перезагружаем список лицензий
            },
            error: (xhr) => {
                const errorMsg = xhr.responseJSON?.error || 'Ошибка при загрузке файла';
                this.showToast(errorMsg, true);
            },
            complete: () => {
                this.showLoader(false);
            }
        });
    }

    // Методы для работы с файлами лицензий
    previewLicenseFile(fileId, fileName) {
        window.open(`/api/license-attachment/${fileId}/download/?preview=true`, '_blank');
    }

    downloadLicenseFile(fileId) {
        window.location.href = `/api/license-attachment/${fileId}/download/`;
    }

    deleteLicenseFile(fileId, objectId) {
        if (confirm('Удалить файл лицензии?')) {
            $.ajax({
                url: `/api/license-attachment/${fileId}/delete/`,
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken },
                success: () => {
                    this.showToast('Файл лицензии удален');
                    this.loadLicenses(objectId);
                },
                error: (xhr) => {
                    this.showToast(xhr.responseJSON?.error || 'Ошибка удаления', true);
                }
            });
        }
    }

    getStatusColor(status) {
        const colors = {
            'working': 'border-green-500',
            'repair': 'border-yellow-500',
            'written_off': 'border-red-500',
            'reserved': 'border-blue-500'
        };
        return colors[status] || 'border-gray-500';
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            'pdf': 'bi-file-pdf',
            'doc': 'bi-file-word',
            'docx': 'bi-file-word',
            'xls': 'bi-file-excel',
            'xlsx': 'bi-file-excel',
            'jpg': 'bi-file-image',
            'jpeg': 'bi-file-image',
            'png': 'bi-file-image',
            'gif': 'bi-file-image',
            'svg': 'bi-file-image',
            'txt': 'bi-file-text',
            'json': 'bi-file-code',
            'zip': 'bi-file-zip',
            'rar': 'bi-file-zip'
        };
        return icons[ext] || 'bi-file-earmark';
    }

    formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
        if (bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1) + ' MB';
        return (bytes/(1024*1024*1024)).toFixed(1) + ' GB';
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

    showLoader(show) {
        if (show) {
            if (!this.loaderElement) {
                this.loaderElement = $(`
                    <div class="global-loader">
                        <div>
                            <i class="bi bi-arrow-repeat spinning"></i>
                            <span>Загрузка...</span>
                        </div>
                    </div>
                `).appendTo('body');

                if (!$('#loader-styles').length) {
                    $('<style id="loader-styles">')
                        .text(`
                            .global-loader {
                                position: fixed;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                                background: rgba(255,255,255,0.8);
                                z-index: 99999;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            }
                            .global-loader > div {
                                background: #1e293b;
                                color: white;
                                padding: 20px 30px;
                                border-radius: 8px;
                                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                display: flex;
                                align-items: center;
                                gap: 15px;
                            }
                            @keyframes spin {
                                from { transform: rotate(0deg); }
                                to { transform: rotate(360deg); }
                            }
                            .spinning {
                                animation: spin 1s infinite linear;
                            }
                        `)
                        .appendTo('head');
                }
            }
            this.loaderElement.show();
        } else {
            if (this.loaderElement) {
                this.loaderElement.hide();
            }
        }
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
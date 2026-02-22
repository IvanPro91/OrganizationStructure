// static/js/core/dashboard.js

// Используем глобальные переменные из window
let USER_ID = window.USER_ID;
const IS_ADMIN = window.IS_ADMIN;
const CSRF_TOKEN = window.CSRF_TOKEN;
const OBJECT_TYPES = window.OBJECT_TYPES || {};
const ROOT_OBJECTS = window.ROOT_OBJECTS || [];

// Состояние приложения
let selectedInstanceId = null;
let adminMode = true;
let pendingParentId = null;
let selectedTypeId = null;
let contextTargetId = null;
let searchTerm = '';
let filterType = '';

$(document).ready(function() {
    console.log('Dashboard JS initialized');
    console.log('USER_ID:', USER_ID);
    console.log('ROOT_OBJECTS:', ROOT_OBJECTS);

    // Инициализация дерева из данных Django
    if (ROOT_OBJECTS.length > 0) {
        renderTree(ROOT_OBJECTS);
        selectedInstanceId = ROOT_OBJECTS[0].id;
        loadObjectDetails(selectedInstanceId);
    }

    // Обработчики событий
    $('#addRootBtn').click(function() {
        showTypeSelector(null);
    });

    $('#settingsBtn').click(function() {
        openSettingsModal();
    });

    $('#searchInput').on('input', function() {
        searchTerm = $(this).val();
        filterTree();
    });

    $('#filterType').on('change', function() {
        filterType = $(this).val();
        filterTree();
    });

    // Контекстное меню
    $('#contextAddChild').click(function() {
        if (contextTargetId) {
            selectedInstanceId = contextTargetId;
            showTypeSelector(contextTargetId);
        }
        $('#contextMenu').addClass('hidden');
    });

    $('#contextChangeStatus').click(function() {
        if (contextTargetId) {
            $('#statusModal').data('targetId', contextTargetId);
            $('#statusModal').removeClass('hidden');
        }
        $('#contextMenu').addClass('hidden');
    });

    $('#contextTransfer').click(function() {
        if (contextTargetId) {
            openTransferModal(contextTargetId);
        }
        $('#contextMenu').addClass('hidden');
    });

    $('#contextDelete').click(function() {
        if (contextTargetId) {
            $('#confirmMessage').text('Удалить объект и всех его потомков?');
            $('#confirmModal').data('targetId', contextTargetId);
            $('#confirmModal').removeClass('hidden');
        }
        $('#contextMenu').addClass('hidden');
    });

    // Закрытие модалок
    $('.cancel-btn, #cancelTypeSelect, #cancelFieldBtn, #cancelStatusBtn, #cancelTransferBtn, #cancelSettingsBtn, #closeSettingsBtn').click(function() {
        $(this).closest('.fixed').addClass('hidden');
    });

    // Сохранение
    $('#saveObjectBtn').click(saveCurrentObject);
});

// Функция отрисовки дерева
function renderTree(nodes, container = $('#treeContainer')) {
    container.empty();
    nodes.forEach(node => {
        container.append(buildTreeNode(node, 0));
    });
}

function buildTreeNode(node, level) {
    const icon = OBJECT_TYPES[node.type_id]?.icon || 'bi-folder';
    const typeName = OBJECT_TYPES[node.type_id]?.name || node.type_name;

    const div = $('<div>').addClass('mb-0.5');
    const header = $('<div>')
        .addClass(`tree-node flex items-center gap-1 ${selectedInstanceId === node.id ? 'selected' : ''}`)
        .css('padding-left', level * 12 + 'px')
        .attr('data-id', node.id)
        .html(`
            <i class="bi ${icon} text-gray-500 text-xs"></i>
            <span class="truncate">${node.name}</span>
            <span class="text-gray-400 text-xs ml-1">${typeName}</span>
        `);

    header.click(function(e) {
        e.stopPropagation();
        selectedInstanceId = node.id;
        loadObjectDetails(node.id);
        $('.tree-node').removeClass('selected');
        $(this).addClass('selected');
    });

    header.contextmenu(function(e) {
        e.preventDefault();
        contextTargetId = node.id;
        $('#contextMenu').css({
            top: e.pageY + 'px',
            left: e.pageX + 'px'
        }).removeClass('hidden');
    });

    div.append(header);

    if (node.children && node.children.length > 0) {
        const childContainer = $('<div>').addClass('node-children');
        node.children.forEach(child => {
            childContainer.append(buildTreeNode(child, level + 1));
        });
        div.append(childContainer);
    }

    return div;
}

// Функция загрузки данных объекта
function loadObjectDetails(objectId) {
    $.ajax({
        url: `/api/object/${objectId}/`,
        method: 'GET',
        headers: {
            'X-CSRFToken': CSRF_TOKEN
        },
        success: function(data) {
            renderEditor(data);
        },
        error: function(xhr, status, error) {
            console.error('Error loading object:', error);
            showToast('Ошибка загрузки данных объекта', true);
        }
    });
}

// Функция отрисовки редактора
function renderEditor(data) {
    $('#selectedObjectPath').text(`${data.type}: ${data.name}`);
    $('#objectTypeTitle').html(`Свойства <span class="text-sm text-gray-500 ml-2">(${data.type})</span>`);

    const container = $('#dynamicFieldsContainer');
    container.empty();

    // Отображаемое имя
    container.append(createField('Отображаемое имя', 'text', data.name, '_name'));

    // Статус
    const statusDiv = $('<div>').addClass('flex flex-col border-b pb-3 mb-2');
    statusDiv.html(`
        <label class="text-sm font-medium text-gray-700 mb-1">Текущий статус</label>
        <span class="text-sm bg-gray-100 px-2 py-1">${data.status_display || 'Не указан'}</span>
    `);
    container.append(statusDiv);

    // Динамические поля
    if (data.fields && data.fields.length) {
        data.fields.forEach(field => {
            container.append(createField(field.name, field.type, field.value, field.name));
        });
    }
}

// Вспомогательная функция создания поля
function createField(label, type, value, fieldName) {
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
    } else if (type === 'datetime-local') {
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

    div.append(labelEl, input);
    return div;
}

// Функция сохранения объекта
function saveCurrentObject() {
    if (!selectedInstanceId) {
        showToast('Нет выбранного объекта', true);
        return;
    }

    const formData = new FormData();
    formData.append('csrfmiddlewaretoken', CSRF_TOKEN);

    $('#dynamicFieldsContainer input, #dynamicFieldsContainer textarea, #dynamicFieldsContainer select').each(function() {
        const fieldName = $(this).data('field');
        if (!fieldName) return;

        if ($(this).attr('type') === 'checkbox') {
            formData.append(fieldName, $(this).is(':checked'));
        } else {
            formData.append(fieldName, $(this).val());
        }
    });

    $.ajax({
        url: `/api/object/${selectedInstanceId}/save/`,
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        headers: {
            'X-CSRFToken': CSRF_TOKEN
        },
        success: function() {
            showToast('Объект сохранён');
        },
        error: function() {
            showToast('Ошибка сохранения', true);
        }
    });
}

// Функция открытия модалки выбора типа
function showTypeSelector(parentId) {
    pendingParentId = parentId;
    selectedTypeId = null;
    $('#confirmTypeSelect').prop('disabled', true);

    const grid = $('#typeSelectorGrid');
    grid.empty();

    Object.keys(OBJECT_TYPES).forEach(typeId => {
        const type = OBJECT_TYPES[typeId];
        const card = $('<div>')
            .addClass('type-card')
            .attr('data-type-id', typeId)
            .html(`
                <i class="bi ${type.icon} text-3xl text-gray-600"></i>
                <div class="font-medium mt-1">${type.name}</div>
            `);

        card.click(function() {
            $('.type-card').removeClass('selected');
            $(this).addClass('selected');
            selectedTypeId = typeId;
            $('#confirmTypeSelect').prop('disabled', false);
        });

        grid.append(card);
    });

    $('#typeSelectorTitle').text(parentId === null ? 'Выберите тип корневого объекта' : 'Выберите тип дочернего объекта');
    $('#typeSelectorModal').removeClass('hidden');
}

// Функция открытия настроек
function openSettingsModal() {
    $('#settingsModal').removeClass('hidden');
}

// Фильтрация дерева
function filterTree() {
    // Простая фильтрация на клиенте
    let filtered = ROOT_OBJECTS;

    if (filterType) {
        filtered = filtered.filter(obj => obj.type_id == filterType);
    }

    if (searchTerm) {
        // Поиск по имени
    }

    renderTree(filtered);
}
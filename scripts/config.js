const pb = new PocketBase('https://pb.etc-tks.synology.me');

const MENU_TITLES = {
    'about': 'Мой профиль',
    'companies_list': 'Компании',
    'contacts_list': 'Контакты',
    'users_list': 'Пользователи',
    'objects_list': 'Объекты',
    'projects_list': 'Проекты',
    'groups_list': 'Группы',
    'materials_list': 'Материалы',
    'inj': 'Журнал входного контроля',
    'work_progress_report': 'Журнал расхода материалов',
    'doc_status_log': 'Журнал движения ИТД',
    'general_work_log': 'Общий журнал работ',
    'gpr': 'График производства работ',
    'feed': 'Лента событий'
};

const MODELS = {
    'companies_list': {
        collectionName: 'companies',
        expand: [], 
        fields: [
            { key: 'name', label: 'Название организации', required: true, type: 'text', width: 'min-w-[200px] max-w-[400px]' },
            { key: 'inn', label: 'ИНН компании', type: 'text', width: 'w-[160px]' },
            { key: 'email', label: 'Email', type: 'text', width: 'w-[180px]' },
            { key: 'phone', label: 'Телефон', type: 'text', width: 'w-[180px]' },
            { key: 'id', label: 'ID', type: 'text', width: 'w-[150px]', hideOnCreate: true, locked: true }
        ]
    },
    'contacts_list': {
        collectionName: 'contacts',
        expand: ['company'], 
        fields: [
            { key: 'last_name', label: 'Фамилия', required: true, type: 'text', width: 'min-w-[200px]' },
            { key: 'first_name', label: 'Имя', required: true, type: 'text', width: 'min-w-[200px]' },
            { key: 'patronymic', label: 'Отчество', type: 'text', width: 'min-w-[200px]' },
            { key: 'position', label: 'Должность', type: 'text', width: 'w-[150px]' },
            { 
                key: 'company', 
                label: 'Организация',
                required: true,
                type: 'relation', 
                sourceCollection: 'companies', 
                sourceKeys: ['name'], 
                multiple: false,
                width: 'min-w-[200px] max-w-[400px]' 
            },
            { key: 'email', label: 'Email', type: 'text', width: 'w-[150px]' },
            { key: 'phone', label: 'Телефон', type: 'text', width: 'w-[150px]' },
            { key: 'id', label: 'ID', type: 'text', width: 'w-[150px]', hideOnCreate: true, locked: true }
        ]
    },
    'users_list': {
        collectionName: 'users',
        expand: ['company'], 
        fields: [
            { key: 'last_name', label: 'Фамилия', required: true, type: 'text', width: 'min-w-[150px]' },
            { key: 'first_name', label: 'Имя', required: true, type: 'text', width: 'min-w-[150px]' },
            { key: 'patronymic', label: 'Отчество', type: 'text', width: 'min-w-[150px]' },
            { key: 'position', label: 'Должность', type: 'text', width: 'w-[300px]' },
            { 
                key: 'company', 
                label: 'Организация', 
                type: 'relation', 
                sourceCollection: 'companies', 
                sourceKeys: ['name'], 
                multiple: false,
                width: 'min-w-[200px] max-w-[400px]' 
            },
            { key: 'email', label: 'Email', type: 'email', required: true, width: 'w-[150px]', visible: false, user_visible: false, hideOnEdit: true },
            { key: 'password', label: 'Пароль', type: 'password', required: true, width: 'w-[150px]', visible: false, user_visible: false, hideOnEdit: true },
            { key: 'passwordConfirm', label: 'Подтверждение пароля', type: 'password', required: true, width: 'w-[150px]', visible: false, user_visible: false, hideOnEdit: true },
            { key: 'global_access', label: 'Права доступа', type: 'json', visible: false, user_visible: false, hideOnEdit: true, hideOnCreate: true }
        ]
    },
    'objects_list': {
        collectionName: 'objects',
        expand: ['global_counterparty'],
        fields: [
            { key: 'name', label: 'Название', required: true, type: 'text', width: 'min-w-[200px] max-w-[350px]' },
            { 
                key: 'global_counterparty', 
                label: 'Контрагент', 
                type: 'relation', 
                sourceCollection: 'companies', 
                sourceKeys: ['name'], 
                multiple: false,
                width: 'min-w-[200px] max-w-[400px]' 
            },
            { key: 'contract', label: 'Номер договора', type: 'text', width: 'w-[180px]' },
            { key: 'contract_price', label: 'Стоимость по договору', type: 'number', user_visible: false, width: 'w-[180px]', format: 'currency' },
            { key: 'id', label: 'ID', type: 'text', width: 'w-[150px]', hideOnCreate: true, locked: true }
        ]
    },
    'projects_list': {
        collectionName: 'projects',
        expand: ['object', 'responsible_users'],
        fields: [
            { 
                key: 'object', 
                label: 'Объект', 
                required: true, 
                type: 'relation', 
                sourceCollection: 'objects', 
                sourceKeys: ['name'], 
                multiple: false,
                width: 'min-w-[200px] max-w-[400px]' 
            },
            { key: 'name', label: 'Название', required: true, type: 'text', width: 'min-w-[200px] max-w-[350px]' },
            { 
                key: 'responsible_users',
                label: 'Команда проекта',
                type: 'relation',
                sourceCollection: 'users',
                sourceKeys: ['position', 'last_name', 'first_name', 'patronymic'],
                multiple: true,
                user_visible: false,
                width: 'w-[300px]'
            },
            { 
                key: 'start_work', 
                label: 'Начало работ', 
                type: 'computed', 
                showInEdit: true,
                visible: false,
                hideOnCreate: true,
                compute: { 
                    collection: 'facts',
                    relationField: 'material.project',
                    targetField: 'date',
                    operation: 'min_date' 
                },
                width: 'w-[150px]', 
                format: 'date' 
            },
            { 
                key: 'end_work', 
                label: 'Окончание работ', 
                type: 'computed', 
                showInEdit: true,
                visible: false,
                hideOnCreate: true,
                compute: { 
                    collection: 'facts',
                    relationField: 'material.project',
                    targetField: 'date',
                    operation: 'max_date' 
                },
                width: 'w-[150px]', 
                format: 'date' 
            },
            { key: 'id', label: 'ID', type: 'text', width: 'w-[150px]', hideOnCreate: true, locked: true },
        ]
    },
    'groups_list': {
        collectionName: 'groups',
        expand: ['projects.object', 'projects'], 
        fields: [
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'formula',
                width: 'min-w-[150px] max-w-[200px]',
                formula: (row) => {
                    const projs = row.expand?.projects;
                    if (Array.isArray(projs) && projs.length > 0) {
                        return projs[0].expand?.object?.name || '—';
                    }
                    return '—';
                }
            },
            { 
                key: 'helper_object',
                label: 'Объект', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true, 
                visible: false, 
                autoFillPath: 'expand.projects.0.expand.object.name', 
                multiple: false
            },
            {
                key: 'projects', 
                label: 'Проекты', 
                required: true, 
                type: 'relation', 
                sourceCollection: 'projects', 
                sourceKeys: ['name'], 
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',  
                multiple: true,
                width: 'min-w-[100px] max-w-[250px]'
            },
            { key: 'name', label: 'Название группы', required: true, type: 'text', width: 'min-w-[200px] max-w-[400px]' },
            { key: 'id', label: 'ID', type: 'text', width: 'w-[150px]', hideOnCreate: true, locked: true }
        ]
    },
    'materials_list': {
        collectionName: 'materials',
        expand: ['project', 'project.object'], 
        fields: [
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'nested',
                path: 'expand.project.expand.object.name',
                width: 'min-w-[150px] max-w-[200px]'
            },
            { 
                key: 'helper_object',
                label: 'Фильтр по Объекту', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true, 
                visible: false, 
                autoFillPath: 'expand.project.expand.object.name', 
                multiple: false
            },
            {
                key: 'project', 
                label: 'Проект', 
                type: 'relation', 
                required: true, 
                sourceCollection: 'projects', 
                sourceKeys: ['name'], 
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',  
                multiple: false,
                width: 'min-w-[150px] max-w-[300px]'
            },
            { key: 'name', label: 'Название материала', required: true, type: 'text', width: 'min-w-[200px] max-w-[400px]' },
            { key: 'replacement', label: 'Замена/аналог', type: 'text', width: 'min-w-[200px] max-w-[400px]' },
            { key: 'unit', label: 'Ед. изм.', required: true, type: 'text', width: 'w-[100px]' },
            { key: 'quantity_spec', label: 'Кол-во по спец-ции', required: true, type: 'number', width: 'w-[150px]', format: "decimal3" },
            { 
                key: 'quantity_supply', 
                label: 'Кол-во по ЖВК', 
                type: 'computed', 
                showInEdit: true,
                visible: false,
                hideOnCreate: true,
                compute: { 
                    collection: 'supply',
                    relationField: 'material',
                    targetField: 'quantity',
                    operation: 'sum' 
                },
                format: 'decimal3' 
            },
            { 
                key: 'quantity_fact', 
                label: 'Кол-во по ЖРМ', 
                type: 'computed', 
                showInEdit: true,
                visible: false,
                hideOnCreate: true,
                compute: { 
                    collection: 'facts',
                    relationField: 'material', 
                    targetField: 'quantity',
                    operation: 'sum' 
                },
                format: 'decimal3' 
            },
            { 
                key: 'remainder', 
                label: 'Остаток', 
                type: 'formula',
                showInEdit: true,
                visible: false,
                hideOnCreate: true,
                format: 'decimal3',
                formula: (row, allRows, app) => {
                    // Используем app.parseNumber, так как данные в окне редактирования уже отформатированы с пробелами
                    const spec = app ? app.parseNumber(row.quantity_spec) : (Number(row.quantity_spec) || 0);
                    const fact = app ? app.parseNumber(row.quantity_fact) : (Number(row.quantity_fact) || 0);
                    return spec - fact;
                }
            }
        ]
    },
    'inj': {
        collectionName: 'supply',
        expand: ['material', 'material.project', 'material.project.object', 'author'],
        fields: [
            { key: 'supply_date', label: 'Дата', required: true, type: 'date', width: 'w-[120px]', format: 'date' },
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'nested',
                path: 'expand.material.expand.project.expand.object.name',
                width: 'min-w-[150px] max-w-[300px]'
            },
            { 
                key: 'project_name',
                label: 'Проект', 
                type: 'nested',
                path: 'expand.material.expand.project.name',
                width: 'min-w-[150px] max-w-[200px]'
            },
            { 
                key: 'helper_object',
                label: 'Фильтр по Объекту', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true,
                visible: false,
                autoFillPath: 'expand.material.expand.project.expand.object.name',
                multiple: false
            },
            { 
                key: 'helper_project',
                label: 'Фильтр по Проекту', 
                type: 'relation',
                sourceCollection: 'projects',
                sourceKeys: ['name'],
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',
                virtual: true,
                visible: false,
                autoFillPath: 'expand.material.expand.project.name',
                multiple: false
            },
            {
                key: 'items',
                label: 'Материалы и количество',
                type: 'repeating_group',
                fields: [
                    {
                        key: 'material', 
                        label: 'Материал', 
                        required: true, 
                        type: 'relation', 
                        sourceCollection: 'materials', 
                        sourceKeys: ['name'], 
                        dependsOn: 'helper_project', 
                        dependsOnTarget: 'project',
                        multiple: false,
                        width: 'w-[350px]',
                    },
                    { key: 'quantity', label: 'Кол-во', required: true, type: 'number', width: 'w-[120px]', format: 'decimal3' },
                ]
            },
            { 
                key: 'unit_name',
                label: 'Ед. изм.', 
                type: 'nested',
                path: 'expand.material.unit',
                width: 'w-[100px]'
            },
            /*
            { 
                key: 'remainder', 
                label: 'Остаток', 
                type: 'formula',
                width: 'w-[120px]', 
                format: 'decimal3',
                formula: (row, allRows) => {
                    const totalSpec = Number(row.expand?.material?.quantity_spec) || 0;
                    const totalDelivered = allRows
                        .filter(r => r.material === row.material)
                        .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
                    return totalSpec - totalDelivered;
                }
            },
            */
            {
                key: 'supplier',
                label: 'Поставщик',
                type: 'text',
                width: 'w-[200px]'
            },
            {
                key: 'doc_data',
                label: 'Наименование и номер документа изготовителя',
                type: 'text',
                width: 'w-[200px]'
            },
            {
                key: 'inspection_result',
                label: 'Результат проверки документов и визуального осмотра',
                type: 'text',
                width: 'w-[200px]'
            },
            {
                key: 'is_lab_required',
                label: 'Решение о необходимости проведения лабораторного контроля',
                type: 'text',
                width: 'w-[200px]'
            },
            {
                key: 'lab_result',
                label: 'Результат лабораторного контроля',
                type: 'text',
                width: 'w-[200px]'
            },
            { 
                key: 'author', 
                label: 'Автор', 
                type: 'relation', 
                sourceCollection: 'users', 
                sourceKeys: ['position', 'last_name', 'first_name'], 
                multiple: false,
                width: 'w-[300px]',
                readonly: true
            }
        ]
    },
    'work_progress_report': {
        collectionName: 'facts',
        expand: ['material', 'material.project', 'material.project.object', 'user'],
        fields: [
            { key: 'date', label: 'Дата', required: true, type: 'date', width: 'w-[120px]', format: 'date' },
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'nested',
                path: 'expand.material.expand.project.expand.object.name',
                width: 'min-w-[150px] max-w-[300px]'
            },
            { 
                key: 'project_name',
                label: 'Проект', 
                type: 'nested',
                path: 'expand.material.expand.project.name',
                width: 'min-w-[150px] max-w-[200px]'
            },
            { 
                key: 'helper_object',
                label: 'Фильтр по Объекту', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true,
                visible: false,
                autoFillPath: 'expand.material.expand.project.expand.object.name',
                multiple: false
            },
            { 
                key: 'helper_project',
                label: 'Фильтр по Проекту', 
                type: 'relation',
                sourceCollection: 'projects',
                sourceKeys: ['name'],
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',
                virtual: true,
                visible: false,
                autoFillPath: 'expand.material.expand.project.name',
                multiple: false
            },
            {
                key: 'items',
                label: 'Материалы и расход',
                type: 'repeating_group',
                fields: [
                    {
                        key: 'material', 
                        label: 'Материал', 
                        required: true, 
                        type: 'relation', 
                        sourceCollection: 'materials', 
                        sourceKeys: ['name'], 
                        dependsOn: 'helper_project', 
                        dependsOnTarget: 'project',
                        multiple: false,
                        width: 'w-[350px]',
                    },
                    { key: 'quantity', label: 'Кол-во', required: true, type: 'number', width: 'w-[120px]', format: 'decimal3' }
                ]
            },
            { 
                key: 'unit_name',
                label: 'Ед. изм.', 
                type: 'nested',
                path: 'expand.material.unit',
                width: 'w-[100px]'
            },
            /*
            { 
                key: 'remainder', 
                label: 'Остаток', 
                type: 'formula',
                width: 'w-[120px]', 
                format: 'decimal3',
                formula: (row, allRows) => {
                    const totalSpec = Number(row.expand?.material?.quantity_spec) || 0;
                    const totalDelivered = allRows
                        .filter(r => r.material === row.material)
                        .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
                    return totalSpec - totalDelivered;
                }
            },
            */
            { 
                key: 'user', 
                label: 'Автор', 
                type: 'relation', 
                sourceCollection: 'users', 
                sourceKeys: ['last_name', 'first_name'], 
                multiple: false,
                width: 'w-[200px]',
                readonly: true
            }
        ]
    },
    'doc_status_log': {
        collectionName: 'doc_status_log',
        expand: ['project', 'project.object', 'responsible_user', 'responsible_company', 'contact', 'contact.company'],
        fields: [
            { key: 'updated', label: 'Дата изменения', required: true, type: 'date', width: 'w-[150px]', format: 'date' },
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'nested',
                path: 'expand.project.expand.object.name',
                width: 'min-w-[150px] max-w-[300px]'
            },
            { 
                key: 'helper_object',
                label: 'Фильтр по Объекту', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true, 
                visible: false, 
                autoFillPath: 'expand.project.expand.object.name', 
                multiple: false
            },
            {
                key: 'project', 
                label: 'Проект', 
                type: 'relation', 
                required: true, 
                sourceCollection: 'projects', 
                sourceKeys: ['name'], 
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',  
                multiple: false,
                width: 'min-w-[150px] max-w-[200px]'
            },
            { key: 'status', label: 'Статус', required: true, type: 'select', options: ['Черновик', 'Формирование', 'На проверке', 'Замечания', 'На подписании', 'Подписано'], width: 'min-w-[150px] max-w-[200px]' },
            {
                key: 'contact', 
                label: 'Согласующий', 
                type: 'relation', 
                sourceCollection: 'contacts', 
                sourceKeys: ['position', 'expand.company.name', 'last_name', 'first_name'], 
                sourceExpand: 'company',
                multiple: false,
                width: 'w-[300px]'
            },
            {
                key: 'responsible_company', 
                label: 'Исполнительная организация', 
                type: 'relation', 
                sourceCollection: 'companies', 
                sourceKeys: ['name'], 
                multiple: false,
                width: 'w-[300px]'
            },
            {
                key: 'responsible_user', 
                label: 'Исполнитель', 
                type: 'relation', 
                sourceCollection: 'users', 
                sourceKeys: ['position', 'last_name', 'first_name'], 
                multiple: false,
                width: 'w-[300px]'
            },
            { key: 'signed_by', label: 'Кем подписано', type: 'text', width: 'w-[400px]' },
            { key: 'comment', label: 'Комментарий', type: 'text', width: 'w-[400px]' }
        ]
    },
    'general_work_log': {
        collectionName: 'general_work_log',
        expand: ['project', 'project.object', 'responsible'],
        fields: [
            { key: 'date', label: 'Дата', required: true, type: 'date', width: 'w-[150px]', format: 'date' },
            { 
                key: 'object_name',
                label: 'Объект', 
                type: 'nested',
                path: 'expand.project.expand.object.name',
                width: 'min-w-[150px] max-w-[300px]'
            },
            { 
                key: 'helper_object',
                label: 'Фильтр по Объекту', 
                type: 'relation',
                sourceCollection: 'objects',
                sourceKeys: ['name'],
                virtual: true, 
                visible: false, 
                autoFillPath: 'expand.project.expand.object.name', 
                multiple: false
            },
            {
                key: 'project', 
                label: 'Проект', 
                type: 'relation', 
                required: true, 
                sourceCollection: 'projects', 
                sourceKeys: ['name'], 
                dependsOn: 'helper_object', 
                dependsOnTarget: 'object',  
                multiple: false,
                width: 'min-w-[150px] max-w-[200px]'
            },
            { key: 'condition', label: 'Условие выполнения работ', required: true, type: 'text', width: 'w-[150px]' },
            { key: 'name', label: 'Наименование работ', required: true, type: 'text', width: 'w-[400px]' },
            {
                key: 'responsible', 
                label: 'Ответственный', 
                type: 'relation', 
                sourceCollection: 'users', 
                sourceKeys: ['last_name', 'first_name'], 
                multiple: false,
                width: 'w-[200px]',
                readonly: true
            }
        ]
    }
};

const EXPORT_CONFIG = {
    'inj': {
        template: 'templates/inj_template.docx',
        prepareData: (data) => {
            // 1. Группируем записи по названию объекта
            const grouped = data.reduce((acc, row) => {
                const key = row.object_name || 'Без объекта';
                if (!acc[key]) acc[key] = [];
                acc[key].push(row);
                return acc;
            }, {});

            // 2. Формируем массив групп
            const groups = Object.entries(grouped).map(([objectName, records]) => {
                
                // Ищем первую и последнюю даты для титульного листа
                const dates = records
                    .map(r => new Date(r.supply_date))
                    .filter(d => !isNaN(d.getTime()));

                const minDate = dates.length ? new Date(Math.min(...dates)).toLocaleDateString('ru-RU') : '—';
                const maxDate = dates.length ? new Date(Math.max(...dates)).toLocaleDateString('ru-RU') : '—';

                // 3. Форматируем данные каждой записи перед отправкой в шаблон
                const formattedRecords = records.map(record => {
                    let formattedDate = record.supply_date;
                    
                    // Преобразуем строку вида 2026-06-22 00:00:00.000Z в 22.06.2026
                    if (record.supply_date) {
                        const dateObj = new Date(record.supply_date);
                        if (!isNaN(dateObj.getTime())) {
                            formattedDate = dateObj.toLocaleDateString('ru-RU');
                        }
                    }

                    // Возвращаем копию записи с замененной датой
                    return {
                        ...record,
                        supply_date: formattedDate
                    };
                });

                return {
                    object_name: objectName,
                    start_date: minDate,
                    end_date: maxDate,
                    records: formattedRecords // Передаем отформатированные записи
                };
            });

            return { groups: groups }; 
        }
    }
};

const buildCollectionMap = () => Object.keys(MODELS).reduce((acc, key) => ({ ...acc, [key]: MODELS[key].collectionName }), {});

const buildBaseColumnsConfig = () => {
    let config = {};
    for (let key in MODELS) {
        let cols = [];
        MODELS[key].fields.forEach(f => {
            // ИСКЛЮЧАЕМ виртуальные поля и поля, предназначенные ТОЛЬКО для окна редактирования
            if (f.virtual || f.showInEdit) return; 
            
            const pushCol = (fieldDef) => {
                cols.push({
                    key: fieldDef.key,
                    label: fieldDef.label,
                    type: fieldDef.type || 'text',
                    width: fieldDef.width || 'w-[150px]',
                    visible: fieldDef.visible !== false,
                    user_visible: fieldDef.user_visible !== false,
                    filterType: fieldDef.filterType || 'contains',
                    filterValue: '',
                    draftFilterType: fieldDef.filterType || 'contains',
                    draftFilterValue: '',
                    format: fieldDef.format || 'raw'
                });
            };

            if (f.type === 'repeating_group') {
                f.fields.forEach(sf => pushCol(sf));
            } else {
                pushCol(f);
            }
        });
        config[key] = cols;
    }
    return config;
};

const buildEditConfig = () => {
    let config = {};
    for (let key in MODELS) {
        config[key] = MODELS[key].fields
            // Пропускаем обычные поля ИЛИ те, у которых есть флаг showInEdit
            .filter(f => f.showInEdit || (f.type !== 'computed' && f.type !== 'nested' && f.type !== 'formula' && !f.readonly)) 
            .map(f => {
                if (f.type === 'repeating_group') {
                    return {
                        key: f.key,
                        label: f.label,
                        type: 'repeating_group',
                        user_visible: f.user_visible !== false,
                        fields: f.fields.map(sf => ({
                            key: sf.key,
                            label: sf.label,
                            type: sf.type || 'text',
                            multiple: sf.multiple || false,
                            sourceCollection: sf.sourceCollection || null,
                            sourceKeys: sf.sourceKeys || null,
                            sourceExpand: sf.sourceExpand || null,
                            dependsOn: sf.dependsOn || null,
                            dependsOnTarget: sf.dependsOnTarget || null,
                            format: sf.format || 'raw',
                            required: sf.required || false,
                            options: sf.options || [],
                            user_visible: sf.user_visible !== false,
                            hideOnEdit: f.hideOnEdit || false,
                            hideOnCreate: f.hideOnCreate || false,
                            locked: f.locked || false,
                            _rawRecords: []
                        }))
                    };
                }
                return {
                    key: f.key,
                    label: f.label,
                    // Превращаем вычисляемые поля в "числа" для корректной отрисовки инпута в HTML
                    type: (f.type === 'computed' || f.type === 'formula') ? 'number' : (f.type || 'text'),
                    multiple: f.multiple || false,
                    sourceCollection: f.sourceCollection || null,
                    sourceKeys: f.sourceKeys || null,
                    sourceExpand: f.sourceExpand || null,
                    dependsOn: f.dependsOn || null,
                    dependsOnTarget: f.dependsOnTarget || null, 
                    virtual: f.virtual || false, 
                    autoFillPath: f.autoFillPath || null, 
                    format: f.format || 'raw',
                    required: f.required || false, 
                    options: f.options || [],
                    user_visible: f.user_visible !== false,
                    hideOnEdit: f.hideOnEdit || false,
                    hideOnCreate: f.hideOnCreate || false,
                    // Блокируем поле, если оно вычисляемое
                    locked: f.locked || f.showInEdit || false,
                    compute: f.compute || null, 
                    formula: f.formula || null, 
                    _rawRecords: [] 
                };
            });
    }
    return config;
};
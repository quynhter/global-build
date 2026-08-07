document.addEventListener('alpine:init', () => {
    Alpine.data('sidebarMenu', () => ({
        
        /*
        Состояние
        */
        activeMenu: localStorage.getItem('activeMenu') || null,
        activeSub: localStorage.getItem('activeSub') || null,
        openGroup: localStorage.getItem('openGroup') || null,
        isDark: localStorage.getItem('theme') === 'dark',

        collectionMap: buildCollectionMap(),
        baseColumnsConfig: buildBaseColumnsConfig(),
        editConfig: buildEditConfig(),
        
        dataSources: Object.keys(MODELS).reduce((acc, key) => ({ ...acc, [key]: [] }), {}),

        isAuth: pb.authStore.isValid,
        currentUser: pb.authStore.model || {},
        authEmail: '', authPassword: '', authError: '',
        isLoggingIn: false,
        allowedObjectIds: [], 

        showPasswordWindow: false,
        passOld: '', passNew: '', passConfirm: '', passError: '',

        showAccessWindow: false,
        accessData: [],

        searchQuery: '', searchInput: '',
        currentPage: 1, perPage: localStorage.getItem('perPage') || 25,
        isPaginatingLeft: false, isPaginatingRight: false,
        isFiltering: false, isSearching: false, isSaving: false,
        showTableSetting: false, showItemEdit: false, showDeleteWindow: false, showImportWindow: false,
        selectedRows: [], userSortKey: null, userSortDir: null,
        editingItem: null, isCreating: false, isLoading: false, loadingEditId: null,
        isExporting: false, isSavingAccess: false, isDownloadingAct: false,
        originalGroupedIds: [],
        importData: [], importColumns: [], importMapping: {},
        
        dialog: { show: false, title: '', message: '', type: 'alert', onConfirm: null, onCancel: null, isLoading: false },

        feedData: [],
        feedPage: 1,
        feedHasMore: true,
        isFeedLoading: false,
        feedDateFrom: '',
        feedDateTo: '',

        gprSelectedObject: '',
        gprObjects: [],
        gprData: [],
        isGprLoading: false,
        gprDisplayMode: 'number', // Может быть 'number' или 'percent'

        // ==========================================
        // 2. ВЫЧИСЛЯЕМЫЕ СВОЙСТВА (GETTERS)
        // ==========================================
        get userAccess() {
            let ga = this.currentUser?.global_access;
            if (!ga) return {};
            if (typeof ga === 'object') return ga;
            try { return JSON.parse(ga); } catch(e) { return {}; }
        },

        get columnsConfig() {
            let userConfig = {};
            const isAdmin = this.currentUser.role === 'admin';
            const globalAccess = this.userAccess;

            for (let key in this.baseColumnsConfig) {
                const cName = this.collectionMap[key];
                const collAccess = globalAccess[cName] || {};
                const hasFullCols = isAdmin || collAccess.view_all_columns === true;

                userConfig[key] = this.baseColumnsConfig[key].filter(col => {
                    if (hasFullCols) return true;
                    return col.user_visible; 
                });
            }
            return userConfig;
        },

        get currentEditSchema() { 
            const schema = this.editConfig[this.activeSub] || []; 
            if (!this.currentUser) return schema;
            
            const isAdmin = this.currentUser.role === 'admin';
            const cName = this.collectionMap[this.activeSub];
            const collAccess = this.userAccess[cName] || {};
            const hasFullCols = isAdmin || collAccess.view_all_columns === true;

            return schema.filter(f => hasFullCols || f.user_visible).map(f => {
                if (f.type === 'repeating_group') {
                    return {
                        ...f,
                        fields: f.fields.filter(sf => hasFullCols || sf.user_visible)
                    };
                }
                return f;
            });
        },

        get currentImportSchema() { 
            const schema = this.currentEditSchema;
            let flatSchema = [];
            schema.forEach(field => {
                // Если это группа - вытаскиваем поля из нее, чтобы в импорте они были на одном уровне
                if (field.type === 'repeating_group') {
                    field.fields.forEach(sf => {
                        if (!sf.readonly && !sf.virtual && sf.type !== 'computed' && sf.type !== 'formula' && !sf.locked) {
                            flatSchema.push(sf);
                        }
                    });
                } else if (!field.readonly && !field.virtual && field.type !== 'computed' && field.type !== 'formula' && !field.locked) {
                    // ДОБАВЛЕНО: && !field.locked
                    flatSchema.push(field);
                }
            });
            return flatSchema;
        },
        
        get userFullName() {
            const u = this.currentUser;
            const fio = [u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ');
            return fio || u.name || u.username || 'Пользователь';
        },

        get userInitial() {
            const u = this.currentUser;
            const source = u.first_name || u.last_name || u.name || u.username || 'П';
            return source.charAt(0).toUpperCase();
        },

        get currentRawData() { return this.dataSources[this.activeSub] || []; },
        get currentColumns() { return this.columnsConfig[this.activeSub]?.filter(col => col.visible) || []; },
        get isFilterActive() { return (this.columnsConfig[this.activeSub] || []).some(c => c.filterType === 'not_empty' || (c.filterValue && String(c.filterValue).trim() !== '')); },
        get tableStatus() {
            if (this.isLoading) return 'loading';
            if (!this.columnsConfig[this.activeSub]) return 'placeholder';
            if (this.totalItems === 0) return 'empty';
            return 'loaded';
        },
        get totalItems() { return this.processedData.length; },
        get totalPages() { return Math.ceil(this.totalItems / this.perPage) || 1; },
        get currentData() { const s = (this.currentPage - 1) * this.perPage; return this.processedData.slice(s, s + parseInt(this.perPage)); },
        
        get processedData() {
            let data = [...this.currentRawData];

            if (this.searchQuery) {
                const searchRegex = this.createSearchRegex(this.searchQuery);
                const activeCols = this.columnsConfig[this.activeSub] || [];

                data = data.filter(row => {
                    return activeCols.some(col => {
                        const rawVal = row[col.key];
                        const formattedVal = String(this.formatValue(rawVal, col.format) || '');
                        return searchRegex.test(formattedVal);
                    });
                });
            }

            const activeCols = this.columnsConfig[this.activeSub] || [];
            activeCols.forEach(col => {
                if (col.filterType === 'not_empty' || (col.filterValue && String(col.filterValue).trim() !== '')) {
                    const fVal = String(col.filterValue).trim();
                    const filterRegex = this.createSearchRegex(fVal);

                    data = data.filter(row => {
                        const rawVal = row[col.key];

                        if (col.filterType === 'not_empty') {
                            if (Array.isArray(rawVal)) return rawVal.length > 0;
                            return rawVal !== null && rawVal !== undefined && rawVal !== '';
                        }

                        const formattedVal = String(this.formatValue(rawVal, col.format) || '');

                        if (col.filterType === 'contains') return filterRegex.test(formattedVal);
                        if (col.filterType === 'equals') {
                            const exactRegex = new RegExp('^' + filterRegex.source + '$', 'i');
                            return exactRegex.test(formattedVal);
                        }

                        if (col.filterType === 'less' || col.filterType === 'greater') {
                            if (col.format === 'date' || col.type === 'date') {
                                const cellDate = new Date(rawVal).getTime();
                                let filtDate = new Date(fVal.split('.').reverse().join('-')).getTime();
                                if (isNaN(filtDate)) filtDate = new Date(fVal).getTime();

                                if (!isNaN(cellDate) && !isNaN(filtDate)) {
                                    return col.filterType === 'less' ? cellDate < filtDate : cellDate > filtDate;
                                }
                                return false; 
                            } 
                            else {
                                const cleanRaw = String(rawVal).replace(/[\s\xa0\u202f]/g, '').replace(',', '.');
                                const cleanFilt = String(fVal).replace(/[\s\xa0\u202f]/g, '').replace(',', '.');
                                const nCell = Number(cleanRaw); 
                                const nFilt = Number(cleanFilt);

                                if (!isNaN(nCell) && !isNaN(nFilt)) {
                                    return col.filterType === 'less' ? nCell < nFilt : nCell > nFilt;
                                }
                                return col.filterType === 'less' ? String(rawVal).toLowerCase() < fVal.toLowerCase() : String(rawVal).toLowerCase() > fVal.toLowerCase();
                            }
                        }
                        return true;
                    });
                }
            });

            const colKeys = activeCols.map(c => c.key);
            data.sort((a, b) => {
                if (this.userSortKey && this.userSortDir) {
                    const vA = String(a[this.userSortKey] || ''); const vB = String(b[this.userSortKey] || '');
                    if (vA !== vB) return this.userSortDir === 'asc' ? vA.localeCompare(vB, 'ru', { numeric: true }) : vB.localeCompare(vA, 'ru', { numeric: true });
                }
                for (let k of colKeys) {
                    if (k === this.userSortKey && this.userSortDir) continue;
                    const vA = String(a[k] || ''); const vB = String(b[k] || '');
                    if (vA !== vB) return vA.localeCompare(vB, 'ru', { numeric: true });
                }
                return 0;
            });
            
            return data;
        },

        get currentTitle() { return MENU_TITLES[this.activeSub] || MENU_TITLES[this.activeMenu] },

        get processedFeedData() {
            let data = this.feedData;
            if (this.searchQuery) {
                const regex = this.createSearchRegex(this.searchQuery);
                data = data.filter(item => {
                    // Очищаем HTML-теги для точного поиска по тексту
                    const cleanContent = item.content.replace(/<[^>]+>/g, '');
                    const searchStr = `${item.typeTitle} ${item.dateFormatted} ${cleanContent}`;
                    return regex.test(searchStr);
                });
            }
            return data;
        },

        // ==========================================
        // 3. ИНИЦИАЛИЗАЦИЯ (LIFECYCLE)
        // ==========================================
        init() {
            if (this.isDark) document.documentElement.classList.add('dark');
            const appLoader = document.getElementById('app-loader');
            if (appLoader) appLoader.remove();
            
            this.$watch('activeMenu', val => { 
                if (val === null) {
                    localStorage.removeItem('activeMenu');
                } else { 
                    localStorage.setItem('activeMenu', val); 
                    if (val === 'feed' && this.feedData.length === 0) {
                        this.loadFeed(true);
                    }
                }
            });

            this.$watch('activeSub', val => { 
                if (val === null) {
                    localStorage.removeItem('activeSub');
                } else { 
                    localStorage.setItem('activeSub', val); 
                    this.dataSources[val] = [];
                    this.loadFiltersFromStorage(val);
                    
                    // ЕСЛИ ЭТО ГПР — ГРУЗИМ ОБЪЕКТЫ
                    if (val === 'gpr') {
                        if (this.gprObjects.length === 0) {
                            this.loadGprObjects();
                        }
                    } else {
                        this.fetchData(); 
                    }
                }
            });
            
            this.$watch('openGroup', val => { 
                if (val === null) {
                    localStorage.removeItem('openGroup');
                } else { 
                    localStorage.setItem('openGroup', val); 
                }
            });

            this.$watch('perPage', (val) => { localStorage.setItem('perPage', val); this.currentPage = 1; this.selectedRows = []; });
            this.$watch('currentPage', () => { this.selectedRows = []; });
            
            if (this.isAuth) {
                this.allowedObjectIds = [];
                Object.keys(this.dataSources).forEach(k => this.dataSources[k] = []);
                
                pb.collection('users').authRefresh().then((authData) => {
                    this.currentUser = authData.record; 
                    return this.cacheUserAccess();
                }).then(() => {
                    if (this.activeSub === 'gpr') {
                        this.loadGprObjects();
                    } else if (this.activeSub) {
                        this.loadFiltersFromStorage(this.activeSub);
                        this.fetchData();
                    } else if (this.activeMenu === 'feed') {
                        this.loadFeed(true);
                    }
                }).catch(() => {
                    this.logout();
                });
            }
        },

        // ==========================================
        // 4. АВТОРИЗАЦИЯ И ПРАВА ДОСТУПА
        // ==========================================
        async login() {
            if (this.isLoggingIn) return; // Блокируем повторные клики
            
            this.authError = '';
            this.isLoggingIn = true; // Включаем спиннер
            
            try {
                const authData = await pb.collection('users').authWithPassword(this.authEmail, this.authPassword);
                this.isAuth = pb.authStore.isValid;
                this.currentUser = authData.record; 
                this.authEmail = ''; this.authPassword = '';
                
                // Очищаем кэш после предыдущего юзера
                this.allowedObjectIds = [];
                Object.keys(this.dataSources).forEach(k => this.dataSources[k] = []);
                
                await this.cacheUserAccess();
                if (this.activeSub) this.fetchData();
            } catch (err) { 
                this.authError = 'Неверный логин или пароль'; 
            } finally {
                this.isLoggingIn = false; // Выключаем спиннер
            }
        },

        logout() {
            pb.authStore.clear();
            this.isAuth = false;
            this.currentUser = {};
            this.activeMenu = null; 
            this.activeSub = null;
            Object.keys(this.dataSources).forEach(k => this.dataSources[k] = []);
            this.allowedObjectIds = []; 
        },

        openPasswordWindow() {
            this.passOld = '';
            this.passNew = '';
            this.passConfirm = '';
            this.passError = '';
            this.showPasswordWindow = true;
        },
        
        closePasswordWindow() {
            this.showPasswordWindow = false;
        },
        
        async changePassword() {
            this.passError = '';
            
            if (!this.passOld || !this.passNew || !this.passConfirm) {
                this.passError = 'Пожалуйста, заполните все поля.';
                return;
            }
            if (this.passNew !== this.passConfirm) {
                this.passError = 'Новые пароли не совпадают.';
                return;
            }
            if (this.passNew.length < 8) {
                this.passError = 'Новый пароль должен быть не менее 8 символов.';
                return;
            }

            try {
                await pb.collection('users').update(this.currentUser.id, {
                    oldPassword: this.passOld,
                    password: this.passNew,
                    passwordConfirm: this.passConfirm
                });
                
                this.closePasswordWindow();
                this.logout();
                this.openDialog('Успех', 'Ваш пароль успешно изменен! Пожалуйста, войдите в систему с новым паролем.', 'alert');
            } catch (err) {
                console.error("Ошибка при смене пароля:", err);
                
                if (err.status === 400) {
                    this.passError = 'Текущий пароль указан неверно.';
                } else if (err.status === 404) {
                    this.closePasswordWindow();
                    this.logout();
                    this.openDialog('Сессия устарела', 'Ваш токен больше недействителен (вероятно, пароль уже был изменен). Пожалуйста, войдите заново.', 'alert');
                } else {
                    this.passError = 'Произошла ошибка на сервере.';
                }
            }
        },

        openAccessWindow() {
            if (!this.editingItem) return;
            const currentGlobalAccess = typeof this.editingItem.global_access === 'string'
                ? JSON.parse(this.editingItem.global_access || '{}')
                : (this.editingItem.global_access || {});

            this.accessData = [];
            const processedCollections = new Set();

            Object.keys(MODELS).forEach(subKey => {
                const collName = MODELS[subKey].collectionName;
                if (!processedCollections.has(collName)) {
                    processedCollections.add(collName);
                    this.accessData.push({
                        collectionName: collName,
                        title: MENU_TITLES[subKey] || collName,
                        rights: {
                            create: currentGlobalAccess[collName]?.create || false,
                            delete: currentGlobalAccess[collName]?.delete || false,
                            update: currentGlobalAccess[collName]?.update || false,
                            import_export: currentGlobalAccess[collName]?.import_export || false,
                            view_all_items: currentGlobalAccess[collName]?.view_all_items || false,
                            view_all_columns: currentGlobalAccess[collName]?.view_all_columns || false,
                        }
                    });
                }
            });

            if (!processedCollections.has('gpr')) {
                this.accessData.push({
                    collectionName: 'gpr',
                    title: MENU_TITLES['gpr'] || 'График производства работ',
                    rights: {
                        create: false,
                        delete: false,
                        update: currentGlobalAccess['gpr']?.update || false,
                        import_export: currentGlobalAccess['gpr']?.import_export || false,
                        view_all_items: currentGlobalAccess['gpr']?.view_all_items || false,
                        view_all_columns: false,
                    }
                });
            }

            this.showAccessWindow = true;
        },
        
        closeAccessWindow() { this.showAccessWindow = false; },

        exportAccessToJSON() {
            if (!this.editingItem || !this.editingItem.id) return;
            
            // Собираем текущие права в чистый объект
            const accessObj = {};
            this.accessData.forEach(item => {
                accessObj[item.collectionName] = item.rights;
            });
            
            // Формируем JSON и скачиваем
            const blob = new Blob([JSON.stringify(accessObj, null, 2)], { type: 'application/json' });
            const fileName = `${this.editingItem.id}_access.json`;
            
            if (typeof window.saveAs !== 'undefined') {
                window.saveAs(blob, fileName);
            } else {
                // Запасной вариант скачивания, если FileSaver недоступен
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                link.click();
                URL.revokeObjectURL(link.href);
            }
        },

        importAccessFromJSON(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    // Безопасно обновляем галочки
                    this.accessData.forEach(item => {
                        if (importedData[item.collectionName]) {
                            const importedRights = importedData[item.collectionName];
                            
                            Object.keys(item.rights).forEach(key => {
                                if (importedRights[key] !== undefined) {
                                    item.rights[key] = !!importedRights[key];
                                }
                            });
                        }
                    });
                    
                    this.openDialog('Импорт завершен', 'Права успешно загружены из файла. Нажмите «Сохранить», чтобы применить их к пользователю.', 'alert');
                } catch (error) {
                    console.error("Ошибка парсинга JSON:", error);
                    this.openDialog('Ошибка', 'Не удалось прочитать файл. Убедитесь, что это корректный файл JSON.', 'alert');
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        },

        async saveAccess() {
            this.isSavingAccess = true;
            try {
                const accessObj = {};
                this.accessData.forEach(item => {
                    accessObj[item.collectionName] = item.rights;
                });
                
                await pb.collection('users').update(this.editingItem.id, { global_access: accessObj });
                this.editingItem.global_access = accessObj; 
                this.showAccessWindow = false;
                this.openDialog('Успех', 'Права доступа успешно обновлены.', 'alert');
            } catch (err) {
                console.error(err);
                this.openDialog('Ошибка', 'Не удалось сохранить права доступа.', 'alert');
            } finally {
                this.isSavingAccess = false;
            }
        },

        hasAccess(action) {
            if (!this.currentUser) return false;
            if (this.currentUser.role === 'admin') return true;

            const collectionName = this.collectionMap[this.activeSub] || this.activeSub; // Добавлен фолбэк
            if (!collectionName) return false;

            const access = this.userAccess; 
            const collAccess = access[collectionName] || {};

            return collAccess[action] === true;
        },

        buildAccessFilter(colName) {
            if (!this.currentUser || this.currentUser.role === 'admin') return '';
            
            const access = this.userAccess; 
            const collAccess = access[colName] || {};
            
            if (collAccess.view_all_items === true) return '';
            
            const uid = this.currentUser.id;
            
            if (colName === 'projects') return `responsible_users ~ "${uid}"`;
            if (colName === 'materials' || colName === 'doc_status_log') return `project.responsible_users ~ "${uid}"`;
            if (colName === 'groups') return `projects.responsible_users ~ "${uid}"`;
            if (colName === 'supply' || colName === 'facts') return `material.project.responsible_users ~ "${uid}"`;
            
            if (colName === 'objects') {
                if (this.allowedObjectIds.length > 0) {
                    return this.allowedObjectIds.map(id => `id="${id}"`).join('||');
                }
                return `id="NONE"`;
            }
            
            return ''; 
        },

        async cacheUserAccess() {
            if (this.currentUser && this.currentUser.role !== 'admin') {
                try {
                    const projAccess = this.userAccess['projects'] || {};
                    let filterStr = `responsible_users ~ "${this.currentUser.id}"`;
                    
                    // Если пользователь может видеть ВСЕ проекты, то мы убираем фильтр по проектам, 
                    // чтобы он мог видеть и привязанные к ним Объекты!
                    if (projAccess.view_all_items === true) {
                        filterStr = ''; 
                    }

                    const reqOptions = { fields: 'id,object', requestKey: null };
                    if (filterStr) reqOptions.filter = filterStr;

                    const projs = await pb.collection('projects').getFullList(reqOptions);
                    this.allowedObjectIds = [...new Set(projs.map(p => p.object).filter(Boolean))];
                } catch(e) { console.error("Ошибка кэширования доступа", e); }
            }
        },

        // ==========================================
        // 5. ИНТЕРФЕЙС, НАВИГАЦИЯ И ДИАЛОГИ
        // ==========================================

        openDialog(title, message, type = 'alert', onConfirm = null, onCancel = null) {
            this.dialog = { show: true, title, message, type, onConfirm, onCancel, isLoading: false };
        },

        closeDialog() { this.dialog.show = false; },

        async confirmDialog() { 
            if (this.dialog.onConfirm) {
                this.dialog.isLoading = true;
                try {
                    await this.dialog.onConfirm();
                } catch (e) {
                    console.error(e);
                } finally {
                    this.dialog.isLoading = false;
                }
            } 
            this.closeDialog(); 
        },

        cancelDialog() { if (this.dialog.onCancel) this.dialog.onCancel(); this.closeDialog(); },

        openTableSettings() {
            if(this.columnsConfig[this.activeSub]) {
                this.columnsConfig[this.activeSub].forEach(c => {
                    c.draftFilterValue = c.filterValue;
                    c.draftFilterType = c.filterType;
                });
            }
            this.showTableSetting = true;
        },

        selectMenu(menuId) {
            this.activeMenu = menuId;
            this.activeSub = null;
            this.openGroup = null;
            
            // Сбрасываем поиск
            this.searchInput = '';
            this.searchQuery = '';

            if (menuId === 'feed') {
                this.loadFeed(true);
            }
        },

        selectSub(subId) {
            this.activeSub = subId;
            this.activeMenu = null;
            this.openGroup = null; 
            this.dataSources[subId] = [];
            this.searchQuery = ''; 
            this.searchInput = '';
            this.currentPage = 1;
            this.userSortKey = null; 
            this.userSortDir = null; 

            // Очищаем ГПР при переходе на другую вкладку
            if (subId !== 'gpr') {
                this.gprSelectedObject = '';
                this.gprData = [];
            }
        },

        toggleTheme() {
            this.isDark = !this.isDark;
            localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
            if (this.isDark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },

        // ==========================================
        // 6. ПОИСК, ФИЛЬТРЫ И СОРТИРОВКА
        // ==========================================
        createSearchRegex(query) {
            if (!query) return /(?:)/;
            const regexStr = String(query).split('').map(char => {
                if (char === '.') return '.';     
                if (char === '*') return '.*';    
                if (char === '#') return '\\d';   
                
                if ('\\^${}[]()|+?'.includes(char)) return '\\' + char;
                return char;
            }).join('');
            
            return new RegExp(regexStr, 'i'); 
        },

        async executeSearch() {
            if (this.isSearching) return; // Защита от двойного клика
            
            this.isSearching = true; // Включаем спиннер
            await new Promise(resolve => setTimeout(resolve, 10)); // Даем браузеру время отрисовать иконку
            
            this.searchQuery = this.searchInput;
            this.currentPage = 1;
            
            // Ждем завершения рендеринга таблицы
            await new Promise(resolve => setTimeout(resolve, 10)); 
            this.isSearching = false; // Выключаем спиннер
        },

        async clearSearch() {
            if (this.isSearching) return;
            
            this.isSearching = true;
            await new Promise(resolve => setTimeout(resolve, 10)); 
            
            this.searchInput = '';
            this.searchQuery = '';
            this.currentPage = 1;
            
            await new Promise(resolve => setTimeout(resolve, 10)); 
            this.isSearching = false;
        },

        async applyFilters() {
            if(this.columnsConfig[this.activeSub]) {
                this.isFiltering = true; // Включаем спиннер и блокируем кнопку
                
                // Микро-пауза, чтобы браузер успел отрисовать крутящийся значок
                await new Promise(resolve => setTimeout(resolve, 10)); 

                this.columnsConfig[this.activeSub].forEach(c => {
                    c.filterValue = c.draftFilterValue;
                    c.filterType = c.draftFilterType;
                });
                this.currentPage = 1;
                this.saveFiltersToStorage(); 
                
                // Микро-пауза, ожидающая завершения перерисовки отфильтрованной таблицы
                await new Promise(resolve => setTimeout(resolve, 10)); 
                
                this.isFiltering = false; // Выключаем спиннер
                this.showTableSetting = false; // Закрываем окно
            }
        },

        async clearFilters() {
            if(this.columnsConfig[this.activeSub]) {
                this.isFiltering = true; // Включаем спиннер
                
                await new Promise(resolve => setTimeout(resolve, 10));

                this.columnsConfig[this.activeSub].forEach(c => { 
                    c.filterValue = ''; 
                    c.draftFilterValue = ''; 
                    c.filterType = 'contains'; 
                    c.draftFilterType = 'contains'; 
                });
                this.currentPage = 1;
                this.saveFiltersToStorage(); 
                
                await new Promise(resolve => setTimeout(resolve, 10));
                
                this.isFiltering = false;
            }
        },

        saveFiltersToStorage() {
            if (!this.activeSub || !this.columnsConfig[this.activeSub]) return;
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem('tableFilters') || '{}'); } catch(e) {}
            
            stored[this.activeSub] = {};
            this.columnsConfig[this.activeSub].forEach(c => {
                if (c.filterValue) {
                    stored[this.activeSub][c.key] = { value: c.filterValue, type: c.filterType };
                }
            });
            localStorage.setItem('tableFilters', JSON.stringify(stored));
        },

        loadFiltersFromStorage(subId) {
            if (!subId) return;
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem('tableFilters') || '{}'); } catch(e) {}
            
            let subFilters = stored[subId] || {};
            if (this.baseColumnsConfig[subId]) {
                this.baseColumnsConfig[subId].forEach(c => {
                    if (subFilters[c.key]) {
                        c.filterValue = subFilters[c.key].value;
                        c.draftFilterValue = subFilters[c.key].value;
                        c.filterType = subFilters[c.key].type;
                        c.draftFilterType = subFilters[c.key].type;
                    } else {
                        c.filterValue = '';
                        c.draftFilterValue = '';
                        c.filterType = 'contains';
                        c.draftFilterType = 'contains';
                    }
                });
            }
        },

        toggleSort(key) {
            if (this.userSortKey === key) {
                if (this.userSortDir === 'asc') this.userSortDir = 'desc';
                else if (this.userSortDir === 'desc') { this.userSortKey = null; this.userSortDir = null; }
            } else { this.userSortKey = key; this.userSortDir = 'asc'; }
            this.currentPage = 1;
        },

        // ==========================================
        // 7. ПАГИНАЦИЯ
        // ==========================================
        async prevPage() {
            if (this.currentPage <= 1 || this.isPaginatingLeft || this.isPaginatingRight) return;
            
            this.isPaginatingLeft = true;
            await new Promise(resolve => setTimeout(resolve, 10)); 
            
            if (this.currentPage > 1) { 
                this.currentPage--;
            }
            
            await new Promise(resolve => setTimeout(resolve, 10)); 
            this.isPaginatingLeft = false;
        },

        async nextPage() {
            if (this.currentPage >= this.totalPages || this.isPaginatingLeft || this.isPaginatingRight) return;
            
            this.isPaginatingRight = true;
            await new Promise(resolve => setTimeout(resolve, 10)); 
            
            // ПРЕДОХРАНИТЕЛЬ: еще раз проверяем значение после паузы!
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
            }
            
            await new Promise(resolve => setTimeout(resolve, 10));
            this.isPaginatingRight = false;
        },

        goToPage(val) {
            // Убрали асинхронную задержку, чтобы смена значения происходила моментально
            let p = parseInt(val);
            
            if (isNaN(p) || p < 1) p = 1;
            
            if (this.totalPages > 0 && p > this.totalPages) {
                p = this.totalPages;
            }
            
            if (this.currentPage !== p) {
                this.currentPage = p;
            }
        },

        // ==========================================
        // 8. БАЗА ДАННЫХ И CRUD
        // ==========================================
        async fetchData() {
            if (!this.activeSub) return;
            const collectionName = this.collectionMap[this.activeSub]; 
            const currentModel = MODELS[this.activeSub];

            if (!collectionName || !currentModel) return;
            
            this.isLoading = true; 
            
            try {
                const options = { sort: '-created' };
                if (currentModel.expand && currentModel.expand.length > 0) {
                    options.expand = currentModel.expand.join(',');
                }

                const accessRule = this.buildAccessFilter(collectionName);
                if (accessRule) options.filter = accessRule;

                const records = await pb.collection(collectionName).getFullList(options);
                
                this.dataSources[this.activeSub] = records.map(record => {
                    currentModel.fields.forEach(fieldDef => {
                        if (fieldDef.type === 'nested' && fieldDef.path) {
                            const val = fieldDef.path.split('.').reduce((obj, p) => (obj ? obj[p] : ''), record);
                            record[fieldDef.key] = val || '—';
                        }
                    });

                    if (currentModel.expand) {
                        currentModel.expand.forEach(relKey => {
                            const fieldDef = currentModel.fields.find(f => f.key === relKey);
                            const sourceKeys = fieldDef ? (fieldDef.sourceKeys || ['name']) : ['name'];
                            
                            if (record.expand && record.expand[relKey]) {
                                const relData = record.expand[relKey];
                                const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                                const buildStr = (item) => sourceKeys.map(k => resolvePath(item, k)).filter(Boolean).join(' ');

                                record[relKey] = Array.isArray(relData) 
                                    ? relData.map(item => buildStr(item)) 
                                    : buildStr(relData) || 'Без названия';
                            } else {
                                record[relKey] = fieldDef && fieldDef.multiple ? [] : '';
                            }
                        });
                    }
                    return record;
                });

                const computedFields = currentModel.fields.filter(f => f.type === 'computed' && f.compute && !f.showInEdit);
                if (computedFields.length > 0) {
                    await Promise.all(this.dataSources[this.activeSub].map(async (row) => {
                        for (let field of computedFields) {
                            try {
                                const { collection, relationField, targetField, operation } = field.compute;
                                const filterStr = `${relationField} ~ "${row.id}"`;

                                if (operation === 'min_date') {
                                    const res = await pb.collection(collection).getFullList({ 
                                        filter: filterStr, 
                                        sort: targetField, 
                                        requestKey: null 
                                    });
                                    row[field.key] = res.length > 0 ? res[0][targetField] : '';
                                } 
                                else if (operation === 'max_date') {
                                    const res = await pb.collection(collection).getFullList({ 
                                        filter: filterStr, 
                                        sort: `-${targetField}`, 
                                        requestKey: null 
                                    });
                                    row[field.key] = res.length > 0 ? res[0][targetField] : '';
                                } 
                                else if (operation === 'sum') {
                                    const res = await pb.collection(collection).getFullList({ filter: filterStr, fields: targetField, requestKey: null });
                                    row[field.key] = res.reduce((sum, r) => sum + (Number(r[targetField]) || 0), 0);
                                }
                            } catch (err) {
                                console.error(`Ошибка вычисляемого поля ${field.key}:`, err);
                            }
                        }
                    }));
                }

                const formulaFields = currentModel.fields.filter(f => f.type === 'formula' && typeof f.formula === 'function' && !f.showInEdit);
                if (formulaFields.length > 0) {
                    this.dataSources[this.activeSub].forEach(row => {
                        formulaFields.forEach(field => {
                            try {
                                row[field.key] = field.formula(row, this.dataSources[this.activeSub]);
                            } catch (err) {
                                console.error(`Ошибка в формуле поля ${field.key}:`, err);
                                row[field.key] = '';
                            }
                        });
                    });
                }

            } catch (err) { console.error("Ошибка загрузки из PocketBase:", err); } 
            finally { this.isLoading = false; }
        },

        async openEdit(row = null) {
            if (!row && !this.hasAccess('create')) {
                this.openDialog('Ошибка доступа', 'У вас нет прав доступа! Обратитесь к администратору.', 'alert');
                return;
            }
            if (row && !this.hasAccess('update')) {
                this.openDialog('Ошибка доступа', 'У вас нет прав доступа! Обратитесь к администратору.', 'alert');
                return;
            }

            // Устанавливаем флаг загрузки (ID строки или 'new')
            this.loadingEditId = row ? row.id : 'new';

            this.isCreating = !row; 
            const schema = this.currentEditSchema;
            this.originalGroupedIds = [];
            
            if (this.isCreating) {
                this.editingItem = { _existingRecordId: null };
                schema.forEach(field => {
                    if (field.type === 'repeating_group') {
                        const initialItem = {};
                        field.fields.forEach(sf => { initialItem[sf.key] = sf.multiple ? [] : ''; });
                        this.editingItem[field.key] = [initialItem];
                    } else if (field.type === 'dynamic_json') {
                        this.editingItem[field.key] = {};
                    } else {
                        this.editingItem[field.key] = field.multiple ? [] : '';
                    }
                });
            } else {
                this.editingItem = JSON.parse(JSON.stringify(row));
                
                schema.forEach(field => {
                    if (field.type === 'dynamic_json' && (!this.editingItem[field.key] || typeof this.editingItem[field.key] !== 'object')) {
                        this.editingItem[field.key] = {};
                    }
                    if (field.type === 'date' && this.editingItem[field.key]) {
                        this.editingItem[field.key] = this.editingItem[field.key].substring(0, 10);
                    }
                });

                const groupField = schema.find(f => f.type === 'repeating_group');
                if (groupField) {
                    let matchedRows = [row]; 

                    this.originalGroupedIds = matchedRows.map(r => r.id);

                    this.editingItem[groupField.key] = matchedRows.map(matchedRow => {
                        const itemFromRow = { _originalId: matchedRow.id };
                        groupField.fields.forEach(sf => {
                            let val = matchedRow[sf.key];
                            if (sf.type === 'number' && sf.format !== 'raw') {
                                val = this.formatValue(val, sf.format);
                            }
                            if (sf.type === 'date' && val) {
                                val = val.substring(0, 10);
                            }
                            itemFromRow[sf.key] = val !== undefined ? val : (sf.multiple ? [] : '');
                        });
                        return itemFromRow;
                    });
                }

                schema.forEach(field => {
                    if (field.type !== 'repeating_group') {
                        if (field.multiple && !Array.isArray(this.editingItem[field.key])) {
                            this.editingItem[field.key] = this.editingItem[field.key] ? [this.editingItem[field.key]] : [];
                        } else if (field.type === 'number' && field.format !== 'raw') {
                            this.editingItem[field.key] = this.formatValue(this.editingItem[field.key], field.format);
                        }

                        if (field.virtual && field.autoFillPath) {
                            const val = field.autoFillPath.split('.').reduce((obj, p) => (obj ? obj[p] : ''), row);
                            if (val) this.editingItem[field.key] = val;
                        }
                    }
                });
            }

            const relationPromises = [];
            
            schema.forEach(field => {
                if (field.type === 'repeating_group') {
                    field.fields.forEach(sf => {
                        if (sf.type === 'relation' && sf.sourceCollection) {
                            const sortField = (sf.sourceKeys && sf.sourceKeys.length > 0) ? sf.sourceKeys[0] : 'name';
                            const reqOptions = { sort: sortField, requestKey: null };
                            if (sf.sourceExpand) reqOptions.expand = sf.sourceExpand;
                            const rule = this.buildAccessFilter(sf.sourceCollection);
                            if (rule) reqOptions.filter = rule;
                            
                            relationPromises.push(
                                pb.collection(sf.sourceCollection).getFullList(reqOptions)
                                    .then(records => { sf._rawRecords = records; })
                            );
                        }
                    });
                } else if (field.type === 'relation' && field.sourceCollection) {
                    const sortField = (field.sourceKeys && field.sourceKeys.length > 0) ? field.sourceKeys[0] : 'name';
                    const reqOptions = { sort: sortField, requestKey: null };
                    
                    if (field.sourceExpand) reqOptions.expand = field.sourceExpand; 
                    
                    const rule = this.buildAccessFilter(field.sourceCollection);
                    if (rule) reqOptions.filter = rule;
                            
                    relationPromises.push(
                        pb.collection(field.sourceCollection).getFullList(reqOptions)
                            .then(records => { field._rawRecords = records; })
                    );
                }
            });

            try {
                // Ждем, пока загрузятся все списки для relations
                await Promise.all(relationPromises);
                this.updateDependentFields(true);
            } catch (err) {
                console.error("Ошибка связей:", err);
                this.openDialog('Ошибка', 'Не удалось загрузить списки связей.', 'alert');
            }
            
            // Подготавливаем поля, чтобы избежать ошибок реактивности
            schema.forEach(field => {
                if (this.editingItem[field.key] === undefined) {
                    this.editingItem[field.key] = '';
                }
            });

            // "Ленивая" загрузка вычисляемых полей для одной карточки
            if (!this.isCreating) {
                const lazyComputed = schema.filter(f => f.compute && f.locked);
                if (lazyComputed.length > 0) {
                    Promise.all(lazyComputed.map(async (field) => {
                        try {
                            const { collection, relationField, targetField, operation } = field.compute;
                            const filterStr = `${relationField} ~ "${row.id}"`;
                            
                            if (operation === 'min_date') {
                                const res = await pb.collection(collection).getFullList({ 
                                    filter: filterStr, 
                                    sort: targetField, 
                                    requestKey: null 
                                });
                                this.editingItem[field.key] = res.length > 0 ? this.formatValue(res[0][targetField], field.format) : '';
                            } 
                            else if (operation === 'max_date') {
                                const res = await pb.collection(collection).getFullList({ 
                                    filter: filterStr, 
                                    sort: `-${targetField}`, 
                                    requestKey: null 
                                });
                                this.editingItem[field.key] = res.length > 0 ? this.formatValue(res[0][targetField], field.format) : '';
                            } 
                            else if (operation === 'sum') {
                                const res = await pb.collection(collection).getFullList({ filter: filterStr, fields: targetField, requestKey: null });
                                const sum = res.reduce((s, r) => s + (Number(r[targetField]) || 0), 0);
                                this.editingItem[field.key] = this.formatValue(sum, field.format);
                            }
                        } catch (e) {
                            console.error(`Ошибка lazy computed ${field.key}:`, e);
                        }
                    })).then(() => {
                        // После вычисления всех сумм, выполняем формулу остатка
                        const lazyFormulas = schema.filter(f => f.formula && typeof f.formula === 'function');
                        lazyFormulas.forEach(field => {
                            const val = field.formula(this.editingItem, [this.editingItem], this);
                            this.editingItem[field.key] = this.formatValue(val, field.format);
                        });
                    });
                }
            }

            // Снимаем флаг загрузки и только теперь показываем окно
            this.loadingEditId = null;
            this.showItemEdit = true;
        },

        async saveEdit() {
            if (this.isSaving) return; // Защита от случайного двойного клика

            const collectionName = this.collectionMap[this.activeSub];
            const currentModel = MODELS[this.activeSub];
            if (!collectionName || !currentModel) return;

            // --- БЛОК ВАЛИДАЦИИ ---
            for (let field of this.currentEditSchema) {
                if ((this.isCreating && field.hideOnCreate) || (!this.isCreating && field.hideOnEdit)) continue;

                if (field.type === 'repeating_group') {
                    const items = this.editingItem[field.key] || [];
                    if (items.length === 0) {
                        this.openDialog('Ошибка заполнения', `Добавьте хотя бы одну позицию в «${field.label}».`, 'alert');
                        return;
                    }
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        for (let sf of field.fields) {
                            if (sf.required) {
                                let val = item[sf.key];
                                let isEmpty = val === null || val === undefined || String(val).trim() === '';
                                if (isEmpty) {
                                    this.openDialog('Ошибка заполнения', `Позиция #${i+1}: Поле «${sf.label}» обязательно.`, 'alert');
                                    return;
                                }
                            }
                        }
                    }
                } else if (field.required) {
                    let val = this.editingItem[field.key];
                    let isEmpty = field.multiple ? (!Array.isArray(val) || val.length === 0 || val.every(v => String(v).trim() === '')) : (val === null || val === undefined || String(val).trim() === '');
                    if (isEmpty) {
                        this.openDialog('Ошибка заполнения', `Поле «${field.label}» является обязательным.`, 'alert');
                        return; 
                    }
                }
            }
            // --- КОНЕЦ ВАЛИДАЦИИ ---

            this.isSaving = true;
            await new Promise(resolve => setTimeout(resolve, 10));

            try {
                let baseData = JSON.parse(JSON.stringify(this.editingItem));

                this.currentEditSchema.forEach(field => {
                    if (field.type === 'dynamic_json' && baseData[field.key] && typeof baseData[field.key] === 'object') {
                        for (let dynKey in baseData[field.key]) {
                            // Удаляем массивы справочников перед сохранением, чтобы они не летели в базу
                            if (baseData[field.key][dynKey]._options) {
                                delete baseData[field.key][dynKey]._options;
                            }
                        }
                    }
                });
                
                if (!this.isCreating) {
                    delete baseData.email;
                    delete baseData.password;
                    delete baseData.passwordConfirm;
                }
                
                ['expand', 'collectionId', 'collectionName', 'created', 'updated', 'id', '_existingRecordId'].forEach(k => delete baseData[k]);
                
                currentModel.fields.forEach(f => { 
                    if (f.type === 'computed' || f.virtual || f.readonly || f.type === 'formula') delete baseData[f.key]; 
                });

                this.currentEditSchema.forEach(field => {
                    if (field.type !== 'repeating_group') {
                        if (field.type === 'relation' && field._relationMap) {
                            if (field.multiple && Array.isArray(baseData[field.key])) {
                                baseData[field.key] = baseData[field.key].map(val => field._relationMap[val]).filter(Boolean);
                            } else if (!field.multiple) {
                                baseData[field.key] = field._relationMap[baseData[field.key]] || "";
                            }
                        }
                        if (field.type === 'number') {
                            baseData[field.key] = this.parseNumber(baseData[field.key]);
                        }
                    }
                });

                const groupField = this.currentEditSchema.find(f => f.type === 'repeating_group');

                if (groupField) {
                    const items = this.editingItem[groupField.key] || []; 
                    delete baseData[groupField.key];

                    const createRecordForItem = async (itemObj, isNew = false, recordId = null) => {
                        let itemData = { ...baseData };
                        groupField.fields.forEach(sf => {
                            let val = itemObj[sf.key];
                            if (sf.type === 'relation' && sf._relationMap) {
                                if (sf.multiple && Array.isArray(val)) {
                                    val = val.map(v => sf._relationMap[v]).filter(Boolean);
                                } else if (!sf.multiple) {
                                    val = sf._relationMap[val] || "";
                                }
                            }
                            if (sf.type === 'number') {
                                val = this.parseNumber(val);
                            }
                            itemData[sf.key] = val;
                        });

                        if (isNew) {
                            const authorField = currentModel.fields.find(f => (f.key === 'author' || f.key === 'user' || f.key === 'responsible') && f.readonly);
                            if (authorField && this.currentUser?.id) itemData[authorField.key] = this.currentUser.id;
                            await pb.collection(collectionName).create(itemData);
                        } else {
                            await pb.collection(collectionName).update(recordId, itemData);
                        }
                    };

                    if (this.isCreating && !this.editingItem._existingRecordId) {
                        for (let itemObj of items) {
                            await createRecordForItem(itemObj, true);
                        }
                    } else {
                        const currentIds = items.map(i => i._originalId).filter(Boolean);
                        const idsToDelete = (this.originalGroupedIds || []).filter(id => !currentIds.includes(id));
                        
                        for (let id of idsToDelete) {
                            await pb.collection(collectionName).delete(id);
                        }

                        for (let itemObj of items) {
                            if (itemObj._originalId) {
                                await createRecordForItem(itemObj, false, itemObj._originalId);
                            } else {
                                await createRecordForItem(itemObj, true);
                            }
                        }
                    }
                } else {
                    // 2. Выбор метода сохранений: CREATE (если запись новая) или UPDATE (если редактирование или если нашли существующую за дату)
                    if (this.isCreating && !this.editingItem._existingRecordId) {
                        const authorField = currentModel.fields.find(f => (f.key === 'author' || f.key === 'user' || f.key === 'responsible') && f.readonly);
                        if (authorField && this.currentUser?.id) baseData[authorField.key] = this.currentUser.id;
                        await pb.collection(collectionName).create(baseData);
                    } else {
                        const recordId = this.isCreating ? this.editingItem._existingRecordId : this.editingItem.id;
                        await pb.collection(collectionName).update(recordId, baseData);
                    }
                }

                this.showItemEdit = false;
                await this.fetchData();
                this.openDialog('Успех', (this.isCreating && !this.editingItem._existingRecordId) ? 'Записи успешно добавлены!' : 'Данные успешно обновлены!', 'alert');
            } catch (err) {
                console.error("Ошибка сохранения:", err);
                this.openDialog('Ошибка', 'Не удалось сохранить: ' + (err.message || ''), 'alert');
            } finally {
                this.isSaving = false;
            }
        },

        attemptDelete() {
            if (!this.hasAccess('delete')) {
                this.openDialog('Ошибка доступа', 'У вас нет прав доступа! Обратитесь к администратору.', 'alert');
                return;
            }
            this.openDialog('Удаление записей', 'Вы уверены, что хотите безвозвратно удалить выбранные строки?', 'confirm', () => this.deleteSelected());
        },

        async deleteSelected() {
            if (this.selectedRows.length === 0 || !this.dataSources[this.activeSub]) return;
            const collectionName = this.collectionMap[this.activeSub];
            if (!collectionName) return;
            
            try {
                await Promise.all(this.selectedRows.map(row => pb.collection(collectionName).delete(row.id)));
                this.selectedRows.forEach(row => {
                    const index = this.dataSources[this.activeSub].indexOf(row);
                    if (index > -1) this.dataSources[this.activeSub].splice(index, 1);
                });
                this.selectedRows = [];
                if (this.currentPage > this.totalPages && this.totalPages > 0) this.currentPage = this.totalPages;
            } catch (err) {
                console.error("Сбой удаления:", err);
                this.openDialog('Ошибка', 'Произошла ошибка при удалении.', 'alert');
            }
        },

        async loadFeed(reset = false) {
            if (reset) {
                this.feedData = [];
                this.feedPage = 1;
                this.feedHasMore = true;
            }
        
            if (!this.feedHasMore || this.isFeedLoading) return;
        
            this.isFeedLoading = true;
        
            try {
                // Подготавливаем фильтры дат
                let filterSupply = [];
                let filterFacts = [];
                let filterDoc = [];
                let filterGwl = []; 

                if (this.feedDateFrom) {
                    filterSupply.push(`supply_date >= "${this.feedDateFrom} 00:00:00.000Z"`);
                    filterFacts.push(`date >= "${this.feedDateFrom} 00:00:00.000Z"`);
                    filterDoc.push(`updated >= "${this.feedDateFrom} 00:00:00.000Z"`);
                    filterGwl.push(`date >= "${this.feedDateFrom} 00:00:00.000Z"`); 
                }
                if (this.feedDateTo) {
                    filterSupply.push(`supply_date <= "${this.feedDateTo} 23:59:59.999Z"`);
                    filterFacts.push(`date <= "${this.feedDateTo} 23:59:59.999Z"`);
                    filterDoc.push(`updated <= "${this.feedDateTo} 23:59:59.999Z"`);
                    filterGwl.push(`date <= "${this.feedDateTo} 23:59:59.999Z"`); 
                }

                const joinFilters = (arr) => arr.length > 0 ? arr.join(' && ') : '';

                // Опции запросов
                const supplyOpts = { sort: '-supply_date', expand: 'material,material.project,material.project.object,author' };
                if (joinFilters(filterSupply)) supplyOpts.filter = joinFilters(filterSupply);

                const factsOpts = { sort: '-date', expand: 'material,material.project,material.project.object,user' };
                if (joinFilters(filterFacts)) factsOpts.filter = joinFilters(filterFacts);

                const docOpts = { sort: '-updated', expand: 'project,project.object,responsible_user,contact' };
                if (joinFilters(filterDoc)) docOpts.filter = joinFilters(filterDoc);

                const gwlOpts = { sort: '-date', expand: 'project,project.object,responsible' };
                if (joinFilters(filterGwl)) gwlOpts.filter = joinFilters(filterGwl);

                // Запросы в PocketBase с новыми фильтрами
                const supplyRes = await pb.collection('supply').getList(this.feedPage, 10, supplyOpts);
                const factsRes = await pb.collection('facts').getList(this.feedPage, 10, factsOpts);
                const docRes = await pb.collection('doc_status_log').getList(this.feedPage, 10, docOpts);
                const gwlRes = await pb.collection('general_work_log').getList(this.feedPage, 10, gwlOpts); 
            
                // Временный объект для группировки записей
                const groupedBatch = {};
            
                // ----------------------------------------------------
                // А) Обработка ЖВК (supply) и ЖРМ (facts)
                // ----------------------------------------------------
                const processMaterialRow = (row, typeKey, typeTitle, dateField, userExpandKey) => {
                    const rawDate = row[dateField];
                    const dateFormatted = this.formatValue(rawDate, 'date');
                    const feedKey = `${typeKey}_${dateFormatted}`;
                
                    if (!groupedBatch[feedKey]) {
                        groupedBatch[feedKey] = {
                            id: feedKey + '_' + this.feedPage,
                            rawDate: rawDate,
                            dateFormatted: dateFormatted,
                            typeTitle: typeTitle,
                            typeKey: typeKey,
                            objects: {}
                        };
                    }
                
                    const objName = row.expand?.material?.expand?.project?.expand?.object?.name || 'Без объекта';
                    const projName = row.expand?.material?.expand?.project?.name || 'Без раздела';
                
                    const userObj = row.expand?.[userExpandKey];
                    let respName = 'Не указан';
                    if (userObj) {
                        const position = userObj.position ? `${userObj.position} ` : '';
                        const fullName = `${userObj.last_name || ''} ${userObj.first_name || ''}`.trim();
                        respName = fullName ? `${position}${fullName}` : 'Не указан';
                    }
                
                    const matName = row.expand?.material?.name || 'Неизвестный материал';
                    const qty = row.quantity || 0;
                    const unit = row.expand?.material?.unit || '';
                    const matString = `- ${matName} — ${qty} ${unit}`;
                
                    if (!groupedBatch[feedKey].objects[objName]) groupedBatch[feedKey].objects[objName] = {};
                    if (!groupedBatch[feedKey].objects[objName][projName]) groupedBatch[feedKey].objects[objName][projName] = {};
                    if (!groupedBatch[feedKey].objects[objName][projName][respName]) groupedBatch[feedKey].objects[objName][projName][respName] = [];
                
                    groupedBatch[feedKey].objects[objName][projName][respName].push(matString);
                };
            
                // ----------------------------------------------------
                // Б) Специальная обработка для Журнала ИТД
                // ----------------------------------------------------
                const processDocRow = (row) => {
                    const rawDate = row.updated;
                    const dateFormatted = this.formatValue(rawDate, 'date');
                    const feedKey = `doc_${dateFormatted}`;
                
                    if (!groupedBatch[feedKey]) {
                        groupedBatch[feedKey] = {
                            id: feedKey + '_' + this.feedPage,
                            rawDate: rawDate,
                            dateFormatted: dateFormatted,
                            typeTitle: 'Журнал движения ИТД',
                            typeKey: 'doc',
                            docObjects: {} // Заменили плоский массив на иерархию
                        };
                    }
                
                    const objName = row.expand?.project?.expand?.object?.name || 'Без объекта';
                    const projName = row.expand?.project?.name || 'Без раздела';
                
                    const respObj = row.expand?.responsible_user;
                    let respStr = 'Не указан';
                    if (respObj) {
                        const pos = respObj.position ? `${respObj.position} ` : '';
                        const name = `${respObj.last_name || ''} ${respObj.first_name || ''}`.trim();
                        respStr = `${pos}${name}`.trim() || 'Не указан';
                    }
                
                    const contactObj = row.expand?.contact;
                    let contactStr = '';
                    if (contactObj) {
                        const pos = contactObj.position ? `${contactObj.position} ` : '';
                        const name = `${contactObj.last_name || ''} ${contactObj.first_name || ''}`.trim();
                        contactStr = `${pos}${name}`.trim();
                    }
                
                    // Древовидная группировка ИТД
                    if (!groupedBatch[feedKey].docObjects[objName]) groupedBatch[feedKey].docObjects[objName] = {};
                    if (!groupedBatch[feedKey].docObjects[objName][projName]) groupedBatch[feedKey].docObjects[objName][projName] = {};
                    if (!groupedBatch[feedKey].docObjects[objName][projName][respStr]) groupedBatch[feedKey].docObjects[objName][projName][respStr] = [];

                    let docLines = [];
                    docLines.push(`<b>Статус:</b> ${row.status || ''}`);
                    if (contactStr) docLines.push(`<b>Согласующий:</b> ${contactStr}`);
                    if (row.comment) docLines.push(`<b>Комментарий:</b> ${row.comment}`);

                    groupedBatch[feedKey].docObjects[objName][projName][respStr].push(docLines.join('<br>'));
                };

                // ----------------------------------------------------
                // В) Обработка Общего журнала работ
                // ----------------------------------------------------
                const processGwlRow = (row) => {
                    const rawDate = row.date;
                    const dateFormatted = this.formatValue(rawDate, 'date');
                    const feedKey = `gwl_${dateFormatted}`;
                
                    if (!groupedBatch[feedKey]) {
                        groupedBatch[feedKey] = {
                            id: feedKey + '_' + this.feedPage,
                            rawDate: rawDate,
                            dateFormatted: dateFormatted,
                            typeTitle: 'Общий журнал работ',
                            typeKey: 'gwl',
                            gwlObjects: {}
                        };
                    }
                
                    const objName = row.expand?.project?.expand?.object?.name || 'Без объекта';
                    const projName = row.expand?.project?.name || 'Без раздела';
                
                    const respObj = row.expand?.responsible;
                    let respStr = 'Не указан';
                    if (respObj) {
                        const pos = respObj.position ? `${respObj.position} ` : '';
                        const name = `${respObj.last_name || ''} ${respObj.first_name || ''}`.trim();
                        respStr = `${pos}${name}`.trim() || 'Не указан';
                    }
                
                    // Древовидная группировка ОЖР
                    if (!groupedBatch[feedKey].gwlObjects[objName]) groupedBatch[feedKey].gwlObjects[objName] = {};
                    if (!groupedBatch[feedKey].gwlObjects[objName][projName]) groupedBatch[feedKey].gwlObjects[objName][projName] = {};
                    if (!groupedBatch[feedKey].gwlObjects[objName][projName][respStr]) groupedBatch[feedKey].gwlObjects[objName][projName][respStr] = [];
                
                    let workLines = [];
                    if (row.condition) workLines.push(`<b>Условия выполнения работ:</b> ${row.condition}`);
                    if (row.name) workLines.push(`<b>Наименование работ:</b><br>${row.name.replace(/\n/g, '<br>')}`);
                    
                    groupedBatch[feedKey].gwlObjects[objName][projName][respStr].push(workLines.join('<br>'));
                };
            
                // Заполняем временный объект
                supplyRes.items.forEach(row => processMaterialRow(row, 'sup', 'Журнал входного контроля', 'supply_date', 'author'));
                factsRes.items.forEach(row => processMaterialRow(row, 'fact', 'Журнал расхода материалов', 'date', 'user'));
                docRes.items.forEach(row => processDocRow(row));
                gwlRes.items.forEach(row => processGwlRow(row)); 
            
                // ----------------------------------------------------
                // Г) Формирование итоговых карточек
                // ----------------------------------------------------
                let newFeedItems = Object.values(groupedBatch).map(group => {
                    let contentLines = [];
                
                    if (group.typeKey === 'doc') {
                        // Отрисовка ИТД по новой иерархии
                        for (const [objName, projects] of Object.entries(group.docObjects)) {
                            contentLines.push(`<b>Наименование объекта:</b> «${objName}»`);
                            for (const [projName, responsibles] of Object.entries(projects)) {
                                for (const [respName, docs] of Object.entries(responsibles)) {
                                    let sectionLine = `<b>Раздел:</b> ${projName}`;
                                    if (respName !== 'Не указан') sectionLine += ` (${respName})`;
                                    contentLines.push(sectionLine);
                                    contentLines.push(docs.join('<hr class="my-2 border-slate-200 dark:border-slate-700">'));
                                }
                            }
                        }
                    } else if (group.typeKey === 'gwl') {
                        // Отрисовка ОЖР по новой иерархии
                        for (const [objName, projects] of Object.entries(group.gwlObjects)) {
                            contentLines.push(`<b>Наименование объекта:</b> «${objName}»`);
                            for (const [projName, responsibles] of Object.entries(projects)) {
                                for (const [respName, works] of Object.entries(responsibles)) {
                                    let sectionLine = `<b>Раздел:</b> ${projName}`;
                                    if (respName !== 'Не указан') sectionLine += ` (${respName})`;
                                    contentLines.push(sectionLine);
                                    contentLines.push(works.join('<hr class="my-2 border-slate-200 dark:border-slate-700">'));
                                }
                            }
                        }
                    } else {
                        // Стандартный вывод для материалов (ЖВК и ЖРМ)
                        for (const [objName, projects] of Object.entries(group.objects)) {
                            contentLines.push(`<b>Наименование объекта:</b> «${objName}»`);

                            for (const [projName, responsibles] of Object.entries(projects)) {
                                contentLines.push(`<b>Раздел:</b> ${projName}`);

                                for (const [respName, materials] of Object.entries(responsibles)) {
                                    contentLines.push(`<b>Ответственный:</b> ${respName}`);
                                    materials.forEach(mat => contentLines.push(mat));
                                }
                            }
                        }
                    }
                
                    return {
                        id: group.id,
                        rawDate: group.rawDate,
                        dateFormatted: group.dateFormatted,
                        typeTitle: group.typeTitle,
                        content: contentLines.join('<br>')
                    };
                });
            
                // Сортировка по дате (самые свежие сверху)
                newFeedItems.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
            
                this.feedData = [...this.feedData, ...newFeedItems];
            
                if (
                    supplyRes.page >= supplyRes.totalPages && 
                    factsRes.page >= factsRes.totalPages && 
                    docRes.page >= docRes.totalPages &&
                    gwlRes.page >= gwlRes.totalPages
                ) {
                    this.feedHasMore = false;
                } else {
                    this.feedPage++;
                }
            
            } catch (err) {
                console.error("Ошибка загрузки ленты:", err);
                this.openDialog('Ошибка', 'Не удалось загрузить ленту.', 'alert');
            } finally {
                this.isFeedLoading = false;
            }
        },

        async checkAndMergeByDate(dateKey = null) {
            if (!this.editingItem) return;

            if (!dateKey) {
                const dateField = this.currentEditSchema.find(f => f.type === 'date');
                if (dateField) dateKey = dateField.key;
                else return;
            }
        
            const selectedDate = this.editingItem[dateKey];
            if (!selectedDate) return;
        
            const collectionName = this.collectionMap[this.activeSub];
            const currentModel = MODELS[this.activeSub];
            if (!collectionName || !currentModel) return;

            // Проверяем, требует ли форма указания проекта
            const pSchema = this.currentEditSchema.find(f => f.key === 'project');
            const hpSchema = this.currentEditSchema.find(f => f.key === 'helper_project');
            
            // Если требует, но он еще не выбран — прерываем поиск и ждем
            if (pSchema && (!this.editingItem.project || String(this.editingItem.project).trim() === '')) return;
            if (hpSchema && (!this.editingItem.helper_project || String(this.editingItem.helper_project).trim() === '')) return;
        
            let filterParts = [
                `${dateKey} >= "${selectedDate} 00:00:00.000Z" && ${dateKey} <= "${selectedDate} 23:59:59.999Z"`
            ];
        
            if (this.editingItem.project) {
                const pSchema = this.currentEditSchema.find(f => f.key === 'project');
                const pId = (pSchema && pSchema._relationMap) ? pSchema._relationMap[this.editingItem.project] : this.editingItem.project;
                if (pId) filterParts.push(`project = "${pId}"`);
            } else if (this.editingItem.helper_project) {
                const pSchema = this.currentEditSchema.find(f => f.key === 'helper_project');
                const pId = (pSchema && pSchema._relationMap) ? pSchema._relationMap[this.editingItem.helper_project] : null;
                if (pId) filterParts.push(`project = "${pId}"`);
            }
        
            const accessRule = this.buildAccessFilter(collectionName);
            if (accessRule) filterParts.push(`(${accessRule})`);
        
            try {
                const options = { filter: filterParts.join(' && '), requestKey: null };
                if (currentModel.expand) options.expand = currentModel.expand.join(',');
            
                const existingRecords = await pb.collection(collectionName).getFullList(options);
                
                if (existingRecords.length === 0) {
                    if (this.isCreating) {
                        this.editingItem._existingRecordId = null;
                        this.originalGroupedIds = [];
                    }
                    return;
                }
            
                const existing = existingRecords[0];

                if (!this.isCreating) {
                    // Проверяем, не совпадает ли ID найденной записи с той, что мы сейчас редактируем
                    if (existing.id !== this.editingItem.id) {
                        this.openDialog(
                            'Запись уже существует', 
                            'На эту дату уже есть карточка по выбранному проекту. Чтобы избежать дубликатов, пожалуйста, редактируйте её напрямую в таблице.', 
                            'alert'
                        );
                        
                        // Откатываем поля (дату и проект) к их исходным значениям
                        const originalRow = this.dataSources[this.activeSub].find(r => r.id === this.editingItem.id);
                        if (originalRow) {
                            if (originalRow[dateKey]) this.editingItem[dateKey] = originalRow[dateKey].substring(0, 10);
                            if (originalRow.project !== undefined) this.editingItem.project = originalRow.project;
                            if (originalRow.helper_project !== undefined) this.editingItem.helper_project = originalRow.helper_project;
                        }
                    }
                    return; // Прерываем функцию, так как слияние при редактировании мы не делаем
                }

                // Логика слияния для режима Создания
                this.editingItem._existingRecordId = existing.id;
                this.originalGroupedIds = existingRecords.map(r => r.id);
            
                this.currentEditSchema.forEach(field => {
                    if (field.key === dateKey || field.locked || field.readonly || field.virtual) return;
                
                    let existingVal = existing[field.key];
                
                    if (field.type === 'relation' && existing.expand && existing.expand[field.key]) {
                        const relData = existing.expand[field.key];
                        const sourceKeys = field.sourceKeys || ['name'];
                        const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                        const buildStr = (item) => sourceKeys.map(k => resolvePath(item, k)).filter(Boolean).join(' ');
                        existingVal = Array.isArray(relData) ? relData.map(item => buildStr(item)) : buildStr(relData);
                    }
                
                    const currentVal = this.editingItem[field.key];
                    const mergeMode = field.merge || (field.type === 'textarea' ? 'append' : 'keep');
                
                    if (field.type === 'repeating_group') {
                        if (existingRecords.length > 0) {
                            const groupItems = existingRecords.map(rec => {
                                const itemObj = { _originalId: rec.id };
                                field.fields.forEach(sf => {
                                    let val = rec[sf.key];
                                    if (sf.type === 'relation' && rec.expand && rec.expand[sf.key]) {
                                        const relData = rec.expand[sf.key];
                                        const sourceKeys = sf.sourceKeys || ['name'];
                                        const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                                        val = sourceKeys.map(k => resolvePath(relData, k)).filter(Boolean).join(' ');
                                    }
                                    itemObj[sf.key] = val !== undefined ? val : (sf.multiple ? [] : '');
                                });
                                return itemObj;
                            });
                        
                            if (Array.isArray(this.editingItem[field.key])) {
                                const newUnsavedItems = this.editingItem[field.key].filter(i => !i._originalId && Object.values(i).some(v => v));
                                this.editingItem[field.key] = [...groupItems, ...newUnsavedItems];
                            } else {
                                this.editingItem[field.key] = groupItems;
                            }
                        }
                    } else if (mergeMode === 'append') {
                        if (existingVal && String(existingVal).trim() !== '') {
                            const cleanExist = String(existingVal).trim();
                            const cleanCurrent = String(currentVal || '').trim();
                        
                            if (!cleanCurrent) {
                                this.editingItem[field.key] = cleanExist;
                            } else if (!cleanCurrent.includes(cleanExist)) {
                                this.editingItem[field.key] = `${cleanExist}\n${cleanCurrent}`;
                            }
                        }
                    } else if (mergeMode === 'keep') {
                        // Строго сохраняем то, что в базе (затираем ручной ввод, если он был)
                        if (existingVal !== undefined && existingVal !== null && String(existingVal).trim() !== '') {
                            this.editingItem[field.key] = existingVal;
                        }
                    } else if (mergeMode === 'change') {
                        // Подтягиваем из базы только если пользователь еще ничего не ввел
                        if (existingVal && String(existingVal).trim() !== '' && (!currentVal || String(currentVal).trim() === '')) {
                            this.editingItem[field.key] = existingVal;
                        }
                    }
                });
            
            } catch (err) {
                console.error("Ошибка при проверке записи по дате:", err);
            }
        },

        // ==========================================
        // 9. ЛОГИКА ФОРМ И СВЯЗЕЙ (RELATIONS & GROUPS)
        // ==========================================
        addRepeatingGroupItem(field) {
            if (!this.editingItem[field.key]) this.editingItem[field.key] = [];
            const newItem = {};
            field.fields.forEach(sf => {
                newItem[sf.key] = sf.multiple ? [] : '';
            });
            this.editingItem[field.key].push(newItem);
            this.updateDependentFields(false);
        },

        updateDependentFields(isInitial = false) {
            const schema = this.currentEditSchema;
            if (!schema) return;

            const processRelation = (field, itemContext = this.editingItem) => {
                if (field.type === 'relation' && field._rawRecords) {
                    let filteredRecords = field._rawRecords; 
                    
                    if (field.dependsOn) {
                        const parentVal = this.editingItem[field.dependsOn];
                        const parentSchema = schema.find(f => f.key === field.dependsOn);
                        const parentId = parentSchema && parentSchema._relationMap ? parentSchema._relationMap[parentVal] : null;

                        if (parentId) {
                            const target = field.dependsOnTarget || field.dependsOn; 
                            filteredRecords = field._rawRecords.filter(r => {
                                const relVal = r[target];
                                return Array.isArray(relVal) ? relVal.includes(parentId) : relVal === parentId;
                            });
                        } else {
                            filteredRecords = []; 
                        }
                    }

                    const keys = field.sourceKeys || ['name'];
                    const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);

                    field.options = filteredRecords.map(r => keys.map(k => resolvePath(r, k)).filter(Boolean).join(' ')).filter(Boolean);

                    field._relationMap = {};
                    filteredRecords.forEach(r => { 
                        const displayStr = keys.map(k => resolvePath(r, k)).filter(Boolean).join(' ');
                        if (displayStr) field._relationMap[displayStr] = r.id; 
                    });

                    if (!isInitial && itemContext[field.key] !== undefined) {
                        if (!field.multiple) {
                            if (itemContext[field.key] && !field.options.includes(itemContext[field.key])) {
                                itemContext[field.key] = '';
                            }
                        } else if (Array.isArray(itemContext[field.key])) {
                            itemContext[field.key] = itemContext[field.key].filter(v => field.options.includes(v));
                        }
                    }
                }
            };

            schema.forEach(field => {
                if (field.type === 'repeating_group') {
                    if(this.editingItem[field.key] && Array.isArray(this.editingItem[field.key])) {
                        this.editingItem[field.key].forEach(itemContext => {
                            field.fields.forEach(sf => processRelation(sf, itemContext));
                        });
                    }
                } else {
                    processRelation(field);
                }
            });

            schema.forEach(field => {
                if (field.type === 'dynamic_json' && field.dependsOn && field.sourceConfigField) {
                    const parentKey = field.dependsOn; // 'act_type'
                    const parentField = schema.find(f => f.key === parentKey);
                    
                    if (parentField && parentField._rawRecords) {
                        const selectedVal = this.editingItem[parentKey];
                        
                        const keys = parentField.sourceKeys || ['name'];
                        const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                        
                        // Ищем, какой акт сейчас выбран
                        let selectedRecord = parentField._rawRecords.find(r => {
                            const displayStr = keys.map(k => resolvePath(r, k)).filter(Boolean).join(' ');
                            return displayStr === selectedVal;
                        });

                        if (selectedRecord && selectedRecord[field.sourceConfigField]) {
                            let templateConfig = selectedRecord[field.sourceConfigField];
                            if (typeof templateConfig === 'string') {
                                try { templateConfig = JSON.parse(templateConfig); } catch (e) { templateConfig = {}; }
                            }
                            
                            const trackerKey = '_current_id_' + field.key;
                            const newActId = selectedRecord.id;

                            // АСИНХРОННАЯ ЗАГРУЗКА СПРАВОЧНИКОВ ДЛЯ JSON
                            const loadRelationsForConfig = async (configObj) => {
                                let hasChanges = false;
                                for (let dynKey in configObj) {
                                    if (configObj[dynKey].type === 'relation' && configObj[dynKey].sourceCollection) {
                                        try {
                                            const reqOptions = { requestKey: null };
                                            // Учитываем глобальные права пользователя (чтобы не показать лишнего)
                                            const rule = this.buildAccessFilter(configObj[dynKey].sourceCollection);
                                            if (rule) reqOptions.filter = rule;
                                            
                                            const records = await pb.collection(configObj[dynKey].sourceCollection).getFullList(reqOptions);
                                            const sourceKeys = configObj[dynKey].sourceKeys || ['name'];
                                            
                                            configObj[dynKey]._options = records.map(r => sourceKeys.map(k => resolvePath(r, k)).filter(Boolean).join(' ')).filter(Boolean);
                                            hasChanges = true;
                                        } catch (e) {
                                            console.error('Ошибка загрузки справочника для JSON:', dynKey, e);
                                            configObj[dynKey]._options = [];
                                        }
                                    }
                                }
                                // Принудительно дергаем реактивность Alpine, чтобы выпадающие списки обновились
                                if (hasChanges) {
                                    this.editingItem[field.key] = { ...configObj };
                                }
                            };

                            if (!isInitial) {
                                if (this.editingItem[trackerKey] !== newActId) {
                                    this.editingItem[field.key] = JSON.parse(JSON.stringify(templateConfig));
                                    this.editingItem[trackerKey] = newActId;
                                    loadRelationsForConfig(this.editingItem[field.key]);
                                }
                            } else {
                                 this.editingItem[trackerKey] = newActId;
                                 if (!this.editingItem[field.key] || Object.keys(this.editingItem[field.key]).length === 0) {
                                     this.editingItem[field.key] = JSON.parse(JSON.stringify(templateConfig));
                                 }
                                 // Загружаем списки даже если открываем уже заполненную карточку
                                 loadRelationsForConfig(this.editingItem[field.key]);
                            }
                        } else if (!isInitial) {
                             this.editingItem[field.key] = {};
                             this.editingItem['_current_id_' + field.key] = null;
                        }
                    }
                }
            });

            if (!isInitial) {
                this.checkAndMergeByDate();
            }
        },

        isRelationInvalid(value, options) {
            if (!value) return false;
            if (!options || options.length === 0) return false;
            return !options.includes(value);
        },

        // ==========================================
        // 10. ИМПОРТ И ЭКСПОРТ
        // ==========================================
        async exportData() {
            this.isExporting = true;
            
            // Берем выделенные строки или все отфильтрованные данные
            const dataToExport = this.selectedRows.length > 0 ? this.selectedRows : this.processedData; 
            
            if (dataToExport.length === 0) {
                this.openDialog('Ошибка', 'Нет данных для экспорта.', 'alert');
                this.isExporting = false;
                return;
            }

            const config = typeof EXPORT_CONFIG !== 'undefined' ? EXPORT_CONFIG[this.activeSub] : null;

            if (config && config.template) {
                await this.handleTemplateExport(config, dataToExport);
            } else {
                this.exportCSV(dataToExport);
            }
            
            this.isExporting = false;
        },

        async handleTemplateExport(config, data) {
            try {
                // 1. Проверяем, загрузились ли библиотеки
                if (typeof window.PizZip === 'undefined' || typeof window.docxtemplater === 'undefined') {
                    throw new Error("Библиотеки для экспорта (PizZip или docxtemplater) еще не загрузились или не подключены.");
                }

                const response = await fetch(config.template);
                if (!response.ok) throw new Error('Шаблон не найден по указанному пути');

                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();

                // Если в конфиге есть prepareData, прогоняем данные через нее
                const templateData = config.prepareData ? config.prepareData(data) : { records: data };

                // 2. Используем window. для доступа к глобальным конструкторам
                const zip = new window.PizZip(arrayBuffer); 

                const doc = new window.docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                });

                doc.render(templateData);

                const out = doc.getZip().generate({
                    type: "blob",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });

                // saveAs тоже берется из глобальной области (библиотека file-saver)
                window.saveAs(out, `${MENU_TITLES[this.activeSub]}.docx`);
            } catch (error) {
                console.error("Ошибка экспорта DOCX:", error);
                this.openDialog('Ошибка', 'Не удалось сгенерировать документ. Проверьте консоль для деталей.', 'alert'); 
            }
        },

        exportCSV(data) {
            const columns = this.columnsConfig[this.activeSub].filter(c => c.visible);
            
            // Формируем расширенные заголовки (добавляем "(ID)" для связей)
            const headers = ['ID'];
            columns.forEach(c => {
                if (c.type === 'relation') {
                    headers.push(`${c.label} (Текст)`);
                    headers.push(`${c.label} (ID)`);
                } else {
                    headers.push(c.label);
                }
            });
            
            const csvRows = [headers.join(';')];

            data.forEach(row => {
                const values = [row.id];
                
                columns.forEach(c => {
                    let val = this.formatValue(row[c.key], c.format) || '';
                    
                    if (c.type === 'relation') {
                        // Значение текста (которое мы обычно видим в таблице)
                        values.push(`"${String(val).replace(/"/g, '""')}"`);
                        
                        // Пытаемся достать оригинальный ID из сырых данных (если он там есть)
                        // В PocketBase сырые ID обычно хранятся в самом поле до того, как мы их отформатируем.
                        // Если в dataSources уже лежат текстовые значения, попробуем достать ID из expand.
                        let idVal = '';
                        const currentModel = MODELS[this.activeSub];
                        const fieldDef = currentModel.fields.find(f => f.key === c.key);
                        
                        if (fieldDef && row.expand && row.expand[c.key]) {
                            if (fieldDef.multiple) {
                                idVal = Array.isArray(row.expand[c.key]) ? row.expand[c.key].map(i => i.id).join(', ') : '';
                            } else {
                                idVal = row.expand[c.key].id || '';
                            }
                        } else if (typeof row[c.key] === 'string' && row[c.key].length === 15 && !row[c.key].includes(' ')) {
                             // Если значение в поле похоже на оригинальный 15-значный ID PocketBase
                             idVal = row[c.key];
                        }
                        
                        values.push(`"${String(idVal).replace(/"/g, '""')}"`);
                    } else {
                        values.push(`"${String(val).replace(/"/g, '""')}"`);
                    }
                });
                
                csvRows.push(values.join(';'));
            });

            const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            saveAs(blob, `${MENU_TITLES[this.activeSub]}.csv`);
        },

        async handleImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (typeof window.XLSX === 'undefined') {
                this.openDialog('Ошибка', 'Библиотека XLSX не загружена.', 'alert');
                event.target.value = ''; 
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // ВАЖНО: cellDates: true заставит SheetJS превратить даты Excel в объекты Date
                    const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                    if (json.length === 0) {
                        this.openDialog('Ошибка', 'Файл пуст или не удалось прочитать данные.', 'alert');
                        return;
                    }

                    this.importData = json;
                    this.importColumns = Object.keys(json[0]);
                    this.importMapping = {};

                    // Авто-маппинг
                    this.currentImportSchema.forEach(field => {
                        // Пытаемся найти точное совпадение
                        let match = this.importColumns.find(col => col.toLowerCase() === field.label.toLowerCase() || col === field.key);
                        
                        if (field.type === 'relation' && !match) {
                            // Ищем столбец с "ID", так как он надежнее
                            match = this.importColumns.find(col => col.toLowerCase() === `${field.label} (id)`.toLowerCase() || col.toLowerCase() === `${field.label.toLowerCase()} id`);
                            // Если не нашли ID, ищем столбец с текстом
                            if (!match) {
                                match = this.importColumns.find(col => col.toLowerCase() === `${field.label} (текст)`.toLowerCase());
                            }
                        }
                        
                        if (match) this.importMapping[field.key] = match;
                    });
                    
                    const idMatch = this.importColumns.find(col => col.toLowerCase() === 'id');
                    if (idMatch) this.importMapping['id'] = idMatch;

                    this.showImportWindow = true;
                } catch (error) {
                    console.error(error);
                    this.openDialog('Ошибка', 'Не удалось обработать файл.', 'alert');
                } finally {
                    event.target.value = ''; 
                }
            };
            reader.readAsArrayBuffer(file);
        },

        async executeImport() {
            const mappedIdCol = this.importMapping['id'];
            let itemsToUpdate = 0;
            
            if (mappedIdCol) {
                itemsToUpdate = this.importData.filter(row => row[mappedIdCol] && String(row[mappedIdCol]).trim() !== '').length;
            }

            if (itemsToUpdate > 0) {
                this.openDialog(
                    'Подтверждение импорта',
                    `Будет произведена замена ${itemsToUpdate} строк по столбцу ID. Остальные записи будут созданы как новые. Продолжить?`,
                    'confirm',
                    () => this.processImportData()
                );
            } else {
                this.processImportData();
            }
        },

        async processImportData() {
            this.isLoading = true;
            const collectionName = this.collectionMap[this.activeSub];
            const currentModel = MODELS[this.activeSub];
            const mappedIdCol = this.importMapping['id'];

            // 1. Предварительная загрузка связей (relations) специально для импорта
            const relationMaps = {};
            for (let field of this.currentImportSchema) {
                const fileCol = this.importMapping[field.key];
                
                if (fileCol && field.type === 'relation' && field.sourceCollection) {
                    try {
                        const reqOptions = { requestKey: null };
                        if (field.sourceExpand) reqOptions.expand = field.sourceExpand;
                        
                        const records = await pb.collection(field.sourceCollection).getFullList(reqOptions);
                        const keys = field.sourceKeys || ['name'];
                        const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                        
                        relationMaps[field.key] = {
                            byText: {},
                            byId: {} 
                        };
                        records.forEach(r => {
                            const displayStr = keys.map(k => resolvePath(r, k)).filter(Boolean).join(' ');
                            if (displayStr) relationMaps[field.key].byText[String(displayStr).trim()] = r.id;
                            relationMaps[field.key].byId[r.id] = r.id; 
                        });
                    } catch(e) {
                        console.error("Не удалось загрузить справочник для импорта: ", field.label);
                    }
                }
            }

            let successCount = 0;
            let errorCount = 0;
            let failedRows = []; 

            try {
                for (let row of this.importData) {
                    try {
                        let recordData = {};

                        for (let field of this.currentImportSchema) {
                            const fileCol = this.importMapping[field.key];

                            if (fileCol && row[fileCol] !== undefined && String(row[fileCol]).trim() !== '') {
                                let val = row[fileCol];

                                // Парсинг чисел
                                if (field.type === 'number') {
                                    val = this.parseNumber(val);
                                } 
                                // Парсинг дат
                                else if (field.type === 'date') {
                                    if (val instanceof Date) {
                                        val = val.toISOString().substring(0, 10);
                                    } else if (typeof val === 'number') {
                                        val = new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString().substring(0, 10);
                                    } else if (typeof val === 'string') {
                                        let parts = val.split('.');
                                        if (parts.length === 3) val = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                    }
                                } 
                                // Обработка связей (с защитой String(val))
                                else if (field.type === 'relation' && relationMaps[field.key]) {
                                    if (field.multiple) {
                                        const parts = String(val).split(',').map(v => v.trim()).filter(Boolean);
                                        val = [];
                                        for (let p of parts) {
                                            const resolved = relationMaps[field.key].byId[p] || relationMaps[field.key].byText[p];
                                            if (!resolved) {
                                                throw new Error(`Поле "${field.label}": значение "${p}" не найдено в справочнике.`);
                                            }
                                            val.push(resolved);
                                        }
                                    } else {
                                        const cleanVal = String(val).trim();
                                        const resolved = relationMaps[field.key].byId[cleanVal] || relationMaps[field.key].byText[cleanVal];
                                        if (!resolved) {
                                            throw new Error(`Поле "${field.label}": значение "${cleanVal}" не найдено в справочнике.`);
                                        }
                                        val = resolved;
                                    }
                                } 
                                else {
                                    val = String(val).trim();
                                }
                                
                                recordData[field.key] = val;
                            }
                        }

                        // Отправка в PocketBase
                        const rowId = mappedIdCol ? String(row[mappedIdCol]).trim() : null;
                        
                        if (rowId) {
                            await pb.collection(collectionName).update(rowId, recordData);
                        } else {
                            const authorField = currentModel.fields.find(f => (f.key === 'author' || f.key === 'user' || f.key === 'responsible') && f.readonly);
                            if (authorField && this.currentUser?.id) recordData[authorField.key] = this.currentUser.id;
                            
                            await pb.collection(collectionName).create(recordData);
                        }
                        successCount++;
                    } catch (e) {
                        console.error("Сбой строки:", row, e);
                        errorCount++;
                        
                        const failedRow = { ...row };
                        let errorMsg = e.message || 'Сбой при сохранении';
                        
                        if (e.data) {
                            errorMsg = e.data.message || errorMsg;
                            if (e.data.data) {
                                const fieldErrors = Object.entries(e.data.data).map(([k, v]) => `${k}: ${v.message}`).join('; ');
                                if (fieldErrors) errorMsg += ` (${fieldErrors})`;
                            }
                        }
                        
                        failedRow['ОШИБКА_ИМПОРТА'] = errorMsg;
                        failedRows.push(failedRow);
                    }
                }

                this.showImportWindow = false;
                await this.fetchData();
                
                let resultMessage = `Успешно обработано: ${successCount}. Ошибок: ${errorCount}.`;
                
                if (failedRows.length > 0) {
                    resultMessage += ' Строки с ошибками сохранены в отдельный файл для проверки.';
                    this.downloadFailedRows(failedRows);
                }
                
                this.openDialog('Импорт завершен', resultMessage, 'alert');
            } catch (err) {
                console.error("Критическая ошибка импорта:", err);
                this.openDialog('Ошибка', 'Произошла критическая ошибка при выполнении импорта.', 'alert');
            } finally {
                this.isLoading = false;
            }
        },

        downloadFailedRows(failedRows) {
            if (typeof window.XLSX === 'undefined') return;
            try {
                // Создаем новый лист на основе массива неимпортированных строк
                const worksheet = window.XLSX.utils.json_to_sheet(failedRows);
                const workbook = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(workbook, worksheet, "Ошибки импорта");
                
                // Формируем имя файла с названием текущего раздела
                const fileName = `Ошибки_импорта_${MENU_TITLES[this.activeSub]}.xlsx`;
                window.XLSX.writeFile(workbook, fileName);
            } catch (e) {
                console.error("Не удалось сгенерировать файл с ошибками", e);
            }
        },

        async downloadSingleAct() {
            if (this.isDownloadingAct) return;
            this.isDownloadingAct = true;

            try {
                // 1. Проверяем библиотеки
                if (typeof window.PizZip === 'undefined' || typeof window.docxtemplater === 'undefined') {
                    throw new Error("Библиотеки для экспорта DOCX не загружены.");
                }

                // 2. Ищем путь к шаблону в коллекции act_types
                let templatePath = '';
                let actName = 'Акт';
                
                const actTypeField = this.currentEditSchema.find(f => f.key === 'act_type');
                if (actTypeField && actTypeField._rawRecords) {
                    const actVal = this.editingItem.act_type; // У нас тут текстовое название (напр. "АОСР")
                    
                    const selectedAct = actTypeField._rawRecords.find(r => {
                        const keys = actTypeField.sourceKeys || ['name'];
                        const resolvePath = (obj, path) => path.split('.').reduce((o, p) => (o ? o[p] : ''), obj);
                        return keys.map(k => resolvePath(r, k)).filter(Boolean).join(' ') === actVal;
                    });
                    
                    if (selectedAct) {
                        templatePath = selectedAct.template_path; // Поле в PocketBase
                        actName = selectedAct.name;
                    }
                }

                if (!templatePath) {
                    this.openDialog('Ошибка', 'Для выбранного типа акта не указан путь к шаблону. Укажите его в коллекции act_types в поле "template_path".', 'alert');
                    this.isDownloadingAct = false;
                    return;
                }

                // 3. Скачиваем .docx файл с сервера
                const response = await fetch(templatePath);
                if (!response.ok) throw new Error(`Шаблон не найден по пути: ${templatePath}`);

                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();

                // 4. Собираем данные (плоский объект) для шаблонизатора
                let templateData = { ...this.editingItem };
                
                // Раскрываем наш Dynamic JSON! Превращаем { cipher: { value: "123" } } в { cipher: "123" }
                if (this.editingItem.own_config && typeof this.editingItem.own_config === 'object') {
                    for (let dynKey in this.editingItem.own_config) {
                        templateData[dynKey] = this.editingItem.own_config[dynKey].value || '';
                    }
                }
                
                // Красиво форматируем обычные даты (start_date, end_date) в формат ДД.ММ.ГГГГ
                for (let key in templateData) {
                    const schemaField = this.currentEditSchema.find(f => f.key === key);
                    if (schemaField && schemaField.type === 'date' && templateData[key]) {
                        const d = new Date(templateData[key]);
                        if (!isNaN(d.getTime())) {
                            templateData[key] = d.toLocaleDateString('ru-RU');
                        }
                    }
                }

                // 5. Генерируем Word-документ
                const zip = new window.PizZip(arrayBuffer); 
                const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
                
                doc.render(templateData);

                const out = doc.getZip().generate({
                    type: "blob",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });

                // Вызываем скачивание
                window.saveAs(out, `${actName}_${new Date().toLocaleDateString('ru-RU')}.docx`);
                
            } catch (error) {
                console.error("Ошибка сборки акта:", error);
                this.openDialog('Ошибка', 'Не удалось сгенерировать акт: ' + error.message, 'alert');
            } finally {
                this.isDownloadingAct = false;
            }
        },

        // ==========================================
        // 11. УТИЛИТЫ И ФОРМАТИРОВАНИЕ
        // ==========================================
        parseNumber(value) {
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'number') return value;
            let cleaned = String(value).replace(/[\s\xa0\u202f]/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
            let parsed = parseFloat(cleaned);
            return isNaN(parsed) ? null : parsed;
        },

        formatValue(value, formatType) {
            if (Array.isArray(value)) return value.join(', ');
            if (value === null || value === undefined || value === '') return '';
            
            const num = Number(value);
            const isNum = !isNaN(num) && typeof value !== 'boolean';
            if (formatType === 'raw') return value;

            if (isNum) {
                switch (formatType) {
                    case 'currency': return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(num);
                    case 'decimal2':
                    case 'currency_no_symbol': return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
                    case 'decimal3': return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(num);
                    case 'decimal1': return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num);
                    case 'integer':
                    case 'int': return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);
                    case 'percent': return new Intl.NumberFormat('ru-RU', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num / 100);
                }
            }

            if (formatType === 'date' && value) {
                const dateObj = new Date(value);
                if (!isNaN(dateObj.getTime())) return dateObj.toLocaleDateString('ru-RU'); 
            }

            return value;
        },
        
        /*
        ЛОГИКА ГРАФИКА ПРОИЗВОДСТВА РАБОТ
        */
        gprTimeline: { years: [], months: [], weeks: [] },
            
        formatNumber(val) {
            const num = Number(val) || 0;
            if (num === 0) return '0';
            return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(num);
        },

        getFactColorClass(remainder, plan) {
            const r = Number(remainder) || 0;
            const p = Number(plan) || 0;
            // Если план есть и факт равен плану или превышает его
            if (p > 0 && Math.abs(r) <= 0.001) return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-400 group-hover/workrow:bg-emerald-200 dark:group-hover/workrow:bg-emerald-800';
            // Если факт превысил план значительно
            if (p > 0 && r < -0.001) return 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400 group-hover/workrow:bg-amber-200 dark:group-hover/workrow:bg-amber-800';
            // Нейтральный цвет
            return 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 group-hover/workrow:bg-slate-100 dark:group-hover/workrow:bg-slate-800';
        },

        getRemColorClass(remainder) {
            const r = Number(remainder) || 0;
            // Остаток ушел в минус
            if (r < -0.001) return 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-400 group-hover/workrow:bg-rose-200 dark:group-hover/workrow:bg-rose-800';
            // Положительный остаток или ноль
            return 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 group-hover/workrow:bg-slate-100 dark:group-hover/workrow:bg-slate-800';
        },
        
        toggleDisplayMode() {
            this.gprDisplayMode = this.gprDisplayMode === 'number' ? 'percent' : 'number';
        },
        
        formatGprValue(val, plan) {
            const numVal = Number(val) || 0;
            if (this.gprDisplayMode === 'percent') {
                const numPlan = Number(plan) || 0;
                if (numPlan === 0) return '0%';
                return Math.round((numVal / numPlan) * 100) + '%';
            }
            return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(numVal);
        },

        generateTimeline(facts, plans) {
            let minDate = new Date();
            let maxDate = new Date();
            maxDate.setMonth(maxDate.getMonth() + 3); 
        
            let hasDates = false;
            
            const checkDate = (dString) => {
                if (!dString) return;
                let d = new Date(dString);
                if (isNaN(d.getTime())) return;
                if (!hasDates || d < minDate) { minDate = d; hasDates = true; }
                if (d > maxDate) { maxDate = d; }
            };

            facts.forEach(f => checkDate(f.date));
            plans.forEach(p => checkDate(p.week_monday));
        
            minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
        
            const weeks = [];
            const months = [];
            const years = [];
        
            let current = new Date(minDate);
            let day = current.getDay(), diff = current.getDate() - day + (day === 0 ? -6 : 1);
            current = new Date(current.setDate(diff));
        
            while (current <= maxDate) {
                let weekStart = new Date(current);
                let weekEnd = new Date(current);
                weekEnd.setDate(weekEnd.getDate() + 6);
        
                let midWeek = new Date(weekStart);
                midWeek.setDate(midWeek.getDate() + 3);
        
                let y = midWeek.getFullYear();
                let m = midWeek.getMonth();
                let mName = midWeek.toLocaleString('ru-RU', { month: 'long' });
                mName = mName.charAt(0).toUpperCase() + mName.slice(1);
        
                let wId = `${weekStart.getFullYear()}-${(weekStart.getMonth()+1).toString().padStart(2, '0')}-${weekStart.getDate().toString().padStart(2, '0')}`;
                let wLabel = `${weekStart.getDate().toString().padStart(2, '0')}.${(weekStart.getMonth()+1).toString().padStart(2, '0')}`;
        
                weeks.push({ 
                    id: wId, 
                    label: wLabel, 
                    year: y, 
                    month: m, 
                    monthName: mName,
                    start: weekStart.getTime(),
                    end: weekEnd.getTime()
                });
        
                current.setDate(current.getDate() + 7);
            }
        
            let lastYear = null;
            let lastMonth = null;
        
            weeks.forEach(w => {
                if (!lastYear || lastYear.value !== w.year) {
                    lastYear = { value: w.year, colspan: 0 };
                    years.push(lastYear);
                }
                lastYear.colspan++;
        
                let monthId = `${w.year}-${w.month}`;
                if (!lastMonth || lastMonth.id !== monthId) {
                    lastMonth = { id: monthId, label: w.monthName, colspan: 0 };
                    months.push(lastMonth);
                }
                lastMonth.colspan++;
            });
        
            this.gprTimeline = { years, months, weeks };
        },

        async savePlan(projectId, groupId, weekId, weekData) {
            if (!this.hasAccess('update')) {
                this.openDialog('Ошибка доступа', 'У вас нет прав на редактирование графика!', 'alert');
                return;
            }

            let val = this.parseNumber(weekData.plan);
            
            try {
                if (weekData.planId) {
                    if (val !== null && val > 0) {
                        await pb.collection('plans').update(weekData.planId, { quantity: val });
                    } else {
                        await pb.collection('plans').delete(weekData.planId);
                        weekData.planId = null;
                        weekData.plan = '';
                    }
                } else {
                    if (val !== null && val > 0) {
                        const record = await pb.collection('plans').create({
                            project: projectId,
                            group: groupId,
                            week_monday: weekId,
                            quantity: val
                        });
                        weekData.planId = record.id;
                    } else {
                        weekData.plan = ''; 
                    }
                }
            } catch (err) {
                console.error("Ошибка сохранения плана:", err);
                this.openDialog('Ошибка', 'Не удалось сохранить план в базу данных.', 'alert');
            }
        },
        
        async loadGprObjects() {
            try {
                if (this.currentUser.role !== 'admin' && this.allowedObjectIds.length === 0) {
                    await this.cacheUserAccess();
                }
            
                // Если у пользователя есть право view_all_items в 'gpr', сбрасываем фильтрацию по объектам
                const gprAccess = this.userAccess['gpr'] || {};
                let accessRule = (gprAccess.view_all_items === true) ? '' : this.buildAccessFilter('objects');
            
                const reqOptions = { sort: 'name', requestKey: null };

                if (accessRule && accessRule !== 'id="NONE"') {
                    reqOptions.filter = accessRule;
                } else if (accessRule === 'id="NONE"') {
                    this.gprObjects = [];
                    return; 
                }
            
                this.gprObjects = await pb.collection('objects').getFullList(reqOptions);
            } catch (err) {
                console.error("Ошибка загрузки объектов ГПР", err);
            }
        },
        
        async loadGprData() {
            if (!this.gprSelectedObject) {
                this.gprData = [];
                return;
            }
        
            this.isGprLoading = true;

            try {
                const filterObj = `object = "${this.gprSelectedObject}"`;
                let projectFilter = filterObj;

                // Если у пользователя есть право view_all_items в 'gpr', сбрасываем фильтрацию по проектам
                const gprAccess = this.userAccess['gpr'] || {};
                let projAccessRule = (gprAccess.view_all_items === true) ? '' : this.buildAccessFilter('projects');
            
                if (projAccessRule) projectFilter = `(${filterObj}) && (${projAccessRule})`;

                const projects = await pb.collection('projects').getFullList({ filter: projectFilter, sort: 'name', requestKey: null });
                const projectIds = projects.map(p => p.id);
            
                if (projectIds.length === 0) {
                    this.gprData = [];
                    this.isGprLoading = false;
                    return;
                }
            
                const groupFilter = projectIds.map(id => `projects ~ "${id}"`).join(' || ');
                const groups = await pb.collection('groups').getFullList({ filter: `(${groupFilter})`, sort: 'name', requestKey: null });
            
                const matFilter = projectIds.map(id => `project="${id}"`).join(' || ');
                const materials = await pb.collection('materials').getFullList({ filter: `(${matFilter})`, sort: 'name', requestKey: null });

                const facts = await pb.collection('facts').getFullList({
                    filter: projectIds.map(id => `material.project="${id}"`).join(' || '),
                    requestKey: null
                });

                const plans = await pb.collection('plans').getFullList({
                    filter: projectIds.map(id => `project="${id}"`).join(' || '),
                    requestKey: null
                });

                this.generateTimeline(facts, plans);
            
                this.gprData = projects.map(project => {
                    const projectMaterials = materials.filter(m => m.project === project.id);
                    const projectPlans = plans.filter(p => p.project === project.id);
                    
                    const projectGroups = groups.filter(g => g.projects && g.projects.includes(project.id)).map(group => {
                        const groupMats = projectMaterials.filter(m => m.group === group.id);
                        const groupPlans = projectPlans.filter(p => p.group === group.id);
                        
                        const unitsSet = new Set();
                        let totalPlan = 0;
                        let totalFact = 0;
                    
                        groupMats.forEach(m => {
                            if (m.unit && String(m.unit).trim() !== '') unitsSet.add(String(m.unit).trim());
                            totalPlan += (Number(m.quantity_spec) || 0);
                        });

                        const groupFacts = facts.filter(f => groupMats.some(m => m.id === f.material));
                        
                        const timeline = {};
                        this.gprTimeline.weeks.forEach(w => {
                            timeline[w.id] = { plan: '', fact: 0, planId: null };
                        });

                        groupPlans.forEach(p => {
                            if (p.week_monday && timeline[p.week_monday]) {
                                timeline[p.week_monday].plan = p.quantity;
                                timeline[p.week_monday].planId = p.id;
                            }
                        });

                        groupFacts.forEach(f => {
                            if (!f.date) return;
                            let fDate = new Date(f.date).getTime();
                            totalFact += (Number(f.quantity) || 0);
        
                            const targetWeek = this.gprTimeline.weeks.find(w => fDate >= w.start && fDate <= w.end + 86399999);
                            if (targetWeek) {
                                timeline[targetWeek.id].fact += (Number(f.quantity) || 0);
                            }
                        });
                    
                        const units = Array.from(unitsSet).join(', ') || '';
                    
                        return {
                            id: group.id,
                            name: group.name,
                            units: units,
                            plan: totalPlan || 0,
                            fact: totalFact,
                            remainder: totalPlan - totalFact,
                            timeline: timeline
                        };
                    });
                
                    return {
                        id: project.id,
                        name: project.name,
                        expanded: true,
                        groups: projectGroups.sort((a, b) => a.name.localeCompare(b.name))
                    };
                });
            
            } catch (err) {
                console.error("Ошибка формирования данных ГПР", err);
            } finally {
                this.isGprLoading = false;
            }
        },
        
        // ==========================================
        // 12. СТИЛИ (TAILWIND)
        // ==========================================
        mainBtn: 'box-border flex flex-col p-1 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 outline-none transition-colors',
        subBtn: 'box-border flex items-center px-3 py-1.5 text-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg outline-none w-full text-left transition-colors duration-150',
        subBtnNormal: 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60',
        subBtnActive: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-medium',
        anyInput: 'box-border w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg outline-none transition-all duration-150 focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600 placeholder:text-slate-400 dark:placeholder:text-slate-500',
        anyBtn: 'box-border flex items-center justify-center self-center gap-1 px-2 py-1.5 text-md font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300/80 dark:hover:bg-slate-600 rounded-lg outline-none w-auto text-center transition-colors duration-150 border border-slate-300 dark:border-slate-600'
    }));
});

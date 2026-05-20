class EditorManager {
    constructor(mapManager, uiManager, socketManager, storageManager) {
        this.mapManager = mapManager;
        this.uiManager = uiManager;
        this.socketManager = socketManager;
        this.storageManager = storageManager;
        this.dragHandler = null;
        this.zoneManager = null;
        this.undoManager = null;
        this.alignmentManager = null;

        this.isEditorMode = false;
        this.snapEnabled = false;
        this.gridSize = 40;
        this.selectedDesks = new Set();
        this.desks = new Map();
        this.zones = [];

        this.nextDeskId = 41;

        // Multi-select rectangle drag
        this._selRect = null;
        this._selStart = null;
        this._selActive = false;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSavedLayout();
    }

    bindEvents() {
        document.getElementById('editor-mode-btn')?.addEventListener('click', () => this.toggleEditorMode());
        document.getElementById('add-desk-btn')?.addEventListener('click', () => this.addNewDesk());
        document.getElementById('delete-selected-btn')?.addEventListener('click', () => this.deleteSelectedDesks());
        document.getElementById('snap-grid-btn')?.addEventListener('click', () => this.toggleSnapGrid());
        document.getElementById('smart-guides-btn')?.addEventListener('click', () => this.toggleSmartGuides());
        document.getElementById('grid-size')?.addEventListener('change', (e) => this.setGridSize(parseInt(e.target.value)));
        document.getElementById('reset-layout-btn')?.addEventListener('click', () => this.resetLayout());
        document.getElementById('save-layout-btn')?.addEventListener('click', () => this.saveLayout());
        document.getElementById('export-layout-btn')?.addEventListener('click', () => this.exportLayout());
        document.getElementById('import-layout')?.addEventListener('change', (e) => this.importLayout(e));
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undoManager?.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.undoManager?.redo());
        document.getElementById('auto-layout-btn')?.addEventListener('click', () => this.openAutoLayoutPanel());

        document.addEventListener('keydown', (e) => {
            if (!this.isEditorMode) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && e.key === 'n') { e.preventDefault(); this.addNewDesk(); }
            else if (ctrl && e.key === 's') { e.preventDefault(); this.saveLayout(); }
            else if (ctrl && e.key === 'a') { e.preventDefault(); this.selectAll(); }
            else if (ctrl && e.key === 'd') { e.preventDefault(); this.duplicateSelected(); }
            else if (e.key === 'Delete' && this.selectedDesks.size > 0) { this.deleteSelectedDesks(); }
            else if (e.key === 'Escape') { this.clearSelection(); }
            // Arrow nudge
            else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
                e.preventDefault();
                this._nudgeSelected(e.key, e.shiftKey ? 10 : 1);
            }
        });

        // Context menu
        const contextMenu = document.getElementById('context-menu');
        document.addEventListener('click', () => { contextMenu.style.display = 'none'; });

        // Multi-select rectangle
        this._bindSelectionRect();
    }

    _bindSelectionRect() {
        const wrapper = document.getElementById('svg-wrapper');
        if (!wrapper) return;

        wrapper.addEventListener('mousedown', (e) => {
            if (!this.isEditorMode) return;
            if (window.zoneManager?.isZoneCreationMode) return;
            if (e.button !== 0) return;

            // Solo activar selección rect sobre el fondo del SVG (no sobre desk/zona)
            const overDesk = e.target.closest?.('.desk-group');
            const overZone = e.target.closest?.('.zone-group');
            if (overDesk || overZone) return;

            // Usar Ctrl/Shift para selección aditiva; click simple sobre fondo limpia
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                this.selectedDesks.forEach(id => this.mapManager.highlightDesk(id, false));
                this.selectedDesks.clear();
            }

            this._selStart = { x: e.clientX, y: e.clientY };
            this._selActive = false;
            const selRect = document.getElementById('selection-rect');

            const onMove = (ev) => {
                const dx = ev.clientX - this._selStart.x;
                const dy = ev.clientY - this._selStart.y;
                if (!this._selActive && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    this._selActive = true;
                    if (selRect) selRect.style.display = 'block';
                }
                if (this._selActive && selRect) {
                    selRect.style.left   = `${Math.min(this._selStart.x, ev.clientX)}px`;
                    selRect.style.top    = `${Math.min(this._selStart.y, ev.clientY)}px`;
                    selRect.style.width  = `${Math.abs(dx)}px`;
                    selRect.style.height = `${Math.abs(dy)}px`;
                }
            };

            const onUp = (ev) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                if (this._selActive && selRect) {
                    selRect.style.display = 'none';
                    this._applyRectSelection(
                        Math.min(this._selStart.x, ev.clientX),
                        Math.min(this._selStart.y, ev.clientY),
                        Math.abs(ev.clientX - this._selStart.x),
                        Math.abs(ev.clientY - this._selStart.y)
                    );
                }
                this._selActive = false;
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    _applyRectSelection(clientX, clientY, clientW, clientH) {
        const dh = this.dragHandler;
        if (!dh) return;

        const tl = dh.getSVGPoint(clientX, clientY);
        const br = dh.getSVGPoint(clientX + clientW, clientY + clientH);

        // Limpiar selección previa antes de aplicar la nueva
        this.selectedDesks.forEach(id => this.mapManager.highlightDesk(id, false));
        this.selectedDesks.clear();

        for (const [id, desk] of this.desks) {
            const cx = desk.x + 30;
            const cy = desk.y + 18;
            if (cx >= tl.x && cx <= br.x && cy >= tl.y && cy <= br.y) {
                this.selectedDesks.add(id);
                this.mapManager.highlightDesk(id, true);
            }
        }
        if (this.selectedDesks.size > 0) {
            this._showMultiSelectPanel();
        }
    }

    _showMultiSelectPanel() {
        const panel = document.getElementById('properties-content');
        if (!panel) return;
        const count = this.selectedDesks.size;
        panel.innerHTML = `
            <div class="multiselect-panel">
                <div class="multiselect-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    <span>${count} puestos seleccionados</span>
                </div>
                <div class="align-toolbar-inline">
                    <div class="align-group">
                        <span class="align-label">Alinear</span>
                        <div class="align-buttons">
                            <button id="align-left"     title="Alinear izquierda">⇤</button>
                            <button id="align-center-v" title="Centrar vertical">⇔</button>
                            <button id="align-right"    title="Alinear derecha">⇥</button>
                            <button id="align-top"      title="Alinear arriba">⇡</button>
                            <button id="align-center-h" title="Centrar horizontal">⇕</button>
                            <button id="align-bottom"   title="Alinear abajo">⇣</button>
                        </div>
                    </div>
                    <div class="align-group">
                        <span class="align-label">Distribuir</span>
                        <div class="align-buttons">
                            <button id="distribute-h" title="Distribuir horizontal">⇺</button>
                            <button id="distribute-v" title="Distribuir vertical">⇻</button>
                        </div>
                    </div>
                </div>
                <div class="multiselect-actions">
                    <button id="ms-delete" class="btn-danger">Eliminar selección</button>
                    <button id="ms-duplicate" class="btn-secondary">Duplicar</button>
                </div>
            </div>
        `;
        // Re-bind alignment buttons (ahora están dentro del panel)
        this.alignmentManager?.['_bindButtons']?.();
        if (this.alignmentManager) {
            const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
            bind('align-left',     () => this.alignmentManager.alignLeft());
            bind('align-right',    () => this.alignmentManager.alignRight());
            bind('align-top',      () => this.alignmentManager.alignTop());
            bind('align-bottom',   () => this.alignmentManager.alignBottom());
            bind('align-center-h', () => this.alignmentManager.alignCenterH());
            bind('align-center-v', () => this.alignmentManager.alignCenterV());
            bind('distribute-h',   () => this.alignmentManager.distributeH());
            bind('distribute-v',   () => this.alignmentManager.distributeV());
        }
        document.getElementById('ms-delete')?.addEventListener('click', () => this.deleteSelectedDesks());
        document.getElementById('ms-duplicate')?.addEventListener('click', () => this.duplicateSelected());
    }

    toggleEditorMode() {
        this.isEditorMode = !this.isEditorMode;
        const editorToolbar     = document.getElementById('editor-toolbar');
        const monitoringSidebar = document.getElementById('monitoring-sidebar');
        const propertiesPanel   = document.getElementById('properties-panel');
        const modeIndicator     = document.getElementById('mode-indicator');
        const editorBtn         = document.getElementById('editor-mode-btn');

        if (this.isEditorMode) {
            editorToolbar.style.display     = 'flex';
            monitoringSidebar.style.display = 'none';
            propertiesPanel.style.display   = 'flex';
            editorBtn.classList.add('active');
            modeIndicator.innerHTML = '<span class="mode-dot editing"></span>Modo Edición';

            if (!this.dragHandler) {
                this.dragHandler = new DragHandler(document.getElementById('floor-map'), this.mapManager, this);
            }
            this.dragHandler.setSnapEnabled(this.snapEnabled);
            this.dragHandler.setGridSize(this.gridSize);

            // Inicializar módulos enterprise la primera vez
            if (!this.undoManager) {
                this.undoManager = new UndoManager(this);
                window.undoManager = this.undoManager;
            }
            if (!this.alignmentManager) {
                this.alignmentManager = new AlignmentManager(this);
            }

            if (this.zoneManager) this.zoneManager.enableEditorEvents();
            this.mapManager.setSelectable(true);
            this.uiManager.showEditorMode(true);

            // Cursor: en modo editor el fondo es de selección, no pan
            document.getElementById('svg-wrapper').style.cursor = 'default';

            // Minimap
            if (!window.minimap) {
                window.minimap = new Minimap(this.mapManager);
            }
        } else {
            editorToolbar.style.display     = 'none';
            monitoringSidebar.style.display = 'flex';
            propertiesPanel.style.display   = 'none';
            editorBtn.classList.remove('active');
            modeIndicator.innerHTML = '<span class="mode-dot"></span>Modo Monitoreo';

            if (this.zoneManager) this.zoneManager.disableEditorEvents();
            this.clearSelection();
            this.mapManager.setSelectable(false);
            this.uiManager.showEditorMode(false);

            // Restaurar cursor pan en modo monitoreo
            document.getElementById('svg-wrapper').style.cursor = 'grab';
        }
    }

    toggleSmartGuides() {
        const se = window.snapEngine;
        if (!se) return;
        se.setEnabled(!se.enabled);
        const btn = document.getElementById('smart-guides-btn');
        btn?.classList.toggle('active', se.enabled);
    }

    openAutoLayoutPanel() {
        if (!this.zoneManager) {
            this.uiManager.showNotification('Crea una zona primero para usar Auto Layout', 'warning');
            return;
        }
        // Si hay zona seleccionada, usar esa; si no, mostrar selector
        const zoneId = this.zoneManager.selectedZoneId;
        if (!zoneId) {
            this.uiManager.showNotification('Selecciona una zona para generar el layout', 'info');
            return;
        }
        const zone = this.zoneManager.zones.get(zoneId);
        if (!zone) return;
        if (!window._layoutGenerators) {
            window._layoutGenerators = new LayoutGenerators(this.zoneManager);
        }
        window._layoutGenerators.showLayoutPanel(zone, this);
    }

    addNewDesk() {
        const newId = this.nextDeskId++;
        const svg   = document.getElementById('floor-map');
        const rect  = svg.getBoundingClientRect();
        const vp    = this.dragHandler?.getSVGPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) || { x: 600, y: 400 };

        let x = vp.x - 30;
        let y = vp.y - 18;
        if (this.snapEnabled) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
        }

        const newDesk = {
            id: newId, x, y, rotation: 0,
            status: 'offline', agent: 'Nuevo Agente',
            extension: null, campaign: 'Sin asignar',
            isNew: true, lastUpdate: new Date()
        };

        this.desks.set(newId, newDesk);
        this.mapManager.addDesk(newDesk, (desk) => {
            if (this.isEditorMode) this.showProperties(desk);
            else this.uiManager.showDeskDetails(desk);
        });

        this.selectDesk(newId);
        this.undoManager?.recordDeskCreate(newDesk);
        this.saveLayoutSilent();

        const deskGroup = this.mapManager.getDeskElement(newId);
        if (deskGroup) {
            deskGroup.style.animation = 'deskAppear 0.3s ease';
            setTimeout(() => { deskGroup.style.animation = ''; }, 300);
        }
    }

    deleteDesk(deskId) {
        const desk = this.desks.get(deskId);
        if (!desk || desk.isLocked) return false;
        this.undoManager?.recordDeskDelete(desk);
        this.desks.delete(deskId);
        this.mapManager.removeDesk(deskId);
        this.selectedDesks.delete(deskId);
        this.saveLayoutSilent();
        return true;
    }

    deleteSelectedDesks() {
        Array.from(this.selectedDesks).forEach(id => this.deleteDesk(id));
        this.clearSelection();
    }

    selectDesk(deskId, addToSelection = false) {
        if (!addToSelection) this.clearSelection();
        this.selectedDesks.add(deskId);
        this.mapManager.highlightDesk(deskId, true);
        const desk = this.desks.get(deskId);
        if (desk && this.isEditorMode) this.showProperties(desk);
    }

    selectAll() {
        for (const id of this.desks.keys()) {
            this.selectedDesks.add(id);
            this.mapManager.highlightDesk(id, true);
        }
        this._showMultiSelectPanel();
    }

    duplicateSelected() {
        const ids = Array.from(this.selectedDesks);
        if (!ids.length) return;
        const newIds = [];
        ids.forEach(id => {
            const desk = this.desks.get(id);
            if (!desk) return;
            const newId = this.nextDeskId++;
            const newDesk = { ...desk, id: newId, x: desk.x + 20, y: desk.y + 20, isNew: true, lastUpdate: new Date() };
            this.desks.set(newId, newDesk);
            this.mapManager.addDesk(newDesk, null);
            this.undoManager?.recordDeskCreate(newDesk);
            newIds.push(newId);
        });
        this.clearSelection();
        newIds.forEach(id => { this.selectedDesks.add(id); this.mapManager.highlightDesk(id, true); });
        this.saveLayoutSilent();
    }

    clearSelection() {
        this.selectedDesks.forEach(id => this.mapManager.highlightDesk(id, false));
        this.selectedDesks.clear();
        if (this.isEditorMode) this.showProperties(null);
        else this.uiManager.showEmptyState();
    }

    _nudgeSelected(key, amount) {
        if (!this.selectedDesks.size) return;
        const snapshots = [];
        for (const id of this.selectedDesks) {
            const desk = this.desks.get(id);
            if (!desk || desk.isLocked) continue;
            snapshots.push({ before: { id, x: desk.x, y: desk.y } });
            if (key === 'ArrowLeft')  desk.x -= amount;
            if (key === 'ArrowRight') desk.x += amount;
            if (key === 'ArrowUp')    desk.y -= amount;
            if (key === 'ArrowDown')  desk.y += amount;
            this.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
            snapshots[snapshots.length - 1].after = { id, x: desk.x, y: desk.y };
        }
        this.undoManager?.recordBulkMove(snapshots);
        this.saveLayoutSilent();
    }

    showProperties(desk) {
        const panel = document.getElementById('properties-content');
        if (!panel) return;
        if (!desk) {
            panel.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                        <path d="M12 8v8M8 12h8"/>
                    </svg>
                    <p>Selecciona un puesto para editar</p>
                </div>`;
            return;
        }

        panel.innerHTML = `
            <div class="properties-form">
                <div class="form-group">
                    <label>ID del Puesto</label>
                    <input type="text" value="#${desk.id}" readonly disabled>
                </div>
                <div class="form-group">
                    <label>Agente</label>
                    <input type="text" id="prop-agent" value="${desk.agent || ''}" placeholder="Nombre del agente">
                </div>
                <div class="form-group">
                    <label>Campaña</label>
                    <input type="text" id="prop-campaign" value="${desk.campaign || ''}" placeholder="Campaña">
                </div>
                <div class="form-group">
                    <label>Extensión</label>
                    <input type="text" id="prop-extension" value="${desk.extension || ''}" placeholder="Extensión">
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="prop-status">
                        <option value="online"  ${desk.status === 'online'  ? 'selected' : ''}>Online</option>
                        <option value="busy"    ${desk.status === 'busy'    ? 'selected' : ''}>Ocupado</option>
                        <option value="pause"   ${desk.status === 'pause'   ? 'selected' : ''}>Pausa</option>
                        <option value="offline" ${desk.status === 'offline' ? 'selected' : ''}>Offline</option>
                        <option value="error"   ${desk.status === 'error'   ? 'selected' : ''}>Error</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Coordenadas</label>
                    <div class="coord-group">
                        <input type="number" id="prop-x" value="${desk.x}" placeholder="X" step="10">
                        <input type="number" id="prop-y" value="${desk.y}" placeholder="Y" step="10">
                    </div>
                </div>
                <div class="form-group">
                    <label>Rotación: <span id="rotation-value">${desk.rotation || 0}°</span></label>
                    <div class="rotation-group">
                        <input type="range" id="prop-rotation" min="0" max="359" value="${desk.rotation || 0}" step="1">
                        <input type="number" id="prop-rotation-num" value="${desk.rotation || 0}" min="0" max="359" step="1" style="width:58px">
                    </div>
                    <div class="rotation-presets">
                        <button class="btn-preset" data-angle="0">0°</button>
                        <button class="btn-preset" data-angle="45">45°</button>
                        <button class="btn-preset" data-angle="90">90°</button>
                        <button class="btn-preset" data-angle="135">135°</button>
                        <button class="btn-preset" data-angle="180">180°</button>
                        <button class="btn-preset" data-angle="270">270°</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="prop-locked" ${desk.isLocked ? 'checked' : ''}>
                        Bloquear posición
                    </label>
                </div>
                <div class="form-actions">
                    <button id="apply-properties" class="btn-primary">Aplicar Cambios</button>
                    <button id="delete-desk" class="btn-danger">Eliminar</button>
                </div>
            </div>`;

        const rotSlider = document.getElementById('prop-rotation');
        const rotNum    = document.getElementById('prop-rotation-num');
        const rotLabel  = document.getElementById('rotation-value');

        const applyRotLive = (angle) => {
            const a = ((parseInt(angle) % 360) + 360) % 360;
            desk.rotation = a;
            if (rotSlider) rotSlider.value = a;
            if (rotNum)    rotNum.value    = a;
            if (rotLabel)  rotLabel.textContent = `${a}°`;
            this.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
        };

        rotSlider?.addEventListener('input', (e) => applyRotLive(e.target.value));
        rotNum?.addEventListener('input',    (e) => applyRotLive(e.target.value));
        panel.querySelectorAll('.btn-preset').forEach(btn =>
            btn.addEventListener('click', () => applyRotLive(btn.dataset.angle))
        );

        document.getElementById('apply-properties')?.addEventListener('click', () => {
            const before = this.undoManager?.snapshotDesk(desk);
            desk.agent    = document.getElementById('prop-agent')?.value;
            desk.campaign = document.getElementById('prop-campaign')?.value;
            desk.extension = document.getElementById('prop-extension')?.value;
            desk.status   = document.getElementById('prop-status')?.value;
            desk.isLocked = document.getElementById('prop-locked')?.checked;
            desk.rotation = ((parseInt(document.getElementById('prop-rotation')?.value) || 0) % 360 + 360) % 360;
            const x = parseInt(document.getElementById('prop-x')?.value);
            const y = parseInt(document.getElementById('prop-y')?.value);
            if (!isNaN(x) && !isNaN(y)) {
                desk.x = Math.max(0, Math.min(1140, x));
                desk.y = Math.max(0, Math.min(764, y));
            }
            this.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
            this.mapManager.updateDesk(desk);
            if (before) this.undoManager?.recordDeskProps(desk, before);
            this.saveLayout();
            this.showProperties(desk);
        });

        document.getElementById('delete-desk')?.addEventListener('click', () => {
            if (confirm(`¿Eliminar puesto #${desk.id}?`)) {
                this.deleteDesk(desk.id);
                this.clearSelection();
            }
        });
    }

    toggleSnapGrid() {
        this.snapEnabled = !this.snapEnabled;
        const gridSelect = document.getElementById('grid-size');
        const snapBtn    = document.getElementById('snap-grid-btn');
        gridSelect.disabled = !this.snapEnabled;
        snapBtn?.classList.toggle('active', this.snapEnabled);
        this.dragHandler?.setSnapEnabled(this.snapEnabled);
    }

    setGridSize(size) {
        this.gridSize = size;
        this.dragHandler?.setGridSize(size);
    }

    getDeskById(id) { return this.desks.get(id); }

    onDeskMove(desk) {
        this.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
        window.minimap?.scheduleRender();
    }

    onDeskMoveEnd(desk) {
        if (this.zoneManager) this.zoneManager.checkDeskZoneAssignment(desk);
        this.saveLayoutSilent();
        window.minimap?.scheduleRender();
    }

    saveLayout(options = {}) {
        const desksArray = Array.from(this.desks.values());
        const zonesArray = this.zoneManager ? this.zoneManager.getAllZones() : this.zones;
        this.storageManager.saveLayout(desksArray);
        this.storageManager.saveZones(zonesArray);
        if (!options.silent) {
            this.uiManager.showNotification('Layout guardado', 'success');
        }
    }

    saveLayoutSilent() { this.saveLayout({ silent: true }); }

    saveLayoutDebounced() {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = setTimeout(() => this.saveLayoutSilent(), 400);
    }

    loadSavedLayout() {
        const savedDesks = this.storageManager.loadLayout();
        const savedZones = this.storageManager.loadZones();
        if (savedDesks?.length > 0) {
            this.desks.clear();
            savedDesks.forEach(desk => {
                this.desks.set(desk.id, desk);
                if (desk.id >= this.nextDeskId) this.nextDeskId = desk.id + 1;
            });
            this.zones = savedZones;
            return true;
        }
        return false;
    }

    resetLayout() {
        if (!confirm('¿Resetear layout? Se eliminarán todos los puestos y zonas.')) return;

        // Borrar storage
        this.storageManager.clearLayout();

        // Borrar puestos del mapa y del estado interno
        this.desks.forEach((_, id) => this.mapManager.removeDesk(id));
        this.desks.clear();
        this.selectedDesks.clear();
        this.nextDeskId = 1;

        // Borrar zonas
        if (this.zoneManager) {
            this.zoneManager.clearAllZones();
        }

        // Limpiar undo/redo
        this.undoManager?.clear();

        // Limpiar panel de propiedades
        const content = document.getElementById('properties-content');
        if (content) content.innerHTML = '';

        // Mostrar canvas vacío
        this.uiManager.showCanvasEmpty();
        this.uiManager.showNotification('Layout reseteado — workspace vacío', 'info');
    }

    exportLayout() {
        const desksArray = Array.from(this.desks.values());
        this.storageManager.exportLayout(desksArray, this.zones);
        this.uiManager.showNotification('Layout exportado correctamente', 'success');
    }

    importLayout(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imported = this.storageManager.importLayout(e.target.result);
            if (imported?.desks) {
                if (confirm('¿Importar layout? Se reemplazará el layout actual.')) {
                    this.desks.clear();
                    imported.desks.forEach(desk => {
                        this.desks.set(desk.id, desk);
                        if (desk.id >= this.nextDeskId) this.nextDeskId = desk.id + 1;
                    });
                    this.zones = imported.zones || [];
                    this.saveLayout();
                    location.reload();
                }
            } else {
                this.uiManager.showNotification('Error al importar layout', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
}

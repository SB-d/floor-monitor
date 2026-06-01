class ZoneManager {
    constructor(zonesContainer, editorManager, mapManager) {
        this.zonesContainer = zonesContainer;
        this.editorManager = editorManager;
        this.mapManager = mapManager;
        this.zones = new Map();
        this.selectedZoneId = null;
        
        // Estado del modo zona
        this.isZoneCreationMode = false;
        this.isCreating = false;
        this.isResizing = false;
        this.isDraggingZone = false;
        
        // Variables de creación
        this.creationStart = null;
        this.tempZoneElement = null;
        
        // Configuración
        this.snapEnabled = true;
        this.gridSize = 40;
        
        // Bindings (mantener referencia para poder removeEventListener)
        this.onMouseDownHandler = this.onMouseDown.bind(this);
        this.onMouseMoveHandler = this.onMouseMove.bind(this);
        this.onMouseUpHandler = this.onMouseUp.bind(this);
        this.onResizeMoveHandler = this.onResizeMove.bind(this);
        this.onResizeEndHandler = this.onResizeEnd.bind(this);
        this.onZoneDragMoveHandler = this.onZoneDragMove.bind(this);
        this.onZoneDragEndHandler = this.onZoneDragEnd.bind(this);

        // Refs DOM por zona { zoneId -> { group, rect, border, labelBg, label, info, handles: {nw,n,ne,e,se,s,sw,w} } }
        this.zoneRefs = new Map();

        this.init();
    }
    
    init() {
        this.bindButtons();
        this.bindGlobalKeys();
        console.log('✅ ZoneManager inicializado');
    }

    bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isZoneCreationMode) {
                this.deactivateZoneCreationMode();
                this.editorManager?.uiManager?.showNotification('Modo zona cancelado', 'info');
            }
        });
    }

    enableEditorEvents() { /* eventos se enganchan al entrar en modo creación */ }
    disableEditorEvents() {
        if (this.isZoneCreationMode) this.deactivateZoneCreationMode();
    }

    bindButtons() {
        const addZoneBtn = document.getElementById('add-zone-btn');
        if (addZoneBtn) {
            addZoneBtn.addEventListener('click', () => {
                console.log('🔘 Botón Zona clickeado');
                if (this.isZoneCreationMode) {
                    this.deactivateZoneCreationMode();
                } else {
                    this.activateZoneCreationMode();
                }
            });
        }
        
        const duplicateBtn = document.getElementById('duplicate-zone-btn');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', () => this.duplicateSelectedZone());
        }
        
        const lockBtn = document.getElementById('lock-zone-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.toggleZoneLock());
        }
        
        const hideBtn = document.getElementById('hide-zones-btn');
        if (hideBtn) {
            hideBtn.addEventListener('click', () => this.toggleZonesVisibility());
        }
        
        const arrangeBtn = document.getElementById('arrange-zones-btn');
        if (arrangeBtn) {
            arrangeBtn.addEventListener('click', () => this.autoArrangeZones());
        }
    }
    
    activateZoneCreationMode() {
        if (!this.editorManager?.isEditorMode) {
            console.warn('⚠️ No estás en modo editor. Activa el modo edición primero.');
            this.editorManager?.uiManager?.showNotification('Activa el modo edición primero', 'warning');
            return;
        }

        this.isZoneCreationMode = true;

        const svgWrapper = document.getElementById('svg-wrapper');
        svgWrapper.classList.add('zone-creating');
        svgWrapper.style.cursor = 'crosshair';
        document.body.classList.add('zone-mode-active');

        document.getElementById('add-zone-btn')?.classList.add('active');

        this.showCreationOverlay();

        // Capturar antes del pan handler (fase de captura)
        svgWrapper.addEventListener('mousedown', this.onMouseDownHandler, true);
        window.addEventListener('mousemove', this.onMouseMoveHandler, true);
        window.addEventListener('mouseup', this.onMouseUpHandler, true);

        console.log('🎨 Modo creación de zonas ACTIVADO');
        this.editorManager?.uiManager?.showNotification('Modo zona activo. Haz click y arrastra sobre el mapa (ESC para salir)', 'info');
    }

    deactivateZoneCreationMode() {
        this.isZoneCreationMode = false;
        this.isCreating = false;
        this.creationStart = null;

        const svgWrapper = document.getElementById('svg-wrapper');
        svgWrapper.classList.remove('zone-creating');
        svgWrapper.style.cursor = 'grab';
        document.body.classList.remove('zone-mode-active');

        document.getElementById('add-zone-btn')?.classList.remove('active');

        this.hideCreationOverlay();

        svgWrapper.removeEventListener('mousedown', this.onMouseDownHandler, true);
        window.removeEventListener('mousemove', this.onMouseMoveHandler, true);
        window.removeEventListener('mouseup', this.onMouseUpHandler, true);

        if (this.tempZoneElement) {
            this.tempZoneElement.remove();
            this.tempZoneElement = null;
        }

        console.log('🎨 Modo creación de zonas DESACTIVADO');
    }
    
    showCreationOverlay() {
        let overlay = document.querySelector('.zone-creation-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'zone-creation-overlay';
            overlay.innerHTML = `
                <div class="zone-creation-hint">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="9" y1="3" x2="9" y2="21"/>
                        <line x1="15" y1="3" x2="15" y2="21"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="3" y1="15" x2="21" y2="15"/>
                    </svg>
                    <span>Modo creación de zonas activo</span>
                    <small>Click y arrastra para crear una nueva zona</small>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }
    
    hideCreationOverlay() {
        const overlay = document.querySelector('.zone-creation-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    getSVGCoordinates(clientX, clientY) {
        const mapRoot = document.getElementById('map-root');
        const svgEl = document.getElementById('floor-map');
        const pt = svgEl.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        try {
            const ctm = mapRoot.getScreenCTM();
            if (ctm) return pt.matrixTransform(ctm.inverse());
        } catch (err) { /* fall through */ }
        // Fallback
        const rect = svgEl.getBoundingClientRect();
        const vbW = svgEl.viewBox.baseVal.width  || 1200;
        const vbH = svgEl.viewBox.baseVal.height || 800;
        const mm = this.mapManager;
        return {
            x: ((clientX - rect.left) * (vbW / rect.width) - (mm?.translateX || 0)) / (mm?.scale || 1),
            y: ((clientY - rect.top)  * (vbH / rect.height) - (mm?.translateY || 0)) / (mm?.scale || 1)
        };
    }
    
    onMouseDown(e) {
        if (!this.isZoneCreationMode) return;
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

        const coords = this.getSVGCoordinates(e.clientX, e.clientY);
        console.log('🖱️ Zone MouseDown en:', coords);

        this.isCreating = true;
        this.creationStart = { x: coords.x, y: coords.y };

        this.createTempZoneElement(coords.x, coords.y);
    }
    
    createTempZoneElement(x, y) {
        const svg = document.getElementById('floor-map');
        this.tempZoneElement = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.tempZoneElement.setAttribute('class', 'temp-zone');
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', 0);
        rect.setAttribute('height', 0);
        rect.setAttribute('fill', 'rgba(59, 130, 246, 0.2)');
        rect.setAttribute('stroke', '#3b82f6');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '8,4');
        rect.setAttribute('rx', '8');
        
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x + 10);
        label.setAttribute('y', y + 25);
        label.setAttribute('fill', '#3b82f6');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-family', 'Inter');
        label.textContent = 'Nueva Zona';
        
        const dimensions = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dimensions.setAttribute('x', x + 10);
        dimensions.setAttribute('y', y + 42);
        dimensions.setAttribute('fill', '#9ca3af');
        dimensions.setAttribute('font-size', '10');
        dimensions.setAttribute('font-family', 'Inter');
        dimensions.textContent = '0 x 0';
        
        this.tempZoneElement.appendChild(rect);
        this.tempZoneElement.appendChild(label);
        this.tempZoneElement.appendChild(dimensions);
        
        const zonesContainer = document.getElementById('zones');
        zonesContainer.appendChild(this.tempZoneElement);
    }
    
    updateTempZoneElement(currentX, currentY) {
        if (!this.tempZoneElement || !this.creationStart) return;

        let x = Math.min(this.creationStart.x, currentX);
        let y = Math.min(this.creationStart.y, currentY);
        let width = Math.abs(currentX - this.creationStart.x);
        let height = Math.abs(currentY - this.creationStart.y);

        // Snap to grid (sin forzar mínimo durante el preview)
        if (this.snapEnabled && this.editorManager?.snapEnabled !== false && width > this.gridSize && height > this.gridSize) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
            width = Math.round(width / this.gridSize) * this.gridSize;
            height = Math.round(height / this.gridSize) * this.gridSize;
        }
        
        const rect = this.tempZoneElement.children[0];
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        
        const label = this.tempZoneElement.children[1];
        label.setAttribute('x', x + 10);
        label.setAttribute('y', y + 25);
        
        const dimensions = this.tempZoneElement.children[2];
        dimensions.setAttribute('x', x + 10);
        dimensions.setAttribute('y', y + 42);
        dimensions.textContent = `${Math.round(width)} x ${Math.round(height)}`;
    }
    
    onMouseMove(e) {
        if (!this.isZoneCreationMode || !this.isCreating) return;

        e.preventDefault();
        e.stopPropagation();

        const coords = this.getSVGCoordinates(e.clientX, e.clientY);
        this.updateTempZoneElement(coords.x, coords.y);
    }

    onMouseUp(e) {
        if (!this.isZoneCreationMode) return;
        if (!this.isCreating) return; // ignorar mouseup sueltos

        e.preventDefault();
        e.stopPropagation();

        const coords = this.getSVGCoordinates(e.clientX, e.clientY);
        console.log('🖱️ Zone MouseUp en:', coords);

        const width = Math.abs(coords.x - this.creationStart.x);
        const height = Math.abs(coords.y - this.creationStart.y);

        // Limpiar preview temporal antes de mostrar diálogo
        if (this.tempZoneElement) {
            this.tempZoneElement.remove();
            this.tempZoneElement = null;
        }

        let createdValid = false;
        if (width > 20 && height > 20) {
            let x = Math.min(this.creationStart.x, coords.x);
            let y = Math.min(this.creationStart.y, coords.y);
            let w = width;
            let h = height;
            if (this.snapEnabled && this.editorManager?.snapEnabled !== false && w > this.gridSize && h > this.gridSize) {
                x = Math.round(x / this.gridSize) * this.gridSize;
                y = Math.round(y / this.gridSize) * this.gridSize;
                w = Math.round(w / this.gridSize) * this.gridSize;
                h = Math.round(h / this.gridSize) * this.gridSize;
            }
            this.showZoneCreationDialog(x, y, w, h);
            createdValid = true;
        } else {
            this.editorManager?.uiManager?.showNotification('Área demasiado pequeña — arrastra más para crear la zona', 'warning');
        }

        this.isCreating = false;
        this.creationStart = null;

        // Desactivar modo solo si se completó una creación válida; si no, dejarlo activo para reintentar
        if (createdValid) {
            this.deactivateZoneCreationMode();
        }
    }
    
    showZoneCreationDialog(x, y, width, height) {
        const dialog = document.createElement('div');
        dialog.className = 'zone-dialog-overlay';
        dialog.innerHTML = `
            <div class="zone-dialog">
                <h3>Crear Nueva Zona</h3>
                <div class="form-group">
                    <label>Nombre de la Zona</label>
                    <input type="text" id="zone-name" placeholder="Ej: Ventas, Soporte, QA..." value="Nueva Zona">
                </div>
                <div class="form-group">
                    <label>Tipo de Zona</label>
                    <select id="zone-type">
                        <option value="sales">💼 Ventas</option>
                        <option value="support">🛠️ Soporte Técnico</option>
                        <option value="qa">✅ QA/Control</option>
                        <option value="noc">📡 NOC</option>
                        <option value="backoffice">📋 Backoffice</option>
                        <option value="meeting">👥 Sala de Juntas</option>
                        <option value="reception">⭐ Recepción</option>
                        <option value="break">☕ Área de Descanso</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <input type="color" id="zone-color" value="#3b82f6">
                </div>
                <div class="form-group">
                    <label>Capacidad (puestos)</label>
                    <input type="number" id="zone-capacity" value="20" min="1" max="200">
                </div>
                <div class="dialog-actions">
                    <button id="cancel-zone" class="btn-secondary">Cancelar</button>
                    <button id="create-zone" class="btn-primary">Crear Zona</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('create-zone').addEventListener('click', () => {
            const name = document.getElementById('zone-name').value;
            const type = document.getElementById('zone-type').value;
            const color = document.getElementById('zone-color').value;
            const capacity = parseInt(document.getElementById('zone-capacity').value);
            
            this.createZone(x, y, width, height, name, type, color, capacity);
            dialog.remove();
        });
        
        document.getElementById('cancel-zone').addEventListener('click', () => {
            dialog.remove();
        });
    }
    
    createZone(x, y, width, height, name, type, color, capacity) {
        const zone = {
            id: `zone_${Date.now()}`,
            name: name,
            type: type,
            color: color,
            x: x,
            y: y,
            width: width,
            height: height,
            capacity: capacity,
            campaign: this.getCampaignByType(type),
            manager: null,
            desks: [],
            isLocked: false,
            visible: true,
            createdAt: new Date(),
            metadata: {}
        };
        
        this.zones.set(zone.id, zone);
        this.renderZone(zone);
        this.selectZone(zone.id);
        this.editorManager?.saveLayoutSilent();
        this.editorManager?.uiManager?.showNotification(`Zona "${name}" creada correctamente`, 'success');

        console.log('✅ Zona creada:', zone);
    }
    
    getCampaignByType(type) {
        const campaigns = {
            sales: 'Campaña de Ventas',
            support: 'Soporte Técnico',
            qa: 'Control de Calidad',
            noc: 'Monitoreo NOC',
            backoffice: 'Gestión Administrativa',
            meeting: 'Reuniones',
            reception: 'Recepción',
            break: 'Descanso'
        };
        return campaigns[type] || 'General';
    }
    
    renderZone(zone) {
        let refs = this.zoneRefs.get(zone.id);

        // Si ya existe el grupo SVG, solo actualizamos atributos (in-place)
        if (refs && refs.group && refs.group.isConnected) {
            this.updateZoneAttributes(zone, refs);
            this.syncSelectionAndHandles(zone, refs);
            return;
        }

        // Si no existe, crear el grupo completo
        const zoneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        zoneGroup.setAttribute('class', `zone-group ${zone.isLocked ? 'locked' : ''}`);
        zoneGroup.setAttribute('data-zone-id', zone.id);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'zone-rect zone-body');
        rect.setAttribute('rx', '12');
        rect.setAttribute('ry', '12');
        rect.setAttribute('stroke-width', '2');
        rect.style.cursor = 'move';

        const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        border.setAttribute('class', 'zone-border');
        border.setAttribute('fill', 'none');
        border.setAttribute('stroke-width', '3');
        border.setAttribute('rx', '12');
        border.setAttribute('ry', '12');
        border.setAttribute('stroke-dasharray', '10, 5');
        border.setAttribute('pointer-events', 'none');

        const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        labelBg.setAttribute('class', 'zone-label-bg');
        labelBg.setAttribute('width', 120);
        labelBg.setAttribute('height', 50);
        labelBg.setAttribute('fill', 'rgba(0,0,0,0.8)');
        labelBg.setAttribute('rx', '6');
        labelBg.style.cursor = 'move';

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('font-size', '13');
        label.setAttribute('font-weight', '600');
        label.setAttribute('font-family', 'Inter');
        label.setAttribute('pointer-events', 'none');

        const info = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        info.setAttribute('fill', '#9ca3af');
        info.setAttribute('font-size', '10');
        info.setAttribute('font-family', 'Inter');
        info.setAttribute('pointer-events', 'none');

        zoneGroup.appendChild(rect);
        zoneGroup.appendChild(border);
        zoneGroup.appendChild(labelBg);
        zoneGroup.appendChild(label);
        zoneGroup.appendChild(info);

        // Crear handles (siempre, los ocultamos según selección)
        const handles = this.createResizeHandles(zoneGroup, zone);

        this.zonesContainer.appendChild(zoneGroup);

        refs = { group: zoneGroup, rect, border, labelBg, label, info, handles };
        this.zoneRefs.set(zone.id, refs);

        // Eventos del grupo: click selecciona, mousedown sobre el body inicia drag
        zoneGroup.addEventListener('click', (e) => {
            if (this._suppressNextClick) {
                this._suppressNextClick = false;
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            this.selectZone(zone.id);
        });

        zoneGroup.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.showZoneProperties(zone.id);
        });

        // Drag desde el body (rect principal o label background)
        const startDragFromBody = (e) => {
            if (this.isZoneCreationMode) return;
            if (e.button !== 0) return;
            const z = this.zones.get(zone.id);
            if (!z || z.isLocked) return;
            this.startZoneDrag(z, e);
        };
        rect.addEventListener('mousedown', startDragFromBody);
        labelBg.addEventListener('mousedown', startDragFromBody);

        this.updateZoneAttributes(zone, refs);
        this.syncSelectionAndHandles(zone, refs);
    }

    updateZoneAttributes(zone, refs) {
        const { rect, border, labelBg, label, info } = refs;
        const fill = `${zone.color}20`;

        rect.setAttribute('x', zone.x);
        rect.setAttribute('y', zone.y);
        rect.setAttribute('width', zone.width);
        rect.setAttribute('height', zone.height);
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', zone.color);

        border.setAttribute('x', zone.x);
        border.setAttribute('y', zone.y);
        border.setAttribute('width', zone.width);
        border.setAttribute('height', zone.height);
        border.setAttribute('stroke', zone.color);

        labelBg.setAttribute('x', zone.x + 10);
        labelBg.setAttribute('y', zone.y + 10);

        label.setAttribute('x', zone.x + 20);
        label.setAttribute('y', zone.y + 30);
        label.setAttribute('fill', zone.color);
        label.textContent = zone.name;

        info.setAttribute('x', zone.x + 20);
        info.setAttribute('y', zone.y + 48);
        const deskCount = Array.isArray(zone.desks) ? zone.desks.length : 0;
        info.textContent = `${deskCount}/${zone.capacity ?? 0} puestos`;

        refs.group.setAttribute('class', `zone-group ${zone.isLocked ? 'locked' : ''} ${this.selectedZoneId === zone.id ? 'selected' : ''}`);
    }

    syncSelectionAndHandles(zone, refs) {
        const isSelected = this.selectedZoneId === zone.id;
        const showHandles = isSelected && !zone.isLocked && this.editorManager?.isEditorMode;

        refs.border.setAttribute('opacity', isSelected ? '1' : '0');

        const handleSize = 8;
        const positions = this.getHandlePositions(zone, handleSize);
        Object.keys(refs.handles).forEach(name => {
            const handle = refs.handles[name];
            const pos = positions[name];
            handle.setAttribute('x', pos.x);
            handle.setAttribute('y', pos.y);
            handle.setAttribute('fill', zone.color);
            handle.style.display = showHandles ? '' : 'none';
        });
    }

    getHandlePositions(zone, handleSize) {
        const hs = handleSize;
        return {
            nw: { x: zone.x - hs/2, y: zone.y - hs/2 },
            n:  { x: zone.x + zone.width/2 - hs/2, y: zone.y - hs/2 },
            ne: { x: zone.x + zone.width - hs/2, y: zone.y - hs/2 },
            e:  { x: zone.x + zone.width - hs/2, y: zone.y + zone.height/2 - hs/2 },
            se: { x: zone.x + zone.width - hs/2, y: zone.y + zone.height - hs/2 },
            s:  { x: zone.x + zone.width/2 - hs/2, y: zone.y + zone.height - hs/2 },
            sw: { x: zone.x - hs/2, y: zone.y + zone.height - hs/2 },
            w:  { x: zone.x - hs/2, y: zone.y + zone.height/2 - hs/2 }
        };
    }

    createResizeHandles(zoneGroup, zone) {
        const handleSize = 8;
        const cursors = {
            nw: 'nwse-resize', se: 'nwse-resize',
            ne: 'nesw-resize', sw: 'nesw-resize',
            n: 'ns-resize', s: 'ns-resize',
            e: 'ew-resize', w: 'ew-resize'
        };
        const handles = {};
        ['nw','n','ne','e','se','s','sw','w'].forEach(name => {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            handle.setAttribute('width', handleSize);
            handle.setAttribute('height', handleSize);
            handle.setAttribute('stroke', '#fff');
            handle.setAttribute('stroke-width', '1.5');
            handle.setAttribute('rx', '2');
            handle.setAttribute('class', `resize-handle resize-${name}`);
            handle.style.cursor = cursors[name];
            handle.style.display = 'none';

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const z = this.zones.get(zone.id);
                if (!z || z.isLocked) return;
                this.startResize(name, e, z);
            });

            zoneGroup.appendChild(handle);
            handles[name] = handle;
        });
        return handles;
    }

    // ============ RESIZE ============
    startResize(handle, event, zone) {
        event.preventDefault();
        event.stopPropagation();

        this.isResizing = true;
        this.resizeHandle = handle;
        this.selectedZoneId = zone.id;

        const refs = this.zoneRefs.get(zone.id);
        if (refs) refs.group.classList.add('resizing');

        const startPoint = this.getSVGCoordinates(event.clientX, event.clientY);
        this.resizeStart = {
            x: startPoint.x,
            y: startPoint.y,
            zoneX: zone.x,
            zoneY: zone.y,
            zoneWidth: zone.width,
            zoneHeight: zone.height
        };

        window.addEventListener('mousemove', this.onResizeMoveHandler);
        window.addEventListener('mouseup', this.onResizeEndHandler);
    }

    onResizeMove(event) {
        if (!this.isResizing || !this.selectedZoneId) return;
        event.preventDefault();

        const zone = this.zones.get(this.selectedZoneId);
        if (!zone || zone.isLocked) return;

        const currentPoint = this.getSVGCoordinates(event.clientX, event.clientY);
        const dx = currentPoint.x - this.resizeStart.x;
        const dy = currentPoint.y - this.resizeStart.y;

        let newX = this.resizeStart.zoneX;
        let newY = this.resizeStart.zoneY;
        let newWidth = this.resizeStart.zoneWidth;
        let newHeight = this.resizeStart.zoneHeight;

        switch(this.resizeHandle) {
            case 'nw': newX += dx; newY += dy; newWidth -= dx; newHeight -= dy; break;
            case 'n':  newY += dy; newHeight -= dy; break;
            case 'ne': newY += dy; newWidth += dx; newHeight -= dy; break;
            case 'e':  newWidth += dx; break;
            case 'se': newWidth += dx; newHeight += dy; break;
            case 's':  newHeight += dy; break;
            case 'sw': newX += dx; newWidth -= dx; newHeight += dy; break;
            case 'w':  newX += dx; newWidth -= dx; break;
        }

        // Mínimos
        const MIN = 80;
        if (newWidth < MIN) {
            if (['nw','sw','w'].includes(this.resizeHandle)) newX = this.resizeStart.zoneX + this.resizeStart.zoneWidth - MIN;
            newWidth = MIN;
        }
        if (newHeight < MIN) {
            if (['nw','n','ne'].includes(this.resizeHandle)) newY = this.resizeStart.zoneY + this.resizeStart.zoneHeight - MIN;
            newHeight = MIN;
        }

        // Snap
        if (this.snapEnabled && this.editorManager?.snapEnabled !== false) {
            newX = Math.round(newX / this.gridSize) * this.gridSize;
            newY = Math.round(newY / this.gridSize) * this.gridSize;
            newWidth = Math.round(newWidth / this.gridSize) * this.gridSize;
            newHeight = Math.round(newHeight / this.gridSize) * this.gridSize;
        }

        zone.x = newX;
        zone.y = newY;
        zone.width = newWidth;
        zone.height = newHeight;

        const refs = this.zoneRefs.get(zone.id);
        if (refs) {
            this.updateZoneAttributes(zone, refs);
            this.syncSelectionAndHandles(zone, refs);
        }
    }

    onResizeEnd() {
        if (!this.isResizing) return;
        this.isResizing = false;
        const refs = this.selectedZoneId ? this.zoneRefs.get(this.selectedZoneId) : null;
        if (refs) refs.group.classList.remove('resizing');
        this.resizeHandle = null;

        window.removeEventListener('mousemove', this.onResizeMoveHandler);
        window.removeEventListener('mouseup', this.onResizeEndHandler);

        // Guardado único al final (silencioso para evitar spam)
        this.editorManager?.saveLayoutDebounced();
    }

    // ============ DRAG (mover zona desde el body) ============
    startZoneDrag(zone, event) {
        event.preventDefault();
        event.stopPropagation();

        this.isDraggingZone = true;
        this.selectedZoneId = zone.id;
        this._dragMoved = false;

        const refs = this.zoneRefs.get(zone.id);
        if (refs) refs.group.classList.add('dragging');

        const startPoint = this.getSVGCoordinates(event.clientX, event.clientY);
        this.dragZoneStart = {
            mouseX: startPoint.x,
            mouseY: startPoint.y,
            zoneX: zone.x,
            zoneY: zone.y,
            deskOffsets: zone.desks.map(id => {
                const desk = this.editorManager?.desks.get(id);
                return desk ? { id, dx: desk.x - zone.x, dy: desk.y - zone.y } : null;
            }).filter(Boolean)
        };

        // Asegurar render con selección
        if (refs) this.syncSelectionAndHandles(zone, refs);

        window.addEventListener('mousemove', this.onZoneDragMoveHandler);
        window.addEventListener('mouseup', this.onZoneDragEndHandler);
    }

    onZoneDragMove(event) {
        if (!this.isDraggingZone || !this.selectedZoneId) return;
        event.preventDefault();

        const zone = this.zones.get(this.selectedZoneId);
        if (!zone || zone.isLocked) return;

        const currentPoint = this.getSVGCoordinates(event.clientX, event.clientY);
        const dx = currentPoint.x - this.dragZoneStart.mouseX;
        const dy = currentPoint.y - this.dragZoneStart.mouseY;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._dragMoved = true;

        let newX = this.dragZoneStart.zoneX + dx;
        let newY = this.dragZoneStart.zoneY + dy;

        if (this.snapEnabled && this.editorManager?.snapEnabled !== false) {
            newX = Math.round(newX / this.gridSize) * this.gridSize;
            newY = Math.round(newY / this.gridSize) * this.gridSize;
        }

        zone.x = newX;
        zone.y = newY;

        const refs = this.zoneRefs.get(zone.id);
        if (refs) {
            this.updateZoneAttributes(zone, refs);
            this.syncSelectionAndHandles(zone, refs);
        }

        // Mover puestos asociados usando offsets fijos desde el inicio del drag
        this.dragZoneStart.deskOffsets.forEach(off => {
            const desk = this.editorManager?.desks.get(off.id);
            if (!desk) return;
            desk.x = newX + off.dx;
            desk.y = newY + off.dy;
            this.mapManager?.updateDeskPosition(desk.id, desk.x, desk.y);
        });
    }

    onZoneDragEnd() {
        if (!this.isDraggingZone) return;
        this.isDraggingZone = false;
        const refs = this.selectedZoneId ? this.zoneRefs.get(this.selectedZoneId) : null;
        if (refs) refs.group.classList.remove('dragging');

        window.removeEventListener('mousemove', this.onZoneDragMoveHandler);
        window.removeEventListener('mouseup', this.onZoneDragEndHandler);

        // Si hubo movimiento real, suprimir el click sintético que dispararía selección + propertypanel reset
        if (this._dragMoved) {
            this._suppressNextClick = true;
            this.editorManager?.saveLayoutDebounced();
        }
        this._dragMoved = false;
    }
    
    selectZone(zoneId) {
        if (this.selectedZoneId === zoneId) return;

        const prevId = this.selectedZoneId;
        this.selectedZoneId = zoneId;

        // Refrescar visual de la anterior
        if (prevId) {
            const prevZone = this.zones.get(prevId);
            const prevRefs = this.zoneRefs.get(prevId);
            if (prevZone && prevRefs) {
                this.updateZoneAttributes(prevZone, prevRefs);
                this.syncSelectionAndHandles(prevZone, prevRefs);
            }
        }

        const zone = this.zones.get(zoneId);
        if (zone) {
            const refs = this.zoneRefs.get(zoneId);
            if (refs) {
                this.updateZoneAttributes(zone, refs);
                this.syncSelectionAndHandles(zone, refs);
            } else {
                this.renderZone(zone);
            }
            if (this.editorManager?.isEditorMode) {
                this.showZoneProperties(zoneId);
            }
        }
    }
    
    showZoneProperties(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return;
        
        const panel = document.getElementById('properties-content');
        if (!panel) return;
        
        panel.innerHTML = `
            <div class="zone-properties">
                <h4>Propiedades de Zona</h4>
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" id="zone-name-prop" value="${zone.name}">
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <input type="color" id="zone-color-prop" value="${zone.color}">
                </div>
                <div class="form-group">
                    <label>Capacidad</label>
                    <input type="number" id="zone-capacity-prop" value="${zone.capacity}" min="1">
                </div>
                <div class="form-actions">
                    <button id="apply-zone-changes" class="btn-primary">Aplicar</button>
                    <button id="generate-desks-zone" class="btn-success">Generar Puestos</button>
                    <button id="delete-zone-btn" class="btn-danger">Eliminar</button>
                </div>
            </div>
        `;
        
        document.getElementById('apply-zone-changes')?.addEventListener('click', () => {
            zone.name = document.getElementById('zone-name-prop').value;
            zone.color = document.getElementById('zone-color-prop').value;
            zone.capacity = parseInt(document.getElementById('zone-capacity-prop').value);
            this.renderZone(zone);
            this.editorManager?.saveLayout({ silent: false });
        });
        
        document.getElementById('delete-zone-btn')?.addEventListener('click', () => {
            if (confirm(`¿Eliminar zona "${zone.name}"?`)) {
                this.deleteZone(zone.id);
            }
        });
        
        document.getElementById('generate-desks-zone')?.addEventListener('click', () => {
            this.generateSimpleDesksInZone(zone.id);
        });
    }
    
    generateSimpleDesksInZone(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return;
        
        const deskWidth = 80;
        const deskHeight = 60;
        const spacing = 15;
        const padding = 20;
        
        const cols = Math.floor((zone.width - padding * 2) / (deskWidth + spacing));
        const rows = Math.floor((zone.height - padding * 2) / (deskHeight + spacing));
        const totalDesks = Math.min(cols * rows, zone.capacity);
        
        if (totalDesks === 0) {
            this.editorManager?.uiManager.showNotification('La zona es demasiado pequeña para generar puestos', 'warning');
            return;
        }
        
        // Eliminar puestos existentes
        zone.desks.forEach(deskId => {
            this.editorManager?.deleteDesk(deskId);
        });
        zone.desks = [];
        
        const startX = zone.x + padding;
        const startY = zone.y + padding;
        
        for (let row = 0; row < rows && zone.desks.length < zone.capacity; row++) {
            for (let col = 0; col < cols && zone.desks.length < zone.capacity; col++) {
                const x = startX + col * (deskWidth + spacing);
                const y = startY + row * (deskHeight + spacing);
                
                if (x + deskWidth <= zone.x + zone.width - padding &&
                    y + deskHeight <= zone.y + zone.height - padding) {
                    
                    const newDesk = {
                        id: this.editorManager.nextDeskId++,
                        x: x,
                        y: y,
                        status: 'offline',
                        agent: `Agente ${zone.desks.length + 1}`,
                        extension: `3${Math.floor(Math.random() * 900) + 100}`,
                        campaign: zone.campaign,
                        zoneId: zone.id,
                        lastUpdate: new Date()
                    };
                    
                    this.editorManager?.desks.set(newDesk.id, newDesk);
                    this.mapManager?.addDesk(newDesk, null);
                    zone.desks.push(newDesk.id);
                }
            }
        }
        
        this.renderZone(zone);
        this.editorManager?.saveLayout();
        this.editorManager?.uiManager.showNotification(`${zone.desks.length} puestos generados en "${zone.name}"`, 'success');
    }
    
    deleteZone(zoneId) {
        const zone = this.zones.get(zoneId);
        if (!zone) return;

        // Eliminar puestos asociados
        zone.desks.forEach(deskId => {
            this.editorManager?.deleteDesk(deskId);
        });

        this.zones.delete(zoneId);
        const refs = this.zoneRefs.get(zoneId);
        if (refs?.group) refs.group.remove();
        this.zoneRefs.delete(zoneId);

        if (this.selectedZoneId === zoneId) {
            this.selectedZoneId = null;
        }

        // Borrar de Supabase si tiene UUID real (no ID local)
        if (zoneId && window.dbService && !dbService._isLocalId(zoneId)) {
            dbService.deleteZone(zoneId).catch(err =>
                console.warn('[ZoneManager] Error borrando zona de DB:', err.message)
            );
        }

        this.editorManager?.saveLayout();
        this.editorManager?.uiManager?.showNotification(`Zona "${zone.name}" eliminada`, 'info');
    }
    
    clearAllZones() {
        this.zones.forEach((_, id) => {
            const refs = this.zoneRefs.get(id);
            if (refs?.group) refs.group.remove();
            this.zoneRefs.delete(id);
        });
        this.zones.clear();
        this.selectedZoneId = null;
    }

    duplicateSelectedZone() {
        if (!this.selectedZoneId) return;
        
        const originalZone = this.zones.get(this.selectedZoneId);
        if (!originalZone) return;
        
        const newZone = JSON.parse(JSON.stringify(originalZone));
        newZone.id = `zone_${Date.now()}`;
        newZone.name = `${originalZone.name} (Copia)`;
        newZone.x = originalZone.x + 50;
        newZone.y = originalZone.y + 50;
        newZone.desks = [];
        
        this.zones.set(newZone.id, newZone);
        this.renderZone(newZone);
        this.selectZone(newZone.id);
        this.editorManager?.saveLayout();
    }
    
    toggleZoneLock() {
        if (!this.selectedZoneId) return;
        const zone = this.zones.get(this.selectedZoneId);
        if (zone) {
            zone.isLocked = !zone.isLocked;
            this.renderZone(zone);
            this.editorManager?.saveLayout();
        }
    }
    
    toggleZonesVisibility() {
        const zones = this.zonesContainer.querySelectorAll('.zone-group');
        const isHidden = zones.length > 0 && zones[0].style.opacity === '0.3';
        
        zones.forEach(zone => {
            zone.style.opacity = isHidden ? '1' : '0.3';
        });
    }
    
    autoArrangeZones() {
        const zones = Array.from(this.zones.values());
        let x = 50;
        let y = 50;
        let maxHeight = 0;
        
        zones.forEach(zone => {
            if (x + zone.width > 1100) {
                x = 50;
                y += maxHeight + 30;
                maxHeight = 0;
            }
            
            zone.x = x;
            zone.y = y;
            
            x += zone.width + 30;
            maxHeight = Math.max(maxHeight, zone.height);
            
            this.renderZone(zone);
        });
        
        this.editorManager?.saveLayout();
    }
    
    loadZones(zonesData) {
        if (zonesData && Array.isArray(zonesData)) {
            zonesData.forEach(zoneData => {
                this.zones.set(zoneData.id, zoneData);
                this.renderZone(zoneData);
            });
        }
    }
    
    getAllZones() {
        return Array.from(this.zones.values());
    }

    // Llamar desde EditorManager.onDeskMoveEnd para reasignar zonas automáticamente
    checkDeskZoneAssignment(desk) {
        const deskCenterX = desk.x + 30; // DESK_WIDTH/2
        const deskCenterY = desk.y + 18; // DESK_HEIGHT/2

        // Quitar puesto de cualquier zona donde estuviera
        let prevZoneId = null;
        for (const [zoneId, zone] of this.zones) {
            const idx = zone.desks.indexOf(desk.id);
            if (idx !== -1) {
                prevZoneId = zoneId;
                zone.desks.splice(idx, 1);
                this.refreshZoneLabel(zone);
            }
        }

        // Buscar zona donde cae el centro del puesto ahora
        let assignedZone = null;
        for (const [, zone] of this.zones) {
            if (
                deskCenterX >= zone.x && deskCenterX <= zone.x + zone.width &&
                deskCenterY >= zone.y && deskCenterY <= zone.y + zone.height
            ) {
                assignedZone = zone;
                break;
            }
        }

        if (assignedZone) {
            // Validar capacidad máxima
            if (assignedZone.desks.length >= assignedZone.capacity) {
                this.editorManager?.uiManager?.showNotification(
                    `La zona "${assignedZone.name}" está llena (máx. ${assignedZone.capacity} puestos)`,
                    'warning'
                );
                // Revertir si venía de otra zona
                if (prevZoneId && prevZoneId !== assignedZone.id) {
                    const prevZone = this.zones.get(prevZoneId);
                    if (prevZone) {
                        prevZone.desks.push(desk.id);
                        this.refreshZoneLabel(prevZone);
                    }
                }
                return;
            }
            assignedZone.desks.push(desk.id);
            desk.zoneId = assignedZone.id;
            this.refreshZoneLabel(assignedZone);
        } else {
            desk.zoneId = null;
        }
    }

    refreshZoneLabel(zone) {
        const refs = this.zoneRefs.get(zone.id);
        if (refs) {
            this.updateZoneAttributes(zone, refs);
            this.syncSelectionAndHandles(zone, refs);
        }
    }

    // Llamado por storageManager después de insertar en Supabase —
    // reemplaza el ID local temporal (zone_timestamp) por el UUID real de la DB.
    updateZoneDbId(localId, dbId) {
        const zone = this.zones.get(localId);
        if (!zone || localId === dbId) return;
        zone.id = dbId;
        this.zones.delete(localId);
        this.zones.set(dbId, zone);
        const refs = this.zoneRefs.get(localId);
        if (refs) {
            this.zoneRefs.delete(localId);
            this.zoneRefs.set(dbId, refs);
        }
        if (this.selectedZoneId === localId) this.selectedZoneId = dbId;
    }
}
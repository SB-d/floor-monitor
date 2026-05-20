class FloorMapManager {
    static DESK_WIDTH = 60;
    static DESK_HEIGHT = 36;

    constructor(svgElement, desksContainer) {
        this.svg = svgElement;
        this.desksContainer = desksContainer;
        this.desks = new Map();
        this.selectedDeskId = null;
        this.tooltip = null;
        this.isSelectable = false;
        
        // Zoom & Pan
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        
        this.initZoomAndPan();
        this.createTooltip();
    }
    
    initZoomAndPan() {
        const wrapper = document.getElementById('svg-wrapper');
        
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newScale = Math.min(3, Math.max(0.5, this.scale + delta));
            
            if (newScale !== this.scale) {
                const rect = wrapper.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const scaleChange = newScale / this.scale;
                this.translateX = mouseX - (mouseX - this.translateX) * scaleChange;
                this.translateY = mouseY - (mouseY - this.translateY) * scaleChange;
                this.scale = newScale;
                
                this.applyTransform();
            }
        });
        
        wrapper.addEventListener('mousedown', (e) => {
            // Bloquear pan cuando estamos en modo creación de zonas, resize o drag de zona
            if (window.zoneManager?.isZoneCreationMode || window.zoneManager?.isResizing || window.zoneManager?.isDraggingZone) {
                return;
            }
            // Solo botón izquierdo
            if (e.button !== 0) return;
            // Nunca iniciar pan sobre un desk o zona
            if (e.target.closest?.('.desk-group') || e.target.closest?.('.zone-group')) return;
            // En modo editor: pan solo con Space+drag
            if (window.editorManager?.isEditorMode && !this._spacePan) {
                return;
            }
            this.isDragging = true;
            this.dragStart = { x: e.clientX - this.translateX, y: e.clientY - this.translateY };
            wrapper.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.translateX = e.clientX - this.dragStart.x;
                this.translateY = e.clientY - this.dragStart.y;
                this.applyTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                if (window.zoneManager?.isZoneCreationMode) {
                    // no cambiar cursor
                } else if (window.editorManager?.isEditorMode) {
                    wrapper.style.cursor = this._spacePan ? 'grab' : 'default';
                } else {
                    wrapper.style.cursor = 'grab';
                }
            }
        });
        
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(0.2));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(-0.2));
        document.getElementById('reset-view').addEventListener('click', () => this.resetView());

        // Space+drag = pan en modo editor (igual que Figma)
        this._spacePan = false;
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && window.editorManager?.isEditorMode && !e.repeat) {
                this._spacePan = true;
                wrapper.style.cursor = 'grab';
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spacePan = false;
                if (window.editorManager?.isEditorMode) {
                    wrapper.style.cursor = 'default';
                }
            }
        });
    }
    
    zoom(delta) {
        const newScale = Math.min(3, Math.max(0.5, this.scale + delta));
        if (newScale !== this.scale) {
            const wrapper = document.getElementById('svg-wrapper');
            const centerX = wrapper.clientWidth / 2;
            const centerY = wrapper.clientHeight / 2;
            const scaleChange = newScale / this.scale;
            this.translateX = centerX - (centerX - this.translateX) * scaleChange;
            this.translateY = centerY - (centerY - this.translateY) * scaleChange;
            this.scale = newScale;
            this.applyTransform();
        }
    }
    
    resetView() {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.applyTransform();
    }
    
    applyTransform() {
        const transform = `matrix(${this.scale}, 0, 0, ${this.scale}, ${this.translateX}, ${this.translateY})`;
        const root = document.getElementById('map-root');
        if (root) root.setAttribute('transform', transform);
    }
    
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'desk-tooltip';
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);
    }
    
    renderDesks(desksData, onDeskClick) {
        this.desksContainer.innerHTML = '';
        this.desks.clear();
        
        desksData.forEach(desk => {
            this.addDesk(desk, onDeskClick);
        });
    }
    
    addDesk(desk, onDeskClick) {
        const deskGroup = this.createDeskElement(desk, onDeskClick);
        this.desksContainer.appendChild(deskGroup);
        this.desks.set(desk.id, deskGroup);
        return deskGroup;
    }
    
    createDeskElement(desk, onDeskClick) {
        const W = FloorMapManager.DESK_WIDTH;
        const H = FloorMapManager.DESK_HEIGHT;
        const cx = W / 2;
        const cy = H / 2;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `desk-group desk-${desk.status}`);
        group.setAttribute('data-id', desk.id);
        const rot = desk.rotation || 0;
        group.setAttribute('transform', `translate(${desk.x}, ${desk.y}) rotate(${rot}, ${cx}, ${cy})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', W);
        rect.setAttribute('height', H);
        rect.setAttribute('rx', '4');
        rect.setAttribute('ry', '4');
        rect.setAttribute('class', 'desk-rect');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy - 2);
        text.setAttribute('class', 'desk-text');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '700');
        text.textContent = `#${desk.id}`;

        const subtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        subtext.setAttribute('x', cx);
        subtext.setAttribute('y', cy + 10);
        subtext.setAttribute('class', 'desk-text');
        subtext.setAttribute('font-size', '7.5');
        subtext.setAttribute('opacity', '0.75');
        subtext.textContent = this.getStatusIcon(desk.status);
        
        group.appendChild(rect);
        group.appendChild(text);
        group.appendChild(subtext);
        
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isSelectable && window.editorManager?.isEditorMode) {
                const isMultiSelect = e.ctrlKey || e.metaKey;
                window.editorManager.selectDesk(desk.id, isMultiSelect);
            } else if (onDeskClick) {
                this.selectDesk(desk.id);
                onDeskClick(desk);
            }
        });
        
        group.addEventListener('mouseenter', (e) => {
            this.showTooltip(desk, e);
        });
        
        group.addEventListener('mousemove', (e) => {
            this.moveTooltip(e);
        });
        
        group.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
        
        group.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.editorManager?.isEditorMode) {
                this.showContextMenu(e, desk);
            }
        });
        
        if (this.selectedDeskId === desk.id) {
            group.classList.add('selected');
        }
        
        return group;
    }
    
    showContextMenu(event, desk) {
        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        
        const handleClick = (e) => {
            const action = e.currentTarget.dataset.action;
            switch(action) {
                case 'edit':
                    window.editorManager?.showProperties(desk);
                    break;
                case 'duplicate':
                    this.duplicateDesk(desk);
                    break;
                case 'delete':
                    window.editorManager?.deleteDesk(desk.id);
                    break;
                case 'status-online':
                    desk.status = 'online';
                    this.updateDesk(desk);
                    window.editorManager?.saveLayout();
                    break;
                case 'status-busy':
                    desk.status = 'busy';
                    this.updateDesk(desk);
                    window.editorManager?.saveLayout();
                    break;
                case 'status-pause':
                    desk.status = 'pause';
                    this.updateDesk(desk);
                    window.editorManager?.saveLayout();
                    break;
                case 'lock':
                    desk.isLocked = !desk.isLocked;
                    window.editorManager?.saveLayout();
                    break;
            }
            contextMenu.style.display = 'none';
            contextMenu.removeEventListener('click', handleClick);
        };
        
        const items = contextMenu.querySelectorAll('.context-menu-item');
        items.forEach(item => {
            item.removeEventListener('click', handleClick);
            item.addEventListener('click', handleClick);
        });
        
        setTimeout(() => {
            document.addEventListener('click', () => {
                contextMenu.style.display = 'none';
            }, { once: true });
        }, 0);
    }
    
    duplicateDesk(desk) {
        const newId = window.editorManager.nextDeskId++;
        const newDesk = {
            ...desk,
            id: newId,
            x: desk.x + 20,
            y: desk.y + 20,
            agent: `${desk.agent} (Copia)`,
            isNew: true
        };
        
        window.editorManager.desks.set(newId, newDesk);
        this.addDesk(newDesk, null);
        window.editorManager.saveLayout();
    }
    
    getStatusIcon(status) {
        const icons = {
            online: '● Online',
            busy: '◉ Ocupado',
            pause: '⏸ Pausa',
            offline: '○ Offline',
            error: '⚠ Error'
        };
        return icons[status] || status;
    }
    
    updateDesk(desk) {
        const deskGroup = this.desks.get(desk.id);
        if (deskGroup) {
            deskGroup.className = `desk-group desk-${desk.status}`;
            if (this.selectedDeskId === desk.id) {
                deskGroup.classList.add('selected');
            }
            
            const subtext = deskGroup.querySelectorAll('text')[1];
            if (subtext) {
                subtext.textContent = this.getStatusIcon(desk.status);
            }
        }
    }
    
    updateDeskPosition(deskId, x, y) {
        const deskGroup = this.desks.get(deskId);
        if (deskGroup) {
            const cx = FloorMapManager.DESK_WIDTH / 2;
            const cy = FloorMapManager.DESK_HEIGHT / 2;
            const desk = window.editorManager?.desks.get(deskId);
            const rot = desk?.rotation || 0;
            deskGroup.setAttribute('transform', `translate(${x}, ${y}) rotate(${rot}, ${cx}, ${cy})`);
        }
    }
    
    removeDesk(deskId) {
        const deskGroup = this.desks.get(deskId);
        if (deskGroup) {
            deskGroup.remove();
            this.desks.delete(deskId);
        }
    }
    
    getDeskElement(deskId) {
        return this.desks.get(deskId);
    }
    
    selectDesk(deskId) {
        if (this.selectedDeskId) {
            const prevSelected = this.desks.get(this.selectedDeskId);
            if (prevSelected) prevSelected.classList.remove('selected');
        }
        
        this.selectedDeskId = deskId;
        const newSelected = this.desks.get(deskId);
        if (newSelected) newSelected.classList.add('selected');
    }
    
    highlightDesk(deskId, highlight) {
        const deskGroup = this.desks.get(deskId);
        if (deskGroup) {
            if (highlight) {
                deskGroup.classList.add('selected');
            } else {
                deskGroup.classList.remove('selected');
            }
        }
    }
    
    setSelectable(selectable) {
        this.isSelectable = selectable;
    }
    
    showTooltip(desk, event) {
        this.tooltip.innerHTML = `
            <div class="tooltip-title">Puesto #${desk.id}</div>
            <div class="tooltip-row">
                <span class="tooltip-label">Agente:</span>
                <span class="tooltip-value">${desk.agent || 'No asignado'}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Estado:</span>
                <span class="tooltip-value">${desk.status.toUpperCase()}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Campaña:</span>
                <span class="tooltip-value">${desk.campaign || 'Sin campaña'}</span>
            </div>
            ${desk.extension ? `<div class="tooltip-row">
                <span class="tooltip-label">Extensión:</span>
                <span class="tooltip-value">${desk.extension}</span>
            </div>` : ''}
            ${desk.isLocked ? `<div class="tooltip-row">
                <span class="tooltip-label">🔒 Bloqueado</span>
            </div>` : ''}
        `;
        
        this.tooltip.style.display = 'block';
        this.moveTooltip(event);
    }
    
    moveTooltip(event) {
        const x = event.clientX + 15;
        const y = event.clientY - 10;
        
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }
    
    hideTooltip() {
        this.tooltip.style.display = 'none';
    }
}
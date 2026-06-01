class UIManager {
    constructor() {
        this.statsElements = {
            online: document.getElementById('stat-online'),
            busy: document.getElementById('stat-busy'),
            pause: document.getElementById('stat-pause'),
            offline: document.getElementById('stat-offline'),
            error: document.getElementById('stat-error'),
            total: document.getElementById('total-desks'),
            occupancy: document.getElementById('occupancy-rate')
        };
        
        this.deskDetails = document.getElementById('desk-details');
        this.connectionStatus = document.getElementById('connection-status');
        this.notificationContainer = this.createNotificationContainer();
    }
    
    createNotificationContainer() {
        const container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
        return container;
    }
    
    updateStats(stats) {
        if (this.statsElements.online) {
            this.statsElements.online.textContent = stats.online || 0;
            this.statsElements.busy.textContent = stats.busy || 0;
            this.statsElements.pause.textContent = stats.pause || 0;
            this.statsElements.offline.textContent = stats.offline || 0;
            this.statsElements.error.textContent = stats.error || 0;
            this.statsElements.total.textContent = stats.total || 0;
            
            const occupancyRate = stats.total > 0
                ? ((stats.online + stats.busy) / stats.total * 100).toFixed(1)
                : '0.0';
            this.statsElements.occupancy.textContent = `${occupancyRate}%`;
        }
    }
    
    updateConnectionStatus(isConnected) {
        if (isConnected) {
            this.connectionStatus.classList.add('connected');
            const statusSpan = this.connectionStatus.querySelector('span');
            if (statusSpan) statusSpan.textContent = 'Conectado';
        } else {
            this.connectionStatus.classList.remove('connected');
            const statusSpan = this.connectionStatus.querySelector('span');
            if (statusSpan) statusSpan.textContent = 'Desconectado';
        }
    }
    
    showDeskDetails(desk) {
        const canAssign = window.authService?.isSupervisor?.() ?? false;
        if (canAssign) {
            this._showDeskAssignForm(desk);
        } else {
            this._showDeskReadOnly(desk);
        }
    }

    _showDeskReadOnly(desk) {
        const statusClass = this.getStatusClass(desk.status);
        const statusText  = this.getStatusText(desk.status);
        const container   = this.deskDetails;
        if (!container) return;

        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'desk-info';

        const rows = [
            ['ID del Puesto', `#${desk.id}`],
            ['Agente',        desk.agent    || 'No asignado'],
            ['Campaña',       desk.campaign || 'Sin campaña'],
            ['Extensión',     desk.extension || '—'],
        ];

        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'info-row';
            const l = document.createElement('span'); l.className = 'info-label'; l.textContent = label;
            const v = document.createElement('span'); v.className = 'info-value'; v.textContent = value;
            row.appendChild(l); row.appendChild(v);
            wrap.appendChild(row);
        });

        // Estado con badge
        const stateRow = document.createElement('div');
        stateRow.className = 'info-row';
        const sl = document.createElement('span'); sl.className = 'info-label'; sl.textContent = 'Estado';
        const sv = document.createElement('span'); sv.className = 'info-value';
        const badge = document.createElement('span');
        badge.className = `status-badge ${statusClass}`;
        badge.textContent = statusText;
        sv.appendChild(badge);
        stateRow.appendChild(sl); stateRow.appendChild(sv);
        wrap.appendChild(stateRow);

        if (desk.lastUpdate) {
            const tr = document.createElement('div'); tr.className = 'info-row';
            const tl = document.createElement('span'); tl.className = 'info-label'; tl.textContent = 'Última actualización';
            const tv = document.createElement('span'); tv.className = 'info-value';
            try { tv.textContent = new Date(desk.lastUpdate).toLocaleTimeString('es-CO'); } catch (_) { tv.textContent = '—'; }
            tr.appendChild(tl); tr.appendChild(tv);
            wrap.appendChild(tr);
        }

        container.appendChild(wrap);
    }

    _showDeskAssignForm(desk) {
        const container = this.deskDetails;
        if (!container) return;

        container.innerHTML = '';

        const form = document.createElement('div');
        form.className = 'desk-assign-form';

        // Encabezado con ID y estado actual
        const header = document.createElement('div');
        header.className = 'assign-header';
        const statusClass = this.getStatusClass(desk.status);
        header.innerHTML = `
            <span class="assign-desk-id">Puesto #${desk.id}</span>
            <span class="status-badge ${statusClass}">${this.getStatusText(desk.status)}</span>`;
        form.appendChild(header);

        // Campos — construidos por DOM para evitar XSS
        const fields = [
            { id: 'assign-agent',     label: 'Agente',    type: 'text',   value: desk.agent    || '', placeholder: 'Nombre del agente' },
            { id: 'assign-campaign',  label: 'Campaña',   type: 'text',   value: desk.campaign || '', placeholder: 'Campaña activa' },
            { id: 'assign-extension', label: 'Extensión', type: 'text',   value: desk.extension|| '', placeholder: 'Ej: 3201' },
        ];

        fields.forEach(f => {
            const group = document.createElement('div');
            group.className = 'assign-group';
            const label = document.createElement('label');
            label.textContent = f.label;
            label.htmlFor = f.id;
            const input = document.createElement('input');
            input.type = f.type;
            input.id = f.id;
            input.className = 'assign-input';
            input.value = f.value;
            input.placeholder = f.placeholder;
            group.appendChild(label);
            group.appendChild(input);
            form.appendChild(group);
        });

        // Select de estado
        const statusGroup = document.createElement('div');
        statusGroup.className = 'assign-group';
        const statusLabel = document.createElement('label');
        statusLabel.textContent = 'Estado';
        statusLabel.htmlFor = 'assign-status';
        const select = document.createElement('select');
        select.id = 'assign-status';
        select.className = 'assign-input assign-select';
        [
            ['online',  'Online'],
            ['busy',    'Ocupado'],
            ['pause',   'Pausa'],
            ['offline', 'Offline'],
            ['error',   'Error'],
        ].forEach(([val, text]) => {
            const opt = document.createElement('option');
            opt.value = val; opt.textContent = text;
            if (val === desk.status) opt.selected = true;
            select.appendChild(opt);
        });
        statusGroup.appendChild(statusLabel);
        statusGroup.appendChild(select);
        form.appendChild(statusGroup);

        // Botones
        const actions = document.createElement('div');
        actions.className = 'assign-actions';

        const btnSave = document.createElement('button');
        btnSave.className = 'btn-assign-save';
        btnSave.textContent = 'Guardar';
        btnSave.addEventListener('click', () => this._saveAssignment(desk, btnSave));

        const btnClear = document.createElement('button');
        btnClear.className = 'btn-assign-clear';
        btnClear.textContent = 'Limpiar';
        btnClear.addEventListener('click', () => {
            document.getElementById('assign-agent').value     = '';
            document.getElementById('assign-campaign').value  = '';
            document.getElementById('assign-extension').value = '';
            document.getElementById('assign-status').value    = 'offline';
        });

        actions.appendChild(btnSave);
        actions.appendChild(btnClear);
        form.appendChild(actions);

        // Última actualización (solo lectura)
        if (desk.lastUpdate) {
            const ts = document.createElement('div');
            ts.className = 'assign-timestamp';
            try { ts.textContent = `Actualizado: ${new Date(desk.lastUpdate).toLocaleTimeString('es-CO')}`; } catch (_) {}
            form.appendChild(ts);
        }

        container.appendChild(form);
    }

    async _saveAssignment(desk, btnSave) {
        const agent     = document.getElementById('assign-agent')?.value.trim()     || null;
        const campaign  = document.getElementById('assign-campaign')?.value.trim()  || null;
        const extension = document.getElementById('assign-extension')?.value.trim() || null;
        const status    = document.getElementById('assign-status')?.value           || 'offline';

        btnSave.disabled = true;
        btnSave.textContent = 'Guardando…';

        try {
            if (!window.dbService) throw new Error('dbService no disponible');
            if (!desk._dbId)       throw new Error('Puesto sin ID en base de datos — guarda el layout primero');

            await dbService.updateDeskStatus(desk._dbId, status, agent, campaign, extension);

            // Actualizar estado local inmediatamente
            desk.status    = status;
            desk.agent     = agent;
            desk.campaign  = campaign;
            desk.extension = extension;
            desk.lastUpdate = new Date().toISOString();

            // Refrescar visual del puesto en el mapa
            window.floorMapManager?.updateDesk(desk);

            this.showNotification(`Puesto #${desk.id} actualizado`, 'success');

            // Re-render del form con los nuevos valores
            this._showDeskAssignForm(desk);
        } catch (err) {
            this.showNotification('Error al guardar: ' + err.message, 'error');
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar';
        }
    }
    
    showEmptyState() {
        if (!this.deskDetails) return;
        this.deskDetails.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                <p>Selecciona un puesto<br>para ver detalles</p>
            </div>
        `;
    }

    showNoLayoutSelected() {
        const wrapper = document.getElementById('svg-wrapper');
        if (!wrapper) return;

        const prev = document.getElementById('canvas-empty-hint');
        if (prev) prev.remove();

        const hint = document.createElement('div');
        hint.id = 'canvas-empty-hint';
        hint.className = 'canvas-empty-hint';

        const icon = document.createElement('div');
        icon.className = 'canvas-empty-icon';
        icon.innerHTML = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>`;

        const title = document.createElement('h3');
        title.className = 'canvas-empty-title';
        title.textContent = 'Ningún layout seleccionado';

        const sub = document.createElement('p');
        sub.className = 'canvas-empty-sub';
        sub.textContent = 'Ve al gestor de layouts, abre uno y vuelve aquí para editarlo.';

        const btn = document.createElement('a');
        btn.href = '/layouts';
        btn.className = 'btn btn-primary';
        btn.style.cssText = 'margin-top:1rem;display:inline-block;padding:0.6rem 1.4rem;border-radius:8px;background:#3b82f6;color:#fff;text-decoration:none;font-size:0.875rem;font-weight:500';
        btn.textContent = '← Ir a Mis Layouts';

        hint.appendChild(icon);
        hint.appendChild(title);
        hint.appendChild(sub);
        hint.appendChild(btn);
        wrapper.appendChild(hint);
    }

    showCanvasEmpty() {
        // Placeholder visible sobre el canvas cuando no hay puestos ni zonas
        const wrapper = document.getElementById('svg-wrapper');
        if (!wrapper) return;

        // Quitar placeholder previo si existe
        const prev = document.getElementById('canvas-empty-hint');
        if (prev) prev.remove();

        const hint = document.createElement('div');
        hint.id = 'canvas-empty-hint';
        hint.className = 'canvas-empty-hint';
        hint.innerHTML = `
            <div class="canvas-empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                </svg>
            </div>
            <h3 class="canvas-empty-title">Workspace vacío</h3>
            <p class="canvas-empty-sub">Activa el modo editor para comenzar a diseñar</p>
            <div class="canvas-empty-actions">
                <span class="canvas-hint-pill">＋ Crear zona</span>
                <span class="canvas-hint-pill">＋ Agregar puesto</span>
                <span class="canvas-hint-pill">⤓ Importar layout</span>
            </div>
        `;
        wrapper.appendChild(hint);

        // Desaparecer cuando se agregue el primer elemento
        this._hideCanvasEmptyOnFirstDesk();
    }

    _hideCanvasEmptyOnFirstDesk() {
        // Observar mutaciones en el contenedor de desks y zonas
        const desksG = document.getElementById('desks');
        const zonesG = document.getElementById('zones');
        if (!desksG && !zonesG) return;

        const hide = () => {
            const hint = document.getElementById('canvas-empty-hint');
            if (hint) hint.remove();
            obs.disconnect();
        };

        const obs = new MutationObserver(() => {
            const hasDesks = desksG && desksG.children.length > 0;
            const hasZones = zonesG && zonesG.children.length > 0;
            if (hasDesks || hasZones) hide();
        });

        if (desksG) obs.observe(desksG, { childList: true });
        if (zonesG) obs.observe(zonesG, { childList: true });
    }
    
    showEditorMode(isEditor) {
        if (isEditor) {
            this.showNotification('Modo Editor Activado - Puedes mover, crear y editar puestos', 'info');
        } else {
            this.showNotification('Modo Monitoreo - Visualización en tiempo real', 'info');
        }
    }
    
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const span = document.createElement('span');
        span.textContent = message;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.textContent = '×';
        notification.appendChild(span);
        notification.appendChild(closeBtn);

        this.notificationContainer.appendChild(notification);

        closeBtn.addEventListener('click', () => notification.remove());

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
    
    getStatusClass(status) {
        const classes = {
            online: 'online',
            busy: 'busy',
            pause: 'pause',
            offline: 'offline',
            error: 'error'
        };
        return classes[status] || 'offline';
    }
    
    getStatusText(status) {
        const texts = {
            online: 'En línea',
            busy: 'Ocupado',
            pause: 'En pausa',
            offline: 'Desconectado',
            error: 'Error técnico'
        };
        return texts[status] || status;
    }
}
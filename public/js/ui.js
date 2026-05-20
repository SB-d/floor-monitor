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
            
            const occupancyRate = ((stats.online + stats.busy) / stats.total * 100).toFixed(1);
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
        const statusClass = this.getStatusClass(desk.status);
        const statusText = this.getStatusText(desk.status);
        
        const detailsHTML = `
            <div class="desk-info">
                <div class="info-row">
                    <span class="info-label">ID del Puesto</span>
                    <span class="info-value">#${desk.id}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Agente</span>
                    <span class="info-value">${desk.agent || 'No asignado'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Estado</span>
                    <span class="info-value">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </span>
                </div>
                <div class="info-row">
                    <span class="info-label">Campaña</span>
                    <span class="info-value">${desk.campaign || 'Sin campaña'}</span>
                </div>
                ${desk.extension ? `
                <div class="info-row">
                    <span class="info-label">Extensión</span>
                    <span class="info-value">${desk.extension}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Última Actualización</span>
                    <span class="info-value">${new Date(desk.lastUpdate).toLocaleTimeString()}</span>
                </div>
            </div>
        `;
        
        this.deskDetails.innerHTML = detailsHTML;
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
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">×</button>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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
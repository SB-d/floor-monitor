class Minimap {
    static W = 180;
    static H = 120;
    static SVG_W = 1200;
    static SVG_H = 800;

    constructor(mapManager) {
        this.mapManager = mapManager;
        this.visible = true;
        this._el = null;
        this._canvas = null;
        this._ctx = null;
        this._viewport = null;
        this._isDragging = false;
        this._raf = null;
        this._build();
        this._bindEvents();
        this.scheduleRender();
    }

    // ─── Construcción DOM ────────────────────────────────────────────────────

    _build() {
        this._el = document.createElement('div');
        this._el.id = 'minimap';
        this._el.className = 'minimap-container';
        this._el.innerHTML = `
            <div class="minimap-header">
                <span>Vista general</span>
                <button id="minimap-toggle" title="Ocultar minimap">−</button>
            </div>
            <canvas id="minimap-canvas" width="${Minimap.W}" height="${Minimap.H}"></canvas>
            <div id="minimap-viewport"></div>
        `;
        document.getElementById('map-container')?.appendChild(this._el)
            || document.body.appendChild(this._el);

        this._canvas   = this._el.querySelector('#minimap-canvas');
        this._ctx      = this._canvas.getContext('2d');
        this._viewport = this._el.querySelector('#minimap-viewport');

        document.getElementById('minimap-toggle')?.addEventListener('click', () => this.toggleBody());
    }

    _bindEvents() {
        // Clic en minimap → navegar al punto en el mapa principal
        this._canvas.addEventListener('mousedown', (e) => {
            this._isDragging = true;
            this._navigate(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (this._isDragging) this._navigate(e);
        });
        window.addEventListener('mouseup', () => { this._isDragging = false; });
    }

    _navigate(e) {
        const rect = this._canvas.getBoundingClientRect();
        const rx = (e.clientX - rect.left) / Minimap.W;
        const ry = (e.clientY - rect.top)  / Minimap.H;

        const svgCX = rx * Minimap.SVG_W;
        const svgCY = ry * Minimap.SVG_H;

        const wrapper = document.getElementById('svg-wrapper');
        const wW = wrapper.clientWidth;
        const wH = wrapper.clientHeight;

        // Centrar viewport en el punto SVG clicado
        const mm = this.mapManager;
        mm.translateX = wW / 2 - svgCX * mm.scale;
        mm.translateY = wH / 2 - svgCY * mm.scale;
        mm.applyTransform();
        this.scheduleRender();
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    scheduleRender() {
        cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => this._render());
    }

    _render() {
        const ctx = this._ctx;
        const scaleX = Minimap.W / Minimap.SVG_W;
        const scaleY = Minimap.H / Minimap.SVG_H;

        ctx.clearRect(0, 0, Minimap.W, Minimap.H);

        // Fondo
        ctx.fillStyle = 'rgba(10, 14, 39, 0.95)';
        ctx.fillRect(0, 0, Minimap.W, Minimap.H);

        // Grid sutil
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < Minimap.W; x += 10) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Minimap.H); ctx.stroke();
        }
        for (let y = 0; y < Minimap.H; y += 10) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Minimap.W, y); ctx.stroke();
        }

        // Zonas
        if (window.zoneManager) {
            for (const zone of window.zoneManager.zones.values()) {
                if (!zone.visible) continue;
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = zone.color + '33';
                ctx.strokeStyle = zone.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(
                    zone.x * scaleX, zone.y * scaleY,
                    zone.width * scaleX, zone.height * scaleY, 2
                );
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        }

        // Puestos
        const statusColors = {
            online: '#10b981', busy: '#f59e0b', pause: '#8b5cf6',
            offline: '#6b7280', error: '#ef4444'
        };
        if (window.editorManager) {
            for (const desk of window.editorManager.desks.values()) {
                const color = statusColors[desk.status] || '#6b7280';
                ctx.fillStyle = color;
                ctx.beginPath();
                // Mínimo 2px para que se vea en el minimap
                ctx.roundRect(
                    desk.x * scaleX, desk.y * scaleY,
                    Math.max(2, 60 * scaleX), Math.max(1.5, 36 * scaleY), 1
                );
                ctx.fill();
            }
        }

        // Viewport indicator
        this._updateViewport(scaleX, scaleY);
    }

    _updateViewport(scaleX, scaleY) {
        const mm = this.mapManager;
        const wrapper = document.getElementById('svg-wrapper');
        if (!wrapper) return;

        const wW = wrapper.clientWidth;
        const wH = wrapper.clientHeight;

        // Área SVG visible en coordenadas del minimap
        const visLeft   = (-mm.translateX / mm.scale) * scaleX;
        const visTop    = (-mm.translateY / mm.scale) * scaleY;
        const visWidth  = (wW / mm.scale) * scaleX;
        const visHeight = (wH / mm.scale) * scaleY;

        const vp = this._viewport;
        vp.style.left   = `${Math.max(0, visLeft)}px`;
        vp.style.top    = `${Math.max(0, visTop) + 22}px`; // offset header
        vp.style.width  = `${Math.min(Minimap.W, visWidth)}px`;
        vp.style.height = `${Math.min(Minimap.H, visHeight)}px`;
    }

    // ─── Visibilidad ─────────────────────────────────────────────────────────

    toggleBody() {
        const canvas = this._canvas;
        const vp = this._viewport;
        const btn = document.getElementById('minimap-toggle');
        this.visible = !this.visible;
        canvas.style.display = this.visible ? 'block' : 'none';
        vp.style.display     = this.visible ? 'block' : 'none';
        if (btn) btn.textContent = this.visible ? '−' : '+';
        this._el.classList.toggle('minimap-collapsed', !this.visible);
    }
}

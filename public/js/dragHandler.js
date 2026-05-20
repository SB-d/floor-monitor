/**
 * DragHandler — maneja el arrastre de puestos en modo edición.
 *
 * Estrategia de coordenadas:
 *   El zoom/pan vive en #map-root como matrix(s,0,0,s,tx,ty).
 *   Usamos mapRoot.getScreenCTM().inverse() para convertir coordenadas
 *   de pantalla al espacio local del mapa, que es el mismo espacio donde
 *   viven desk.x / desk.y. Esto es correcto con cualquier escala y pan.
 */
class DragHandler {
    constructor(svgElement, mapManager, editorManager) {
        this.svg        = svgElement;   // <svg id="floor-map">
        this.mapManager = mapManager;
        this.editorManager = editorManager;

        this.isDragging  = false;
        this.currentDesk = null;                    // { group, data }
        this.dragOffset  = { x: 0, y: 0 };         // cursor offset dentro del desk
        this.originalPos = { x: 0, y: 0 };

        this.snapEnabled = false;
        this.gridSize    = 40;

        // Multi-select drag
        this._multiOffsets   = null;  // [{ id, dx, dy }]
        this._multiSnapshots = null;  // [{ before: {id,x,y} }]

        this._bound = {
            down: this._onDown.bind(this),
            move: this._onMove.bind(this),
            up:   this._onUp.bind(this),
        };

        this._attach();
    }

    // ─── Attachment ──────────────────────────────────────────────────────────

    _attach() {
        // mousedown en el SVG (burbujea desde desk-group → #desks → #map-root → svg)
        this.svg.addEventListener('mousedown', this._bound.down);
        window.addEventListener('mousemove', this._bound.move);
        window.addEventListener('mouseup',   this._bound.up);
    }

    // ─── mousedown ───────────────────────────────────────────────────────────

    _onDown(e) {
        if (e.button !== 0) return;
        if (!this.editorManager?.isEditorMode) return;
        if (window.zoneManager?.isZoneCreationMode) return;

        // Encontrar el desk-group que recibió el click
        const deskGroup = this._findDeskGroup(e.target);
        if (!deskGroup) return;

        const deskId = parseInt(deskGroup.getAttribute('data-id'));
        const desk   = this.editorManager.getDeskById(deskId);
        if (!desk || desk.isLocked) return;

        // Capturar el evento para que no active pan ni selection-rect
        e.preventDefault();
        e.stopPropagation();

        const pt = this._toMapCoords(e.clientX, e.clientY);
        this.originalPos = { x: desk.x, y: desk.y };

        const sel = this.editorManager.selectedDesks;
        if (sel.size > 1 && sel.has(deskId)) {
            // ── Multi-select drag ──
            this._startMultiDrag(pt, sel, deskGroup, desk);
        } else {
            // ── Single drag ──
            this.isDragging  = true;
            this.currentDesk = { group: deskGroup, data: desk };
            this.dragOffset  = { x: pt.x - desk.x, y: pt.y - desk.y };
            this._multiOffsets = null;
            deskGroup.classList.add('dragging');
        }
    }

    _startMultiDrag(pt, selIds, clickedGroup, clickedDesk) {
        this._multiOffsets   = [];
        this._multiSnapshots = [];

        for (const id of selIds) {
            const d = this.editorManager.desks.get(id);
            if (!d || d.isLocked) continue;
            this._multiOffsets.push({ id, dx: d.x - pt.x, dy: d.y - pt.y });
            this._multiSnapshots.push({ before: { id: d.id, x: d.x, y: d.y } });
            this.mapManager.getDeskElement(id)?.classList.add('dragging');
        }

        this.isDragging  = true;
        this.currentDesk = { group: clickedGroup, data: clickedDesk };
    }

    // ─── mousemove ───────────────────────────────────────────────────────────

    _onMove(e) {
        if (!this.isDragging || !this.currentDesk) return;
        e.preventDefault();

        const pt   = this._toMapCoords(e.clientX, e.clientY);
        const snap = window.snapEngine;

        if (this._multiOffsets) {
            // Mover todos los desks seleccionados
            for (const off of this._multiOffsets) {
                const d = this.editorManager.desks.get(off.id);
                if (!d) continue;
                let nx = pt.x + off.dx;
                let ny = pt.y + off.dy;
                if (this.snapEnabled) {
                    nx = Math.round(nx / this.gridSize) * this.gridSize;
                    ny = Math.round(ny / this.gridSize) * this.gridSize;
                }
                nx = Math.max(0, Math.min(1140, nx));
                ny = Math.max(0, Math.min(764,  ny));
                d.x = nx;  d.y = ny;
                this.mapManager.updateDeskPosition(d.id, nx, ny);
            }
            snap?.clearGuides();

        } else {
            let nx = pt.x - this.dragOffset.x;
            let ny = pt.y - this.dragOffset.y;

            if (this.snapEnabled) {
                nx = Math.round(nx / this.gridSize) * this.gridSize;
                ny = Math.round(ny / this.gridSize) * this.gridSize;
            }
            nx = Math.max(0, Math.min(1140, nx));
            ny = Math.max(0, Math.min(764,  ny));

            if (snap?.enabled) {
                const snapped = snap.snap(nx, ny, 60, 36,
                    this.currentDesk.data.id, this.editorManager.desks);
                nx = snapped.x;  ny = snapped.y;
            }

            this.currentDesk.data.x = nx;
            this.currentDesk.data.y = ny;

            const rot = this.currentDesk.data.rotation || 0;
            this.currentDesk.group.setAttribute(
                'transform', `translate(${nx},${ny}) rotate(${rot},30,18)`);

            this.editorManager.onDeskMove?.(this.currentDesk.data);
        }
    }

    // ─── mouseup ─────────────────────────────────────────────────────────────

    _onUp() {
        if (!this.isDragging || !this.currentDesk) {
            this.isDragging = false;
            return;
        }

        window.snapEngine?.clearGuides();

        if (this._multiOffsets) {
            // Registrar undo + quitar clase dragging
            this._multiSnapshots.forEach(s => {
                const d = this.editorManager.desks.get(s.before.id);
                if (d) s.after = { id: d.id, x: d.x, y: d.y };
            });
            const moved = this._multiSnapshots.filter(s => s.after &&
                (s.after.x !== s.before.x || s.after.y !== s.before.y));
            if (moved.length) this.editorManager.undoManager?.recordBulkMove(moved);

            for (const off of this._multiOffsets) {
                this.mapManager.getDeskElement(off.id)?.classList.remove('dragging');
                const d = this.editorManager.desks.get(off.id);
                if (d) window.zoneManager?.checkDeskZoneAssignment(d);
            }
            this._multiOffsets   = null;
            this._multiSnapshots = null;

        } else {
            this.currentDesk.group.classList.remove('dragging');
            const dx = this.currentDesk.data.x - this.originalPos.x;
            const dy = this.currentDesk.data.y - this.originalPos.y;
            if (dx !== 0 || dy !== 0) {
                this.editorManager.undoManager?.recordDeskMove(
                    this.currentDesk.data,
                    { ...this.originalPos, id: this.currentDesk.data.id }
                );
                window.zoneManager?.checkDeskZoneAssignment(this.currentDesk.data);
            }
        }

        this.editorManager.onDeskMoveEnd?.(this.currentDesk.data);

        this.isDragging  = false;
        this.currentDesk = null;
    }

    // ─── Utilidades ──────────────────────────────────────────────────────────

    /**
     * Convierte coordenadas de pantalla al espacio local de #map-root.
     * getScreenCTM() en el <g> incluye viewBox + pan + zoom correctamente.
     */
    _toMapCoords(clientX, clientY) {
        const mapRoot = document.getElementById('map-root');
        if (mapRoot) {
            try {
                const ctm = mapRoot.getScreenCTM();
                if (ctm) {
                    const pt = this.svg.createSVGPoint();
                    pt.x = clientX;
                    pt.y = clientY;
                    return pt.matrixTransform(ctm.inverse());
                }
            } catch (_) { /* fall through */ }
        }
        // Fallback manual (sin pan/zoom o si getScreenCTM falla)
        const rect = this.svg.getBoundingClientRect();
        const vbW  = this.svg.viewBox?.baseVal?.width  || 1200;
        const vbH  = this.svg.viewBox?.baseVal?.height || 800;
        const mm   = this.mapManager;
        const s    = mm?.scale      || 1;
        const tx   = mm?.translateX || 0;
        const ty   = mm?.translateY || 0;
        return {
            x: ((clientX - rect.left) * (vbW / rect.width)  - tx) / s,
            y: ((clientY - rect.top)  * (vbH / rect.height) - ty) / s,
        };
    }

    /**
     * Sube por el árbol DOM desde el target hasta encontrar .desk-group.
     * Usa closest() si está disponible, con loop manual como fallback.
     */
    _findDeskGroup(target) {
        if (!target) return null;
        // closest() funciona en SVG en todos los browsers modernos
        if (typeof target.closest === 'function') {
            return target.closest('.desk-group');
        }
        // Fallback IE / browser antiguo
        let el = target;
        while (el && el !== this.svg) {
            if (el.classList?.contains('desk-group')) return el;
            el = el.parentElement || el.parentNode;
        }
        return null;
    }

    // ─── API pública ─────────────────────────────────────────────────────────

    /** Alias para compatibilidad con editor.js que llama getSVGPoint() */
    getSVGPoint(clientX, clientY) {
        return this._toMapCoords(clientX, clientY);
    }

    setSnapEnabled(v) { this.snapEnabled = v; }
    setGridSize(v)    { this.gridSize    = v; }
}

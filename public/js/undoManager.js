class UndoManager {
    static MAX_HISTORY = 100;

    constructor(editorManager) {
        this.editor = editorManager;
        this.undoStack = [];
        this.redoStack = [];
        this._suspended = false;

        this._bindKeys();
    }

    _bindKeys() {
        document.addEventListener('keydown', (e) => {
            if (!this.editor?.isEditorMode) return;
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const ctrl = isMac ? e.metaKey : e.ctrlKey;
            if (!ctrl) return;

            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
        });
    }

    // Suspender grabación durante undo/redo
    suspend()  { this._suspended = true;  }
    resume()   { this._suspended = false; }

    // ─── Registro de acciones ────────────────────────────────────────────────

    record(action) {
        if (this._suspended) return;
        this.undoStack.push(action);
        if (this.undoStack.length > UndoManager.MAX_HISTORY) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this._updateUI();
    }

    // Helpers de snapshot: captura estado antes de una operación
    snapshotDesk(desk) {
        return {
            id: desk.id, x: desk.x, y: desk.y,
            rotation: desk.rotation || 0,
            status: desk.status, agent: desk.agent,
            campaign: desk.campaign, extension: desk.extension,
            isLocked: desk.isLocked
        };
    }

    snapshotZone(zone) {
        return {
            id: zone.id, x: zone.x, y: zone.y,
            width: zone.width, height: zone.height,
            name: zone.name, color: zone.color, capacity: zone.capacity
        };
    }

    // ─── Tipos de acción ─────────────────────────────────────────────────────

    recordDeskMove(desk, before) {
        const after = this.snapshotDesk(desk);
        if (before.x === after.x && before.y === after.y) return;
        this.record({
            type: 'deskMove',
            undo: () => this._applyDeskSnapshot(before),
            redo: () => this._applyDeskSnapshot(after)
        });
    }

    recordDeskCreate(desk) {
        const snap = this.snapshotDesk(desk);
        this.record({
            type: 'deskCreate',
            undo: () => { this.editor.deleteDesk(snap.id); },
            redo: () => { this._restoreDesk(snap); }
        });
    }

    recordDeskDelete(desk) {
        const snap = this.snapshotDesk(desk);
        this.record({
            type: 'deskDelete',
            undo: () => { this._restoreDesk(snap); },
            redo: () => { this.editor.deleteDesk(snap.id); }
        });
    }

    recordDeskProps(desk, before) {
        const after = this.snapshotDesk(desk);
        this.record({
            type: 'deskProps',
            undo: () => this._applyDeskSnapshot(before),
            redo: () => this._applyDeskSnapshot(after)
        });
    }

    recordZoneMove(zone, before) {
        const after = this.snapshotZone(zone);
        this.record({
            type: 'zoneMove',
            undo: () => this._applyZoneSnapshot(before),
            redo: () => this._applyZoneSnapshot(after)
        });
    }

    recordZoneResize(zone, before) {
        const after = this.snapshotZone(zone);
        this.record({
            type: 'zoneResize',
            undo: () => this._applyZoneSnapshot(before),
            redo: () => this._applyZoneSnapshot(after)
        });
    }

    recordZoneCreate(zone) {
        const snap = this.snapshotZone(zone);
        this.record({
            type: 'zoneCreate',
            undo: () => { this.editor.zoneManager?.deleteZone(snap.id); },
            redo: () => { /* zone re-creation complex — reload layout */ this.editor.zoneManager?.loadZones([snap]); }
        });
    }

    recordZoneDelete(zone) {
        const snap = this.snapshotZone(zone);
        this.record({
            type: 'zoneDelete',
            undo: () => { this.editor.zoneManager?.loadZones([snap]); },
            redo: () => { this.editor.zoneManager?.deleteZone(snap.id); }
        });
    }

    recordBulkMove(snapshots) {
        // snapshots: [{ before, after }]
        this.record({
            type: 'bulkMove',
            undo: () => snapshots.forEach(s => this._applyDeskSnapshot(s.before)),
            redo: () => snapshots.forEach(s => this._applyDeskSnapshot(s.after))
        });
    }

    // ─── Undo / Redo ────────────────────────────────────────────────────────

    undo() {
        if (!this.undoStack.length) return;
        const action = this.undoStack.pop();
        this.redoStack.push(action);
        this.suspend();
        try { action.undo(); } finally { this.resume(); }
        this.editor.saveLayoutSilent();
        this._updateUI();
        this._toast(`↩ Deshacer: ${this._label(action.type)}`);
    }

    redo() {
        if (!this.redoStack.length) return;
        const action = this.redoStack.pop();
        this.undoStack.push(action);
        this.suspend();
        try { action.redo(); } finally { this.resume(); }
        this.editor.saveLayoutSilent();
        this._updateUI();
        this._toast(`↪ Rehacer: ${this._label(action.type)}`);
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._updateUI();
    }

    // ─── Aplicadores internos ────────────────────────────────────────────────

    _applyDeskSnapshot(snap) {
        const desk = this.editor.desks.get(snap.id);
        if (!desk) return;
        Object.assign(desk, snap);
        this.editor.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
        this.editor.mapManager.updateDesk(desk);
    }

    _restoreDesk(snap) {
        if (this.editor.desks.has(snap.id)) return;
        const desk = { ...snap, lastUpdate: new Date() };
        this.editor.desks.set(snap.id, desk);
        this.editor.mapManager.addDesk(desk, null);
    }

    _applyZoneSnapshot(snap) {
        const zm = this.editor.zoneManager;
        if (!zm) return;
        const zone = zm.zones.get(snap.id);
        if (!zone) return;
        Object.assign(zone, snap);
        zm.refreshZoneLabel(zone);
    }

    // ─── UI ─────────────────────────────────────────────────────────────────

    _updateUI() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
    }

    _toast(msg) {
        this.editor.uiManager?.showNotification(msg, 'info');
    }

    _label(type) {
        const labels = {
            deskMove: 'mover puesto', deskCreate: 'crear puesto',
            deskDelete: 'eliminar puesto', deskProps: 'editar propiedades',
            zoneMove: 'mover zona', zoneResize: 'redimensionar zona',
            zoneCreate: 'crear zona', zoneDelete: 'eliminar zona',
            bulkMove: 'mover selección'
        };
        return labels[type] || type;
    }
}

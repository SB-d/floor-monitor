class AlignmentManager {
    constructor(editorManager) {
        this.editor = editorManager;
        this._bindButtons();
    }

    _bindButtons() {
        const actions = [
            'align-left', 'align-right', 'align-top', 'align-bottom',
            'align-center-h', 'align-center-v',
            'distribute-h', 'distribute-v'
        ];
        actions.forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => this[this._toCamel(id)]());
        });
    }

    _toCamel(str) {
        return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _getSelectedDesks() {
        const ids = this.editor.selectedDesks;
        if (!ids || ids.size < 2) {
            this.editor.uiManager?.showNotification('Selecciona 2 o más puestos para alinear', 'warning');
            return null;
        }
        return Array.from(ids)
            .map(id => this.editor.desks.get(id))
            .filter(Boolean);
    }

    _W() { return 60; } // DESK_WIDTH
    _H() { return 36; } // DESK_HEIGHT

    _apply(desks, snapshots) {
        desks.forEach(desk => {
            this.editor.mapManager.updateDeskPosition(desk.id, desk.x, desk.y);
        });
        this.editor.undoManager?.recordBulkMove(snapshots);
        this.editor.saveLayoutSilent();
    }

    _snapshot(desks) {
        return desks.map(d => ({
            before: { id: d.id, x: d.x, y: d.y },
            after: null // se rellena después
        }));
    }

    // ─── Alineación ──────────────────────────────────────────────────────────

    alignLeft() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const minX = Math.min(...desks.map(d => d.x));
        desks.forEach(d => { d.x = minX; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    alignRight() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const maxX = Math.max(...desks.map(d => d.x + this._W()));
        desks.forEach(d => { d.x = maxX - this._W(); });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    alignTop() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const minY = Math.min(...desks.map(d => d.y));
        desks.forEach(d => { d.y = minY; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    alignBottom() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const maxY = Math.max(...desks.map(d => d.y + this._H()));
        desks.forEach(d => { d.y = maxY - this._H(); });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    alignCenterH() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const avgY = desks.reduce((s, d) => s + d.y + this._H() / 2, 0) / desks.length;
        desks.forEach(d => { d.y = avgY - this._H() / 2; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    alignCenterV() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const avgX = desks.reduce((s, d) => s + d.x + this._W() / 2, 0) / desks.length;
        desks.forEach(d => { d.x = avgX - this._W() / 2; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    // ─── Distribución ────────────────────────────────────────────────────────

    distributeH() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        if (desks.length < 3) {
            this.editor.uiManager?.showNotification('Necesitas al menos 3 puestos para distribuir', 'warning');
            return;
        }
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const sorted = [...desks].sort((a, b) => a.x - b.x);
        const totalW = sorted[sorted.length - 1].x - sorted[0].x;
        const gap = (totalW - this._W()) / (sorted.length - 1);
        sorted.forEach((d, i) => { d.x = sorted[0].x + i * (this._W() + gap - this._W()); });
        // simpler: equal spacing between left edges
        const startX = sorted[0].x;
        const endX   = sorted[sorted.length - 1].x;
        const step   = (endX - startX) / (sorted.length - 1);
        sorted.forEach((d, i) => { d.x = startX + i * step; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }

    distributeV() {
        const desks = this._getSelectedDesks(); if (!desks) return;
        if (desks.length < 3) {
            this.editor.uiManager?.showNotification('Necesitas al menos 3 puestos para distribuir', 'warning');
            return;
        }
        const snaps = desks.map(d => ({ before: { id: d.id, x: d.x, y: d.y } }));
        const sorted = [...desks].sort((a, b) => a.y - b.y);
        const startY = sorted[0].y;
        const endY   = sorted[sorted.length - 1].y;
        const step   = (endY - startY) / (sorted.length - 1);
        sorted.forEach((d, i) => { d.y = startY + i * step; });
        snaps.forEach((s, i) => { s.after = { id: desks[i].id, x: desks[i].x, y: desks[i].y }; });
        this._apply(desks, snaps);
    }
}

/**
 * StorageManager — persistencia con Supabase como fuente de verdad.
 * layout_id es el contenedor de todo: desks, zonas, config.
 */
class StorageManager {
    constructor() {
        this.storageKey  = 'contacta_floor_layout';
        this.zonesKey    = 'contacta_floor_zones';
        this.layoutIdKey = 'contacta_active_layout_id';

        // Se lee desde localStorage para sobrevivir recargas de página
        this._activeLayoutId = localStorage.getItem(this.layoutIdKey) ?? null;

        this._saveTimer  = null;
        this._zoneTimer  = null;
        this._SAVE_DEBOUNCE = 1500;
    }

    // ── Layout activo ───────────────────────────────────────────
    setActiveLayoutId(id) {
        this._activeLayoutId = id;
        if (id) localStorage.setItem(this.layoutIdKey, id);
        else    localStorage.removeItem(this.layoutIdKey);
        console.log('[StorageManager] activeLayoutId set to:', id);
    }

    // Siempre leer desde localStorage como fuente de verdad —
    // cubre el caso donde el objeto fue creado antes de que se seteara el ID.
    get activeLayoutId() {
        return this._activeLayoutId ?? localStorage.getItem(this.layoutIdKey) ?? null;
    }

    getActiveLayoutId() { return this.activeLayoutId; }

    // ── Save desks ──────────────────────────────────────────────
    saveLayout(desks) {
        const layoutId = this.activeLayoutId;
        this._saveLocalLayout(desks, layoutId);

        if (layoutId && this._isAuthenticated()) {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                this._saveSupabaseLayout(desks, layoutId).catch(err =>
                    console.warn('[StorageManager] Desk save error:', err.message)
                );
            }, this._SAVE_DEBOUNCE);
        }
        return true;
    }

    _saveLocalLayout(desks, layoutId) {
        try {
            const data = {
                version: '2.0',
                timestamp: new Date().toISOString(),
                layoutId: layoutId,
                desks: desks.map(d => ({
                    id: d.id, x: d.x, y: d.y,
                    rotation: d.rotation ?? 0,
                    status: d.status ?? 'offline',
                    agent: d.agent ?? null,
                    extension: d.extension ?? null,
                    campaign: d.campaign ?? null,
                    isLocked: d.isLocked || false,
                    customColor: d.customColor || null,
                    _dbId: d._dbId || null
                }))
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (_) {}
    }

    async _saveSupabaseLayout(desks, layoutId) {
        if (!window.dbService || !layoutId) return;
        console.log(`[StorageManager] Saving ${desks.length} desks to layout ${layoutId}`);
        const saved = await dbService.batchUpsertDesks(desks, layoutId);
        // Actualizar _dbId en memoria para que futuros saves sean UPDATE en vez de INSERT
        if (saved?.length && window.editorManager) {
            saved.forEach(row => {
                const desk = editorManager.desks.get(row.desk_number);
                if (desk) desk._dbId = row.id;
            });
        }
    }

    // ── Load desks ──────────────────────────────────────────────
    loadLayout() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                // Solo usar caché local si corresponde al layout activo
                if (data.layoutId && data.layoutId !== this.activeLayoutId) return null;
                return data.desks ?? null;
            }
        } catch (_) {}
        return null;
    }

    async loadLayoutFromSupabase(layoutId) {
        if (!window.dbService || !layoutId) return null;
        console.log('[StorageManager] Loading layout from Supabase:', layoutId);

        const layout = await dbService.getLayout(layoutId);
        if (!layout) return null;

        const rawDesks = Array.isArray(layout.desks) ? layout.desks : [];
        const rawZones = Array.isArray(layout.zones) ? layout.zones : [];

        const desks = rawDesks.map(d => ({
            id:          d.desk_number,
            x:           d.x,
            y:           d.y,
            rotation:    d.rotation ?? 0,
            status:      d.status ?? 'offline',
            agent:       d.agent ?? null,
            extension:   d.extension ?? null,
            campaign:    d.campaign ?? null,
            isLocked:    d.is_locked ?? false,
            customColor: d.custom_color ?? null,
            _dbId:       d.id  // ID real en DB — necesario para updates futuros
        }));

        const zones = rawZones.map(z => ({
            id:       z.id,
            name:     z.name,
            color:    z.color,
            x:        z.x,
            y:        z.y,
            width:    z.width,
            height:   z.height,
            capacity: z.capacity ?? 10,
            isLocked: z.is_locked ?? false
        }));

        console.log(`[StorageManager] Loaded ${desks.length} desks, ${zones.length} zones`);

        // Cachear en localStorage
        const cacheData = { version: '2.0', timestamp: new Date().toISOString(), layoutId, desks };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            localStorage.setItem(this.zonesKey, JSON.stringify(zones));
        } catch (_) {}

        return { desks, zones, meta: layout };
    }

    // ── Save zones ──────────────────────────────────────────────
    saveZones(zones) {
        const layoutId = this.activeLayoutId;

        try { localStorage.setItem(this.zonesKey, JSON.stringify(zones)); } catch (_) {}

        if (layoutId && this._isAuthenticated()) {
            clearTimeout(this._zoneTimer);
            this._zoneTimer = setTimeout(() => {
                this._saveSupabaseZones(zones, layoutId).catch(err =>
                    console.warn('[StorageManager] Zone save error:', err.message)
                );
            }, this._SAVE_DEBOUNCE);
        }
        return true;
    }

    async _saveSupabaseZones(zones, layoutId) {
        if (!window.dbService || !layoutId) return;
        console.log(`[StorageManager] Saving ${zones.length} zones to layout ${layoutId}`);
        for (const zone of zones) {
            try {
                const saved = await dbService.upsertZone(zone, layoutId);
                // Actualizar el ID real en memoria si era local (número o timestamp string)
                if (saved && zone.id !== saved.id && window.zoneManager) {
                    zoneManager.updateZoneDbId(zone.id, saved.id);
                }
            } catch (err) {
                console.warn('[StorageManager] Zone upsert error:', err.message, zone);
            }
        }
    }

    loadZones() {
        try {
            const saved = localStorage.getItem(this.zonesKey);
            if (saved) return JSON.parse(saved);
        } catch (_) {}
        return [];
    }

    // ── Export / Import ─────────────────────────────────────────
    exportLayout(desks, zones) {
        const data = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            desks: desks.map(d => ({
                id: d.id, x: d.x, y: d.y,
                rotation: d.rotation ?? 0,
                status: d.status, agent: d.agent,
                extension: d.extension, campaign: d.campaign,
                isLocked: d.isLocked || false,
                customColor: d.customColor || null,
                metadata: d.metadata || {}
            })),
            zones: zones,
            settings: {
                gridEnabled: window.editorManager?.snapEnabled || false,
                gridSize:    window.editorManager?.gridSize    || 40
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `floor_layout_${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }

    importLayout(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            if (!data.desks || !Array.isArray(data.desks)) throw new Error('Formato inválido');
            return { desks: data.desks, zones: data.zones || [], settings: data.settings || {} };
        } catch (err) {
            console.error('Error importing layout:', err);
            return null;
        }
    }

    // ── Clear ───────────────────────────────────────────────────
    clearLayout() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.zonesKey);
        // NO borrar layoutIdKey — se necesita para la carga
    }

    clearActiveLayout() {
        this._activeLayoutId = null;
        localStorage.removeItem(this.layoutIdKey);
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.zonesKey);
    }

    hasSavedLayout() {
        return localStorage.getItem(this.storageKey) !== null;
    }

    // ── Utils ───────────────────────────────────────────────────
    _isAuthenticated() {
        return window.authService?.isLoggedIn ?? false;
    }
}

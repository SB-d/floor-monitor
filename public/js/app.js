// Inicializar aplicación
document.addEventListener('DOMContentLoaded', () => {
    const socketManager  = new SocketManager();
    const uiManager      = new UIManager();
    const storageManager = new StorageManager();

    let floorMapManager = null;
    let editorManager   = null;
    let zoneManager     = null;
    let currentDesks    = new Map();   // estado en tiempo real del servidor

    // ─── helpers ────────────────────────────────────────────────────────────

    function ensureManagers() {
        if (!floorMapManager) {
            const svg            = document.getElementById('floor-map');
            const desksContainer = document.getElementById('desks');
            floorMapManager      = new FloorMapManager(svg, desksContainer);
        }
        if (!editorManager) {
            editorManager        = new EditorManager(floorMapManager, uiManager, socketManager, storageManager);
            window.editorManager = editorManager;
        }
        if (!zoneManager) {
            const zonesContainer   = document.getElementById('zones');
            zoneManager            = new ZoneManager(zonesContainer, editorManager, floorMapManager);
            editorManager.zoneManager = zoneManager;
            window.zoneManager     = zoneManager;
        }
    }

    function initFromSavedLayout() {
        const savedDesks = storageManager.loadLayout();
        if (!savedDesks || savedDesks.length === 0) return false;

        // Mezclar layout guardado con estados en tiempo real del servidor
        const merged = savedDesks.map(saved => {
            const live = currentDesks.get(saved.id);
            return live ? {
                ...saved,
                status:     live.status,
                agent:      live.agent,
                campaign:   live.campaign,
                extension:  live.extension,
                lastUpdate: live.lastUpdate,
            } : saved;
        });

        editorManager.desks.clear();
        merged.forEach(d => {
            editorManager.desks.set(d.id, d);
            if (d.id >= editorManager.nextDeskId) editorManager.nextDeskId = d.id + 1;
        });

        floorMapManager.renderDesks(merged, (desk) => {
            if (!editorManager.isEditorMode) uiManager.showDeskDetails(desk);
        });

        // Zonas guardadas
        const savedZones = storageManager.loadZones();
        if (savedZones?.length > 0) zoneManager.loadZones(savedZones);

        return true;
    }

    // ─── Socket callbacks ───────────────────────────────────────────────────

    socketManager.on('onConnectionChange', (isConnected) => {
        uiManager.updateConnectionStatus(isConnected);
    });

    socketManager.on('onInitialData', (desks) => {
        // Guardar estado en tiempo real (se usa solo para actualizar puestos existentes)
        currentDesks.clear();
        desks.forEach(d => currentDesks.set(d.id, d));

        ensureManagers();

        // Intentar cargar layout guardado
        const loaded = initFromSavedLayout();

        if (!loaded) {
            // No hay layout guardado → canvas vacío (comportamiento por defecto)
            floorMapManager.renderDesks([], null);
            uiManager.showCanvasEmpty();
        }
    });

    socketManager.on('onDesksUpdate', (updates) => {
        updates.forEach(updated => {
            currentDesks.set(updated.id, updated);

            if (editorManager?.desks.has(updated.id)) {
                const existing   = editorManager.desks.get(updated.id);
                // Actualizar solo campos de tiempo real, preservar posición y configuración
                existing.status     = updated.status;
                existing.agent      = updated.agent;
                existing.campaign   = updated.campaign;
                existing.extension  = updated.extension;
                existing.lastUpdate = updated.lastUpdate;

                floorMapManager?.updateDesk(existing);
            }
        });

        if (floorMapManager?.selectedDeskId && !editorManager?.isEditorMode) {
            const sel = currentDesks.get(floorMapManager.selectedDeskId);
            if (sel) uiManager.showDeskDetails(sel);
        }
    });

    socketManager.on('onStatsUpdate', (stats) => {
        uiManager.updateStats(stats);
    });

    // ─── Arranque ───────────────────────────────────────────────────────────

    socketManager.connect();
    uiManager.showEmptyState();   // panel lateral vacío al inicio

    console.log('✅ Contacta Floor Monitor v2.0 — Professional Layout Editor');
});

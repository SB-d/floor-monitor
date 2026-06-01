// ─── Contacta Floor Monitor — app.js ──────────────────────────────────────────
// Arquitectura: Layout es el contenedor principal. Todo (desks, zonas) pertenece
// a un layout_id específico. El editor nunca tiene estado "global".
// ──────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

    // 1. Esperar auth gate (sesión validada)
    if (window.__authGate) {
        try { await window.__authGate; } catch (_) {}
    }

    // 2. Mostrar UI
    document.getElementById('auth-gate-overlay')?.remove();
    document.getElementById('auth-gate-style')?.remove();
    document.body.style.removeProperty('visibility');
    document.documentElement.style.removeProperty('visibility');

    // ─── Instancias globales ───────────────────────────────────────────────
    const socketManager  = new SocketManager();
    const uiManager      = new UIManager();
    const storageManager = new StorageManager();

    let floorMapManager = null;
    let editorManager   = null;
    let zoneManager     = null;
    let currentDesks    = new Map();  // estado en tiempo real del socket
    let _supabaseReady  = false;

    // Unsubscribers realtime — evitar acumulación al cambiar de layout
    let _realtimeUnsubDesks     = null;
    let _realtimeUnsubPresence  = null;

    // ─── Inicializar managers SVG ──────────────────────────────────────────
    function ensureManagers() {
        if (!floorMapManager) {
            floorMapManager = new FloorMapManager(
                document.getElementById('floor-map'),
                document.getElementById('desks')
            );
        }
        if (!editorManager) {
            editorManager        = new EditorManager(floorMapManager, uiManager, socketManager, storageManager);
            window.editorManager = editorManager;
        }
        if (!zoneManager) {
            zoneManager               = new ZoneManager(document.getElementById('zones'), editorManager, floorMapManager);
            editorManager.zoneManager = zoneManager;
            window.zoneManager        = zoneManager;
        }
    }

    // ─── Cargar layout desde Supabase ─────────────────────────────────────
    // Esta es la función central. Limpia el estado anterior, carga desde DB,
    // renderiza y activa el activeLayoutId para todos los saves posteriores.
    async function loadLayout(layoutId) {
        if (!layoutId) {
            console.warn('[App] loadLayout: layoutId es null, abortando');
            return false;
        }
        console.log('[App] Cargando layout:', layoutId);

        try {
            ensureManagers();

            // Limpiar estado anterior (MANTENIENDO el layoutId en localStorage)
            editorManager.desks.clear();
            editorManager.nextDeskId = 1;
            floorMapManager.renderDesks([], null);
            zoneManager?.clearAllZones?.();
            // No llamar clearLayout() aquí — borraría el layoutId antes de setActiveLayoutId

            // Setear layoutId PRIMERO — antes de cualquier fetch —
            // así si el usuario hace algo mientras carga, se guarda al layout correcto
            storageManager.setActiveLayoutId(layoutId);
            console.log('[App] activeLayoutId seteado:', storageManager.getActiveLayoutId());

            // Cargar desde Supabase
            const result = await storageManager.loadLayoutFromSupabase(layoutId);
            if (!result) {
                console.warn('[App] loadLayoutFromSupabase devolvió null para:', layoutId);
                // Layout existe en DB pero sin desks/zonas todavía — es válido (layout nuevo)
                uiManager.showNotification(`Layout cargado (vacío)`, 'success', 2000);
                return true;
            }

            console.log(`[App] Cargados: ${result.desks.length} desks, ${result.zones.length} zonas`);

            // Renderizar
            _renderLoadedLayout(result.desks, result.zones);

            // Mostrar nombre del layout en el header
            const layoutName = result.meta?.name ?? 'Sin nombre';
            const headerSub = document.getElementById('layout-name-header');
            if (headerSub) headerSub.textContent = layoutName;
            document.title = `${layoutName} — Floor Monitor`;

            // Suscribir realtime
            _subscribeToLayout(layoutId);

            uiManager.showNotification(`Layout "${result.meta?.name ?? ''}" cargado`, 'success', 3000);
            return true;

        } catch (err) {
            console.error('[App] Error cargando layout:', err.message, err);
            uiManager.showNotification('Error al cargar layout: ' + err.message, 'error');
            // Aunque falle, el activeLayoutId ya fue seteado — los saves futuros van al layout correcto
            return false;
        }
    }

    function _renderLoadedLayout(desks, zones) {
        editorManager.desks.clear();
        desks.forEach(d => {
            const live   = currentDesks.get(d.id);
            const merged = live ? { ...d, status: live.status, agent: live.agent, campaign: live.campaign, extension: live.extension } : d;
            editorManager.desks.set(d.id, merged);
            if (d.id >= editorManager.nextDeskId) editorManager.nextDeskId = d.id + 1;
        });

        floorMapManager.renderDesks(Array.from(editorManager.desks.values()), (desk) => {
            if (!editorManager.isEditorMode) {
                // Usar siempre el objeto en memoria (tiene _dbId y estado actual)
                const live = editorManager.desks.get(desk.id) ?? desk;
                uiManager.showDeskDetails(live);
            }
        });

        if (zones?.length > 0) zoneManager?.loadZones(zones);

        _recalcStats();
    }

    // ─── Supabase / Auth init ──────────────────────────────────────────────
    async function initSupabase() {
        _supabaseReady = authService.isLoggedIn;
        if (!_supabaseReady) return;

        authService.onAuthChange((event) => {
            if (event === 'SIGNED_OUT') window.location.replace('/login');
        });

        _applyRoleRestrictions();
        _updateUserHeader();

        // Cargar layout activo guardado en localStorage
        const savedLayoutId = storageManager.getActiveLayoutId();
        console.log('[App] savedLayoutId desde localStorage:', savedLayoutId);

        if (savedLayoutId) {
            await loadLayout(savedLayoutId);
        } else {
            console.log('[App] Sin layout activo — mostrando pantalla de selección');
            uiManager.showNoLayoutSelected();
        }
    }

    function _applyRoleRestrictions() {
        const canEdit  = authService.isEditor();
        const canAdmin = authService.isSupervisor();
        document.querySelectorAll('[data-require-editor]').forEach(el => { el.style.display = canEdit  ? '' : 'none'; });
        document.querySelectorAll('[data-require-supervisor]').forEach(el => { el.style.display = canAdmin ? '' : 'none'; });
        document.querySelectorAll('[data-require-admin]').forEach(el => { el.style.display = authService.isAdmin() ? '' : 'none'; });
        document.body.dataset.role = authService.role;
    }

    function _updateUserHeader() {
        const nameEl   = document.getElementById('user-name');
        const roleEl   = document.getElementById('user-role');
        const avatarEl = document.getElementById('user-avatar');
        const compEl   = document.getElementById('company-name');

        if (nameEl)   nameEl.textContent = authService.fullName;
        if (roleEl)   roleEl.textContent = authService.role;
        if (compEl)   compEl.textContent = authService.company?.name ?? '';
        if (avatarEl) {
            const av = authService.profile?.avatar_url;
            if (av) {
                avatarEl.style.backgroundImage = `url(${av})`;
            } else {
                avatarEl.textContent = (authService.fullName ?? 'U')
                    .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            }
        }
    }

    // ─── Realtime ──────────────────────────────────────────────────────────
    function _subscribeToLayout(layoutId) {
        // Limpiar listeners del layout anterior para evitar acumulación
        if (_realtimeUnsubDesks)    { _realtimeUnsubDesks();    _realtimeUnsubDesks    = null; }
        if (_realtimeUnsubPresence) { _realtimeUnsubPresence(); _realtimeUnsubPresence = null; }

        if (!window.realtimeService || !_supabaseReady) return;
        realtimeService.subscribeToLayout(layoutId).then(() => {
            _realtimeUnsubDesks = realtimeService.onDeskChange((eventType, newRow) => {
                if (!editorManager) return;
                if (eventType === 'UPDATE' || eventType === 'INSERT') {
                    const desk = editorManager.desks.get(newRow.desk_number);
                    if (desk) {
                        desk.status    = newRow.status;
                        desk.agent     = newRow.agent;
                        desk.campaign  = newRow.campaign;
                        desk.extension = newRow.extension;
                        desk.x         = newRow.x;
                        desk.y         = newRow.y;
                        desk.lastUpdate = newRow.updated_at ?? new Date().toISOString();
                        floorMapManager?.updateDesk(desk);
                        // Si el panel de monitoreo muestra este puesto, refrescarlo
                        if (!editorManager.isEditorMode &&
                            floorMapManager?.selectedDeskId === desk.id) {
                            uiManager.showDeskDetails(desk);
                        }
                    }
                }
            });
            _realtimeUnsubPresence = realtimeService.onPresence((event, data) => {
                _renderPresenceIndicators(realtimeService.getActiveUsers(layoutId));
            });
        }).catch(() => {});
    }

    function _renderPresenceIndicators(users) {
        const container = document.getElementById('presence-avatars');
        if (!container) return;
        container.innerHTML = '';
        users.filter(u => u.user_id !== authService.user?.id).slice(0, 5).forEach(u => {
            const el = document.createElement('div');
            el.className = 'presence-avatar';
            el.title = u.full_name ?? 'Usuario';
            if (u.avatar_url) el.style.backgroundImage = `url(${u.avatar_url})`;
            else el.textContent = (u.full_name ?? 'U')[0].toUpperCase();
            container.appendChild(el);
        });
    }

    // ─── Stats ─────────────────────────────────────────────────────────────
    function _recalcStats() {
        const stats = { online: 0, busy: 0, pause: 0, offline: 0, error: 0, total: 0 };
        editorManager?.desks?.forEach(d => {
            stats.total++;
            const s = d.status ?? 'offline';
            if (stats[s] !== undefined) stats[s]++;
        });
        uiManager.updateStats(stats);
    }

    // ─── Socket callbacks ──────────────────────────────────────────────────
    socketManager.on('onConnectionChange', (isConnected) => {
        uiManager.updateConnectionStatus(isConnected);
    });

    socketManager.on('onInitialData', (desks) => {
        currentDesks.clear();
        desks.forEach(d => currentDesks.set(d.id, d));
        ensureManagers();

        const layoutId = storageManager.getActiveLayoutId();
        if (layoutId && _supabaseReady) {
            // Ya tenemos un layout cargado — solo actualizar estados de tiempo real
            desks.forEach(updated => {
                if (editorManager?.desks.has(updated.id)) {
                    const existing = editorManager.desks.get(updated.id);
                    existing.status = updated.status; existing.agent = updated.agent;
                    existing.campaign = updated.campaign; existing.extension = updated.extension;
                    floorMapManager?.updateDesk(existing);
                }
            });
            _recalcStats();
        } else {
            // Sin layout Supabase activo — intentar localStorage
            const savedDesks = storageManager.loadLayout();
            if (savedDesks?.length) {
                editorManager.desks.clear();
                savedDesks.forEach(d => {
                    const live = currentDesks.get(d.id);
                    const merged = live ? { ...d, status: live.status, agent: live.agent, campaign: live.campaign, extension: live.extension } : d;
                    editorManager.desks.set(d.id, merged);
                    if (d.id >= editorManager.nextDeskId) editorManager.nextDeskId = d.id + 1;
                });
                floorMapManager.renderDesks(Array.from(editorManager.desks.values()), d => {
                    if (!editorManager.isEditorMode) uiManager.showDeskDetails(d);
                });
                const savedZones = storageManager.loadZones();
                if (savedZones?.length) zoneManager?.loadZones(savedZones);
                _recalcStats();
            } else {
                floorMapManager.renderDesks([], null);
                uiManager.showCanvasEmpty();
            }
        }
    });

    socketManager.on('onDesksUpdate', (updates) => {
        updates.forEach(updated => {
            currentDesks.set(updated.id, updated);
            if (editorManager?.desks.has(updated.id)) {
                const existing = editorManager.desks.get(updated.id);
                existing.status = updated.status; existing.agent = updated.agent;
                existing.campaign = updated.campaign; existing.extension = updated.extension;
                existing.lastUpdate = updated.lastUpdate;
                floorMapManager?.updateDesk(existing);
            }
        });
        _recalcStats();
        if (floorMapManager?.selectedDeskId && !editorManager?.isEditorMode) {
            const sel = currentDesks.get(floorMapManager.selectedDeskId);
            if (sel) uiManager.showDeskDetails(sel);
        }
    });

    socketManager.on('onStatsUpdate', () => { _recalcStats(); });

    // ─── API pública (layout selector, crear, guardar) ─────────────────────
    window.openLayoutSelector = async () => {
        if (!authService.isLoggedIn) {
            uiManager.showNotification('Inicia sesión para ver tus layouts guardados', 'info');
            return;
        }
        try {
            const layouts = await dbService.getLayouts();
            _showLayoutSelectorModal(layouts);
        } catch (err) {
            uiManager.showNotification('Error al cargar layouts: ' + err.message, 'error');
        }
    };

    window.selectLayout = async (layoutId) => {
        _closeModal('layout-selector-modal');
        await loadLayout(layoutId);
    };

    window.createNewLayout = async (name) => {
        if (!authService.isLoggedIn) {
            uiManager.showNotification('Inicia sesión para guardar layouts en la nube', 'info');
            return null;
        }
        try {
            const layout = await dbService.createLayout({ name: name || 'Nuevo Layout' });
            storageManager.setActiveLayoutId(layout.id);
            _subscribeToLayout(layout.id);
            uiManager.showNotification(`Layout "${layout.name}" creado`, 'success');
            return layout;
        } catch (err) {
            uiManager.showNotification('Error al crear layout: ' + err.message, 'error');
            return null;
        }
    };

    window.saveCurrentLayoutToCloud = async () => {
        if (!authService.isLoggedIn) {
            uiManager.showNotification('Inicia sesión para guardar en la nube', 'info');
            return;
        }
        let layoutId = storageManager.getActiveLayoutId();
        if (!layoutId) {
            const name = prompt('Nombre del layout:', 'Mi Layout');
            if (!name) return;
            const layout = await window.createNewLayout(name);
            if (!layout) return;
            layoutId = layout.id;
        }
        try {
            const desks = Array.from(editorManager?.desks.values() ?? []);
            const zones = zoneManager ? Array.from(zoneManager.zones.values()) : [];
            await storageManager._saveSupabaseLayout(desks, layoutId);
            if (zones.length) await storageManager._saveSupabaseZones(zones, layoutId);
            uiManager.showNotification('Layout guardado en la nube ☁️', 'success');
        } catch (err) {
            uiManager.showNotification('Error al guardar: ' + err.message, 'error');
        }
    };

    function _showLayoutSelectorModal(layouts) {
        document.getElementById('layout-selector-modal')?.remove();

        const modal  = document.createElement('div');
        modal.id     = 'layout-selector-modal';
        modal.className = 'modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';
        dialog.style.maxWidth = '500px';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        const h3 = document.createElement('h3');
        h3.textContent = 'Seleccionar Layout';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => modal.remove();
        header.appendChild(h3);
        header.appendChild(closeBtn);

        // Body — items construidos con DOM (sin innerHTML con datos del usuario)
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.cssText = 'max-height:360px;overflow-y:auto';

        if (!layouts.length) {
            const p = document.createElement('p');
            p.style.cssText = 'color:var(--text-muted);text-align:center;padding:2rem';
            p.textContent = 'No hay layouts guardados';
            body.appendChild(p);
        } else {
            layouts.forEach(l => {
                const item = document.createElement('div');
                item.className = 'layout-item';
                item.onclick = () => window.selectLayout(l.id);
                const name = document.createElement('div');
                name.className = 'layout-item-name';
                name.textContent = l.name;
                const meta = document.createElement('div');
                meta.className = 'layout-item-meta';
                meta.textContent = `Actualizado: ${new Date(l.updated_at).toLocaleDateString()}`;
                item.appendChild(name);
                item.appendChild(meta);
                body.appendChild(item);
            });
        }

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const newBtn = document.createElement('button');
        newBtn.className = 'btn btn-primary';
        newBtn.textContent = '+ Nuevo Layout';
        newBtn.onclick = () => {
            const n = prompt('Nombre del nuevo layout:', 'Nuevo Layout');
            if (n) window.createNewLayout(n);
        };
        footer.appendChild(newBtn);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        modal.appendChild(dialog);
        document.body.appendChild(modal);
    }

    window._closeModal = (id) => { document.getElementById(id)?.remove(); };
    window.closeModal  = window._closeModal;

    window.logoutUser = async () => {
        if (!confirm('¿Cerrar sesión?')) return;
        try {
            realtimeService?.unsubscribeAll().catch(() => {});
            await authService.logout();
        } catch (_) {}
        window.location.replace('/login');
    };

    // ─── Advertencia al salir con cambios sin guardar ─────────────────────
    let _hasUnsavedChanges = false;

    // Marcar dirty después de cualquier cambio en el editor
    const _originalSaveLayout = storageManager.saveLayout.bind(storageManager);
    storageManager.saveLayout = function(desks) {
        _hasUnsavedChanges = true;
        return _originalSaveLayout(desks);
    };

    // Limpiar dirty después de guardar en nube con éxito
    const _originalSaveToCloud = window.saveCurrentLayoutToCloud;
    window.saveCurrentLayoutToCloud = async () => {
        await _originalSaveToCloud();
        _hasUnsavedChanges = false;
    };

    // El autosave también limpia el flag
    window.addEventListener('beforeunload', (e) => {
        if (_hasUnsavedChanges && editorManager?.isEditorMode) {
            e.preventDefault();
            e.returnValue = '¿Salir? Tienes cambios sin guardar en la nube.';
        }
    });

    // ─── Autosave cada 30 segundos (solo en modo editor con cambios pendientes) ──
    setInterval(async () => {
        if (!authService.isLoggedIn) return;
        if (!editorManager?.isEditorMode) return;
        if (!_hasUnsavedChanges) return;
        const layoutId = storageManager.getActiveLayoutId();
        if (!layoutId || !editorManager?.desks?.size) return;
        try {
            const desks = Array.from(editorManager.desks.values());
            const zones = zoneManager ? Array.from(zoneManager.zones.values()) : [];
            await storageManager._saveSupabaseLayout(desks, layoutId);
            if (zones.length) await storageManager._saveSupabaseZones(zones, layoutId);
            _hasUnsavedChanges = false;
            console.log(`[App] Autosave OK — ${desks.length} desks, ${zones.length} zonas → layout ${layoutId}`);
            uiManager.showNotification('Guardado automático ☁️', 'success', 2000);
        } catch (err) {
            console.warn('[App] Autosave error:', err.message);
        }
    }, 30000);

    // ─── Arranque ─────────────────────────────────────────────────────────
    uiManager.showEmptyState();

    // initSupabase PRIMERO — setea activeLayoutId antes de que el socket dispare onInitialData
    await initSupabase();

    // Socket después — onInitialData ya encontrará el layout en memoria
    socketManager.connect();

    console.log('✅ Contacta Floor Monitor v3.0 — Layout:', storageManager.getActiveLayoutId() ?? 'ninguno');
});

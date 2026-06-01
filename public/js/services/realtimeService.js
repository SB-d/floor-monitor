/**
 * RealtimeService — colaboración en vivo con Supabase Realtime
 * Sincronización de desks/zones + presencia de usuarios
 */

class RealtimeService {
    constructor() {
        this._channels  = new Map();
        this._presence  = null;
        this._listeners = { desk: [], zone: [], presence: [] };
    }

    // ── Suscribirse a un layout ─────────────────────────────────
    async subscribeToLayout(layoutId) {
        await this.unsubscribeFromLayout(layoutId);
        const sb = await getSupabase();

        const channel = sb.channel(`layout:${layoutId}`, {
            config: { broadcast: { self: false } }
        });

        // Cambios en desks
        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table:  'desks',
            filter: `layout_id=eq.${layoutId}`
        }, payload => {
            this._listeners.desk.forEach(fn => {
                try { fn(payload.eventType, payload.new, payload.old); } catch (_) {}
            });
        });

        // Cambios en zones
        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table:  'zones',
            filter: `layout_id=eq.${layoutId}`
        }, payload => {
            this._listeners.zone.forEach(fn => {
                try { fn(payload.eventType, payload.new, payload.old); } catch (_) {}
            });
        });

        // Presencia de colaboradores
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            this._listeners.presence.forEach(fn => {
                try { fn('sync', state); } catch (_) {}
            });
        });

        channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
            this._listeners.presence.forEach(fn => {
                try { fn('join', { key, users: newPresences }); } catch (_) {}
            });
        });

        channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            this._listeners.presence.forEach(fn => {
                try { fn('leave', { key, users: leftPresences }); } catch (_) {}
            });
        });

        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const profile = authService.profile;
                await channel.track({
                    user_id:   authService.user?.id,
                    full_name: profile?.full_name ?? 'Usuario',
                    avatar_url: profile?.avatar_url ?? null,
                    role:      authService.role,
                    joined_at: new Date().toISOString(),
                    cursor:    null
                });
            }
        });

        this._channels.set(layoutId, channel);
        this._presence = channel;
        return channel;
    }

    async unsubscribeFromLayout(layoutId) {
        const ch = this._channels.get(layoutId);
        if (ch) {
            await ch.unsubscribe();
            this._channels.delete(layoutId);
            if (this._presence === ch) this._presence = null;
        }
    }

    async unsubscribeAll() {
        for (const [id] of this._channels) {
            await this.unsubscribeFromLayout(id);
        }
    }

    // ── Cursor sharing ──────────────────────────────────────────
    async updateCursor(x, y) {
        if (!this._presence) return;
        try {
            await this._presence.track({ cursor: { x, y } });
        } catch (_) {}
    }

    // ── Presencia actual ────────────────────────────────────────
    getPresenceState(layoutId) {
        const ch = this._channels.get(layoutId);
        if (!ch) return {};
        return ch.presenceState();
    }

    getActiveUsers(layoutId) {
        const state = this.getPresenceState(layoutId);
        return Object.values(state).flat();
    }

    // ── Listeners ───────────────────────────────────────────────
    onDeskChange(fn)    { this._listeners.desk.push(fn);     return () => this._removeListener('desk', fn); }
    onZoneChange(fn)    { this._listeners.zone.push(fn);     return () => this._removeListener('zone', fn); }
    onPresence(fn)      { this._listeners.presence.push(fn); return () => this._removeListener('presence', fn); }

    _removeListener(type, fn) {
        this._listeners[type] = this._listeners[type].filter(l => l !== fn);
    }
}

window.realtimeService = new RealtimeService();

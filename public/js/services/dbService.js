/**
 * DbService — CRUD completo con Supabase
 * Layouts, floors, buildings, zones, desks, historial
 */

class DbService {

    // ── Layouts ─────────────────────────────────────────────────
    async getLayouts(floorId = null) {
        const sb = await getSupabase();
        let q = sb.from('layouts')
            .select('*, zones(count), desks(count)')
            .eq('is_active', true)
            .order('updated_at', { ascending: false });
        if (floorId) q = q.eq('floor_id', floorId);
        const { data, error } = await q;
        if (error) throw error;
        return data;
    }

    async getLayout(layoutId) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('layouts')
            .select('*, zones(*), desks(*)')
            .eq('id', layoutId)
            .single();
        if (error) throw error;
        return data;
    }

    async createLayout(payload) {
        const sb        = await getSupabase();
        const userId    = authService.user?.id;
        const companyId = authService.companyId; // null para super_admin — OK

        if (!userId) throw new Error('No hay sesión activa. Recarga la página.');

        // super_admin puede crear layouts sin empresa (globales / de plantilla)
        // admin/editor requieren empresa
        if (!companyId && !authService.isSuperAdmin()) {
            throw new Error('Tu usuario no tiene una empresa asociada. Contacta al administrador.');
        }

        const { data, error } = await sb
            .from('layouts')
            .insert({ ...payload, company_id: companyId, created_by: userId })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateLayout(layoutId, updates) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('layouts')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', layoutId)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteLayout(layoutId) {
        const sb = await getSupabase();
        const { error } = await sb
            .from('layouts')
            .update({ is_active: false })
            .eq('id', layoutId);
        if (error) throw error;
    }

    // ── Buildings ───────────────────────────────────────────────
    async getBuildings() {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('buildings')
            .select('*, floors(*)')
            .order('name');
        if (error) throw error;
        return data;
    }

    async createBuilding(name, address = '') {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('buildings')
            .insert({
                name,
                address,
                company_id: authService.companyId,
                created_by: authService.user?.id
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    // ── Floors ──────────────────────────────────────────────────
    async createFloor(buildingId, name, floorNumber = 1) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('floors')
            .insert({
                building_id: buildingId,
                company_id:  authService.companyId,
                created_by:  authService.user?.id,
                name,
                floor_number: floorNumber
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    // ── Zones ───────────────────────────────────────────────────
    async getZones(layoutId) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('zones')
            .select('*')
            .eq('layout_id', layoutId)
            .order('created_at');
        if (error) throw error;
        return data;
    }

    async upsertZone(zone, layoutId) {
        const sb = await getSupabase();
        // Solo los campos que existen en la tabla — evitar columnas extra del estado local
        const payload = {
            layout_id:  layoutId,
            company_id: authService.companyId ?? await this._getLayoutCompanyId(layoutId),
            created_by: authService.user?.id,
            name:       zone.name,
            color:      zone.color,
            x:          zone.x,
            y:          zone.y,
            width:      zone.width,
            height:     zone.height,
            capacity:   zone.capacity ?? 10,
            is_locked:  zone.isLocked ?? false
        };

        if (zone.id && !this._isLocalId(zone.id)) {
            // UPDATE zona existente en DB (tiene UUID)
            const { data, error } = await sb
                .from('zones').update(payload).eq('id', zone.id).select().single();
            if (error) throw error;
            return data;
        } else {
            // INSERT nueva zona — ignorar el id local
            const { data, error } = await sb
                .from('zones').insert(payload).select().single();
            if (error) throw error;
            return data;
        }
    }

    async deleteZone(zoneId) {
        const sb = await getSupabase();
        const { error } = await sb.from('zones').delete().eq('id', zoneId);
        if (error) throw error;
    }

    async deleteAllZones(layoutId) {
        const sb = await getSupabase();
        const { error } = await sb.from('zones').delete().eq('layout_id', layoutId);
        if (error) throw error;
    }

    async deleteAllDesks(layoutId) {
        const sb = await getSupabase();
        const { error } = await sb.from('desks').delete().eq('layout_id', layoutId);
        if (error) throw error;
    }

    // ── Desks ───────────────────────────────────────────────────
    async getDesks(layoutId) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('desks')
            .select('*')
            .eq('layout_id', layoutId)
            .order('desk_number');
        if (error) throw error;
        return data;
    }

    async upsertDesk(desk, layoutId) {
        const sb = await getSupabase();
        const payload = {
            layout_id:   layoutId,
            company_id:  authService.companyId,
            created_by:  authService.user?.id,
            desk_number: desk.id,
            x:           desk.x,
            y:           desk.y,
            rotation:    desk.rotation ?? 0,
            status:      desk.status ?? 'offline',
            agent:       desk.agent ?? null,
            extension:   desk.extension ?? null,
            campaign:    desk.campaign ?? null,
            is_locked:   desk.isLocked ?? false,
            custom_color: desk.customColor ?? null,
            metadata:    desk.metadata ?? {}
        };

        if (desk._dbId) {
            const { data, error } = await sb
                .from('desks').update(payload).eq('id', desk._dbId).select().single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await sb
                .from('desks').insert(payload).select().single();
            if (error) throw error;
            return data;
        }
    }

    async batchUpsertDesks(desks, layoutId) {
        const sb = await getSupabase();
        // Obtener company_id del layout si el usuario no tiene empresa propia (super_admin)
        const companyId = authService.companyId ?? await this._getLayoutCompanyId(layoutId);
        const payloads = desks.map(desk => ({
            layout_id:   layoutId,
            company_id:  companyId,
            created_by:  authService.user?.id,
            desk_number: desk.id,
            x: desk.x, y: desk.y,
            rotation: desk.rotation ?? 0,
            status:   desk.status ?? 'offline',
            agent:    desk.agent ?? null,
            extension: desk.extension ?? null,
            campaign:  desk.campaign ?? null,
            is_locked: desk.isLocked ?? false,
            custom_color: desk.customColor ?? null,
            metadata: desk.metadata ?? {}
        }));

        const { data, error } = await sb
            .from('desks')
            .upsert(payloads, { onConflict: 'layout_id,desk_number', ignoreDuplicates: false })
            .select();
        if (error) throw error;
        return data;
    }

    async deleteDesk(deskDbId) {
        const sb = await getSupabase();
        const { error } = await sb.from('desks').delete().eq('id', deskDbId);
        if (error) throw error;
    }

    async updateDeskStatus(deskDbId, status, agent = null, campaign = null, extension = null) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('desks')
            .update({ status, agent, campaign, extension })
            .eq('id', deskDbId)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    // ── Stats ───────────────────────────────────────────────────
    async getLayoutStats(layoutId) {
        const sb = await getSupabase();
        const { data, error } = await sb.rpc('get_layout_stats', { p_layout_id: layoutId });
        if (error) throw error;
        return data;
    }

    // ── Desk History ────────────────────────────────────────────
    async getDeskHistory(deskDbId, limit = 50) {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('desk_history')
            .select('*')
            .eq('desk_id', deskDbId)
            .order('changed_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    }

    // ── Profiles ────────────────────────────────────────────────
    async getTeamMembers() {
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('profiles')
            .select('id, full_name, avatar_url, role, is_active, last_seen')
            .eq('company_id', authService.companyId)
            .eq('is_active', true)
            .order('full_name');
        if (error) throw error;
        return data;
    }

    // ── Utils ───────────────────────────────────────────────────
    _isLocalId(id) {
        if (typeof id === 'number') return true;
        if (typeof id !== 'string') return true;
        // IDs locales: solo dígitos, o empiezan con "zone_", "desk_", etc.
        if (/^\d+$/.test(id)) return true;
        if (/^(zone|desk|local)_/.test(id)) return true;
        // Si no es un UUID válido, es local
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return !uuidRegex.test(id);
    }

    async _getLayoutCompanyId(layoutId) {
        if (!layoutId) return null;
        const sb = await getSupabase();
        const { data } = await sb.from('layouts').select('company_id').eq('id', layoutId).single();
        return data?.company_id ?? null;
    }
}

window.dbService = new DbService();

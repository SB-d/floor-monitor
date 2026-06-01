/**
 * StorageService — Supabase Storage para assets del layout
 * Thumbnails, imágenes de fondo, exportaciones SVG/PNG
 */

class StorageService {
    constructor() {
        this.BUCKET = 'floor-assets';
    }

    // ── Upload ──────────────────────────────────────────────────
    async uploadThumbnail(layoutId, blob) {
        const sb   = await getSupabase();
        const cId  = authService.companyId;
        const path = `${cId}/layouts/${layoutId}/thumbnail.png`;

        const { data, error } = await sb.storage
            .from(this.BUCKET)
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
        if (error) throw error;

        return this.getPublicUrl(path);
    }

    async uploadBackground(layoutId, file) {
        const sb   = await getSupabase();
        const cId  = authService.companyId;
        const ext  = file.name.split('.').pop();
        const path = `${cId}/layouts/${layoutId}/background.${ext}`;

        const { error } = await sb.storage
            .from(this.BUCKET)
            .upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;

        return this.getPublicUrl(path);
    }

    async uploadSVGExport(layoutId, svgString) {
        const sb   = await getSupabase();
        const cId  = authService.companyId;
        const ts   = new Date().toISOString().replace(/[:.]/g, '-');
        const path = `${cId}/exports/${layoutId}/${ts}.svg`;

        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const { error } = await sb.storage
            .from(this.BUCKET)
            .upload(path, blob, { contentType: 'image/svg+xml' });
        if (error) throw error;

        return this.getPublicUrl(path);
    }

    // ── Download / URLs ─────────────────────────────────────────
    getPublicUrl(path) {
        if (!window._supabaseInstance) return null;
        const { data } = window._supabaseInstance.storage
            .from(this.BUCKET)
            .getPublicUrl(path);
        return data?.publicUrl ?? null;
    }

    async getSignedUrl(path, expiresIn = 3600) {
        const sb = await getSupabase();
        const { data, error } = await sb.storage
            .from(this.BUCKET)
            .createSignedUrl(path, expiresIn);
        if (error) throw error;
        return data.signedUrl;
    }

    // ── List exports ────────────────────────────────────────────
    async listExports(layoutId) {
        const sb  = await getSupabase();
        const cId = authService.companyId;
        const { data, error } = await sb.storage
            .from(this.BUCKET)
            .list(`${cId}/exports/${layoutId}`, { sortBy: { column: 'created_at', order: 'desc' } });
        if (error) throw error;
        return data;
    }

    // ── Delete ──────────────────────────────────────────────────
    async deleteAsset(path) {
        const sb = await getSupabase();
        const { error } = await sb.storage.from(this.BUCKET).remove([path]);
        if (error) throw error;
    }

    async deleteLayoutAssets(layoutId) {
        const sb  = await getSupabase();
        const cId = authService.companyId;
        const prefix = `${cId}/layouts/${layoutId}/`;

        const { data: files } = await sb.storage.from(this.BUCKET).list(prefix);
        if (!files?.length) return;

        const paths = files.map(f => `${prefix}${f.name}`);
        await sb.storage.from(this.BUCKET).remove(paths);
    }
}

window.storageService = new StorageService();

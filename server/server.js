require('dotenv').config();

const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const { createClient } = require('@supabase/supabase-js');
const { SocketManager } = require('./socket/socketManager');

// ── Validar configuración mínima ──────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SRK      = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SRK) {
    console.error('FATAL: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos en .env');
    process.exit(1);
}

// ── Supabase Admin Client (service role — solo servidor) ──────
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SRK, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ── Express + Socket.IO ───────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
    cors: { origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET', 'POST'] }
});

// ── Rate limiter simple (sin dependencia externa) ─────────────
const _rateLimitStore = new Map();

function rateLimit(windowMs, maxRequests) {
    return (req, res, next) => {
        const key  = req.ip + ':' + req.path;
        const now  = Date.now();
        const data = _rateLimitStore.get(key) || { count: 0, start: now };

        if (now - data.start > windowMs) {
            data.count = 1;
            data.start = now;
        } else {
            data.count++;
        }
        _rateLimitStore.set(key, data);

        if (data.count > maxRequests) {
            return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' });
        }
        next();
    };
}

// Limpiar rate limit store cada hora
setInterval(() => _rateLimitStore.clear(), 3600000);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Headers de seguridad básicos ─────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// ── Jerarquía de roles ────────────────────────────────────────
const ROLE_HIERARCHY = {
    super_admin: 5,
    admin:       4,
    supervisor:  3,
    editor:      2,
    viewer:      1
};

// ── Middleware: verificar JWT de Supabase ─────────────────────
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        // Cargar perfil para tener rol y company_id
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, company_id, is_active')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(401).json({ error: 'Perfil no encontrado' });
        }

        if (!profile.is_active) {
            return res.status(403).json({ error: 'Cuenta desactivada' });
        }

        req.user       = user;
        req.userRole   = profile.role;
        req.companyId  = profile.company_id;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Error de autenticación' });
    }
}

// ── Middleware: verificar rol mínimo ─────────────────────────
function requireRole(minRole) {
    return (req, res, next) => {
        const userLevel = ROLE_HIERARCHY[req.userRole] ?? 0;
        const minLevel  = ROLE_HIERARCHY[minRole] ?? 99;
        if (userLevel < minLevel) {
            return res.status(403).json({
                error: `Se requiere rol ${minRole} o superior. Tu rol: ${req.userRole}`
            });
        }
        next();
    };
}

// ── Config endpoint: expone solo anon key (no secrets) ────────
app.get('/api/config', rateLimit(60000, 30), (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
        SUPABASE_URL.includes('TU_PROYECTO') ||
        SUPABASE_ANON_KEY.includes('TU_ANON')) {
        return res.status(503).json({
            error: 'Supabase no configurado. Completa el archivo .env.'
        });
    }
    res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date(),
        supabase: true,
        version: '3.1.0'
    });
});

// ── Stats del socket ──────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
    res.json(SocketManager.getStats ? SocketManager.getStats() : {});
});

// ── Layout: guardar snapshot ──────────────────────────────────
app.post(
    '/api/layouts/:id/snapshot',
    requireAuth,
    requireRole('editor'),
    async (req, res) => {
        const { id }          = req.params;
        const { desks, zones } = req.body;

        try {
            // Verificar que el layout existe y pertenece a la empresa del usuario
            // (super_admin puede acceder a cualquier layout)
            const layoutQuery = supabaseAdmin
                .from('layouts')
                .select('id, company_id')
                .eq('id', id);

            if (req.userRole !== 'super_admin' && req.companyId) {
                layoutQuery.eq('company_id', req.companyId);
            }

            const { data: layout } = await layoutQuery.single();
            if (!layout) return res.status(404).json({ error: 'Layout no encontrado' });

            // Usar company_id del layout si el usuario es super_admin sin empresa
            const companyId = req.companyId ?? layout.company_id;

            if (desks?.length) {
                const deskRows = desks.map(d => ({
                    layout_id:    id,
                    company_id:   companyId,
                    created_by:   req.user.id,
                    desk_number:  d.id,
                    x: d.x, y: d.y,
                    rotation:     d.rotation ?? 0,
                    status:       d.status ?? 'offline',
                    agent:        d.agent ?? null,
                    extension:    d.extension ?? null,
                    campaign:     d.campaign ?? null,
                    is_locked:    d.isLocked ?? false,
                    custom_color: d.customColor ?? null
                }));

                await supabaseAdmin.from('desks')
                    .upsert(deskRows, { onConflict: 'layout_id,desk_number' });
            }

            if (zones?.length) {
                const zoneRows = zones.map(z => ({
                    layout_id:  id,
                    company_id: companyId,
                    created_by: req.user.id,
                    name:       z.name,
                    color:      z.color,
                    x: z.x, y: z.y,
                    width:      z.width,
                    height:     z.height,
                    capacity:   z.capacity ?? 10,
                    is_locked:  z.isLocked ?? false
                }));

                await supabaseAdmin.from('zones')
                    .upsert(zoneRows, { onConflict: 'id' });
            }

            await supabaseAdmin.from('layouts')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', id);

            res.json({ success: true });
        } catch (err) {
            console.error('[Snapshot] Error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Desk status (integraciones externas) ─────────────────────
app.patch(
    '/api/desks/:id/status',
    requireAuth,
    requireRole('supervisor'),
    async (req, res) => {
        const { id } = req.params;
        const { status, agent, campaign, extension } = req.body;

        const validStatuses = ['online', 'busy', 'pause', 'offline', 'error'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Status inválido. Usa: ${validStatuses.join(', ')}`
            });
        }

        try {
            // Verificar que el desk pertenece a la empresa del usuario
            const { data: desk } = await supabaseAdmin
                .from('desks')
                .select('id, company_id')
                .eq('id', id)
                .single();

            if (!desk) return res.status(404).json({ error: 'Puesto no encontrado' });

            if (req.userRole !== 'super_admin' && desk.company_id !== req.companyId) {
                return res.status(403).json({ error: 'Sin acceso a este puesto' });
            }

            const { data, error } = await supabaseAdmin
                .from('desks')
                .update({ status, agent, campaign, extension })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            io.emit('deskStatusUpdate', { id, status, agent, campaign, extension });
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Audit log ────────────────────────────────────────────────
app.post('/api/audit', requireAuth, async (req, res) => {
    const { action, entityType, entityId, beforeData, afterData } = req.body;

    try {
        await supabaseAdmin.from('audit_logs').insert({
            company_id:  req.companyId,
            user_id:     req.user.id,
            action,
            entity_type: entityType,
            entity_id:   entityId,
            before_data: beforeData,
            after_data:  afterData,
            ip_address:  req.ip,
            user_agent:  req.headers['user-agent']
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin: listar usuarios ────────────────────────────────────
app.get(
    '/api/admin/users',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
        try {
            const companyId = req.userRole === 'super_admin'
                ? (req.query.company_id || null)
                : req.companyId;

            const query = supabaseAdmin
                .from('profiles')
                .select('id, full_name, avatar_url, role, is_active, last_seen, company_id, created_at, companies(name)')
                .order('created_at', { ascending: false });

            if (companyId) query.eq('company_id', companyId);

            const { data, error } = await query;
            if (error) throw error;

            // Obtener emails de auth.users (solo con service role)
            const userIds = data.map(u => u.id);
            const emailMap = {};
            for (const uid of userIds) {
                try {
                    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
                    if (authUser?.user) emailMap[uid] = authUser.user.email;
                } catch (_) {}
            }

            const result = data.map(u => ({ ...u, email: emailMap[u.id] ?? null }));
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Admin: cambiar rol ────────────────────────────────────────
app.patch(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
        const { id }      = req.params;
        const { role }    = req.body;
        const validRoles  = ['super_admin', 'admin', 'supervisor', 'editor', 'viewer'];

        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }

        // Solo super_admin puede asignar super_admin
        if (role === 'super_admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({ error: 'Solo super_admin puede asignar ese rol' });
        }

        // Admin solo puede cambiar roles de su empresa
        if (req.userRole === 'admin') {
            const { data: target } = await supabaseAdmin
                .from('profiles').select('company_id').eq('id', id).single();
            if (!target || target.company_id !== req.companyId) {
                return res.status(403).json({ error: 'Usuario no pertenece a tu empresa' });
            }
        }

        try {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ role })
                .eq('id', id);
            if (error) throw error;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Admin: desactivar usuario ─────────────────────────────────
app.patch(
    '/api/admin/users/:id/deactivate',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
        const { id } = req.params;

        if (req.userRole === 'admin') {
            const { data: target } = await supabaseAdmin
                .from('profiles').select('company_id, role').eq('id', id).single();
            if (!target || target.company_id !== req.companyId) {
                return res.status(403).json({ error: 'Usuario no pertenece a tu empresa' });
            }
            if (target.role === 'super_admin') {
                return res.status(403).json({ error: 'No puedes desactivar un super_admin' });
            }
        }

        try {
            const { error } = await supabaseAdmin
                .from('profiles').update({ is_active: false }).eq('id', id);
            if (error) throw error;

            // Revocar sesiones activas
            await supabaseAdmin.auth.admin.signOut(id, 'global').catch(() => {});
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Admin: reactivar usuario ──────────────────────────────────
app.patch(
    '/api/admin/users/:id/activate',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
        const { id } = req.params;
        try {
            const { error } = await supabaseAdmin
                .from('profiles').update({ is_active: true }).eq('id', id);
            if (error) throw error;
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Admin: listar auditoría ───────────────────────────────────
app.get(
    '/api/admin/audit',
    requireAuth,
    requireRole('supervisor'),
    async (req, res) => {
        try {
            const query = supabaseAdmin
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            if (req.userRole !== 'super_admin') {
                query.eq('company_id', req.companyId);
            }

            const { data, error } = await query;
            if (error) throw error;
            res.json(data);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Rutas de página (sin extensión .html) ────────────────────
const PAGE_MAP = {
    '/':             'index.html',
    '/editor':       'index.html',
    '/layouts':      'layouts.html',
    '/login':        'login.html',
    '/admin':        'admin.html',
    '/admin/users':  'admin.html',
    '/admin/audit':  'admin.html',
};

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }

    // Ruta limpia → página HTML
    const page = PAGE_MAP[req.path];
    if (page) {
        return res.sendFile(path.join(__dirname, '../public', page));
    }

    // Archivos estáticos ya son servidos por express.static arriba.
    // Cualquier otra ruta desconocida → 404 en lugar de index.html
    res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Socket Manager ────────────────────────────────────────────
const socketManager = new SocketManager(io);

// ── Arranque ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Contacta Floor Monitor v3.1 — http://localhost:${PORT}`);
    console.log(`📡 WebSocket activo`);
    console.log(`☁️  Supabase: conectado a ${SUPABASE_URL}`);
});

/**
 * Sidebar compartido — se monta en cualquier página que tenga <div id="app-sidebar">
 * Detecta la ruta actual para marcar el ítem activo.
 * El menú "Administración" se despliega/colapsa sin recargar la página.
 */
(function () {
    const ROUTES = {
        layouts:       { path: '/layouts',        label: 'Mis Layouts' },
        editor:        { path: '/editor',          label: 'Editor' },
        adminUsers:    { path: '/admin/users',     label: 'Usuarios' },
        adminAudit:    { path: '/admin/audit',     label: 'Auditoría' },
        admin:         { path: '/admin',           label: 'Administración' },
    };

    function currentPath() {
        return window.location.pathname.replace(/\/$/, '') || '/';
    }

    function isActive(path) {
        const p = currentPath();
        if (path === '/layouts') return p === '/layouts';
        if (path === '/editor')  return p === '/editor' || p === '/';
        if (path === '/admin')   return p.startsWith('/admin');
        return p === path;
    }

    function isAdminSection() {
        return currentPath().startsWith('/admin');
    }

    function buildSidebar(isAdmin) {
        const path = currentPath();

        const adminOpen = isAdminSection();
        const adminToggleClass = adminOpen ? 'lm-nav-item active' : 'lm-nav-item';
        const subnavStyle      = adminOpen ? '' : 'display:none';

        const adminBlock = isAdmin ? `
            <button class="lm-nav-item lm-nav-toggle ${adminOpen ? 'open' : ''}"
                    id="nav-admin-toggle" type="button" aria-expanded="${adminOpen}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span>Administración</span>
                <svg class="lm-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
            <div class="lm-subnav" id="nav-admin-sub" style="${subnavStyle}">
                <a class="lm-subnav-item ${path === '/admin' || path === '/admin/users' ? 'active' : ''}"
                   href="/admin/users">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Usuarios
                </a>
                <a class="lm-subnav-item ${path === '/admin/audit' ? 'active' : ''}"
                   href="/admin/audit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Auditoría
                </a>
            </div>` : '';

        const layoutsActive  = path === '/layouts';

        return `
        <aside class="lm-sidebar" id="lm-sidebar">
            <div class="lm-brand">
                <div class="lm-brand-icon">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                        <rect x="4" y="12" width="6" height="16" rx="1" fill="#3b82f6"/>
                        <rect x="13" y="8" width="6" height="20" rx="1" fill="#3b82f6"/>
                        <rect x="22" y="4" width="6" height="24" rx="1" fill="#3b82f6"/>
                    </svg>
                </div>
                <div>
                    <div class="lm-brand-name">Floor Monitor</div>
                    <div class="lm-brand-sub">Contacta SaaS</div>
                </div>
            </div>

            <nav class="lm-nav">
                <a class="lm-nav-item ${layoutsActive ? 'active' : ''}" href="/layouts">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <rect x="3" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="3" y="14" width="7" height="7" rx="1"/>
                        <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                    Mis Layouts
                </a>

                ${adminBlock}
            </nav>

            <div class="lm-sidebar-footer">
                <div class="lm-user">
                    <div class="lm-user-avatar" id="sidebar-avatar"></div>
                    <div class="lm-user-info">
                        <div id="sidebar-name" class="lm-user-name">—</div>
                        <div id="sidebar-role" class="lm-user-role">—</div>
                    </div>
                </div>
                <button class="lm-logout-btn" id="sidebar-logout">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Cerrar sesión
                </button>
            </div>
        </aside>`;
    }

    function fillUserInfo() {
        const name = window.authService?.fullName ?? '—';
        const role = window.authService?.role ?? '—';
        const av   = window.authService?.profile?.avatar_url;

        const nameEl   = document.getElementById('sidebar-name');
        const roleEl   = document.getElementById('sidebar-role');
        const avatarEl = document.getElementById('sidebar-avatar');

        if (nameEl)   nameEl.textContent = name;
        if (roleEl)   roleEl.textContent = role.replace('_', ' ').toUpperCase();
        if (avatarEl) {
            if (av) {
                avatarEl.style.backgroundImage = `url(${av})`;
                avatarEl.style.backgroundSize  = 'cover';
            } else {
                avatarEl.textContent = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            }
        }
    }

    function bindToggle() {
        const btn = document.getElementById('nav-admin-toggle');
        const sub = document.getElementById('nav-admin-sub');
        if (!btn || !sub) return;

        btn.addEventListener('click', () => {
            const open = sub.style.display !== 'none';
            sub.style.display = open ? 'none' : 'flex';
            btn.setAttribute('aria-expanded', String(!open));
            btn.classList.toggle('open', !open);
        });
    }

    function bindLogout() {
        document.getElementById('sidebar-logout')?.addEventListener('click', async () => {
            try {
                if (window.realtimeService) await realtimeService.unsubscribeAll().catch(() => {});
                if (window.authService)     await authService.logout();
            } catch (_) {}
            window.location.replace('/login');
        });
    }

    // ── API pública ───────────────────────────────────────────────
    window.SidebarComponent = {
        mount(containerId = 'app-sidebar') {
            const container = document.getElementById(containerId);
            if (!container) return;

            const isAdmin = window.authService?.isAdmin?.() ?? false;
            container.innerHTML = buildSidebar(isAdmin);

            fillUserInfo();
            bindToggle();
            bindLogout();
        },

        // Llamar después de que authService esté listo para refrescar user info
        refresh() {
            fillUserInfo();
        }
    };
})();

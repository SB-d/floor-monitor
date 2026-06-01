/**
 * AuthService — autenticación y autorización completa con Supabase
 * Roles: super_admin > admin > supervisor > editor > viewer
 */

class AuthService {
    constructor() {
        this._user    = null;
        this._profile = null;
        this._listeners = [];
        this._initialized = false;

        this._ROLE_HIERARCHY = {
            super_admin: 5,
            admin:       4,
            supervisor:  3,
            editor:      2,
            viewer:      1
        };
    }

    // ── Inicialización ──────────────────────────────────────────
    async init() {
        if (this._initialized) return;
        const sb = await getSupabase();

        sb.auth.onAuthStateChange((event, session) => {
            this._user = session?.user ?? null;
            if (this._user) {
                // No awaitar — el listener no debe bloquear
                this._loadProfile().then(() => {
                    this._emit(event, { user: this._user, profile: this._profile, session });
                }).catch(() => {
                    this._emit(event, { user: this._user, profile: null, session });
                });
            } else {
                this._profile = null;
                this._emit(event, { user: null, profile: null, session });
            }
        });

        const { data: { session } } = await sb.auth.getSession();
        this._user = session?.user ?? null;
        if (this._user) await this._loadProfile();

        this._initialized = true;
    }

    // ── Bootstrap: primer usuario del sistema ───────────────────
    async isBootstrapNeeded() {
        try {
            const sb = await getSupabase();
            const { data, error } = await sb.rpc('bootstrap_completed');
            if (error) throw error;
            return data === false;
        } catch (_) {
            return false;
        }
    }

    // ── Login ───────────────────────────────────────────────────
    async login(email, password) {
        const sb = await getSupabase();
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Verificar que el usuario esté activo
        if (data.user) {
            await this._loadProfile();
            if (this._profile?.is_active === false) {
                await sb.auth.signOut();
                const err = new Error('Tu cuenta está desactivada. Contacta al administrador.');
                err.code = 'USER_INACTIVE';
                throw err;
            }
        }

        // Registrar login en auditoría
        sb.rpc('log_login').then(() => {}).catch(() => {});

        return data;
    }

    // ── Registro ────────────────────────────────────────────────
    async register(email, password, fullName, companyName) {
        const sb = await getSupabase();

        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        });
        if (error) throw error;

        if (data.user) {
            // create_company_for_user maneja: bootstrap (super_admin) o empresa nueva
            const result = await this._createCompanyOrBootstrap(
                data.user.id, companyName, fullName
            );

            // Si el signUp retornó sesión, cargar perfil
            if (data.session) {
                await this._loadProfile();
            }

            return { ...data, bootstrapRole: result?.role };
        }

        return data;
    }

    async _createCompanyOrBootstrap(userId, companyName, fullName) {
        const sb = await getSupabase();
        const { data, error } = await sb.rpc('create_company_for_user', {
            p_user_id:      userId,
            p_company_name: companyName || '',
            p_full_name:    fullName || null
        });
        if (error) {
            console.warn('create_company_for_user error:', error.message);
            throw new Error(error.message);
        }
        return data;
    }

    // ── Logout ──────────────────────────────────────────────────
    async logout() {
        this._user    = null;
        this._profile = null;
        try {
            const sb = await getSupabase();
            // Fire-and-forget: no bloquear el signOut
            sb.rpc('log_logout').then(() => {}).catch(() => {});
            await sb.auth.signOut({ scope: 'local' });
        } catch (_) {}
    }

    // ── Recuperar contraseña ────────────────────────────────────
    async forgotPassword(email) {
        const sb = await getSupabase();
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });
        if (error) throw error;
    }

    async updatePassword(newPassword) {
        const sb = await getSupabase();
        const { error } = await sb.auth.updateUser({ password: newPassword });
        if (error) throw error;
    }

    // ── Perfil ──────────────────────────────────────────────────
    async _loadProfile() {
        if (!this._user) return;
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('profiles')
            .select('*, companies(id, name, slug, plan, logo_url)')
            .eq('id', this._user.id)
            .single();

        if (!error) this._profile = data;
    }

    async updateProfile(updates) {
        if (!this._user) throw new Error('No autenticado');
        const sb = await getSupabase();
        const { data, error } = await sb
            .from('profiles')
            .update(updates)
            .eq('id', this._user.id)
            .select()
            .single();
        if (error) throw error;
        this._profile = data;
        return data;
    }

    async refreshProfile() {
        await this._loadProfile();
        return this._profile;
    }

    // ── Gestión de usuarios (admin / super_admin) ───────────────
    async listUsers(companyId = null) {
        const sb = await getSupabase();
        const { data, error } = await sb.rpc('list_users', {
            p_company_id: companyId
        });
        if (error) throw error;
        return data;
    }

    async changeUserRole(targetUserId, newRole) {
        const sb = await getSupabase();
        const { error } = await sb.rpc('change_user_role', {
            p_target_user_id: targetUserId,
            p_new_role:       newRole
        });
        if (error) throw error;
    }

    async deactivateUser(targetUserId) {
        const sb = await getSupabase();
        const { error } = await sb.rpc('deactivate_user', {
            p_target_user_id: targetUserId
        });
        if (error) throw error;
    }

    // ── Getters ─────────────────────────────────────────────────
    get user()       { return this._user; }
    get profile()    { return this._profile; }
    get isLoggedIn() { return !!this._user; }
    get role()       { return this._profile?.role ?? 'viewer'; }
    get companyId()  { return this._profile?.company_id ?? null; }
    get company()    { return this._profile?.companies ?? null; }
    get fullName()   { return this._profile?.full_name ?? this._user?.email ?? 'Usuario'; }
    get isActive()   { return this._profile?.is_active !== false; }

    // ── Checks de rol (jerárquicos) ─────────────────────────────
    _hasRole(minRole) {
        return (this._ROLE_HIERARCHY[this.role] ?? 0) >=
               (this._ROLE_HIERARCHY[minRole] ?? 0);
    }

    isSuperAdmin() { return this.role === 'super_admin'; }
    isAdmin()      { return this._hasRole('admin'); }
    isSupervisor() { return this._hasRole('supervisor'); }
    isEditor()     { return this._hasRole('editor'); }
    isViewer()     { return this._hasRole('viewer'); }

    // ── Route / module protection ───────────────────────────────
    requireAuth(redirectTo = '/login.html') {
        if (!this.isLoggedIn) {
            window.location.replace(redirectTo);
            return false;
        }
        return true;
    }

    requireRole(minRole, redirectTo = '/login.html') {
        if (!this.isLoggedIn) {
            window.location.replace(redirectTo);
            return false;
        }
        if (!this._hasRole(minRole)) {
            console.warn(`[Auth] Rol insuficiente. Se requiere: ${minRole}, tienes: ${this.role}`);
            return false;
        }
        return true;
    }

    // ── Evento listeners ────────────────────────────────────────
    onAuthChange(fn) {
        this._listeners.push(fn);
        return () => { this._listeners = this._listeners.filter(l => l !== fn); };
    }

    _emit(event, data) {
        this._listeners.forEach(fn => { try { fn(event, data); } catch (_) {} });
    }
}

window.authService = new AuthService();

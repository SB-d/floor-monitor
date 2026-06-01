/**
 * Supabase Client — inicializado con config del servidor
 * No hardcodeamos keys en el frontend; las obtenemos de /api/config
 */

let _supabase = null;
let _initPromise = null;

async function initSupabaseClient() {
    if (_supabase) return _supabase;

    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('No se pudo obtener la configuración del servidor');
    const { supabaseUrl, supabaseAnonKey } = await res.json();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Configuración de Supabase incompleta en el servidor');
    }

    _supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'cfm_auth'
        },
        realtime: {
            params: { eventsPerSecond: 10 }
        }
    });

    return _supabase;
}

function getSupabaseClient() {
    if (!_supabase) throw new Error('Supabase no inicializado. Llama initSupabaseClient() primero.');
    return _supabase;
}

async function getSupabase() {
    if (_supabase) return _supabase;
    if (!_initPromise) _initPromise = initSupabaseClient();
    return _initPromise;
}

window.initSupabaseClient = initSupabaseClient;
window.getSupabaseClient  = getSupabaseClient;
window.getSupabase        = getSupabase;

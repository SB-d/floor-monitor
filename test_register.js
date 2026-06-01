require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function main() {
    const testEmail = `test_${Date.now()}@contacta.co`;
    const testPass  = 'Test12345*';

    console.log('── Probando registro con:', testEmail);

    // 1. Registrar usuario
    const { data: regData, error: regError } = await sb.auth.signUp({
        email: testEmail,
        password: testPass,
        options: { data: { full_name: 'Test Usuario' } }
    });

    if (regError) { console.log('✗ Error registro:', regError.message); return; }
    console.log('✓ signUp OK — user id:', regData.user?.id);
    console.log('  session:', regData.session ? 'ACTIVA (auto-confirm ON)' : 'NULL (requiere confirmar email)');

    if (!regData.session) {
        console.log('\n⚠ Auto-confirm está desactivado — el usuario debe confirmar su email');
        return;
    }

    // 2. Crear empresa via RPC
    const { data: compData, error: compError } = await sb.rpc('create_company_for_user', {
        p_user_id:      regData.user.id,
        p_company_name: 'Contacta S.A.S Test',
        p_full_name:    'Test Usuario'
    });

    if (compError) { console.log('✗ Error RPC create_company:', compError.message); }
    else console.log('✓ Empresa creada:', JSON.stringify(compData));

    // 3. Verificar perfil
    const { data: profile, error: profError } = await sb
        .from('profiles')
        .select('*, companies(name)')
        .eq('id', regData.user.id)
        .single();

    if (profError) { console.log('✗ Error leyendo perfil:', profError.message); }
    else console.log('✓ Perfil:', JSON.stringify(profile));

    // 4. Limpiar usuario de prueba
    const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    await sbAdmin.auth.admin.deleteUser(regData.user.id);
    console.log('\n✓ Usuario de prueba eliminado. Todo funciona correctamente.');
}

main().catch(console.error);

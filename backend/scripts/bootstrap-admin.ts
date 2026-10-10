import 'dotenv/config';
import { supabaseAdmin } from '../services/supabase';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters');
const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !data.user) throw error || new Error('Could not create admin');
const { error: profileError } = await supabaseAdmin.from('profiles').insert({ id: data.user.id, name: 'System Admin', role: 'admin', tenant_id: null });
if (profileError) {
  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
  throw profileError;
}
console.log(`Admin created: ${email}`);

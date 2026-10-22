import 'dotenv/config';
import { supabaseAdmin } from '../services/supabase';

const [tenants, states] = await Promise.all([
  supabaseAdmin.from('tenants').select('id'),
  supabaseAdmin.from('tenant_states').select('tenant_id'),
]);
if (tenants.error) throw new Error(`Could not read factories: ${tenants.error.message}`);
if (states.error) throw new Error(`Could not read factory data: ${states.error.message}`);
const tenantIds = new Set((states.data || []).map((row) => row.tenant_id));
const missing = (tenants.data || []).filter((tenant) => !tenantIds.has(tenant.id));
if (missing.length) throw new Error(`${missing.length} factory account(s) do not have isolated data storage`);
console.log(`Supabase connected. Factory accounts: ${tenants.data?.length || 0}; isolated data stores: ${states.data?.length || 0}.`);

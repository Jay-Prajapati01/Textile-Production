import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const root = process.env.TEST_BASE_URL || 'http://localhost:3002';
const email = process.env.INITIAL_OWNER_EMAIL;
const password = process.env.INITIAL_OWNER_PASSWORD;
if (!email || !password) throw new Error('Set INITIAL_OWNER_EMAIL and INITIAL_OWNER_PASSWORD in your local .env');

const login = await fetch(`${root}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const session = await login.json();
const me = await fetch(`${root}/api/auth/me`, { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => r.json());
const tenantId = me.tenantId;
if (!tenantId) throw new Error('Owner has no factory');
const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
client.realtime.setAuth(session.token);
let received = false;
const channel = client.channel(`test-${tenantId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenant_states', filter: `tenant_id=eq.${tenantId}` }, () => { received = true; })
  .subscribe();

try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000);
    // Poll channel state because subscribe() was initiated above.
    const interval = setInterval(() => {
      if (channel.state === 'joined') { clearInterval(interval); clearTimeout(timeout); resolve(); }
    }, 100);
  });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` };
  const settings = await fetch(`${root}/api/settings`, { headers }).then((r) => r.json());
  const write = await fetch(`${root}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ average_divisor: settings.average_divisor }) });
  if (!write.ok) throw new Error(`Write failed: ${write.status}`);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime update timed out')), 15000);
    const interval = setInterval(() => {
      if (received) { clearInterval(interval); clearTimeout(timeout); resolve(); }
    }, 100);
  });
  console.log('Realtime tenant update received');
} finally {
  await client.removeChannel(channel);
  client.realtime.disconnect();
}

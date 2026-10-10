import 'dotenv/config';
import fs from 'node:fs';
import { supabaseAdmin } from '../services/supabase';

const tenantId = process.env.IMPORT_TENANT_ID;
const file = process.env.IMPORT_FILE || 'data/loom_db.json';
if (!tenantId) throw new Error('Set IMPORT_TENANT_ID to the destination factory UUID');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
// Legacy plaintext demo users never enter the hosted database.
state.users = [];
const { data: existing, error: readError } = await supabaseAdmin.from('tenant_states').select('revision').eq('tenant_id', tenantId).single();
if (readError) throw readError;
if (existing.revision !== 0) throw new Error('Destination has existing writes; refusing to overwrite');
const { data: updated, error } = await supabaseAdmin.from('tenant_states').update({ state, revision: 1 }).eq('tenant_id', tenantId).eq('revision', 0).select('tenant_id').single();
if (error) throw error;
if (!updated) throw new Error('Import did not update a factory');
console.log(`Imported ${file} into tenant ${tenantId}`);

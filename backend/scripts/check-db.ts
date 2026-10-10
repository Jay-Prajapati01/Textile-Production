import 'dotenv/config';
import { prisma } from '../services/prisma';
import { supabaseAdmin } from '../services/supabase';

try {
  const [tenantCount, profileCheck] = await Promise.all([
    prisma.tenant.count(),
    supabaseAdmin.from('profiles').select('id').limit(1),
  ]);
  if (profileCheck.error) throw profileCheck.error;
  console.log(`Database connected. Factories: ${tenantCount}`);
} finally {
  await prisma.$disconnect();
}

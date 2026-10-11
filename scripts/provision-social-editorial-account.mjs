import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Creates the user-approved application identity through Auth, never a fake traveler.
// No password, confirmation, invitation, email or verification badge is generated.
const email = 'hello@letsgo2travel.com.tr';
const username = 'letsgo2travel_app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw Error('Service environment is required.');
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const found = await db.from('profiles').select('id,username,email').eq('email', email).maybeSingle();
if (found.error) throw Error('Application profile lookup failed.');
if (found.data?.username === username) {
  console.log(JSON.stringify({ id: found.data.id, username, result: 'already-present' }));
} else if (!process.argv.includes('--create')) {
  console.log(JSON.stringify({ mode: 'dry-run', email, username, fullName: 'LetsGo2Travel' }));
} else {
  const created = found.data ? await db.auth.admin.getUserById(found.data.id) : await db.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { username, full_name: 'LetsGo2Travel' },
    app_metadata: { editorial_account: true },
  });
  if (created.error || !created.data.user) throw Error('Application account creation failed; inspect Auth before retrying.');
  if (created.data.user.email !== email || !created.data.user.app_metadata?.editorial_account) throw Error('This is not the approved application identity.');
  const id = created.data.user.id;
  const saved = await db.from('profiles').upsert({ id, email, username, full_name: 'LetsGo2Travel', opt_in_leaderboard: false });
  if (saved.error) throw Error(`Auth account ${id} created, profile save failed. Repair this account before retrying.`);
  const metadata = await db.auth.admin.updateUserById(id, { user_metadata: { username, full_name: 'LetsGo2Travel' } });
  if (metadata.error) throw Error('Application identity metadata update failed.');
  const bio = await db.rpc('update_community_profile', { p_viewer: id, p_bio: 'LetsGo2Travel uygulama hesabı. Seyahat fikirleri, rota önerileri ve keşif seçkileri.', p_show_avatar: false });
  if (bio.error) throw Error('Application profile description update failed.');
  console.log(JSON.stringify({ id, username, result: 'created' }));
}

if (process.argv.includes('--brand-avatar')) {
  const profile = await db.from('profiles').select('id').eq('email', email).eq('username', username).single();
  if (profile.error) throw Error('Create the application profile first.');
  const id = profile.data.id;
  const identity = await db.auth.admin.getUserById(id);
  if (!identity.data.user?.app_metadata?.editorial_account) throw Error('Application identity mismatch.');
  const avatarPath = `${id}/e0112026-1012-4000-8000-000000000010.jpg`;
  const photo = await sharp(fileURLToPath(new URL('../public/icon-512.png', import.meta.url))).jpeg({ quality: 88 }).toBuffer();
  const uploaded = await db.storage.from('profile-avatars').upload(avatarPath, photo, { contentType: 'image/jpeg', upsert: true });
  if (uploaded.error) throw Error('Application avatar upload failed.');
  const metadata = await db.auth.admin.updateUserById(id, { user_metadata: { l2t_avatar_path: avatarPath } });
  if (metadata.error) throw Error('Application avatar metadata save failed.');
  const visibility = await db.rpc('update_community_profile', { p_viewer: id, p_show_avatar: true });
  if (visibility.error) throw Error('Application avatar visibility save failed.');
  console.log(JSON.stringify({ id, result: 'brand-avatar-saved' }));
}

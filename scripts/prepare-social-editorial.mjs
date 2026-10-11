import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

// Dry-run by default. Publishing requires a verified existing official account,
// reviewed repository-owned imagery, service credentials and explicit flags.
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('./social-editorial-posts.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const owner = args.find(arg => arg.startsWith('--owner='))?.slice(8);
const publish = args.includes('--publish');
const prepared = [];
for (const item of manifest) {
  const filename = path.resolve(root, item.photo);
  if (!filename.startsWith(path.resolve(root, 'mobile/src/assets') + path.sep)) throw Error('Photo must be an approved repository asset.');
  let photo;
  for (const [edge, quality] of [[1280,76],[1024,62],[768,50]]) {
    photo = await sharp(await readFile(filename), {limitInputPixels:20_000_000}).rotate().resize(edge,edge,{fit:'inside',withoutEnlargement:true}).jpeg({quality,progressive:true}).toBuffer();
    if (photo.length <= 300_000) break;
  }
  if (photo.length > 300_000) throw Error('Photo exceeds 300 KB.');
  prepared.push({...item,photo,photoHash:createHash('sha256').update(photo).digest('hex')});
}
if (!publish) {
  console.log(JSON.stringify({mode:'dry-run',publication:'Not published. Requires an existing verified LetsGo2Travel account.',posts:prepared.map(({id,caption,place,photo})=>({id,caption,place,bytes:photo.length,editorial:true,likes:0,comments:0}))},null,2));
} else {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner || '') || !args.includes('--confirm-brand-owner') || !args.includes('--rights-reviewed')) throw Error('Provide --owner=<verified UUID> --confirm-brand-owner --rights-reviewed.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw Error('Service environment is required for publication.');
  const db = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const profile = await db.from('profiles').select('id,username').eq('id',owner).single();
  if (profile.error || !['letsgo2travel','letsgo2travel_app'].includes(String(profile.data?.username).toLowerCase())) throw Error('The selected account is not a verified branded profile. Do not use a personal account.');
  const bucket = await db.storage.getBucket('travel-social-photos');
  if (bucket.error || bucket.data?.public !== false) throw Error('Private social photo storage unavailable.');
  for (const item of prepared) {
    const storagePath = `${owner}/${item.id}.jpg`;
    const prior = await db.from('travel_social_posts').select('user_id,photo_hash,caption,editorial,status,deleted_at').eq('id',item.id).maybeSingle();
    if (prior.error) throw Error('Could not inspect previous publication.');
    if (prior.data) {
      if (prior.data.user_id !== owner || prior.data.photo_hash !== item.photoHash || prior.data.caption !== item.caption) throw Error('Existing post conflicts with reviewed manifest.');
      if (prior.data.deleted_at || prior.data.status === 'hidden' || prior.data.status === 'published' && prior.data.editorial) {
        console.log(JSON.stringify({id:item.id,result:'already-present',status:prior.data.status,deleted:Boolean(prior.data.deleted_at)}));
        continue;
      }
    }
    const upload = await db.storage.from('travel-social-photos').upload(storagePath,item.photo,{contentType:'image/jpeg',upsert:false});
    if (upload.error) {
      if (String(upload.error.statusCode) !== '409' && upload.error.statusCode !== 'Duplicate') throw Error('Photo upload failed. Retry is safe.');
      const existing = await db.storage.from('travel-social-photos').download(storagePath);
      if (existing.error || !existing.data || createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex') !== item.photoHash) throw Error('Uploaded photo differs from reviewed manifest.');
    }
    const created = await db.rpc('write_travel_social',{p_viewer:owner,p_action:'create',p_input:{requestId:item.id,caption:item.caption,visibility:'public',photoHash:item.photoHash,place:item.place}});
    if (created.error) throw Error('Post creation failed. Retry is safe.');
    // No authored dates, likes, comments, followers or fictitious identities are inserted.
    const published = await db.from('travel_social_posts').update({status:'published',editorial:true}).eq('id',item.id).eq('user_id',owner).eq('photo_hash',item.photoHash).is('deleted_at',null).select('id').single();
    if (published.error || !published.data) throw Error('Publication failed. Review the pending post before retrying.');
    console.log(JSON.stringify({id:item.id,result:'published'}));
  }
}

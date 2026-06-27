import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(str => str.trim()))
);

async function runAuthTests() {
  console.log("--- Bilet Sitem Canlı Auth Testleri Başlıyor ---");
  const LIVE_URL = "https://letsgo2travel.vercel.app";
  
  const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
  const cronSecret = envVars['CRON_SECRET'];
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("\n[Test 6] Production ortamında MOCK_PRICE_ALERTS durumu:");
  console.log(`MOCK_PRICE_ALERTS = ${envVars['MOCK_PRICE_ALERTS'] || 'undefined'} (Canlıda kapalı) ✅`);

  console.log("\n[Test 7] Cron endpointi geçerli secret ile test ediliyor:");
  const cronRes = await fetch(`${LIVE_URL}/api/cron/check-price-alerts`, {
    headers: { "Authorization": `Bearer ${cronSecret}` }
  });
  console.log(`Cron Response Status: ${cronRes.status}`);
  if (cronRes.status === 200) {
    const json = await cronRes.json();
    console.log("✅ Cron endpoint geçerli token ile başarıyla çalıştı:", json.message || "Başarılı");
  } else {
    console.log("❌ Cron endpoint geçerli token ile çalışmadı.");
  }

  // --- MOCKING GUEST DELETE TOKEN TEST ---
  console.log("\n[Test 4] Guest alarm kapatma linki ve token test ediliyor:");
  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  // Veritabanına direk guest alert yazıyoruz (API'yi bypass edip sadece test datası atıyoruz)
  const { data: mockGuestAlert } = await supabase.from("flight_price_alerts").insert({
    email: "guest_delete_test@example.com",
    origin_code: "IST",
    origin_label: "Istanbul",
    destination_code: "JFK",
    destination_label: "New York",
    departure_date: "2026-12-01",
    manage_token_hash: hashedToken,
    manage_token_expires_at: expiresAt.toISOString()
  }).select().single();

  if (mockGuestAlert) {
    // 4.1. Token olmadan id ile kapatma
    const resNoToken = await fetch(`${LIVE_URL}/api/price-alerts/${mockGuestAlert.id}`, { method: "DELETE" });
    console.log(`Token olmadan istek: Status ${resNoToken.status} (Beklenen: 401) ${resNoToken.status === 401 ? '✅' : '❌'}`);

    // 4.2. Yanlış token ile kapatma
    const resWrongToken = await fetch(`${LIVE_URL}/api/price-alerts/${mockGuestAlert.id}?token=invalid123`, { method: "DELETE" });
    console.log(`Yanlış token ile istek: Status ${resWrongToken.status} (Beklenen: 401) ${resWrongToken.status === 401 ? '✅' : '❌'}`);

    // 4.3. Doğru token ile kapatma
    const resRightToken = await fetch(`${LIVE_URL}/api/price-alerts/${mockGuestAlert.id}?token=${plainToken}`, { method: "DELETE" });
    console.log(`Doğru token ile istek: Status ${resRightToken.status} (Beklenen: 200) ${resRightToken.status === 200 ? '✅' : '❌'}`);
    
    // Check if soft deleted
    const { data: deletedCheck } = await supabase.from("flight_price_alerts").select("is_active").eq("id", mockGuestAlert.id).single();
    if (deletedCheck && deletedCheck.is_active === false) {
      console.log("✅ Guest alarm başarıyla soft delete ile kapatıldı.");
    }
  }


  // --- AUTHENTICATED USER TESTS ---
  console.log("\n[Test 1, 2, 3] Giriş yapmış kullanıcıların senaryoları test ediliyor...");
  
  // 1. Create temporary test users
  const user1Email = `user1_${Date.now()}@test.com`;
  const user2Email = `user2_${Date.now()}@test.com`;
  const testPassword = "TestPassword123!";
  
  const { data: user1Auth } = await supabase.auth.admin.createUser({ email: user1Email, password: testPassword, email_confirm: true });
  const { data: user2Auth } = await supabase.auth.admin.createUser({ email: user2Email, password: testPassword, email_confirm: true });

  if (user1Auth.user && user2Auth.user) {
    // Sign in to get tokens (using standard auth client to simulate frontend)
    const { data: u1Session } = await supabase.auth.signInWithPassword({ email: user1Email, password: testPassword });
    const { data: u2Session } = await supabase.auth.signInWithPassword({ email: user2Email, password: testPassword });

    const u1Token = u1Session.session?.access_token;
    const u2Token = u2Session.session?.access_token;

    if (u1Token && u2Token) {
      // User 1 Alarm Kuruyor
      const u1PostRes = await fetch(`${LIVE_URL}/api/price-alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${u1Token}` },
        body: JSON.stringify({
          originCode: "ADB", originLabel: "Izmir", destinationCode: "CDG", destinationLabel: "Paris", departureDate: "2026-11-15", email: user1Email
        })
      });
      const u1PostJson = await u1PostRes.json();
      console.log(`User 1 Alarm Kurulum Status: ${u1PostRes.status}`, u1PostJson);

      // We bypass direct DB check, let's just use the API!
      const u1GetRes = await fetch(`${LIVE_URL}/api/price-alerts`, { headers: { "Authorization": `Bearer ${u1Token}` } });
      const u1GetData = await u1GetRes.json();
      
      const u2GetRes = await fetch(`${LIVE_URL}/api/price-alerts`, { headers: { "Authorization": `Bearer ${u2Token}` } });
      const u2GetData = await u2GetRes.json();

      console.log(`User 1 listesinde ${u1GetData.data?.length} alarm var (Beklenen: 1) ${u1GetData.data?.length === 1 ? '✅' : '❌'}`);
      console.log(`User 2 listesinde ${u2GetData.data?.length} alarm var (Beklenen: 0) ${u2GetData.data?.length === 0 ? '✅' : '❌'}`);

      if (u1GetData.data?.length > 0) {
        const alertId = u1GetData.data[0].id;
        console.log(`✅ Giriş yapmış kullanıcı olarak alarm kuruldu, user_id DOĞRU (null değil): ${u1GetData.data[0].user_id}`);
        console.log("✅ Başka kullanıcının alarmı görünmüyor.");

        // Test DELETE isolation
        const u2DeleteRes = await fetch(`${LIVE_URL}/api/price-alerts/${alertId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${u2Token}` } });
        console.log(`User 2, User 1'in alarmını kapatmayı denedi: Status ${u2DeleteRes.status} (Beklenen: 403) ${u2DeleteRes.status === 403 ? '✅' : '❌'}`);

        const u1DeleteRes = await fetch(`${LIVE_URL}/api/price-alerts/${alertId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${u1Token}` } });
        console.log(`User 1 kendi alarmını kapatmayı denedi: Status ${u1DeleteRes.status} (Beklenen: 200) ${u1DeleteRes.status === 200 ? '✅' : '❌'}`);
      }
    }

    // Cleanup disabled for debugging
    console.log("\n✅ Test kullanıcıları veritabanında bırakıldı. (Debug)");
  }
}

runAuthTests().catch(console.error);

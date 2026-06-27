import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(str => str.trim()))
);

async function runTests() {
  console.log("--- Bilet Sitem Canlı Test Başlıyor ---");
  const LIVE_URL = "https://letsgo2travel.vercel.app";
  
  const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseServiceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Test 1: CRON Endpoint without secret
  console.log("\n[Test 10] Cron endpoint CRON_SECRET olmadan 500/401 dönüyor mu?");
  const cronRes = await fetch(`${LIVE_URL}/api/cron/check-price-alerts`);
  console.log(`Cron Response Status: ${cronRes.status}`);
  if (cronRes.status === 401 || cronRes.status === 500) {
    console.log("✅ Cron endpoint başarıyla koruma altında.");
  } else {
    console.log("❌ Beklenmeyen cron yanıtı.");
  }

  // Test 2: Guest POST Price Alert
  console.log("\n[Test 2 & 3] Guest kullanıcı fiyat alarmı kurabiliyor mu?");
  const testEmail = `test.guest.${Date.now()}@example.com`;
  
  const postRes = await fetch(`${LIVE_URL}/api/price-alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originCode: "IST",
      originLabel: "Istanbul",
      destinationCode: "LHR",
      destinationLabel: "London",
      departureDate: "2026-10-10",
      email: testEmail
    })
  });
  
  const postJson = await postRes.json();
  console.log(`POST Response Status: ${postRes.status}`, postJson);
  
  if (postRes.ok && postJson.success) {
    console.log("✅ Guest alarm API başarıyla yanıt verdi.");
  } else {
    console.log("❌ Guest alarm kurulamadı.");
  }

  console.log("\n[Test 9] manage_token_hash frontend JSON response içinde dönmüyor mu?");
  if (postJson.manage_token_hash || postJson.data?.manage_token_hash) {
    console.log("❌ Güvenlik açığı: manage_token_hash response içinde geldi!");
  } else {
    console.log("✅ manage_token_hash frontend'e gönderilmiyor.");
  }

  console.log("\n[Test 3] Supabase veritabanı kontrolü:");
  const { data: dbData } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("email", testEmail)
    .single();

  if (dbData) {
    console.log("✅ Alarm veritabanına başarıyla kaydedildi.");
    console.log(`manage_token_hash var mı: ${!!dbData.manage_token_hash}`);
    console.log(`user_id durumu: ${dbData.user_id === null ? 'null (Guest)' : dbData.user_id}`);
  } else {
    console.log("❌ Alarm veritabanında bulunamadı.");
  }

  console.log("\n[Test 14 & 15] Affiliate linkler ve Fiyat Çekimi");
  if (dbData && dbData.base_price !== null) {
    console.log(`✅ Fiyat Travelpayouts üzerinden çekildi. Base Price: ${dbData.base_price}`);
  } else {
    console.log("⚠️ Fiyat çekilemedi (Bilet yok veya API kapalı). Sistem çökmedi, base_price: null olarak kaydedildi.");
  }

  // Cleanup Test Data
  if (dbData) {
    await supabase.from("flight_price_alerts").delete().eq("id", dbData.id);
    console.log("\n✅ Test verisi temizlendi.");
  }
}

runTests().catch(console.error);

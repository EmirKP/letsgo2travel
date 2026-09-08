/* Run with PLAYWRIGHT_MODULE / CHROMIUM_PATH if Playwright is not locally installed.
   UI fixtures are synthetic and isolated. Separate live read-only probes below
   never treat missing provider data or an unsigned-in avatar as a success. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.cwd();
const out = path.join(root,'tests/browser/results');
const mobile = 'http://127.0.0.1:5183';
const web = 'http://127.0.0.1:3018';
let checks=0; const requests=new Set(); const errors=[]; const children=[];
const pass=(name,condition=true)=>{assert.ok(condition,name);checks++;console.log('PASS '+name);};
const now='2026-09-08T12:00:00.000Z';
const advice=code=>({code,level:['RU','IR','IL'].includes(code)?'avoid-all':code==='UA'?'regional':'no-specific-warning',scope:code==='UA'?'regional':'whole-country',topics:['RU','IR','UA','IL'].includes(code)?['conflict']:[],updatedAt:now,source:{name:'Test fixture',url:'https://www.gov.uk/foreign-travel-advice',checkedAt:now},updates:[],freshness:'live'});
async function mock(route){
 const url=new URL(route.request().url()); let body;
 if(url.pathname==='/api/country-advisories'){const codes=(url.searchParams.get('countries')||'').split(',');pass('advice batch is bounded: '+codes.length,codes.length<=8);codes.forEach(c=>requests.add(c));body={data:codes.map(advice)};}
 else if(url.pathname==='/api/country-costs' && url.searchParams.has('benchmark'))body={currency:'EUR',referenceFx:{base:'GBP',quote:'EUR',rate:1.2,date:'2026-05-05',sourceUrl:'https://frankfurter.dev/'},fx:{base:'EUR',quote:'TRY',rate:50,date:new Date().toISOString().slice(0,10),sourceUrl:'https://frankfurter.dev/'},inflation:{provider:'Eurostat',period:'2026-08',index:105,referenceIndex:100,referenceMonth:'2026-05',annualPercent:5,checkedAt:now,sourceUrl:'https://ec.europa.eu/',freshness:'live'}};
 else if(url.pathname==='/api/country-brief'){const code=url.searchParams.get('country')||'TR';body={code,checkedAt:now,timeZone:code==='SE'?'Europe/Stockholm':'Europe/Istanbul',today:'2026-09-08',advisory:advice(code),calendar:code==='SE'?[{id:'se-election',date:'2026-09-13',type:'election',name:{tr:'İsveç · Parlamento ve yerel seçimler',en:'Sweden · Parliamentary and local elections'},countryWide:true,regions:[],sourceUrl:'https://www.val.se',verification:'live',checkedAt:now}]:[],calendarState:'ok',newsState:'ok',news:[{title:'Sweden airport strike announced',url:'https://www.bbc.com/news/test-fixture',publisher:'Test fixture',language:'English',firstSeenAt:now,publishedAt:'2026-09-08T09:00:00Z',eventDate:null,topic:'transport',provider:'BBC'}]};}
 else return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Controlled offline fixture"}'});
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
}
async function waitFor(url){for(let n=0;n<80;n++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Server not ready: '+url);}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const vite=spawn(process.execPath,[path.join(root,'mobile/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5183'],{cwd:path.join(root,'mobile'),env:{...process.env,VITE_API_BASE_URL:web},stdio:'inherit'});children.push(vite);
 const next=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3018'],{cwd:root,stdio:'inherit'});children.push(next);
 process.on('exit',()=>children.forEach(p=>p.kill()));
 await waitFor(mobile);
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const locale of ['tr','en'])for(const width of [320,393,430]){
   const context=await browser.newContext({viewport:{width,height:852},isMobile:true,hasTouch:true});
   await context.addInitScript(locale=>{localStorage.setItem('l2t-language-v1',locale);localStorage.setItem('l2t.mobile.onboarding.v2','done');localStorage.setItem('l2t.mobile.release-seen','1.4.0-27');},locale);
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',mock);
   for(const view of ['home','passport','profile','events','route','costs','country-news']){
    await page.goto(mobile+'/#'+view);await page.locator('.launch-overlay').waitFor({state:'hidden',timeout:10000}).catch(()=>{});await page.waitForTimeout(180);
    const close=page.getByRole('button',{name:locale==='tr'?'Yenilikleri gördüm':"Got it",exact:true});if(await close.isVisible().catch(()=>false))await close.click();
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    pass(`${locale}/${width}/${view} renders within viewport`,geometry.scroll<=width+1 && await page.locator('h1').count()>0);
    if(view==='home')pass(`${locale}/${width} compact home`,geometry.height<1250);
    if(width===393)await page.screenshot({path:path.join(out,`${locale}-${view}.png`)});
    if(view==='passport'){
     pass(`${locale}/${width} base map has no obstructing flags`,await page.locator('.passport-map-flag').count()===0);
     const pos=await page.evaluate(()=>{const map=document.querySelector('.passport-map-viewport').getBoundingClientRect(),controls=document.querySelector('.passport-map-controls').getBoundingClientRect();return controls.top>=map.bottom-1;});pass(`${locale}/${width} controls below map`,pos);
    }
    if(view==='events'){
     await page.locator('.event-filter-disclosure summary').click();
     const widths=await page.locator('.event-search-grid').evaluate(el=>[...el.querySelectorAll('select,.country-picker-trigger')].map(node=>node.getBoundingClientRect().width));pass(`${locale}/${width} country and city widths align`,Math.abs(widths[0]-widths[1])<2);
     if(width===393)await page.screenshot({path:path.join(out,`${locale}-events-form.png`)});
    }
    if(view==='route'){
     await page.getByRole('button',{name:locale==='tr'?'Tercihlerim':'Preferences',exact:true}).click();
     const gap=await page.locator('.planner-form > label:not(.planner-inline-field)').evaluate(label=>{const text=[...label.childNodes].find(n=>n.nodeType===3),r=document.createRange();r.selectNodeContents(text);return label.querySelector('select').getBoundingClientRect().top-r.getBoundingClientRect().bottom;});pass(`${locale}/${width} preference label above field`,gap>=5);
     if(width===393)await page.screenshot({path:path.join(out,`${locale}-preferences.png`)});
    }
   }
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});await context.addInitScript(()=>{localStorage.setItem('l2t-language-v1','tr');localStorage.setItem('l2t.mobile.onboarding.v2','done');localStorage.setItem('l2t.mobile.release-seen','1.4.0-27');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',mock);
  await page.goto(mobile+'/#passport');await page.locator('.passport-map-viewport').waitFor();
  await page.getByRole('button',{name:'Haritayı yakınlaştır',exact:true}).click();await page.getByRole('button',{name:'Haritayı yakınlaştır',exact:true}).click();pass('zoom reveals collision-filtered flags',await page.locator('.passport-map-flag').count()>0);
  await page.getByRole('button',{name:'Haritayı tam ekran aç'}).click();pass('fullscreen map fills viewport',await page.locator('.passport-map.fullscreen').count()===1);await page.getByRole('button',{name:'Tam ekrandan çık'}).click();
  await page.locator('.passport-selection .country-picker-trigger').click();await page.getByPlaceholder('Ülke veya dil ara').fill('Almanya');await page.getByRole('option',{name:'Almanya',exact:true}).click();
  pass('passport country changes to Germany',await page.locator('.passport-selection').innerText().then(t=>t.includes('Almanya')));await page.locator('.passport-selection select').selectOption('diplomatic');pass('unsupported passport type has no false visa-free count',(await page.locator('.passport-stats strong').allTextContents()).every(t=>t==='0'));
  pass('advice covers more than the former first eight countries',requests.size>=40);
  await page.goto(mobile+'/#costs');await page.getByRole('searchbox',{name:'50 şehirde ara'}).fill('Roma');await page.locator('.ci-city-catalog .ci-cost-row').click();await page.getByText('2026-05 → 2026-08 · CPI',{exact:true}).waitFor();pass('dated benchmark applies CPI after reference FX',await page.locator('.ci-details').innerText().then(t=>t.includes('28.594')));
  const fields=page.locator('.ci-details .ci-calculator input');for(const [i,value]of ['100','80','30','3','4','2'].entries())await fields.nth(i).fill(value);pass('real quotes include per-person extra transport',await page.locator('.ci-details .ci-calculator').innerText().then(t=>t.includes('480')&&t.includes('180')));
  await page.getByRole('button',{name:'Kapat',exact:true}).click();await page.goto(mobile+'/#country-news');await page.locator('.country-picker-trigger').click();await page.getByPlaceholder('Ülke veya dil ara').fill('İsveç');await page.getByRole('option',{name:'İsveç',exact:true}).click();await page.getByText('Planlanan seçim',{exact:true}).waitFor();pass('verified election is separate from news publication',await page.locator('.ci-calendar-row').innerText().then(t=>!t.includes('Bugün')));
  await page.getByRole('button',{name:'Takvim',exact:true}).click();pass('calendar filter hides news',await page.locator('.ci-news-card').count()===0);
  await page.goto(mobile+'/#home');await page.getByRole('button',{name:'Ortak seyahat',exact:true}).click();pass('shared trip remains one tap away',page.url().endsWith('#trips'));await page.goto(mobile+'/#home');await page.getByRole('button',{name:'Çevrimdışı ifadeler',exact:true}).click();pass('phrases shortcut opens the phrases tab',page.url().endsWith('#phrases'));
  await page.goto(mobile+'/#profile');await page.getByRole('button',{name:'Profil fotoğrafı seç'}).click();pass('guest photo selection requires sign-in',await page.getByRole('dialog').count()>0);
  await waitFor(web+'/butce-hesapla');await page.goto(web+'/butce-hesapla');await page.getByRole('heading',{name:'50 şehir · Tarihli fiyat karşılaştırması'}).waitFor();pass('web uses the same 50-city screen');await page.getByRole('searchbox',{name:'50 şehirde ara'}).fill('Roma');await page.locator('.ci-city-catalog .ci-cost-row').click();await page.getByRole('dialog').waitFor();pass('web price details open in an accessible dialog');await page.screenshot({path:path.join(out,'web-price-detail.png')});
  await page.goto(web+'/ulke-gundemi?country=SE');await page.getByText('Planlanan seçim',{exact:true}).waitFor();pass('web country URL selects the correct calendar');
  pass('no browser runtime exceptions',errors.length===0);
  await context.close();
  // Live read-only checks: separately reported, never backed by fixtures.
  const live=[];
  for(const route of (process.env.L2T_LIVE_CHECKS === '1' ? ['/api/country-costs?benchmark=IT-rome','/api/country-brief?country=SE','/api/profile/avatar'] : [])){
   try {const response=await fetch(web+route,{signal:AbortSignal.timeout(30000)});const data=await response.json();const result={route,status:response.status,fx:Boolean(data.fx),referenceFx:Boolean(data.referenceFx),inflation:data.inflation?.period||null,newsState:data.newsState,headlines:data.news?.length,elections:data.calendar?.filter(r=>r.type==='election').length};live.push(result);console.log('LIVE '+JSON.stringify(result));}catch(error){live.push({route,error:error.message});console.log('LIVE unavailable '+route);}
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,adviceCountries:requests.size,live},null,2));
  console.log(`COMPLETE ${checks} browser assertions`);
 }finally{await browser.close();children.forEach(p=>p.kill());}
})().catch(error=>{console.error(error);children.forEach(p=>p.kill());process.exit(1);});

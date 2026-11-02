import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

// Execute the existing production hook fixture without importing/registering its
// unrelated suites. It still runs the real screen callbacks/effects and API mocks.
const fixturePath='tests/community-ui.mjs';
const fixtureSource=ts.createSourceFile(fixturePath,readFileSync(fixturePath,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const firstTest=fixtureSource.statements.findIndex(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(fixtureSource)==='test');
const declarations=fixtureSource.statements.slice(0,firstTest).filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(fixtureSource)).join('\n');
const f=vm.runInNewContext(`${declarations}\n({harness,nodes,text,find,button,byClass,question,i18n,countryIso,load})`,{assert,readFileSync,vm,ts,realLocaleModule,Date,Intl,URLSearchParams,setImmediate});
const ro=f.load('mobile/src/lib/locales/ro.ts',{}).RO_MESSAGES;
f.i18n.ro={locale:'ro',dateLocale:'ro-RO',copy:(_tr,en)=>ro[en]||en,countryName:(_code,fallback)=>fallback};
const byClass=(tree,name)=>f.nodes(tree).find(node=>node.props?.className?.split(' ').includes(name));
const bylines=tree=>f.nodes(tree).filter(node=>node.props?.className==='community-meta-header');
const children=node=>[node.props.children].flat(Infinity).filter(value=>value&&typeof value==='object');
const longName='traveller_with_a_very_long_public_name_9';
const date='2026-11-02T15:10:00Z';
const topic=f.question('metadata-topic','BA','Practical museum advice',{username:longName,authorId:'author-long',createdAt:date,avatarUrl:null});
const answer={id:'metadata-answer',username:'another_traveller_with_long_public_name',authorId:'answer-long',body:'Use the museum’s public entrance.',createdAt:'2026-11-02T15:30:00Z',avatarUrl:null};
const snapshots=[];

function assertByline(header,{username,createdAt,scope='BA'}) {
 const direct=children(header);assert.equal(direct[0].props.className,'community-post-byline cs-post-identity','Identity and context stay together in the first grid cell');
 assert.equal(direct.at(-1).type,'button','Safety action remains a separate native keyboard control on the right');
 const identity=direct[0],author=f.find(identity,'button',p=>p.className==='community-author-button');
 assert.ok(author);assert.equal(author.props.type,'button');assert.equal(author.props['aria-haspopup'],'dialog');assert.notEqual(author.props.tabIndex,-1);
 assert.match(f.text(author),new RegExp(username));assert.ok(f.find(author,'CommunityAvatar'));
 const context=byClass(identity,'community-post-context');const row=children(context);assert.equal(row[0].type,'time');assert.equal(row[0].props.dateTime,createdAt);assert.equal(row[1].props['aria-hidden'],'true');
 const country=f.find(context,'CountryFlag');assert.equal(country.props.code,scope);assert.ok(country.props.label);
 assert.equal(f.nodes(header).filter(n=>n.type==='time').length,1,'No floating duplicate date');
 assert.equal(f.nodes(header).filter(n=>n.type==='CountryFlag').length,1,'Country is shown once in the metadata row');
 assert.equal(f.nodes(header).filter(n=>n.props?.className==='community-answer-meta').length,0);
}

for(const locale of ['tr','en','sq','ro'])test(`Feed, question and reply keep one aligned metadata structure and real profile/safety actions in ${locale}`,async()=>{
 const h=f.harness({locale,user:{id:'viewer'},accessToken:'FIXTURE_TOKEN'});
 try{
  let view=await h.feed([topic]);const feedHeader=bylines(view)[0];assertByline(feedHeader,{username:longName,createdAt:date});
  snapshots.push({locale,kind:'feed',header:feedHeader});
  const open=f.nodes(view).find(node=>node.props?.className==='community-question-open');assert.ok(open);open.props.onClick();h.render();
  const request=h.requests.at(-1);assert.equal(request.options.headers.Authorization,'Bearer FIXTURE_TOKEN');request.resolve({data:{...topic,answers:[answer],totalAnswerCount:1}});
  view=await h.settle();const detail=byClass(view,'community-question-detail'),headers=bylines(detail);assert.equal(headers.length,2);
  assertByline(headers[0],{username:longName,createdAt:date});assertByline(headers[1],{username:answer.username,createdAt:answer.createdAt});
  snapshots.push({locale,kind:'question',header:headers[0]},{locale,kind:'answer',header:headers[1]});
  const profile=f.find(headers[1],'button',p=>p.className==='community-author-button');profile.props.onClick();view=h.render();assert.equal(f.find(view,'CommunityProfileSheet').props.profileKey,'user:answer-long');
  f.find(view,'CommunityProfileSheet').props.onClose();view=h.render();
  children(bylines(byClass(view,'community-question-detail'))[1]).at(-1).props.onClick();view=h.render();const safety=f.find(view,'CommunitySafetySheet');assert.equal(safety.props.target.targetType,'answer');assert.equal(safety.props.target.targetId,'metadata-answer');assert.equal(safety.props.target.authorId,'answer-long');
  assert.equal(h.requests.filter(item=>item.options.method==='POST').length,0,'Metadata actions do not post answers or change records');
 }finally{h.dispose();}
});

function production(path,imports={}) {
 const mod={exports:{}};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{URL})(id=>{if(id==='react')return React;if(id==='react/jsx-runtime')return jsxRuntime;if(id.endsWith('.css'))return{};if(id in imports)return imports[id];throw Error(`Unexpected fixture dependency ${id}`);},mod,mod.exports);return mod.exports;
}
const profiles=production('mobile/src/lib/communityProfiles.ts',{'./api':{requestJson:()=>assert.fail('No live API calls in layout fixtures')}});
const Avatar=production('mobile/src/components/CommunityAvatar.tsx',{'../lib/communityProfiles':profiles}).CommunityAvatar;
const Icon=production('mobile/src/components/Icon.tsx').Icon;
const flags=production('mobile/src/data/flagAssets.ts');
const Flag=production('mobile/src/components/CountryFlag.tsx',{'../data/countryIso':f.countryIso,'../data/flagAssets':flags,'./Icon':{Icon}}).CountryFlag;
const Badge=production('mobile/src/components/OfficialBadge.tsx',{'../lib/i18n':{useI18n:()=>f.i18n.en}}).OfficialBadge;
function element(node, fallbackKey="fixture") {
 if(Array.isArray(node))return node.map((item,index)=>element(item,`${fallbackKey}-${index}`));if(!node||typeof node!=='object')return node;
 const type={CommunityAvatar:Avatar,CountryFlag:Flag,OfficialBadge:Badge,Icon,fragment:React.Fragment}[node.type]||node.type;
 const {children:items,ref,...props}=node.props;
 return React.createElement(type,{...props,key:node.key??fallbackKey},element(items,`${fallbackKey}-child`));
}
test('Production metadata snapshots render with real avatars/flags and semantic keyboard order for browser layout verification',()=>{
 assert.equal(snapshots.length,12);
 const cards=[];
 for(const width of [320,390])for(const snapshot of snapshots){
  const markup=renderToStaticMarkup(element(snapshot.header));
  assert.match(markup,/<time dateTime="2026-11-02/);assert.match(markup,/class="community-profile-avatar/);assert.match(markup,/class="country-flag community-scope-flag"/);
  assert.ok(markup.indexOf('community-author-button')<markup.indexOf('community-post-context'));
  const container=snapshot.kind==='feed'?`<div class="cs-posts"><article>${markup}<p>Fixture content</p></article></div>`:snapshot.kind==='question'?`<div class="community-question-detail">${markup}<p>Fixture content</p></div>`:`<article class="community-answer">${markup}<p>Fixture content</p></article>`;
  cards.push(`<section class="fixture-case" data-kind="${snapshot.kind}" data-locale="${snapshot.locale}" data-width="${width}" style="width:${width}px"><h2>${snapshot.locale} · ${snapshot.kind} · ${width}px</h2>${container}</section>`);
 }
 const styles=['mobile/src/index.css','mobile/src/App.css','mobile/src/components/community-safety.css','mobile/src/components/community-profile.css','mobile/src/components/country-flag.css','mobile/src/components/official-badge.css','mobile/src/screens/reference-community-profile.css','mobile/src/screens/reference-community.css'];
 const html=`<!doctype html><html lang="en" data-theme="THEME"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forum metadata · isolated production render</title>${styles.map(path=>`<link rel="stylesheet" href="/source/${path}">`).join('')}<style>body{margin:0;padding:16px}.fixture-grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}.fixture-case{box-sizing:border-box;flex:none;min-width:0;padding:14px;background:var(--theme-surface);color:var(--theme-ink);border:1px solid var(--theme-border);border-radius:16px}.fixture-case>h2{font:12px system-ui;margin:0 0 16px;color:var(--theme-muted)}.fixture-case .cs-posts article{padding:12px}.fixture-case .community-question-detail{padding:12px}.fixture-case p:not(.community-post-context){font:12px system-ui;margin:12px 0 0}.fixture-root.editorial-app{width:auto;max-width:none;min-height:0;margin:0}</style></head><body><main class="editorial-app shared-shell view-community fixture-root"><div class="community-social fixture-grid">${cards.join('')}</div></main></body></html>`;
 const out='outputs/map-profile-polish-20261102/forum';mkdirSync(out,{recursive:true});writeFileSync(`${out}/layout-fixture.html`,html);writeFileSync(`${out}/layout-fixture.json`,JSON.stringify({source:'Actual CommunityScreen hook render, ReactDOMServer markup, production avatar/flag components and production styles',cases:24,widths:[320,390],locales:['tr','en','sq','ro'],themes:['light','dark'],liveRequests:false},null,2)+'\n');
});

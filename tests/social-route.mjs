import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const loaded = {exports:{}};
const code = ts.transpileModule(readFileSync('mobile/src/lib/socialRoute.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(`(function(module,exports){${code}})`)(loaded,loaded.exports);
const {appendSocialPlace,findSocialRoute} = loaded.exports;
const route = (name,days=['First day','Second day']) => ({name,country:'Albania',cityOrRegion:'Ksamil',destinationCode:'TIA',dailyPlan:days});
const saved = () => ({id:'a',createdAt:'2026-10-10T00:00:00Z',input:{},plan:{summary:'Trip',routes:[route('Coastal trip'),route('City trip')]}});
test('a social stop is appended only to the selected day and preserves the full saved trip',()=>{
 const original=saved(),next=appendSocialPlace(original,1,1,'  Butrint  ');
 assert.equal(next.plan.routes[1].dailyPlan[1],'Second day\n• Butrint');
 assert.equal(next.plan.routes[0],original.plan.routes[0]);
 assert.equal(next.plan.routes[1].dailyPlan[0],'First day');
 assert.equal(original.plan.routes[1].dailyPlan[1],'Second day');
 assert.equal(next.input,original.input);assert.equal(next.id,original.id);
});
test('repeat additions are idempotent without confusing a substring for a saved stop',()=>{
 const original=saved();original.plan.routes[0].dailyPlan[0]='Romeo museum';
 const next=appendSocialPlace(original,0,0,'Rome');
 assert.equal(next.plan.routes[0].dailyPlan[0],'Romeo museum\n• Rome');
 assert.equal(appendSocialPlace(next,0,0,'rome'),next);
});
test('invalid days, removed routes and notes beyond the route limit fail without mutation',()=>{
 const original=saved();
 for(const [r,d,n] of [[9,0,'Place'],[0,-1,'Place'],[0,0.5,'Place'],[0,2,'Place'],[0,0,' '],[0,0,'x'.repeat(121)]]) assert.throws(()=>appendSocialPlace(original,r,d,n));
 original.plan.routes[0].dailyPlan[0]='x'.repeat(598);
 assert.throws(()=>appendSocialPlace(original,0,0,'Place'));
 assert.equal(original.plan.routes[0].dailyPlan[0].length,598);
});
test('sync reordering resolves the chosen route and refuses ambiguous or replaced routes',()=>{
 const original=saved(),selected=original.plan.routes[0];
 original.plan.routes.reverse();assert.equal(findSocialRoute(original,selected),1);
 original.plan.routes[1]={...selected,name:'Replacement'};assert.equal(findSocialRoute(original,selected),-1);
 original.plan.routes=[selected,{...selected}];assert.equal(findSocialRoute(original,selected),-1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function harness(ios, authenticate, theme='light'){
 const calls=[]; const m={exports:{}};
 const code=ts.transpileModule(readFileSync('mobile/src/lib/native.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports={'./capacitor':{isIOSNative:()=>ios,isNativePlatform:()=>true,plugin:name=>name==='WebAuthentication'?(authenticate?{authenticate}:null):{open:async options=>calls.push(options)}},'./config':{config:{apiBaseUrl:'https://example.com'}},'./storage':{},'./support':{},'./theme':{getThemeSnapshot:()=>({resolved:theme})}};
 vm.runInNewContext(code,{module:m,exports:m.exports,require:name=>imports[name],URL,Error});
 return {...m.exports,calls};
}
const callback='tr.com.letsgo2travel.app://auth/callback?code=test';
test('iOS uses authentication bridge and does not open Browser',async()=>{
 let received;const h=harness(true,async options=>{received=options.url;return {callbackUrl:callback};});
 assert.equal(await h.openOAuthSession('https://example.com/auth'),'tr.com.letsgo2travel.app://auth/callback?code=test');
 assert.equal(received,'https://example.com/auth');assert.equal(h.calls.length,0);
});
test('Missing native bridge fails without falling back to Safari popover',async()=>{
 const h=harness(true);await assert.rejects(h.openOAuthSession('https://example.com/auth'),/unavailable/);assert.equal(h.calls.length,0);
});
test('Untrusted or incomplete callbacks are rejected',async()=>{
 for(const url of ['https://evil.test/auth/callback','tr.com.letsgo2travel.app://evil/callback','tr.com.letsgo2travel.app://auth/other','tr.com.letsgo2travel.app://user@auth/callback','']){
 const h=harness(true,async()=>({callbackUrl:url}));await assert.rejects(h.openOAuthSession('https://example.com/auth'));}
});
test('Cancellation reaches caller without browser fallback',async()=>{
 const h=harness(true,async()=>{throw Error('Sign-in cancelled');});await assert.rejects(h.openOAuthSession('https://example.com/auth'),/cancelled/);assert.equal(h.calls.length,0);
});
test('Android retains existing Browser and app-link callback flow',async()=>{
 const h=harness(false);assert.equal(await h.openOAuthSession('https://example.com/auth'),null);assert.equal(h.calls.length,1);
});

for(const [theme,color] of [['light','#0877b8'],['dark','#101b2d']])test(`External native browser uses the ${theme} app toolbar without changing OAuth callbacks`,async()=>{
 for(const ios of [false,true]){
  const h=harness(ios,async()=>({callbackUrl:callback}),theme);
  assert.equal(await h.openExternal('https://example.com/advice'),true);
  assert.equal(h.calls[0].toolbarColor,color);assert.equal(h.calls[0].presentationStyle,'popover');assert.equal(h.calls[0].url,'https://example.com/advice');
  assert.equal(await h.openOAuthSession('https://example.com/auth'),ios?callback:null);
  assert.equal(h.calls.length,ios?1:2);
  if(!ios)assert.equal(h.calls[1].toolbarColor,color);
 }
});

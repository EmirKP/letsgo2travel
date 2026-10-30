import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {load}=require('js-yaml');
const {workflows}=load(readFileSync('codemagic.yaml','utf8'));
const target=workflows['letsgo2travel-ios-testflight'];

test('the requested internal release triggers only its single exact tag',()=>{
 assert.deepEqual(target.triggering,{events:['tag'],tag_patterns:[{pattern:'testflight-20261030-live-chat',include:true}]});
 for(const [name,workflow] of Object.entries(workflows))if(name!=='letsgo2travel-ios-testflight')assert.equal(workflow.triggering,undefined);
});
test('TestFlight upload retains signing and automatic internal distribution without a redundant group assignment or review',()=>{
 assert.equal(target.integrations.app_store_connect,'LetsGo2Travel');
 assert.equal(target.environment.ios_signing.bundle_identifier,'tr.com.letsgo2travel.app');
 assert.deepEqual(target.publishing.app_store_connect,{auth:'integration',submit_to_testflight:false,submit_to_app_store:false});
 assert.equal(workflows['letsgo2travel-ios'].publishing.app_store_connect.submit_to_app_store,undefined);
});
test('the tag build retains the full release gate before Apple numbering, iOS packaging and publishing',()=>{
 const scripts=target.scripts.map(item=>item.script);
 const gate=scripts.findIndex(script=>script.includes('npm run test:release'));
 const numbering=scripts.findIndex(script=>script.includes('get-latest-testflight-build-number'));
 const packaging=scripts.findIndex(script=>script.includes('npm run mobile:prepare:ios'));
 assert.ok(gate>=0&&numbering>gate&&packaging>numbering);
 assert.equal(target.environment.vars.VITE_TRAVEL_ASSISTANT_API_BASE_URL,'https://testflight.letsgo2travel.com.tr');
 assert.equal(target.environment.vars.VITE_API_BASE_URL,undefined);
});

test('the uploaded-build access check reuses the integration without building, uploading or changing distribution',()=>{
 const check=workflows['letsgo2travel-testflight-83-verify'];
 assert.deepEqual(check.integrations,{app_store_connect:'LetsGo2Travel'});
 assert.deepEqual(check.scripts.map(item=>item.name),['Read Apple build and internal testing state','Verify processed build and existing internal access']);
 assert.match(check.scripts[0].script,/app-store-connect builds get 6a6a7aad-c91c-433d-bb3a-25b9906c5204 --json/);
 assert.match(check.scripts[0].script,/app-store-connect builds beta-details 6a6a7aad-c91c-433d-bb3a-25b9906c5204 --json/);
 assert.doesNotMatch(check.scripts[0].script,/publish|submit|add-build|modify/);
 assert.equal(check.scripts[1].script,'python3 scripts/verify-testflight-distribution.py');
 assert.equal(check.publishing,undefined);
 assert.equal(check.environment,undefined);
 assert.equal(check.triggering,undefined);
 assert.deepEqual(check.artifacts,['testflight-distribution-83.json','apple-build-83.json','apple-beta-details-83.json']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync('mobile/src/components/JourneyMap.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;

test('iOS opens native Apple Maps while web and Android use genuine Apple MapKit JS with unchanged itinerary callbacks',()=>{
  for(const platform of ['ios','android','web']){
    const native=()=>null,web=()=>null,fixtureModule={exports:{}};
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`)(name=>{
      if(name==='../lib/capacitor')return {isIOSNative:()=>platform==='ios'};
      if(name==='./NativeJourneyMap')return {NativeJourneyMap:native};
      if(name==='./AppleJourneyMap')return {AppleJourneyMap:web};
      if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};
      throw Error(`Unexpected dependency ${name}`);
    },fixtureModule,fixtureModule.exports);
    const props={ownerId:'owner-a',stops:[],center:{latitude:41,longitude:29},onSelectPlace(){},onSearchArea(){}};
    const result=fixtureModule.exports.JourneyMap(props);
    assert.equal(result.type,platform==='ios'?native:web);
    assert.equal(result.props.onSelectPlace,props.onSelectPlace);
    assert.equal(result.props.onSearchArea,props.onSearchArea);
    assert.equal(result.props.ownerId,'owner-a');
  }
});

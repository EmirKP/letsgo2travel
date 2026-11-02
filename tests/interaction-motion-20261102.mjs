import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import ts from 'typescript';

const css=postcss.parse(readFileSync('mobile/src/interaction-motion.css','utf8'));
const rules=[];css.walkRules(rule=>rules.push(rule));
const media=(node,expression)=>{for(let current=node.parent;current;current=current.parent)if(current.type==='atrule'&&current.name==='media'&&expression.test(current.params))return true;return false;};
const properties=rule=>Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
const keyframes=new Map();css.walkAtRules('keyframes',rule=>keyframes.set(rule.params,rule));

test('Page entry preserves fixed/native containing blocks and cancels the former nested screen slide',()=>{
  const page=rules.find(rule=>rule.selector==='.editorial-app .navigation-pane'&&media(rule,/prefers-reduced-motion:no-preference/));
  assert.ok(page);
  const animation=properties(page).animation.split(' ')[0];
  const pageFrames=keyframes.get(animation);assert.ok(pageFrames);
  pageFrames.walkDecls(decl=>assert.equal(decl.prop,'opacity','Navigation-pane entry must never establish a transformed containing block'));
  assert.ok(rules.some(rule=>rule.selector.includes('.navigation-pane > .screen')&&!media(rule,/prefers-reduced-motion/)&&properties(rule).animation==='none'),'The child screen must not run a second entry animation');
});

test('Shared motion remains finite, short and limited to compositor properties without layout or input changes',()=>{
  const allowed=new Set(['animation','animation-delay','transition','transform','opacity']);
  css.walkDecls(decl=>{
    assert.ok(allowed.has(decl.prop),`Unexpected global layout/input change: ${decl.prop}`);
    if(decl.prop==='animation'&&decl.value!=='none'){
      assert.ok(media(decl,/prefers-reduced-motion:no-preference/),'Positive animation must be opt-in to normal motion');
      assert.doesNotMatch(decl.value,/infinite|forwards|both/,'Animations must end without retaining a transform layer');
      const duration=decl.value.match(/\b(\d+)ms\b/);assert.ok(duration);assert.ok(+duration[1]>=150&&+duration[1]<=280);
      assert.ok(keyframes.has(decl.value.split(' ')[0]));
    }
    if(decl.prop==='transition'){
      assert.doesNotMatch(decl.value,/(?:^|,)\s*all\b/,'Do not animate unknown future layout properties');
      if(decl.value!=='none')for(const transition of decl.value.split(','))assert.match(transition.trim(),/^(?:transform|background-color|border-color|color|opacity) \d+ms /);
    }
  });
  for(const frames of keyframes.values())frames.walkDecls(decl=>assert.ok(['opacity','transform'].includes(decl.prop)));
  const card=rules.find(rule=>properties(rule).animation?.startsWith('interaction-card-enter')&&rule.selector.includes('nth-child'));
  assert.ok(card);const bound=card.selector.match(/nth-child\(-n\+(\d+)\)/);assert.ok(bound&&+bound[1]<=8,'Do not animate entire long result lists');
  assert.ok(rules.filter(rule=>properties(rule)['animation-delay']).every(rule=>parseInt(properties(rule)['animation-delay'])<=40));
});

test('Interactive map/camera ancestors and map controls are explicitly exempt rather than transforming canvases or map markers',()=>{
  const exemption=rules.find(rule=>rule.selector.includes('.navigation-pane:has(')&&properties(rule).animation==='none');
  assert.ok(exemption);
  for(const surface of ['.um-shell','.journey-map-shell','.ta-map','canvas','video','.ta-photo-preview'])assert.ok(exemption.selector.includes(surface));
  assert.ok(exemption.selector.includes('.sheet-layer > .sheet:has('));
  assert.ok(exemption.selector.includes('.sheet-layer > .sheet.mj-sheet'),'Known native planner sheets must be exempt before their lazy canvas mounts');
  const control=rules.find(rule=>rule.selector.includes('.um-shell')&&rule.selector.includes(':active:not(:disabled)')&&properties(rule).transform==='none');assert.ok(control);
  for(const rule of rules){
    if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes')continue;
    const outsideHas=rule.selector.replace(/:has\([^)]*\)/g,':has-surface');
    assert.doesNotMatch(outsideHas,/(?:^|,)\s*(?:canvas|video|\.maplibregl-canvas|\.leaflet-pane)\s*(?:$|,)/,'Never style the actual renderer transform');
  }
});

test('Reduced motion cancels new page/card/tab/sheet/press effects while preserving keyboard focus and existing heart feedback',()=>{
  const reduced=rules.filter(rule=>media(rule,/prefers-reduced-motion:reduce/));assert.ok(reduced.length);
  const stop=reduced.find(rule=>properties(rule).animation==='none'&&properties(rule).transition==='none');assert.ok(stop);
  for(const category of ['.navigation-pane','.city-destination-highlights','.plans-category-grid','.profile-travel-shortcuts','.event-list','.explorer-card','.profile-section','.community-mode-switch','.cs-tabs','.editorial-segments','.bottom-nav','.sheet-layer > .sheet'])assert.ok(stop.selector.includes(category),category);
  assert.ok(reduced.some(rule=>rule.selector.includes(':active')&&properties(rule).transform==='none'));
  css.walkDecls(decl=>assert.ok(!['outline','outline-width','outline-style','pointer-events','visibility','display'].includes(decl.prop),'Focus and interaction must not be hidden or disabled by decorative motion'));
  for(const rule of rules)assert.ok(!rule.selector.includes('city-heart-button')&&!rule.selector.includes('city-heart-glyph'),'Keep the existing saved-heart celebration independent');
  const hearts=readFileSync('mobile/src/components/city-heart-button.css','utf8');assert.match(hearts,/city-heart-pop/);assert.match(hearts,/prefers-reduced-motion:reduce/);
});

test('The motion stylesheet loads once after established app styles and does not add JavaScript animation lifecycle state',()=>{
  const main=ts.createSourceFile('main.tsx',readFileSync('mobile/src/main.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const imports=main.statements.filter(ts.isImportDeclaration).map(node=>node.moduleSpecifier.text);
  assert.equal(imports.filter(name=>name==='./interaction-motion.css').length,1);
  assert.ok(imports.indexOf('./interaction-motion.css')>imports.indexOf('./App'));
  assert.ok(imports.indexOf('./interaction-motion.css')>imports.indexOf('./search-fields.css'));
  const motionImports=imports.filter(name=>/motion/.test(name));assert.deepEqual(motionImports,['./interaction-motion.css']);
});

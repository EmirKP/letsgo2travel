import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function graph(entry, extensions) {
  const visited=new Set();
  function follow(file){
    const full=path.resolve(file);if(visited.has(full))return;visited.add(full);
    const source=ts.createSourceFile(full,fs.readFileSync(full,'utf8'),ts.ScriptTarget.Latest,true);
    for(const node of source.statements){
      if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node)||!node.moduleSpecifier||!ts.isStringLiteralLike(node.moduleSpecifier))continue;
      if(node.isTypeOnly||ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly)continue;
      if(ts.isImportDeclaration(node)&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)&&!node.importClause.name&&node.importClause.namedBindings.elements.every(item=>item.isTypeOnly))continue;
      const name=node.moduleSpecifier.text;if(!name.startsWith('.'))continue;
      const base=path.resolve(path.dirname(full),name);
      const candidate=[base,...extensions.map(ext=>base+ext),...extensions.map(ext=>path.join(base,'index'+ext))].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()&&/\.(?:ts|tsx|js)$/.test(p));
      if(candidate)follow(candidate);
    }
  }
  follow(entry);return[...visited].map(f=>f.replaceAll('\\','/'));
}

test('The mobile startup graph keeps the complete Romanian catalog behind its language download',()=>{
  const files=graph('mobile/src/main.tsx',['.ts','.tsx']);
  assert.ok(files.some(file=>file.endsWith('/lib/planner-copy.ts')),'The shared planner route must be part of the graph being checked');
  assert.equal(files.some(file=>file.endsWith('/mobile/src/lib/locales/ro.ts')),false);
  assert.equal(files.some(file=>file.endsWith('/lib/locale-copy.ts')),false,'The server-only full catalog helper must not enter mobile startup');
});

test('The production entry does not statically import the Romanian catalog chunk',t=>{
  const file='mobile/dist/index.html';if(!fs.existsSync(file))return t.skip('Production artifacts are checked after a mobile build.');
  const html=fs.readFileSync(file,'utf8'),entry=html.match(/<script[^>]+src="([^"]+\.js)"/);
  assert.ok(entry);const files=graph(path.resolve('mobile/dist',entry[1]),['.js']);
  assert.equal(files.some(file=>/\/ro-[^/]+\.js$/.test(file)),false,'Changing language may load this chunk; Turkish or English startup must not require it');
  assert.ok(fs.readdirSync('mobile/dist/assets').some(name=>/^ro-.*\.js$/.test(name)),'Romanian still ships with the application');
});

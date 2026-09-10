import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the shipped moderation function, not a duplicate of its rules.
const output = ts.transpileModule(readFileSync('lib/community/moderation.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { moderateUserText } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log('PASS', name); }
check('ordinary English travel words and pic do not contain false profanity', () => {
  for (const text of ['Where can I take a picture of the harbour?', 'Is the aquarium near the train station?', 'Can I take a pic here?', 'Is camping illegal on this beach?', 'We had a classic meal in Harrogate.']) {
    assert.equal(moderateUserText(text).action, 'visible', text);
  }
});
check('complete Turkish abuse tokens are queued without matching within harmless words', () => {
  for (const text of ['Siktir!', 'Sen piç misin?', 'aq', 'AMK']) {
    const result = moderateUserText(text);
    assert.equal(result.action, 'pending_review', text);
    assert.equal(result.isIllegalOrProfane, true, text);
  }
});
check('English abuse and threats are queued, including uppercase and zero-width variants', () => {
  for (const text of ['You are a fucking asshole.', 'You BITCH!', 'Go kill yourself.', 'FUCK', 'fu\u200bck']) {
    const result = moderateUserText(text);
    assert.equal(result.action, 'pending_review', text);
    assert.equal(result.isIllegalOrProfane, true, text);
  }
});
check('Turkish dotted uppercase and fullwidth Unicode are normalized safely', () => {
  assert.equal(moderateUserText('SİKTİR').action, 'pending_review');
  assert.equal(moderateUserText('ＦＵＣＫ').action, 'pending_review');
});
check('visa guarantees and forged document advice remain reviewable in both languages', () => {
  for (const text of ['Garantİ vize alırsın.', 'This is a guaranteed visa.', 'Use a fake passport.', 'Sahte belge hazırlayın.']) {
    assert.equal(moderateUserText(text).action, 'pending_review', text);
  }
  assert.equal(moderateUserText('This is a guaranteed visa.').isIllegalOrProfane, false);
});
check('short profanity needs punctuation or word boundaries', () => {
  assert.deepEqual(moderateUserText('aquarium picture picnic').flaggedTerms, []);
  assert.equal(moderateUserText('(aq)').isIllegalOrProfane, true);
});
console.log(`${passed} moderation checks passed`);

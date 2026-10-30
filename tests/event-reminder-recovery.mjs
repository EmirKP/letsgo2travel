import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('mobile/src/lib/eventReminders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const key = 'l2t.mobile.event-reminders.v1';
const record = (id, ownerId, extra = {}) => ({ id, ownerId, eventId: `event-${id}`, startsAt: '2030-01-01T12:00:00Z', updatedAt: '2026-10-30T00:00:00Z', status: 'scheduled', timePrecision: 'exact', ...extra });
function fixture({ native = true, rows = [], pending = [], permission = 'denied', malformed = false } = {}) {
  const values = new Map([[key, malformed ? '{' : JSON.stringify(rows)], ['saved_events', 'keep-me']]);
  const writes = [], calls = [], output = { exports: {} }; let permissionPrompts = 0;
  const notifications = { getPending: async () => ({ notifications: pending.map(id => ({ id })) }), checkPermissions: async () => ({ display: permission }), requestPermissions: async () => { permissionPrompts++; return { display: permission }; }, cancel: async value => { calls.push(['cancel', value]); }, schedule: async value => { calls.push(['schedule', value]); } };
  const settings = { openNotificationSettings: async () => { calls.push(['settings']); return { opened: true }; } };
  const imports = { './capacitor': { isNativePlatform: () => native, plugin: name => name === 'AppSettings' ? settings : notifications }, '../../../lib/event-time': { hasEventTime: event => event.timePrecision === 'exact' }, './accountCollections': {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Set, CustomEvent: class { constructor(name) { this.type = name; } }, window: { localStorage: { getItem: name => values.get(name), setItem: (name, value) => { writes.push(name); values.set(name, value); } }, dispatchEvent() {} } })(name => imports[name], output, output.exports);
  return { api: output.exports, values, writes, calls, get prompts() { return permissionPrompts; } };
}

test('Reminder state reflects pending native IDs, preserves cancellation entries and keeps owners separate without prompting', async () => {
  const f = fixture({ rows: [record(1, 'A'), record(2, 'B'), record(3, 'A', { pendingCancel: true }), record(4, 'A')], pending: [1, 2] });
  const state = await f.api.readEventReminderState('A');
  assert.equal(state.error, false); assert.deepEqual(JSON.parse(JSON.stringify(state.items)), [{ eventId: 'event-1', state: 'scheduled' }, { eventId: 'event-3', state: 'pending-cancel' }]);
  assert.equal(f.prompts, 0); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});

test('Turning off a reminder cancels only its owner-scoped notification and preserves the saved event', async () => {
  const f = fixture({ rows: [record(1, 'A'), record(2, 'B')], pending: [1, 2] });
  assert.equal(await f.api.cancelEventReminder('event-1', 'A'), true);
  assert.deepEqual(JSON.parse(f.values.get(key)).map(row => row.ownerId), ['B']);
  assert.equal(f.values.get('saved_events'), 'keep-me'); assert.ok(f.writes.every(name => name === key));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'cancel'); assert.equal(f.prompts, 0);
});

test('Denied permission checks and app-settings handoff do not reschedule, request permission or change records', async () => {
  const f = fixture();
  assert.equal(await f.api.eventReminderPermission(), 'denied'); assert.equal(await f.api.openEventNotificationSettings(), true);
  assert.deepEqual(f.calls, [['settings']]); assert.equal(f.prompts, 0); assert.equal(f.writes.length, 0);
  const web = fixture({ native: false }); assert.equal(await web.api.openEventNotificationSettings(), false); assert.equal(await web.api.eventReminderPermission(), 'unavailable'); assert.equal(web.calls.length, 0);
});

test('Unreadable reminder data is an error without resetting the registry', async () => {
  const f = fixture({ malformed: true }); assert.equal((await f.api.readEventReminderState('A')).error, true);
  assert.equal(f.values.get(key), '{'); assert.equal(f.writes.length, 0);
});

test('iOS and Android register a dedicated settings bridge without allowing caller-controlled URLs', () => {
  const ios = readFileSync('ios/App/App/AppSettingsPlugin.swift', 'utf8');
  assert.match(ios, /UIApplication\.openNotificationSettingsURLString/); assert.doesNotMatch(ios, /call\.getString/);
  assert.match(ios, /if #available\(iOS 16\.0, \*\)\s*\{\s*target = UIApplication\.openNotificationSettingsURLString\s*\} else \{\s*target = UIApplication\.openSettingsURLString/);
  assert.match(readFileSync('ios/App/App/MainViewController.swift', 'utf8'), /registerPluginInstance\(AppSettingsPlugin\(\)\)/);
  const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  assert.equal((project.match(/AppSettingsPlugin\.swift in Sources/g) || []).length, 2);
  assert.match(readFileSync('android/app/src/main/java/tr/com/letsgo2travel/app/AppSettingsPlugin.java', 'utf8'), /Settings\.ACTION_APP_NOTIFICATION_SETTINGS/);
  assert.match(readFileSync('android/app/src/main/java/tr/com/letsgo2travel/app/MainActivity.java', 'utf8'), /registerPlugin\(AppSettingsPlugin\.class\)/);
});

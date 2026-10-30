import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const legacyPath = 'scripts/verify-testflight-distribution.py';
const legacyHash = () => createHash('sha256').update(readFileSync(legacyPath)).digest('hex');

test('the current verifier workflow is manual, read-only, integration-bound and separate from build 83', () => {
  const workflows = load(readFileSync('codemagic.yaml', 'utf8')).workflows;
  const current = workflows['letsgo2travel-testflight-current-verify'];
  assert.equal(Object.keys(workflows).at(-1), 'letsgo2travel-testflight-current-verify');
  assert.deepEqual(current.integrations, { app_store_connect: 'LetsGo2Travel' });
  assert.equal(current.max_build_duration, 10);
  assert.equal(current.triggering, undefined); assert.equal(current.publishing, undefined); assert.equal(current.environment, undefined);
  assert.deepEqual(current.scripts, [{ name: 'Verify latest new build and existing internal group access', script: 'python3 scripts/verify-testflight-current.py' }]);
  assert.deepEqual(current.artifacts, ['testflight-current.json']);
  assert.equal(workflows['letsgo2travel-testflight-83-verify'].scripts[1].script, 'python3 scripts/verify-testflight-distribution.py');
});

test('Python fixtures reject old, pending, wrong-app/group and unauthorized builds without mutations, credentials or legacy artifact overwrite', () => {
  const bundled = join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const python = process.env.LETSGO_PYTHON_BIN || (process.platform === 'win32' && existsSync(bundled) ? bundled : 'python3');
  const originalHash = legacyHash();
  const tests = String.raw`
import builtins, contextlib, copy, importlib.util, io, json, os, pathlib, tempfile, types, unittest
from unittest.mock import patch

script = pathlib.Path('scripts/verify-testflight-current.py').resolve()
spec = importlib.util.spec_from_file_location('current_verifier_fixture', script)
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
NEW_ID = '00000000-1111-4222-8333-444444444444'
OLD_ID = '6a6a7aad-c91c-433d-bb3a-25b9906c5204'

class Fixture:
    def __init__(self):
        self.latest, self.calls, self.cli, self.normalized = '84', [], [], []
        self.build = {'id':NEW_ID,'type':'builds','attributes':{'version':'84','processingState':'VALID','expired':False}}
        self.group = {'id':v.GROUP_ID,'type':'betaGroups','attributes':{'name':'Existing group','isInternalGroup':True,'hasAccessToAllBuilds':True}}
        self.groups = [self.group]
        self.members = [copy.deepcopy(self.build)]
        self.details = {'id':NEW_ID,'type':'buildBetaDetails','attributes':{'internalBuildState':'IN_BETA_TESTING'}}
        self.app, self.platform, self.status, self.extra_builds = v.APP_ID, 'IOS', {}, []
        fixture = self
        class Session:
            def get(self, url, **options):
                fixture.calls.append((url,options))
                assert options['allow_redirects'] is False and options['timeout'] == 30
                path = url.removeprefix(v._reads.API)
                if path == '/builds':
                    assert options['params']['filter[app]'] == v.APP_ID
                    assert options['params']['filter[version]'] == fixture.latest
                    payload = {'data':[fixture.build,*fixture.extra_builds]}
                elif path == '/builds/'+NEW_ID+'/app': payload = {'data':{'id':fixture.app,'type':'apps'}}
                elif path == '/builds/'+NEW_ID+'/preReleaseVersion': payload = {'data':{'id':'version','attributes':{'platform':fixture.platform}}}
                elif path == '/apps/'+v.APP_ID+'/betaGroups': payload = {'data':fixture.groups}
                elif path == '/betaGroups/'+v.GROUP_ID+'/builds': payload = {'data':fixture.members}
                else: raise AssertionError('Unexpected read path')
                return types.SimpleNamespace(status_code=fixture.status.get(path,200),json=lambda:copy.deepcopy(payload))
        self.client = types.SimpleNamespace(session=Session())
        def argument(name):
            class Argument:
                @staticmethod
                def from_environment_variable_default():
                    fixture.normalized.append(name)
                    return types.SimpleNamespace(value='fixture-'+name)
            return Argument
        self.Types = types.SimpleNamespace(KeyIdentifierArgument=argument('key'),IssuerIdArgument=argument('issuer'),PrivateKeyArgument=argument('private'))
    def factory(self,*args,**kwargs):
        assert args == ('fixture-key','fixture-issuer','fixture-private')
        assert kwargs == dict(log_requests=False,unauthorized_request_retries=0,server_error_retries=0,enable_jwt_cache=False)
        return self.client
    def cli_read(self,args):
        self.cli.append(args)
        if args == ['get-latest-testflight-build-number',v.APP_ID,'--platform','IOS']: return self.latest
        assert args == ['builds','beta-details',NEW_ID,'--json']
        return json.dumps(self.details)
    def run(self):
        report={'verified':False,'stage':'start'}
        with patch.object(v,'import_sdk',return_value=(self.factory,self.Types)),patch.object(v,'cli_read',side_effect=self.cli_read):
            v.verify(report)
        return report

class Checks(unittest.TestCase):
    def setUp(self):
        self.environment=patch.dict(os.environ,{},clear=True);self.environment.start()
    def tearDown(self): self.environment.stop()
    def rejected(self,f,pattern):
        with self.assertRaisesRegex(v.VerificationError,pattern): f.run()
    def test_current_dynamic_id_and_official_normalization(self):
        f=Fixture();r=f.run();self.assertTrue(r['verified']);self.assertEqual(r['build']['id'],NEW_ID);self.assertEqual(r['latestBuildNumber'],'84');self.assertEqual(r['group']['id'],v.GROUP_ID);self.assertTrue(r['buildIsInGroup']);self.assertEqual(f.normalized,['key','issuer','private']);self.assertNotIn(OLD_ID,json.dumps(r))
    def test_latest_83_and_older_never_succeed(self):
        for number in ['83','82','0','-84','84.0','84;echo private']:
            with self.subTest(number=number):
                f=Fixture();f.latest=number;self.rejected(f,'build number|newer');self.assertEqual(f.calls,[])
    def test_expected_build_must_match_exactly(self):
        os.environ['LETSGO_EXPECTED_TESTFLIGHT_BUILD_NUM']='85';self.rejected(Fixture(),'expected build')
        os.environ['LETSGO_EXPECTED_TESTFLIGHT_BUILD_NUM']='83';self.rejected(Fixture(),'newer')
        os.environ['LETSGO_EXPECTED_TESTFLIGHT_BUILD_NUM']='84';self.assertTrue(Fixture().run()['verified'])
    def test_old_list_identity_is_not_a_new_build(self):
        f=Fixture();f.build['attributes']['version']='83';self.rejected(f,'uniquely')
    def test_pending_or_failed_processing_never_passes(self):
        for state in ['PROCESSING','FAILED','INVALID',None]:
            f=Fixture();f.build['attributes']['processingState']=state;self.rejected(f,'processing');self.assertEqual(len(f.cli),1)
    def test_expired_or_missing_expiry_never_passes(self):
        for expired in [True,None]:
            f=Fixture();f.build['attributes']['expired']=expired;self.rejected(f,'expired')
    def test_ambiguous_build_and_path_injection_rejected(self):
        f=Fixture();f.extra_builds=[copy.deepcopy(f.build)];self.rejected(f,'uniquely')
        f=Fixture();f.build['id']='../private';self.rejected(f,'identity')
    def test_wrong_app_or_platform_rejected(self):
        f=Fixture();f.app='other';self.rejected(f,'another app')
        f=Fixture();f.platform='MAC_OS';self.rejected(f,'iOS')
    def test_old_beta_details_and_pending_state_rejected(self):
        f=Fixture();f.details['id']=OLD_ID;self.rejected(f,'identity')
        for state in ['PROCESSING','READY_FOR_BETA_TESTING','IN_EXPORT_COMPLIANCE_REVIEW',None]:
            f=Fixture();f.details['attributes']['internalBuildState']=state;self.rejected(f,'internal beta')
    def test_exact_internal_automatic_group_required(self):
        f=Fixture();f.group['id']='other-group';self.rejected(f,'exact existing')
        for flag in ['isInternalGroup','hasAccessToAllBuilds']:
            f=Fixture();f.group['attributes'][flag]=False;self.rejected(f,'internal group|Automatic distribution')
    def test_old_or_missing_group_membership_never_passes(self):
        for members in [[],[{'id':OLD_ID,'attributes':{'version':'83','processingState':'VALID','expired':False}}],[{'id':NEW_ID,'attributes':{'version':'84','processingState':'PROCESSING','expired':False}}]]:
            f=Fixture();f.members=members;self.rejected(f,'associated')
    def test_group_401_is_failure_without_fallback_or_mutation(self):
        f=Fixture();f.status['/betaGroups/'+v.GROUP_ID+'/builds']=401;self.rejected(f,'successful read')
        self.assertEqual(len([c for c in f.calls if '/betaGroups/'+v.GROUP_ID+'/builds' in c[0]]),1)
    def test_pending_check_can_be_retried_but_cannot_report_success_early(self):
        f=Fixture();f.build['attributes']['processingState']='PROCESSING';self.rejected(f,'processing');f.build['attributes']['processingState']='VALID';self.assertTrue(f.run()['verified'])
    def test_report_has_distinct_fixed_path_and_never_overwrites(self):
        before=script.with_name('verify-testflight-distribution.py').read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            previous=os.getcwd();os.chdir(directory)
            try:
                legacy=pathlib.Path('testflight-distribution-83.json');legacy.write_text('legacy sentinel')
                result=Fixture().run()
                with patch.object(v,'verify',side_effect=lambda report:report.update(result)),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(v.main(),0);saved=pathlib.Path('testflight-current.json').read_text();self.assertEqual(v.main(),1)
                self.assertTrue(json.loads(saved)['verified']);self.assertEqual(pathlib.Path('testflight-current.json').read_text(),saved);self.assertEqual(legacy.read_text(),'legacy sentinel')
            finally: os.chdir(previous)
        self.assertEqual(script.with_name('verify-testflight-distribution.py').read_bytes(),before)
    def test_failure_report_and_console_never_include_exception_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'testflight-current.json';stream=io.StringIO()
            with patch.object(v,'REPORT',path),patch.object(v,'verify',side_effect=RuntimeError('DO_NOT_LOG_FIXTURE_CREDENTIAL')),contextlib.redirect_stderr(stream):self.assertEqual(v.main(),1)
            self.assertFalse(json.loads(path.read_text())['verified']);self.assertNotIn('DO_NOT_LOG',path.read_text()+stream.getvalue())
    def test_symlink_report_is_not_followed(self):
        report=types.SimpleNamespace(is_symlink=lambda:True,open=lambda *args,**kwargs:(_ for _ in ()).throw(AssertionError('Must not open')))
        with patch.object(v,'REPORT',report),patch.object(v,'verify',side_effect=lambda result:result.update(verified=True)),contextlib.redirect_stderr(io.StringIO()):self.assertEqual(v.main(),1)
    def test_reexec_only_safe_existing_python_and_current_script_once(self):
        original=builtins.__import__
        def importing(name,*args,**kwargs):
            if name.startswith('codemagic'):raise ImportError('Fixture unavailable')
            return original(name,*args,**kwargs)
        with tempfile.TemporaryDirectory() as directory:
            interpreter=pathlib.Path(directory)/'python3';interpreter.write_text('fixture')
            entry=pathlib.Path(directory)/'app-store-connect';entry.write_text('#!'+interpreter.as_posix()+'\n')
            with patch('builtins.__import__',side_effect=importing),patch.object(v.shutil,'which',return_value=str(entry)),patch.object(v.os,'execv',side_effect=RuntimeError('reexec fixture')) as execution:
                with self.assertRaisesRegex(RuntimeError,'reexec fixture'):v.import_sdk({})
                self.assertEqual(execution.call_args.args,(interpreter.as_posix(),[interpreter.as_posix(),str(script)]));self.assertEqual(os.environ[v.REEXEC_FLAG],'1')
                with self.assertRaises(ImportError):v.import_sdk({})
                self.assertEqual(execution.call_count,1)
    def test_reexec_rejects_shell_entrypoint(self):
        original=builtins.__import__
        def importing(name,*args,**kwargs):
            if name.startswith('codemagic'):raise ImportError('Fixture unavailable')
            return original(name,*args,**kwargs)
        with tempfile.TemporaryDirectory() as directory:
            entry=pathlib.Path(directory)/'app-store-connect';entry.write_text('#!/bin/sh -c unsafe\n')
            with patch('builtins.__import__',side_effect=importing),patch.object(v.shutil,'which',return_value=str(entry)),patch.object(v.os,'execv') as execution:
                with self.assertRaises(ImportError):v.import_sdk({})
                execution.assert_not_called()

unittest.main(verbosity=1)
`;
  const result = spawnSync(python, ['-B', '-c', tests], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}${result.error || ''}`);
  assert.match(result.stderr, /Ran 18 tests/);
  assert.equal(legacyHash(), originalHash);
});

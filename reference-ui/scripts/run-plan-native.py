"""Root-supervised native Plan runner. Requires outer cgroup kill/empty + all-cookie cleanup proof."""
import hashlib,json,os,pathlib,subprocess,sys
from plan_native_contract import fixture,outer_scope,private_output,MINIMUM_MEMORY_AVAILABLE_BYTES

def main():
    assert os.environ.get('PLAN_NATIVE_REVIEWED_EXECUTION')=='1'
    assert not any(os.environ.get(n)for n in ('DEBUG','PWDEBUG','NODE_DEBUG'))
    fixture();scope,_=outer_scope(True)
    result=private_output(os.environ['PLAN_NATIVE_RESULT']);runner=private_output(scope['runnerResultPath'])
    temporary=pathlib.Path(os.environ['TMPDIR']);assert temporary.parent==pathlib.Path('/dev/shm')and temporary.is_dir()and not temporary.is_symlink()and temporary.stat().st_mode&0o777==0o700
    available=int(next(x.split()[1]for x in pathlib.Path('/proc/meminfo').read_text().splitlines()if x.startswith('MemAvailable:')))*1024
    assert available>=MINIMUM_MEMORY_AVAILABLE_BYTES
    app=pathlib.Path(__file__).resolve().parent.parent;node='/root/.nvm/versions/node/v22.23.3/bin/node'
    env={**os.environ,'NODE_OPTIONS':'--max-old-space-size=512','PLAN_NATIVE_OUTER_SCOPE_ADMITTED':'1'}
    command=['nice','-n','10',node,str(app/'node_modules/@playwright/test/cli.js'),'test','--config',str(app/'playwright.plan-native.config.ts'),'--workers=1','--retries=0']
    receipt={'status':'INNER_RUNNER_STARTED_OUTER_CLEANUP_REQUIRED','outerScopeReceiptSha256':os.environ['PLAN_NATIVE_OUTER_SCOPE_SHA256'],
      'allThreeNormalCookiesCleanupRequired':True,'ownedCgroupKillAndEmptyProofRequired':True,'outerCleanupComplete':False}
    with runner.open('x')as f:json.dump(receipt,f);f.write('\n')
    runner.chmod(0o600);success=False
    try:
        completed=subprocess.run(command,cwd=app,env=env,timeout=300,capture_output=True,start_new_session=True)
        receipt.update(status='INNER_RUNNER_FINISHED_OUTER_CLEANUP_REQUIRED',exitCode=completed.returncode,
          stdoutSha256=hashlib.sha256(completed.stdout).hexdigest(),stderrSha256=hashlib.sha256(completed.stderr).hexdigest())
        success=completed.returncode==0
    except subprocess.TimeoutExpired as error:
        receipt.update(status='INNER_TIMEOUT_ROOT_MUST_KILL_OWNED_CGROUP',timeout=True,
          stdoutSha256=hashlib.sha256(error.stdout or b'').hexdigest(),stderrSha256=hashlib.sha256(error.stderr or b'').hexdigest())
    except BaseException:
        receipt.update(status='INNER_RUNNER_FAILED_ROOT_CLEANUP_REQUIRED',safeCode='RunnerFailure')
    finally:
        # Never persist/print transport output or claim subprocess timeout killed detached Chromium.
        temporary_result=runner.with_name(runner.name+'.writing')
        with temporary_result.open('x')as f:json.dump(receipt,f,indent=2);f.write('\n')
        temporary_result.chmod(0o600);os.replace(temporary_result,runner)
    return 0 if success else 1
if __name__=='__main__':
    try:code=main()
    except BaseException:print('Native Plan runner stopped; Root-owned scope and all-cookie cleanup proof required.');code=1
    raise SystemExit(code)

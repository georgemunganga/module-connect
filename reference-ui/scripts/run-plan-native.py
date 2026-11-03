"""Root-run native Plan UI wrapper. No API/DB/server/build setup; no automatic retry."""
import hashlib,json,os,pathlib,subprocess

def main():
    assert os.environ.get('PLAN_NATIVE_REVIEWED_EXECUTION')=='1','Root-reviewed execution required'
    assert not any(os.environ.get(n)for n in ('DEBUG','PWDEBUG','NODE_DEBUG')),'Credential debug capture forbidden'
    fixture=pathlib.Path(os.environ['PLAN_NATIVE_FIXTURE']);assert fixture.is_file()and not fixture.is_symlink()and fixture.stat().st_mode&0o777==0o600
    assert hashlib.sha256(fixture.read_bytes()).hexdigest()==os.environ['PLAN_NATIVE_FIXTURE_SHA256']
    result=pathlib.Path(os.environ['PLAN_NATIVE_RESULT']);assert result.is_absolute()and not result.exists()and result.parent.stat().st_mode&0o777==0o700
    temporary=pathlib.Path(os.environ['TMPDIR']);assert temporary.parent==pathlib.Path('/dev/shm')and temporary.is_dir()and not temporary.is_symlink()and temporary.stat().st_mode&0o777==0o700
    available=int(next(x.split()[1]for x in pathlib.Path('/proc/meminfo').read_text().splitlines()if x.startswith('MemAvailable:')))*1024
    assert available>=1536*1024**2,'Coordinate the1536MiB browser resource slot with Root'
    app=pathlib.Path(__file__).resolve().parent.parent;node='/root/.nvm/versions/node/v22.23.3/bin/node'
    env={**os.environ,'NODE_OPTIONS':'--max-old-space-size=512'}
    command=['nice','-n','10',node,str(app/'node_modules/@playwright/test/cli.js'),'test','--config',str(app/'playwright.plan-native.config.ts'),'--workers=1','--retries=0']
    # One invocation only. Existing result/partial command evidence forbids an implicit repeat.
    completed=subprocess.run(command,cwd=app,env=env,timeout=300)
    assert completed.returncode==0,'Native Plan UI failed; retain records/report and ask Root for reconciliation, never rerun'
if __name__=='__main__':main()

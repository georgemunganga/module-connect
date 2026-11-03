"""INERT until Root pins/approves actual inputs. One systemd user service; no API/DB setup."""
import hashlib,json,os,pathlib,re,shutil,signal,subprocess,sys,time
from plan_native_contract import protected_json,private_output

def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def ticks(pid):
    value=pathlib.Path(f'/proc/{pid}/stat').read_text()
    return value[value.rfind(')')+2:].split()[19]
def pinned(pin):return protected_json(pin['path'],pin['sha256'])
def save(path,value):
    target=path if not path.exists()else path.with_name(path.name+'.writing')
    with target.open('x')as f:json.dump(value,f,indent=2);f.write('\n')
    target.chmod(0o600)
    if target!=path:os.replace(target,path)
def systemctl(*args):
    r=subprocess.run(['systemctl','--user',*args],capture_output=True,timeout=20)
    return r.returncode,r.stdout.decode('utf8','replace')
def unit_state(unit):
    code,text=systemctl('show',unit,'--property=LoadState,ActiveState,SubState,MainPID,ControlPID,ControlGroup,InvocationID,Description','--no-pager')
    values=dict(line.split('=',1)for line in text.splitlines()if '='in line)
    assert code in (0,4)and values.get('LoadState'),'Unit state unavailable'
    return values
def unit_is_stopped(state):
    return (state.get('LoadState')=='not-found'and state.get('ActiveState','inactive')in('inactive','failed')and state.get('MainPID','0')=='0'and state.get('ControlPID','0')=='0')or(state.get('LoadState')=='loaded'and state.get('ActiveState')in('inactive','failed')and state.get('MainPID')=='0'and state.get('ControlPID')=='0')
def namespace_matches(owner):
    assert ticks(owner['pid'])==str(owner['startTicks'])
    assert os.stat(f"/proc/{owner['pid']}/ns/net").st_ino==owner['networkNamespaceInode']
def main():
    assert os.environ.get('PLAN_NATIVE_OUTER_REVIEWED_EXECUTION')=='1'
    plan_path=os.environ['PLAN_NATIVE_OUTER_PLAN'];plan_sha=os.environ['PLAN_NATIVE_OUTER_PLAN_SHA256'];p=protected_json(plan_path,plan_sha)
    assert p['purpose']=='PLAN_NATIVE_SYSTEMD_USER_OUTER_EXECUTION'and p['rootApproved']is True
    assert 0< p['expiresAtUnix']-time.time()<=3600
    app=pathlib.Path(__file__).resolve().parent.parent;repo=app.parent
    assert p['repositoryPath']==str(repo)
    assert subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True,timeout=15)==''
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True,timeout=15).strip()==p['harnessSourceCommit']
    for relative,expected in p['sourceFilesSha256'].items():
        target=repo/relative;assert target.resolve().is_relative_to(repo)and target.is_file()and not target.is_symlink()and digest(target)==expected
    required=['scripts/run-plan-native-outer.py','scripts/run-plan-native.py','scripts/plan_native_contract.py','scripts/cleanup-plan-native-cookies.py','playwright.plan-native.config.ts','tests/normal-cookie/plan-review/input.ts','tests/normal-cookie/plan-review/positive.spec.ts','tests/normal-cookie/plan-review/safety.ts','tests/normal-cookie/plan-review/safe-reporter.ts']
    assert all('reference-ui/'+x in p['sourceFilesSha256']for x in required)
    f=pinned(p['fixture']);manifest=pinned(p['uiManifest']);binding=pinned(p['uiSourceBinding'])
    assert f['purpose']=='PLAN_REVIEW_NATIVE_POSITIVE'and f['rootApprovedFourBusinessCommands']is True and f['normalCoreCookieStates']is True
    assert set(f['actors'])=={'owner','reviewer','final'}
    for actor in f['actors'].values():pinned(actor['storageState'])
    assert manifest['uiSourceCommit']==f['uiSourceCommit']==p['uiBuildCommit']==binding['sourceCommit']
    assert binding['manifestSha256']==p['uiManifest']['sha256']and manifest['liveMode']is True and manifest['base']=='/procurement/workspace/'
    for tree in ('reference-ui/src','shared'):
        assert subprocess.check_output(['git','rev-parse',p['uiBuildCommit']+':'+tree],cwd=repo,text=True,timeout=15)==subprocess.check_output(['git','rev-parse',p['harnessSourceCommit']+':'+tree],cwd=repo,text=True,timeout=15)
    static=pathlib.Path(manifest['staticRoot']);assert static.resolve()==static and static.is_dir()
    assert {str(x.relative_to(static))for x in static.rglob('*')if x.is_file()}==set(manifest['files'])
    for relative,pin in manifest['files'].items():
        target=static/relative;assert target.resolve().is_relative_to(static)and not target.is_symlink()and target.stat().st_size==pin['size']and digest(target)==pin['sha256']
    # Receipt contents are not guessed: Root supplies exact reviewed predicates and hashes.
    for name in ('runtimeReceipt','proxyReceipt'):
        value=pinned(p[name])
        assert p[name]['expectedFields'],'Root must specify actual receipt admission predicates'
        for key,expected in p[name]['expectedFields'].items():assert value.get(key)==expected
    assert f['backendSourceCommit']==p['backendSourceCommit']
    owner=p['networkNamespaceOwner'];namespace_matches(owner)
    assert re.fullmatch(r'procurement-plan-native-[a-z0-9-]+\.service',p['unitName'])
    assert unit_state(p['unitName'])['LoadState']=='not-found','Never reuse an existing unit'
    code,text=systemctl('show','app.slice','--property=ControlGroup','--value');assert code==0
    parent=text.strip();assert parent.startswith('/user.slice/')and parent.endswith('/app.slice')
    cgroup=pathlib.Path('/sys/fs/cgroup'+parent)/p['unitName'];assert not cgroup.exists()
    r=p['resources'];assert 300<=r['runtimeMaxSeconds']<=360 and 90<=r['cleanupMaxSeconds']<=120
    assert 768*1024**2<=r['memoryMaxBytes']<=1280*1024**2 and 128<=r['tasksMax']<=256
    assert r['minimumMemoryAvailableBytes']>=1536*1024**2 and r['minimumRootFreeBytes']>=200*1024**2
    available=int(next(x.split()[1]for x in pathlib.Path('/proc/meminfo').read_text().splitlines()if x.startswith('MemAvailable:')))*1024
    assert available>=r['minimumMemoryAvailableBytes']and shutil.disk_usage('/').free>=r['minimumRootFreeBytes']
    tmp=pathlib.Path(p['temporaryDirectory']);assert tmp.parent==pathlib.Path('/dev/shm')and tmp.resolve()==tmp and tmp.is_dir()and tmp.stat().st_mode&0o777==0o700
    assert shutil.disk_usage(tmp).free>=128*1024**2
    outputs={k:private_output(v)for k,v in p['outputs'].items()}
    assert set(outputs)=={'controller','scopeReceipt','scopeEmptyProof','runner','browser','cookies','outerCleanupProof'}and len(set(outputs.values()))==7
    scope={'purpose':'PLAN_NATIVE_ROOT_OWNED_CGROUP_V2','authorized':True,'fixtureSha256':p['fixture']['sha256'],'cgroupPath':str(cgroup),
      'supervisorKind':'systemd-user-service','unitName':p['unitName'],'outerSupervisorPid':os.getpid(),'outerSupervisorStartTicks':ticks(os.getpid()),'approvedAtUnix':time.time(),
      'killOwnedScopeOnEveryExit':True,'verifyScopeEmptyAfter':True,'cleanupAllThreeNormalCookies':True,'runnerResultPath':str(outputs['runner']),
      'cookieCleanupResultPath':str(outputs['cookies']),'outerCleanupProofPath':str(outputs['outerCleanupProof']),'scopeEmptyProofPath':str(outputs['scopeEmptyProof'])}
    save(outputs['scopeReceipt'],scope)
    env={k:v for k,v in os.environ.items()if k not in ('DEBUG','PWDEBUG','NODE_DEBUG','PLAN_NATIVE_COOKIE_CLEANUP_REVIEWED_EXECUTION')}
    env.update(PLAN_NATIVE_REVIEWED_EXECUTION='1',PLAN_NATIVE_FIXTURE=p['fixture']['path'],PLAN_NATIVE_FIXTURE_SHA256=p['fixture']['sha256'],
      PLAN_NATIVE_OUTER_SCOPE_RECEIPT=str(outputs['scopeReceipt']),PLAN_NATIVE_OUTER_SCOPE_SHA256=digest(outputs['scopeReceipt']),
      PLAN_NATIVE_RUNNER_RESULT=str(outputs['runner']),PLAN_NATIVE_RESULT=str(outputs['browser']),PLAN_NATIVE_COOKIE_CLEANUP_RESULT=str(outputs['cookies']),
      TMPDIR=str(tmp),PATH='/root/.nvm/versions/node/v22.23.3/bin:'+os.environ['PATH'])
    report={'status':'ADMITTED_NO_BROWSER_SUCCESS_CLAIMED','planSha256':plan_sha,'sourceFilesSha256':p['sourceFilesSha256'],'uiManifestSha256':p['uiManifest']['sha256'],
      'fixtureSha256':p['fixture']['sha256'],'unitName':p['unitName'],'cgroupPath':str(cgroup),'allThreeCookieCleanupRequired':True,'nativeOwnerReconciliationRequired':True}
    save(outputs['controller'],report);child=None;description='PlanNative-'+plan_sha
    def interrupted(_sig,_frame):raise InterruptedError('Root controller interrupted')
    for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,interrupted)
    try:
        command=['systemd-run','--user','--unit='+p['unitName'],'--slice=app.slice','--service-type=exec','--wait','--pipe',
          '--property=Description='+description,'--property=KillMode=control-group','--property=SendSIGKILL=yes','--property=TimeoutStopSec=10s',
          '--property=RuntimeMaxSec='+str(r['runtimeMaxSeconds'])+'s','--property=MemoryMax='+str(r['memoryMaxBytes']),
          '--property=TasksMax='+str(r['tasksMax']),'--property=CPUQuota=100%','--property=WorkingDirectory='+str(app),
          '--property=UnsetEnvironment=DEBUG PWDEBUG NODE_DEBUG']
        names=['PLAN_NATIVE_REVIEWED_EXECUTION','PLAN_NATIVE_FIXTURE','PLAN_NATIVE_FIXTURE_SHA256','PLAN_NATIVE_OUTER_SCOPE_RECEIPT','PLAN_NATIVE_OUTER_SCOPE_SHA256','PLAN_NATIVE_RUNNER_RESULT','PLAN_NATIVE_RESULT','PLAN_NATIVE_COOKIE_CLEANUP_RESULT','TMPDIR','PATH']
        command+=['--setenv='+key+'='+env[key]for key in names]
        command+=['/usr/bin/nsenter','--target',str(owner['pid']),'--net','/usr/bin/python3',str(app/'scripts/run-plan-native.py')]
        namespace_matches(owner);child=subprocess.Popen(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        for _ in range(50):
            observed=unit_state(p['unitName'])
            if observed.get('InvocationID'):
                assert observed.get('Description')==description and observed.get('ControlGroup')==parent+'/'+p['unitName']
                report['actualUnitInvocationIdObserved']=observed['InvocationID'];report['actualUnitOwnershipMarkerVerified']=True
                save(outputs['controller'],report);break
            if child.poll()is not None:break
            time.sleep(0.1)
        assert report.get('actualUnitInvocationIdObserved'),'Actual unit identity must be observed before acceptance'
        stdout,stderr=child.communicate(timeout=r['runtimeMaxSeconds']+25)
        report.update(innerExitCode=child.returncode,innerStdoutSha256=hashlib.sha256(stdout).hexdigest(),innerStderrSha256=hashlib.sha256(stderr).hexdigest())
    except BaseException:report['safeFailureCode']='ChildFailedOrTimedOutNoRetry'
    finally:
        for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,signal.SIG_IGN)
        empty=False
        try:
            state=unit_state(p['unitName'])
            if state['LoadState']!='not-found':
                assert state['Description']==description,'Do not stop a unit without the exact ownership marker'
                if state.get('InvocationID'):
                    assert not report.get('actualUnitInvocationIdObserved')or report['actualUnitInvocationIdObserved']==state['InvocationID']
                    report['actualUnitInvocationIdObserved']=state['InvocationID'];report['actualUnitOwnershipMarkerVerified']=True
                systemctl('kill','--kill-whom=all','--signal=KILL',p['unitName']);systemctl('stop',p['unitName'])
            if child is not None:
                try:child.communicate(timeout=10)
                except subprocess.TimeoutExpired:child.kill();child.communicate(timeout=10)
            state=unit_state(p['unitName'])
            stopped=unit_is_stopped(state)
            empty=stopped and(not cgroup.exists()or(not(cgroup/'cgroup.procs').read_text().strip()and 'populated 0'in(cgroup/'cgroup.events').read_text().splitlines()))
            assert empty and report.get('actualUnitInvocationIdObserved')and report.get('actualUnitOwnershipMarkerVerified')is True
            save(outputs['scopeEmptyProof'],{'status':'PASS_OWNED_SYSTEMD_UNIT_STOPPED_AND_SCOPE_EMPTY','scopeReceiptSha256':digest(outputs['scopeReceipt']),
              'fixtureSha256':p['fixture']['sha256'],'unitName':p['unitName'],'cgroupPath':str(cgroup),'scopeRemoved':not cgroup.exists(),'unitState':state,
              'actualUnitInvocationIdObserved':report['actualUnitInvocationIdObserved'],'actualUnitOwnershipMarkerVerified':True})
        except BaseException:empty=False;report['scopeCleanupSafeFailure']='OwnedScopeEmptyUnconfirmed'
        # Always attempt all three issued cookies after scope safety is confirmed, regardless of UI progress.
        if empty:
            try:
                namespace_matches(owner);env.update(PLAN_NATIVE_COOKIE_CLEANUP_REVIEWED_EXECUTION='1',PLAN_NATIVE_SCOPE_EMPTY_PROOF=str(outputs['scopeEmptyProof']),PLAN_NATIVE_SCOPE_EMPTY_PROOF_SHA256=digest(outputs['scopeEmptyProof']))
                cleanup=subprocess.run(['/usr/bin/nsenter','--target',str(owner['pid']),'--net','/usr/bin/python3',str(app/'scripts/cleanup-plan-native-cookies.py')],env=env,capture_output=True,timeout=r['cleanupMaxSeconds'])
                report.update(cookieCleanupExitCode=cleanup.returncode,cookieCleanupStdoutSha256=hashlib.sha256(cleanup.stdout).hexdigest(),cookieCleanupStderrSha256=hashlib.sha256(cleanup.stderr).hexdigest())
            except BaseException:report['cookieCleanupSafeFailure']='AllThreeCookieCleanupUnconfirmed'
        report['ownedScopeVerifiedEmpty']=empty
        try:report['allThreeCookiesVerifiedInactive']=outputs['cookies'].exists()and json.loads(outputs['cookies'].read_text()).get('allThreeCookiesVerifiedInactive')is True
        except BaseException:report['allThreeCookiesVerifiedInactive']=False
        report['status']='PASS_OUTER_CLEANUP_AWAIT_NATIVE_OWNER'if empty and report['allThreeCookiesVerifiedInactive']else'FAILED_OUTER_CLEANUP_ROOT_RECONCILIATION_REQUIRED'
        report['proofs']={k:{'path':str(outputs[k]),'sha256':digest(outputs[k])}for k in ('scopeReceipt','scopeEmptyProof','runner','browser','cookies')if outputs[k].exists()}
        save(outputs['controller'],report);save(outputs['outerCleanupProof'],report)
    return 0 if report.get('innerExitCode')==0 and report['status']=='PASS_OUTER_CLEANUP_AWAIT_NATIVE_OWNER'else 1
if __name__=='__main__':
    try:result=main()
    except BaseException:print('Native Plan outer controller stopped. Inspect protected safe-code receipts; Root must reconcile all issued cookies.');result=1
    raise SystemExit(result)

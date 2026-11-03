"""Read-only admission contract for a Root-owned native-browser cgroup supervisor."""
import hashlib,json,os,pathlib,time,urllib.parse
MINIMUM_MEMORY_AVAILABLE_BYTES=1280*1024**2
MAXIMUM_BROWSER_CGROUP_BYTES=1024*1024**2

def resource_budget_accepted(resources,available,root_free):
    return (resources['minimumMemoryAvailableBytes']>=MINIMUM_MEMORY_AVAILABLE_BYTES
      and resources['minimumRootFreeBytes']>=200*1024**2
      and 768*1024**2<=resources['memoryMaxBytes']<=MAXIMUM_BROWSER_CGROUP_BYTES
      and available>=resources['minimumMemoryAvailableBytes']and root_free>=resources['minimumRootFreeBytes'])

def sha(data):return hashlib.sha256(data).hexdigest()
def protected_json(path,expected):
    p=pathlib.Path(path)
    assert p.is_absolute()and p.resolve()==p and p.is_file()and not p.is_symlink()and p.stat().st_mode&0o777==0o600
    data=p.read_bytes();assert len(data)<=1048576 and sha(data)==expected
    return json.loads(data)
def private_output(path):
    p=pathlib.Path(path);assert p.is_absolute()and not p.exists()and p.parent.resolve()==p.parent and p.parent.stat().st_mode&0o777==0o700
    return p
def fixture():
    p=protected_json(os.environ['PLAN_NATIVE_FIXTURE'],os.environ['PLAN_NATIVE_FIXTURE_SHA256'])
    u=urllib.parse.urlsplit(p['baseURL']);assert u.scheme=='https'and u.hostname=='127.0.0.1'and u.port and not u.username and not u.password and u.path in ('','/')and not u.query and not u.fragment
    assert p['purpose']=='PLAN_REVIEW_NATIVE_POSITIVE'and p['normalCoreCookieStates']is True and p['databaseName']!='erp'
    assert set(p['actors'])=={'owner','reviewer','final'}
    return p
def outer_scope(require_inside):
    p=protected_json(os.environ['PLAN_NATIVE_OUTER_SCOPE_RECEIPT'],os.environ['PLAN_NATIVE_OUTER_SCOPE_SHA256'])
    assert p['purpose']=='PLAN_NATIVE_ROOT_OWNED_CGROUP_V2'and p['authorized']is True and p['fixtureSha256']==os.environ['PLAN_NATIVE_FIXTURE_SHA256']
    assert p['killOwnedScopeOnEveryExit']is True and p['verifyScopeEmptyAfter']is True and p['cleanupAllThreeNormalCookies']is True
    assert 0<=time.time()-p['approvedAtUnix']<=3600
    cg=pathlib.Path(p['cgroupPath']);assert cg.is_absolute()and cg.resolve()==cg and cg.parent!=cg and cg.is_relative_to('/sys/fs/cgroup')and cg!=pathlib.Path('/sys/fs/cgroup')
    assert cg.name.startswith('procurement-plan-native-'),'Only the exact dedicated native Plan scope is admissible'
    relative='/'+str(cg.relative_to('/sys/fs/cgroup'));inside=('0::'+relative)in pathlib.Path('/proc/self/cgroup').read_text().splitlines()
    assert inside is require_inside
    pid=int(p['outerSupervisorPid']);assert pid>1 and pid!=os.getpid()
    raw=pathlib.Path(f'/proc/{pid}/stat').read_text();assert raw[raw.rfind(')')+2:].split()[19]==str(p['outerSupervisorStartTicks'])
    assert ('0::'+relative)not in pathlib.Path(f'/proc/{pid}/cgroup').read_text().splitlines()
    assert p['runnerResultPath']==os.environ['PLAN_NATIVE_RUNNER_RESULT']and p['cookieCleanupResultPath']==os.environ['PLAN_NATIVE_COOKIE_CLEANUP_RESULT']
    for key in ('cookieCleanupResultPath','outerCleanupProofPath'):private_output(p[key])
    if require_inside:private_output(p['runnerResultPath'])
    else:
        runner=pathlib.Path(p['runnerResultPath']);assert runner.is_absolute()and runner.parent.resolve()==runner.parent and runner.parent.stat().st_mode&0o777==0o700
        if runner.exists():assert runner.is_file()and not runner.is_symlink()and runner.stat().st_mode&0o777==0o600
    return p,cg

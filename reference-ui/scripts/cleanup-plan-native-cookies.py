"""Root outer-supervisor finally step: normal logout/auth verification for ALL three fixture states."""
import json,os,pathlib,re,ssl,sys,urllib.error,urllib.request
from plan_native_contract import fixture,outer_scope,private_output,protected_json
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def authenticate_result(status,body):
    if status==401:return False
    if status!=200:return None
    try:
        value=json.loads(body)
        return value.get('authenticated')if isinstance(value,dict)and isinstance(value.get('authenticated'),bool)else None
    except BaseException:return None

def all_cookie_cleanup_confirmed(rows):
    return len(rows)==3 and {x.get('actor')for x in rows}=={'owner','reviewer','final'}and all(x.get('logoutAttempted')is True and x.get('cookieVerifiedInactive')is True for x in rows)

def main():
    assert os.environ.get('PLAN_NATIVE_COOKIE_CLEANUP_REVIEWED_EXECUTION')=='1'
    p=fixture();scope,cgroup=outer_scope(False)
    assert not(cgroup/'cgroup.procs').read_text().strip(),'Root must kill and verify the owned browser scope empty first'
    output=private_output(scope['cookieCleanupResultPath'])
    report={'status':'CLEANUP_RUNNING','fixtureSha256':os.environ['PLAN_NATIVE_FIXTURE_SHA256'],
      'outerScopeReceiptSha256':os.environ['PLAN_NATIVE_OUTER_SCOPE_SHA256'],'ownedCgroupObservedEmptyBeforeAuthCleanup':True,
      'normalCoreLogoutOnly':True,'actors':[],'allThreeCookiesVerifiedInactive':False}
    def persist(first=False):
        target=output if first else output.with_name(output.name+'.writing')
        with target.open('x')as f:json.dump(report,f,indent=2);f.write('\n')
        target.chmod(0o600)
        if not first:os.replace(target,output)
    persist(True)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
    def request(path,cookie,method='GET'):
        req=urllib.request.Request(p['baseURL'].rstrip('/')+path,data=b''if method=='POST'else None,
          headers={'Cookie':cookie,'Cache-Control':'no-store'},method=method)
        try:
            with opener.open(req,timeout=10)as response:return response.status,response.read(65536)
        except urllib.error.HTTPError as error:return error.code,error.read(65536)
    for role in ('owner','reviewer','final'):
        row={'actor':role,'logoutAttempted':False,'logoutAcknowledged':False,'cookieVerifiedInactive':False,'revokedByThisCleanupObserved':False}
        report['actors'].append(row);persist()
        try:
            pin=p['actors'][role]['storageState'];state=protected_json(pin['path'],pin['sha256'])
            assert isinstance(state.get('cookies'),list)and state.get('origins')==[]
            entries=[]
            for c in state['cookies']:
                assert c['domain']=='127.0.0.1'and re.fullmatch(r'[A-Za-z0-9_.-]+',c['name'])and not any(x in c['value']for x in ('\r','\n',';'))
                if '/api/hrm/auth/'.startswith(c['path']):entries.append(c['name']+'='+c['value'])
            assert entries;cookie='; '.join(entries)
            try:
                before,body=request('/api/hrm/auth/me',cookie);row['beforeAuthStatus']=before;row['authenticatedBefore']=authenticate_result(before,body)
            except BaseException:row['beforeAuthCheckUnavailable']=True
            row['logoutAttempted']=True;persist()
            status,_=request('/api/hrm/auth/logout',cookie,'POST');row['logoutStatus']=status;row['logoutAcknowledged']=status in (200,204);persist()
            after,body=request('/api/hrm/auth/me',cookie);row['afterAuthStatus']=after;row['cookieVerifiedInactive']=authenticate_result(after,body)is False
            row['revokedByThisCleanupObserved']=row.get('authenticatedBefore')is True and row['logoutAcknowledged']and row['cookieVerifiedInactive']
        except BaseException:row['safeFailureCode']='NormalCookieCleanupUnconfirmed'
        persist() # Continue every actor even if an earlier actor failed or was never used by the UI.
    report['allThreeCookiesVerifiedInactive']=all_cookie_cleanup_confirmed(report['actors'])
    report['status']='PASS_ALL_THREE_FIXTURE_COOKIES_INACTIVE_AFTER_LOGOUT_ATTEMPTS'if report['allThreeCookiesVerifiedInactive']else'FAILED_ALL_COOKIE_CLEANUP_REQUIRES_ROOT_RECONCILIATION'
    persist();return 0 if report['allThreeCookiesVerifiedInactive']else 1
if __name__=='__main__':
    try:code=main()
    except BaseException:print('Native Plan cookie cleanup unconfirmed; inspect protected safe-code receipt.');code=1
    raise SystemExit(code)

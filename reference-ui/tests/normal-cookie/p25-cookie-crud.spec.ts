import { test, expect, type BrowserContext, type APIResponse, type Page } from '@playwright/test';
import { readFileSync, lstatSync, realpathSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

type Credential = { principalId:string; email:string; password:string };
type Fixture = { schemaVersion:1; controlPlaneOnly:true; apiUrl:string; database:string; tenantId:string;
  companyId:string; branchId:string; makerPrincipalId:string; ungrantedPrincipalId:string;
  expiresAt:string; syntheticCredentials:Credential[]; browserAuthenticationRequired:string };
const guid = (value:unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
function privateFile(name:string): string {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value) || realpathSync(value) !== value || !lstatSync(value).isFile()
    || (lstatSync(value).mode & 0o777) !== 0o600) throw new Error('Protected input missing');
  return value;
}
const fixturePath = privateFile('P25_COOKIE_FIXTURE');
const fixtureBytes = readFileSync(fixturePath);
if (fixtureBytes.length > 65536) throw new Error('Invalid protected fixture');
let fixture:Fixture;
try { fixture = JSON.parse(fixtureBytes.toString('utf8')) as Fixture; } catch { throw new Error('Malformed protected fixture'); }
const proxy = JSON.parse(readFileSync(privateFile('P25_COOKIE_PROXY_RECEIPT'),'utf8'));
if (fixture.schemaVersion !== 1 || fixture.controlPlaneOnly !== true
  || fixture.browserAuthenticationRequired !== 'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE'
  || proxy.fixtureSha256 !== createHash('sha256').update(fixtureBytes).digest('hex')
  || proxy.apiUrl !== fixture.apiUrl || proxy.database !== fixture.database
  || fixture.database !== process.env.P25_COOKIE_EXPECTED_DATABASE
  || ![fixture.companyId,fixture.branchId,fixture.makerPrincipalId,fixture.ungrantedPrincipalId].every(guid)
  || !Number.isFinite(Date.parse(fixture.expiresAt)) || Date.parse(fixture.expiresAt) <= Date.now())
  throw new Error('Actual unexpired normal-cookie fixture required');
const credentials = (principal:string):Credential => {
  const found = fixture.syntheticCredentials.filter(value => value.principalId === principal);
  if (found.length !== 1 || !found[0].email || !found[0].password) throw new Error('Exact synthetic account missing');
  return found[0];
};
const output = process.env.P25_COOKIE_BROWSER_RESULT!;
if (!output || !path.isAbsolute(output) || existsSync(output)) throw new Error('New protected browser result required');
const evidence:Record<string,unknown> = { schemaVersion:1, status:'RUNNING_NOT_ACCEPTANCE',
  authentication:'NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE', apiSetupAuthentication:'PRIVATE_SUBJECT_TEST_AUTH_ONLY',
  transport:'normal-local-cookie-https-v1', fixtureSha256:proxy.fixtureSha256, proxyIndexSha256:proxy.indexSha256,
  database:fixture.database, tenantId:fixture.tenantId, companyId:fixture.companyId, branchId:fixture.branchId,
  makerPrincipalId:fixture.makerPrincipalId, fullApprovalFlowVerified:false, nativeIdentityProviderVerified:false,
  externalFinanceAuthority:false, ownerCompletionVerified:false, productionTouched:false };
let sequence=0;
function retain() {
  const temporary = `${output}.tmp-${++sequence}`;
  writeFileSync(temporary, JSON.stringify(evidence,null,2)+'\n', {mode:0o600,flag:'wx'});
  renameSync(temporary,output);
}
// Playwright's API exceptions can include cookies/headers in call logs. Never
// propagate their message/cause or dump responses/credentials. Typed statuses only.
async function api(action:()=>Promise<APIResponse>):Promise<APIResponse> {
  try { return await action(); } catch { throw new Error('Private API transport failed'); }
}
async function json(response:APIResponse):Promise<Record<string,any>> {
  try { return await response.json(); } catch { throw new Error('Private API returned invalid JSON'); }
}
async function login(context:BrowserContext, principal:string):Promise<void> {
  const account = credentials(principal);
  const response = await api(()=>context.request.post('/api/hrm/auth/login', {data:{email:account.email,password:account.password}}));
  expect(response.status()).toBe(200);
  const me = await api(()=>context.request.get('/api/hrm/auth/me'));
  expect(me.status()).toBe(200);
  const current = await json(me);
  expect(current.authenticated).toBe(true);
  expect(current.user?.id).toBe(principal);
}
async function visible(page:Page, name:string):Promise<void> {
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
    const overlay = document.getElementById('erp-global-preloader');
    return !overlay || getComputedStyle(overlay).display === 'none' || getComputedStyle(overlay).pointerEvents === 'none';
  })).toBe(true);
}
async function mutation(page:Page, method:string, suffix:string, action:()=>Promise<unknown>) {
  const waiting = page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(suffix) && response.request().method()===method);
  await action(); const response = await waiting;
  expect(response.status()).toBe(method==='POST' && suffix==='/requests' ? 201 : 200);
  try { return await response.json() as Record<string,any>; } catch { throw new Error('Actual mutation returned invalid JSON'); }
}

test('normal cookie Core-only request draft create edit reload withdraw and ungranted denial',async({browser})=>{
  if (test.info().project.use.trace !== 'off' || test.info().project.use.screenshot !== 'off' || test.info().project.use.video !== 'off')
    throw new Error('Credential-safe proof requires capture disabled');
  retain(); let step='maker-login';
  const context = await browser.newContext({baseURL:proxy.origin,ignoreHTTPSErrors:true});
  let denied:BrowserContext|undefined; let failed=false;
  try {
    await login(context,fixture.makerPrincipalId); evidence.makerLocalCookieLoginVerified=true;
    // Existing UI selection headers are ordinary user context, not an authority
    // alias. Core validates this candidate selection before any business mutation.
    const selection = {'X-Shell-Entity':fixture.companyId,'X-Shell-Location':fixture.branchId};
    step='real-core-procurement-context';
    const response = await api(()=>context.request.get('/api/procurement/v1/context',{headers:selection}));
    expect(response.status()).toBe(200); const current=await json(response);
    expect(current.principalId).toBe(fixture.makerPrincipalId); expect(current.workerId).toBeNull();
    expect(current.tenantId).toBe(fixture.tenantId); expect(current.company?.id).toBe(fixture.companyId);
    expect(current.branch?.id).toBe(fixture.branchId);
    const currency=current.company?.currencyCode;
    expect(typeof currency==='string' && /^[A-Z]{3}$/.test(currency)).toBe(true);
    for (const action of ['procurement-request-read','procurement-request-create','procurement-request-edit'])
      expect(current.permissions.includes(action)).toBe(true);
    evidence.defaultCurrencyCode=currency; evidence.workerId=null;
    const page=await context.newPage();
    await page.addInitScript(value=>localStorage.setItem('erp.shell.state.v1',JSON.stringify(value)),
      {entityId:current.company.id,branch:current.branch.id});
    step='real-request-list';
    const listing=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/procurement/v1/requests' && r.request().method()==='GET');
    await page.goto('/procurement/workspace/requests'); await visible(page,'My Requests');
    const listed=await listing; expect(listed.status()).toBe(200);
    expect(listed.request().headers()['x-shell-entity']).toBe(fixture.companyId);
    expect(listed.request().headers()['x-shell-location']).toBe(fixture.branchId);
    step='create-draft';
    await page.getByRole('link',{name:'New request',exact:true}).first().click(); await visible(page,'New request');
    const prefix=`GW-P25-COOKIE-${randomUUID()}`;
    await page.getByLabel('What do you need?',{exact:true}).fill(prefix);
    await expect(page.getByLabel('Currency',{exact:true})).toHaveValue(currency);
    await page.getByLabel('Item or service 1',{exact:true}).fill('Retained normal-cookie synthetic supplies');
    await page.getByLabel('Quantity',{exact:true}).fill('2.1234');
    await page.getByLabel('Estimated unit price',{exact:true}).fill('10.2345');
    const created=await mutation(page,'POST','/requests',()=>page.getByRole('button',{name:'Save draft',exact:true}).click());
    expect(guid(created.id)).toBe(true); expect(created.requesterPrincipalId).toBe(fixture.makerPrincipalId);
    expect(created.requesterWorkerId).toBeNull(); expect(created.version).toBe(1);
    expect(Array.isArray(created.lines) && created.lines.length===1 && created.lines.every((line:any)=>guid(line.id))).toBe(true); expect(created.currencyCode).toBe(currency); expect(created.status).toBe('Draft');
    expect(created.lines[0].exactAmounts).toMatchObject({requestedQuantity:'2.1234',estimatedUnitPrice:'10.2345'});
    evidence.requestId=created.id; evidence.lineIds=created.lines.map((line:any)=>line.id);
    evidence.createdVersion=created.version; evidence.createdExactAmounts={requestedQuantity:created.lines[0].exactAmounts.requestedQuantity,estimatedUnitPrice:created.lines[0].exactAmounts.estimatedUnitPrice}; retain();
    await visible(page,prefix); await page.reload(); await visible(page,prefix);
    step='edit-draft';
    await page.getByRole('link',{name:'Edit request',exact:true}).click(); await visible(page,'Edit request');
    await page.getByLabel('Quantity',{exact:true}).fill('3.5678');
    const updated=await mutation(page,'PUT',`/requests/${created.id}`,()=>page.getByRole('button',{name:'Save draft',exact:true}).click());
    expect(updated.id).toBe(created.id); expect(updated.version).toBe(created.version+1);
    expect(updated.currencyCode).toBe(currency); expect(updated.requesterWorkerId).toBeNull();
    expect(updated.lines[0].exactAmounts).toMatchObject({requestedQuantity:'3.5678',estimatedUnitPrice:'10.2345'});
    evidence.updatedVersion=updated.version; evidence.updatedExactAmounts={requestedQuantity:updated.lines[0].exactAmounts.requestedQuantity,estimatedUnitPrice:updated.lines[0].exactAmounts.estimatedUnitPrice}; retain();
    await visible(page,prefix); await page.reload(); await visible(page,prefix);
    step='withdraw-draft';
    await page.getByRole('textbox',{name:/^Reason(?:\s|$)/}).fill('Retained private normal-cookie draft withdrawal');
    const withdrawn=await mutation(page,'POST',`/requests/${created.id}/withdraw`,()=>page.getByRole('button',{name:'Withdraw request',exact:true}).click());
    expect(withdrawn.id).toBe(created.id); expect(withdrawn.status).toBe('Withdrawn'); expect(withdrawn.version).toBe(updated.version+1);
    evidence.withdrawnVersion=withdrawn.version; evidence.finalStatus=withdrawn.status; retain();
    await page.reload(); await visible(page,prefix); await expect(page.getByText('Withdrawn',{exact:true})).toBeVisible();
    step='ungranted-normal-cookie-denial';
    denied=await browser.newContext({baseURL:proxy.origin,ignoreHTTPSErrors:true});
    await login(denied,fixture.ungrantedPrincipalId);
    const forbidden=await api(()=>denied!.request.get('/api/procurement/v1/context',{headers:selection}));
    expect(forbidden.status()).toBe(403);
    const forbiddenList=await api(()=>denied!.request.get('/api/procurement/v1/requests',{headers:selection}));
    expect(forbiddenList.status()).toBe(403);
    evidence.ungrantedLocalCookieLoginVerified=true; evidence.ungrantedProcurementDenied403=true;
    evidence.status='PASS_NORMAL_COOKIE_DRAFT_UI_ONLY'; evidence.browserDraftCrudVerified=true;
  } catch { failed=true; evidence.status='FAILED_RETAIN_FIXTURE'; evidence.failedStep=step; }
  finally {
    // Close before throwing to prevent automatic failure snapshots of authenticated
    // DOM/session context. No cookies/storageState/HAR/trace/screenshots exported.
    await denied?.close().catch(()=>undefined); await context.close().catch(()=>undefined); retain();
  }
  if (failed) throw new Error(`Normal-cookie proof failed at ${step}; inspect protected typed result and owning-store evidence`);
});

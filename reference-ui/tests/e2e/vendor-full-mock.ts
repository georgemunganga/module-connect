import { type Page } from "@playwright/test";
import { currentWorkspaceFixture, fixtureBranch, fixturePrincipal } from "./current-workspace-fixture";
export const company="11111111-1111-4111-8111-111111111111",worker="22222222-2222-4222-8222-222222222222",vendor="33333333-3333-4333-8333-333333333333",contact="44444444-4444-4444-8444-444444444444";
const capabilities=Object.fromEntries(["vendorDraft","itemDraft","requestDraft","approvals","sourcing","contracts","orders","receiving","invoiceIntake","invoiceValidation","financeHandoff","supplierPortal","planningDraft","configurationDraft","contractDraft","sourcingDraft"].map(key=>[key,key==="vendorDraft"]));
const site="55555555-5555-4555-8555-555555555555",qualification="66666666-6666-4666-8666-666666666666";
type Row=Record<string,unknown>;
/** Contract mocks only: not real persistence or authorization evidence. */
export async function fullVendorMock(page:Page,options:{edit?:boolean;denyEdit?:boolean;stale?:boolean;loseChild?:boolean;qualificationStatus?:string;secondBranch?:boolean}={}) {
  const writes:{method:string;path:string;body:Row}[]=[];
  let saved:Row={id:vendor,number:"VEN-1",legalName:"Full Vendor Ltd",displayName:"Full Vendor",countryCode:"ZM",status:"Draft",isOrderable:false,version:1,defaultCurrencyCode:"ZMW",isLocal:true,contacts:[{id:contact,name:"Jane",isPrimary:false}],sites:[],qualifications:options.qualificationStatus?[{id:qualification,qualificationType:"Reviewed clearance",reviewStatus:options.qualificationStatus}]:[],attributes:[],createdAt:"2026-10-22T00:00:00Z"};
  await page.addInitScript(id=>localStorage.setItem("erp.shell.state.v1",JSON.stringify({entityId:id})),company);
  await page.route("**/api/**",async route=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path==="/api/core/v1/workspace-context"){
      const workspace=currentWorkspaceFixture("mock",fixturePrincipal,[{companyId:company,branchId:fixtureBranch,code:"TEST",name:"Synthetic Company"}]);
      if(options.secondBranch)workspace.branches.push({id:"88888888-8888-4888-8888-888888888888",code:"ALT",name:"Other synthetic branch",legalEntityId:company,type:"Branch"});
      return json(workspace);
    }
    if(path==="/api/hrm/auth/me")return json({authenticated:true,user:{id:fixturePrincipal,isActive:true,roles:["procurement_buyer"],displayName:"Buyer"}});
    if(path==="/api/hrm/branding")return json({displayName:"Synthetic vendor contract"});
    if(path==="/api/hrm/admin/legal-entities")return json({items:[{id:company,code:"TEST",registeredName:"Synthetic Company"}]});
    if(path==="/api/hrm/admin/locations")return json({items:[]});
    if(path==="/api/hrm/shell/")return json({assignedLocationIds:[],confined:false});
    if(path==="/api/procurement/v1/context")return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenantId:"mock",legalEntityId:company,workerId:worker,permissions:["procurement-access","procurement-vendor-read","procurement-vendor-create","procurement-vendor-edit"],company:{id:company,name:"Synthetic Company",code:"TEST",currencyCode:"ZMW"}});
    if(path==="/api/procurement/v1/meta")return json({schemaReady:true,tenantId:"mock",legalEntityId:company,capabilities});
    if(method!=="GET"&&path.startsWith("/api/procurement/"))writes.push({method,path,body:request.postDataJSON()});
    if(path==="/api/procurement/v1/vendors"&&method==="GET")return json({items:[saved],total:1,page:1,pageSize:25});
    if(path==="/api/procurement/v1/vendors"&&method==="POST"){
      const draft=request.postDataJSON();saved={...saved,...draft,version:1,defaultCurrencyCode:draft.currencyCode,contacts:[...(draft.primaryContact?[{...draft.primaryContact,id:contact}]:[]),...(draft.contacts||[]).map((row:Row)=>({...row,id:contact}))],sites:(draft.sites||[]).map((row:Row)=>({...row,id:site})),qualifications:(draft.qualifications||[]).map((row:Row)=>({...row,id:qualification,reviewStatus:"Pending"})),attributes:(draft.attributes||[]).map((row:Row,index:number)=>({...row,id:`attribute-${index}`,version:1}))};return json({id:vendor,version:1,number:"VEN-1",possibleDuplicate:false},201);
    }
    if(path===`/api/procurement/v1/vendors/${vendor}`&&method==="GET")return options.denyEdit?json({message:"Forbidden"},403):json(saved);
    if(path===`/api/procurement/v1/vendors/${vendor}`&&method==="PUT"){
      const body=request.postDataJSON();if(options.stale||body.version!==saved.version)return json({message:"Vendor changed"},409);
      saved={...saved,...body.draft,defaultCurrencyCode:body.draft.currencyCode,version:Number(saved.version)+1};return json({id:vendor,version:saved.version,status:saved.status});
    }
    if(path===`/api/procurement/v1/vendors/${vendor}/contacts/${contact}`&&method==="PUT"){
      const body=request.postDataJSON();if(options.stale||body.version!==saved.version)return json({message:"Vendor changed"},409);
      saved={...saved,contacts:[{...body.contact,id:contact}],version:Number(saved.version)+1};if(options.loseChild)return route.abort("failed");return json({id:contact,version:saved.version});
    }
    return json({message:`Unexpected mock contract route ${method} ${path}`},404);
  });
  return {writes,read:()=>saved};
}

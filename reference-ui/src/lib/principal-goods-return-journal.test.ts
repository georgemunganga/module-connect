import { describe, expect, it } from "vitest";
import { goodsReturnJournal, type ReturnJournalScope } from "./principal-goods-return-journal";
import type { ReturnCommand } from "./principal-goods-return-api";
const id = (n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
const scope:ReturnJournalScope={tenantId:"amizo",companyId:id(1),principalId:id(2),branchId:id(3),recordId:"new"};
const command:ReturnCommand={operation:"Create",key:id(4),targetId:null,method:"POST",body:JSON.stringify({acceptanceFactId:id(5),quantity:"0.5001",reason:"Wrong colour",evidenceReference:null})};
function memory(){const values=new Map<string,string>();return{
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},
  removeItem:(key:string)=>{values.delete(key);},key:(_index:number)=>null,get length(){return values.size;},clear:()=>values.clear(),values,
} as Storage&{values:Map<string,string>};}
describe("goods return session recovery journal",()=>{
  it("retains the exact typed command across reload and clears only its matching key and body",()=>{
    const storage=memory();goodsReturnJournal.claim(scope,command,storage);
    expect(goodsReturnJournal.read(scope,storage)).toEqual(command);
    expect(()=>goodsReturnJournal.claim(scope,{...command,key:id(6)},storage)).toThrow("earlier return");
    expect(()=>goodsReturnJournal.clear(scope,{...command,body:"{}"},storage)).toThrow("changed");
    goodsReturnJournal.clear(scope,command,storage);expect(goodsReturnJournal.read(scope,storage)).toBeNull();
  });
  it("fails closed for a substituted company, branch, principal, record, key or body",()=>{
    const storage=memory();goodsReturnJournal.claim(scope,command,storage);
    const key=[...storage.values.keys()][0],original=JSON.parse(storage.values.get(key)!) as Record<string,unknown>;
    for(const mutated of [
      {...original,scope:{...scope,branchId:id(7)}},
      {...original,scope:{...scope,principalId:id(8)}},
      {...original,scope:{...scope,companyId:id(9)}},
      {...original,scope:{...scope,recordId:id(10)}},
      {...original,command:{...command,key:"invalid"}},
      {...original,command:{...command,body:JSON.stringify({acceptanceFactId:id(11),quantity:"0.5001",reason:"Wrong colour",evidenceReference:null,extra:true})}},
    ]){storage.values.set(key,JSON.stringify(mutated));expect(()=>goodsReturnJournal.read(scope,storage)).toThrow("needs review");}
  });
  it("never sends when storage is unavailable, oversize, or corrupted",()=>{
    const storage=memory();const bad={...storage,getItem:()=>{throw new Error("denied");}} as Storage;
    expect(()=>goodsReturnJournal.claim(scope,command,bad)).toThrow("storage is unavailable");
    expect(()=>goodsReturnJournal.claim(scope,{...command,body:"x".repeat(12001)},storage)).toThrow();
    storage.values.set("erp.procurement.goods-return-command.v1:"+[scope.tenantId,scope.companyId,scope.principalId,scope.branchId,scope.recordId].join(":"),"{");
    expect(()=>goodsReturnJournal.read(scope,storage)).toThrow("needs review");
  });
  it("validates the original cancel CAS and retained value pins",()=>{
    const editScope={...scope,recordId:id(12)},storage=memory();
    const cancel:ReturnCommand={operation:"Cancel",key:id(13),targetId:id(12),method:"POST",body:JSON.stringify({expectedRevision:2,reason:"Withdrawn"}),
      prior:{quantityExact:"0.5",evidenceReference:"DN-1"}};
    goodsReturnJournal.claim(editScope,cancel,storage);expect(goodsReturnJournal.read(editScope,storage)).toEqual(cancel);
    expect(()=>goodsReturnJournal.claim(editScope,{...cancel,prior:undefined},memory())).toThrow();
  });
});

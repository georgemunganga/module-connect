import { afterEach, describe, expect, it, vi } from "vitest";
import { principalOrderJournal } from "./principal-order-command-journal";
import type { PrincipalCommand } from "../../../src/platform/procurement-principal-orders-api";

const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
function memory(){const map=new Map<string,string>();return {map,getItem:(key:string)=>map.get(key)??null,
  setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}};}
const command:PrincipalCommand={operation:"Create",key:id(1),orderId:null,body:'{"externalEvidenceReference":"private proof"}'};
afterEach(()=>vi.unstubAllGlobals());
describe("principal order command journal",()=>{
  it("persists only a scoped locator before POST and retains it across reload",()=>{
    const storage=memory();vi.stubGlobal("sessionStorage",storage);
    const locator=principalOrderJournal.claim("tenant:company:buyer:branch:new",command);
    expect(principalOrderJournal.read("tenant:company:buyer:branch:new")).toEqual(locator);
    expect([...storage.map.values()][0]).not.toContain("private proof");
    expect(()=>principalOrderJournal.claim("tenant:company:buyer:branch:new",{...command,key:id(2)})).toThrow();
    expect(principalOrderJournal.read("tenant:company:other:branch:new")).toBeNull();
    principalOrderJournal.clear("tenant:company:buyer:branch:new",locator);
    expect(principalOrderJournal.read("tenant:company:buyer:branch:new")).toBeNull();
  });
  it("blocks malformed storage and failed write verification",()=>{
    const storage=memory();vi.stubGlobal("sessionStorage",storage);storage.setItem("erp.procurement.principal-order-command.v1:scope",'{"operation":"Create","key":"bad"}');
    expect(()=>principalOrderJournal.read("scope")).toThrow();
    const dropped={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    vi.stubGlobal("sessionStorage",dropped);expect(()=>principalOrderJournal.claim("scope",command)).toThrow();
  });
});

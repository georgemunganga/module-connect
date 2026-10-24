import { describe, expect, it } from "vitest";
import type { PrincipalOrderDetail } from "../../../src/platform/procurement-principal-orders-api";
import { draftEditProblem } from "./principal-order-draft-edit";

const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
const saved:PrincipalOrderDetail={id:id(1),number:"PO-1",status:"Draft",version:1,supplierId:id(2),
  branchRef:id(3),currencyCode:"ZMW",originalDirectSourceSha256:"a".repeat(64),
  shipToRef:"",billToRef:"",paymentTermRef:"",expectedDeliveryOn:null,fundingRecorded:false,
  release:null,releaseConfirmation:null,lines:[{id:id(4),lineNumber:1,description:"Laptop",unitCode:"EA",
    quantity:"1.0001",unitPrice:"1.0001",taxAmount:"0.0001",purchaseRequestId:id(5),allocationStatus:"Reserved"}]};
const draft=()=>({supplierId:id(2),currencyCode:"ZMW",shipToRef:"",billToRef:"",paymentTermRef:"",
  expectedDeliveryOn:null,lines:[{id:id(4),description:"Laptop",unitCode:"EA",quantity:"1.0001",
    unitPrice:"1.0001",taxAmount:"0.0001"}]});

describe("unfunded principal PO draft edit guidance",()=>{
  it("keeps supplier, currency, source line and unit fixed",()=>{
    expect(draftEditProblem(saved,draft())).toBeNull();
    expect(draftEditProblem(saved,{...draft(),supplierId:id(9)})).toMatch(/supplier/);
    expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],id:id(9)}]})).toMatch(/line/);
    expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],unitCode:"BOX"}]})).toMatch(/unit/);
  });
  it("uses exact four-place integers to limit price, line value and tax while allowing capacity-checked quantity growth",()=>{
    for(const changed of [{quantity:"1.0002"},{unitPrice:"1.0002"},{taxAmount:"0.0002"},
      {quantity:"0.0000"},{quantity:"1e3"}])
      expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],...changed}]})).not.toBeNull();
    expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],quantity:"1.0000"}]})).toBeNull();
    expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],quantity:"1.0002",unitPrice:"1.0000"}]})).toBeNull();
    expect(draftEditProblem(saved,{...draft(),lines:[{...draft().lines[0],quantity:"1.0003",unitPrice:"1.0000"}]})).toMatch(/line value/);
  });
});

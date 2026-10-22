import { afterEach, describe, expect, it, vi } from "vitest";
import { addVendorContact, addVendorSite, VendorApiError } from "../../../src/platform/procurement-vendors-api";
const company="11111111-1111-4111-8111-111111111111",vendor="22222222-2222-4222-8222-222222222222",child="33333333-3333-4333-8333-333333333333";
afterEach(()=>vi.unstubAllGlobals());
describe("supplier child persistence receipts",()=>{
  it("retains authoritative child ID and supplier CAS rather than deriving from names",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:child,version:9}),{status:201}));vi.stubGlobal("fetch",fetcher);
    expect(await addVendorContact(company,vendor,8,{name:"Same display name",isPrimary:false})).toEqual({id:child,version:9});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({version:8,contact:{name:"Same display name",isPrimary:false}});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not treat invalid or lost write acknowledgements as success or retry",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({version:2}),{status:201}));vi.stubGlobal("fetch",fetcher);
    await expect(addVendorSite(company,vendor,1,{kind:"Billing",addressLine1:"Street",countryCode:"ZM",isPrimary:true,isServiceSite:false})).rejects.toMatchObject({status:0});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves explicit stale/no-effect server rejection for editable form recovery",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:"Vendor changed"}),{status:409}));vi.stubGlobal("fetch",fetcher);
    await expect(addVendorContact(company,vendor,1,{name:"Jane",isPrimary:false})).rejects.toBeInstanceOf(VendorApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

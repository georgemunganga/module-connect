import { describe,expect,it,vi } from "vitest";
import { AUTH_CONTEXT_KEY,AUTH_CONTEXT_EVENT,observeAuthContext } from "./auth-context-invalidation";
function setup(){const host=new EventTarget();const change=vi.fn();const stop=observeAuthContext(host as unknown as Window,change);return {host,change,stop};}
function storage(key:string|null){const event=new Event("storage");Object.defineProperty(event,"key",{value:key});return event;}
describe("canonical auth generation only",()=>{
  it("reacts to public cookie-account nonce without inspecting credentials",()=>{const {host,change}=setup();host.dispatchEvent(storage(AUTH_CONTEXT_KEY));host.dispatchEvent(new Event(AUTH_CONTEXT_EVENT));expect(change).toHaveBeenCalledTimes(2);});
  it("ordinary blur/focus/pageshow never invalidates or discards unsaved state",()=>{const {host,change}=setup();for(const kind of ["blur","focus","pageshow","visibilitychange"])host.dispatchEvent(new Event(kind));expect(change).not.toHaveBeenCalled();});
  it("ignores sibling token refresh/settings and conservatively handles storage clear",()=>{const {host,change}=setup();host.dispatchEvent(storage("erp.company-branding.v1"));host.dispatchEvent(storage("erp.oidc.session"));expect(change).not.toHaveBeenCalled();host.dispatchEvent(storage(null));expect(change).toHaveBeenCalledTimes(1);});
  it("unsubscription prevents old callback invocation",()=>{const {host,change,stop}=setup();stop();host.dispatchEvent(storage(AUTH_CONTEXT_KEY));host.dispatchEvent(new Event(AUTH_CONTEXT_EVENT));expect(change).not.toHaveBeenCalled();});
});

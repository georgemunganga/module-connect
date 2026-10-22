export const AUTH_CONTEXT_KEY = "erp.auth-context.v1";
export const AUTH_CONTEXT_EVENT = "erp:auth-context-changed";
type WindowPort = Pick<Window,"addEventListener"|"removeEventListener">;
/** Public lifecycle invalidation only; no token parsing, timers or focus/visibility behavior. */
export function observeAuthContext(host: WindowPort, invalidate: ()=>void): ()=>void {
  const storage=(event:Event)=>{const key=(event as StorageEvent).key;if(key===null||key===AUTH_CONTEXT_KEY)invalidate();};
  host.addEventListener("storage",storage);host.addEventListener(AUTH_CONTEXT_EVENT,invalidate);
  return()=>{host.removeEventListener("storage",storage);host.removeEventListener(AUTH_CONTEXT_EVENT,invalidate);};
}

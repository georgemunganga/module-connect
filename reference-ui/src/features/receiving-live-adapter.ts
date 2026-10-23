import * as legacy from "../../../src/platform/procurement-receiving-api";
import * as principal from "../../../src/platform/procurement-principal-receiving-api";
/** Explicit backend capability selects the transport; permissions/employee presence do not. */
const old = { ...legacy, getReceipt: (company: string, id: string, task: boolean, signal?: AbortSignal, _acceptance = false) => legacy.getReceipt(company, id, task, signal) };
const current = { ...legacy, listReceiving: principal.listPrincipalReceiving, listReceivingSources: principal.listPrincipalReceivingSources,
  getReceipt: principal.getPrincipalReceipt, getService: principal.getPrincipalService,
  sendReceiving: principal.sendPrincipalReceiving, recoverReceiving: principal.recoverPrincipalReceiving };
export const receivingAdapter = (enabled: boolean) => enabled ? current : old;

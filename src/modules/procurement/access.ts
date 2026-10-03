import type { Role } from "@/mock/types";

export const procurementEntity = (entityId: string) => entityId === "ent-ke" ? "Kenya" : entityId === "ent-de" ? "Germany" : "Netherlands";
export const procurementEntityName = (entityId: string) => entityId === "ent-ke" ? "Meridian Kenya Ltd" : entityId === "ent-de" ? "Meridian GmbH" : "Meridian Netherlands B.V.";
export const sameEntity = (recordEntity: string | undefined, entityId: string) => Boolean(recordEntity && recordEntity.includes(procurementEntity(entityId)));
export const internalRole = (role: Role) => role !== "supplier_user";
export const operationsRole = (role: Role) => ["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"].includes(role);
export const sourcingRole = (role: Role) => ["buyer", "proc_admin", "auditor"].includes(role);
export const supplierRole = (role: Role) => ["buyer", "supplier_steward", "proc_admin", "auditor"].includes(role);
export const requesterRole = (role: Role) => ["employee", "manager", "hr_ops", "payroll", "hr_admin"].includes(role);
export const demoRequester = (role: Role, entityId: string) => entityId === "ent-ke" ? role === "manager" ? "Grace Wanjiru" : "Daniel Otieno" : role === "manager" ? "Lukas Brandt" : "Amara Chukwuemeka-Van der Berghe";
export const isDemoRequester = (requester: string, role: Role, entityId: string) => requester === demoRequester(role, entityId) || entityId === "ent-ke" && role !== "manager" && requester === "Otieno Odhiambo";
export const demoManagerForEntity = (recordEntity: string) => recordEntity.includes("Kenya") ? "Grace Wanjiru" : "Lukas Brandt";
export const demoApprovalActors = (entityId: string) => entityId === "ent-ke" ? ["Grace Wanjiru", "Daniel Otieno"] : entityId === "ent-de" ? ["Lukas Brandt", "Joost Meijer", "Marieke Hoek"] : ["Lukas Brandt", "Marieke Hoek", "Joost Meijer", "Priya Raman", "Ines Vogel (IT)"];
export const approvalActorForEntity = (selected: { entityId: string; name: string } | null, entityId: string) => selected?.entityId === entityId && demoApprovalActors(entityId).includes(selected.name) ? selected.name : demoApprovalActors(entityId)[0];
export const requestVisible = (role: Role, entityId: string, recordEntity: string | undefined, requester: string, department?: string) => internalRole(role) && sameEntity(recordEntity, entityId) && (operationsRole(role) || role === "manager" && (department === (entityId === "ent-ke" ? "Operations" : "Engineering") || isDemoRequester(requester, role, entityId)) || isDemoRequester(requester, role, entityId));

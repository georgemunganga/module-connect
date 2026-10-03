import type { Role } from "@/mock/types";

export const procurementEntity = (entityId: string) => entityId === "ent-ke" ? "Kenya" : entityId === "ent-de" ? "Germany" : "Netherlands";
export const sameEntity = (recordEntity: string | undefined, entityId: string) => Boolean(recordEntity && recordEntity.includes(procurementEntity(entityId)));
export const internalRole = (role: Role) => role !== "supplier_user";
export const operationsRole = (role: Role) => ["buyer", "supplier_steward", "receiver", "ap_processor", "proc_admin", "auditor"].includes(role);
export const sourcingRole = (role: Role) => ["buyer", "proc_admin", "auditor"].includes(role);
export const supplierRole = (role: Role) => ["buyer", "supplier_steward", "proc_admin", "auditor"].includes(role);
export const requestVisible = (role: Role, entityId: string, recordEntity: string | undefined, requester: string) => internalRole(role) && sameEntity(recordEntity, entityId) && (operationsRole(role) || role === "manager" || requester.startsWith("Amara"));

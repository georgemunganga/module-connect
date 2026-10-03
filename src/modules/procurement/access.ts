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
export const demoManagerForEntity = (recordEntity: string) => recordEntity.includes("Kenya") ? "Grace Wanjiru" : "Lukas Brandt";
export const requestVisible = (role: Role, entityId: string, recordEntity: string | undefined, requester: string, department?: string) => internalRole(role) && sameEntity(recordEntity, entityId) && (operationsRole(role) || role === "manager" && (department === (entityId === "ent-ke" ? "Operations" : "Engineering") || requester === demoRequester(role, entityId)) || requester === demoRequester(role, entityId));

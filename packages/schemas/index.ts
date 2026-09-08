import { z } from 'zod';
import type { Project } from '../contracts/index.ts';
const number = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const fraction = z.number().finite().min(0).max(1);
const efficiency = z.number().finite().gt(0).lte(1);
const station = z.object({ batteries: positive.int().max(500), capacityKWh: positive.max(5000), readySOC: fraction, returnSOC: fraction, bays: positive.int().max(100), swapMinutes: positive.min(.1), guns: positive.int().max(100), gunKW: positive, chargePoolKW: positive, batteryChargeKW: positive, auxiliaryKW: number }).refine(s => s.readySOC > s.returnSOC, 'Ready SOC must exceed return SOC');
const row = z.object({ hour: number.int().max(23), station: z.enum(['A', 'B']), swapCount: number.int().max(1000), swapKWh: number, chargeCount: number.int().max(1000), chargeKWh: number, idleRaw: number.nullable(), gridPrice: number, swapFee: number, chargeFee: number, swapTotalRaw: number, chargeTotalRaw: number }).refine(r => (r.swapCount > 0 || r.swapKWh === 0) && (r.chargeCount > 0 || r.chargeKWh === 0), 'Energy requires a nonzero session count');
export const projectSchema = z.object({ schemaVersion: z.literal('1.1'), name: z.string().min(1).max(120), seed: number.int().max(4294967295), phase: z.union([z.literal(1), z.literal(2)]), mode: z.enum(['SOURCE_REPLAY', 'CONSTRAINED']), strategy: z.enum(['IMMEDIATE', 'TOU']), arrival: z.enum(['SCHEDULED', 'SEEDED']), topology: z.object({ nodes: z.array(z.object({ id: z.string().min(1), type: z.string(), name: z.string(), station: z.enum(['A', 'B']), x: z.number().finite(), y: z.number().finite(), enabled: z.boolean(), params: z.record(number) })).min(1).max(100), edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), enabled: z.boolean() })).max(200) }), services: z.array(row).length(48), station: z.object({ A: station, B: station }), efficiency: z.object({ mode: z.enum(['SOURCE_CHAIN', 'ASSEMBLY']), sst: efficiency, transformer: efficiency, pcs: efficiency, charger: efficiency, sstSource: efficiency, pcsSource: efficiency }), billing: z.enum(['EXACT_COMPONENTS', 'SOURCE_DISPLAY_PRICE']), finance: z.object({ capex: number.nullable(), fixedDaily: number.nullable(), variablePerKWh: number, discountRate: z.number().finite().min(0).max(1), years: positive.int().max(30), rampMonths: number.int().max(120), startLoad: fraction, operatingDaysPerYear: positive.max(366) }), sources: z.array(z.object({ id: z.string(), status: z.string(), note: z.string() })) }).superRefine((p, ctx) => { const keys = new Set(p.services.map(r => `${r.station}:${r.hour}`)); if (keys.size !== 48)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each station must have exactly 24 unique hours' }); if (p.services.reduce((sum, r) => sum + r.swapCount + r.chargeCount, 0) > 20000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Interactive simulation supports at most 20,000 requests' }); });
export function parseProject(input: unknown): Project { return projectSchema.parse(input); }
export function migrateProject(input: unknown): Project { const p = structuredClone(input) as Record<string, unknown>; if (p.schemaVersion === '1.0') {
    p.schemaVersion = '1.1';
    p.arrival ??= 'SCHEDULED';
    p.sources ??= [];
} return parseProject(p); }

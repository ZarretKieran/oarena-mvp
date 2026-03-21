import type { GeneralStatus, AdditionalStatus, StrokeData, SplitData } from './types.js';
/** Read a 24-bit unsigned integer in little-endian from a DataView. */
export declare function readUint24LE(dv: DataView, offset: number): number;
/**
 * Parse General Status notification (ce060031), 19 bytes.
 * Returns null if buffer is too short.
 */
export declare function parseGeneralStatus(dv: DataView): GeneralStatus | null;
/**
 * Parse Additional Status notification (ce060032), 16 bytes.
 * Returns null if buffer is too short.
 */
export declare function parseAdditionalStatus(dv: DataView): AdditionalStatus | null;
/**
 * Parse Stroke Data notification (ce060035), 20 bytes.
 * Returns null if buffer is too short.
 */
export declare function parseStrokeData(dv: DataView): StrokeData | null;
/**
 * Parse Split/Interval Data notification (ce060037), 18 bytes.
 * Returns null if buffer is too short.
 */
export declare function parseSplitData(dv: DataView): SplitData | null;
/**
 * Calculate watts from pace (seconds per 500m).
 * Formula: 2.80 / (pace_per_meter ^ 3)
 */
export declare function wattsFromPace(paceSeconds: number): number;
/**
 * Calculate total calories burned from average watts and elapsed seconds.
 * Uses the Concept2 approximation: cal/hr = watts * 4 + 300 (when watts >= 50).
 */
export declare function caloriesFromWattsAndTime(watts: number, seconds: number): number;
//# sourceMappingURL=parsers.d.ts.map
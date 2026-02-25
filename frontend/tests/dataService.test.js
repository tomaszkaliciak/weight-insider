import { describe, it, expect } from 'vitest';
import { DataService } from '../js/core/dataService.js';
import { CONFIG } from '../js/config.js';

describe('DataService', () => {
    describe('calculateBodyComposition', () => {
        it('calculates lean body mass and fat mass correctly', () => {
            const data = [{ value: 100, bfPercent: 20 }];
            const result = DataService.calculateBodyComposition(data);
            expect(result[0].lbm).toBe(80);
            expect(result[0].fm).toBe(20);
        });

        it('returns nulls if weight or bfPercent is missing or invalid', () => {
            const data = [
                { value: 100, bfPercent: null },
                { value: null, bfPercent: 20 },
                { value: 100, bfPercent: 120 } // invalid bf%
            ];
            const result = DataService.calculateBodyComposition(data);
            expect(result[0].lbm).toBeNull();
            expect(result[1].lbm).toBeNull();
            expect(result[2].lbm).toBeNull();
        });
    });

    describe('calculateEMA', () => {
        it('calculates the Exponential Moving Average correctly', () => {
            // Default emaWindow is 7
            // alpha = 2 / (7 + 1) = 0.25

            const data = [
                { value: 10 },
                { value: 20 },
                { value: 30 }
            ];
            const result = DataService.calculateEMA(data);

            // i=0: EMA = 10
            // i=1: EMA = 20 * 0.25 + 10 * 0.75 = 5 + 7.5 = 12.5
            // i=2: EMA = 30 * 0.25 + 12.5 * 0.75 = 7.5 + 9.375 = 16.875
            expect(result[0].ema).toBe(10);
            expect(result[1].ema).toBe(12.5);
            expect(result[2].ema).toBe(16.875);
        });

        it('carries forward the last valid EMA if current value is null', () => {
            const data = [
                { value: 10 },
                { value: null },
            ];
            const result = DataService.calculateEMA(data);
            expect(result[0].ema).toBe(10);
            expect(result[1].ema).toBe(10);
        });
    });
});

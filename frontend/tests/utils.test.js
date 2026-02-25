import { describe, it, expect } from 'vitest';
import { Utils } from '../js/core/utils.js';

describe('Utils', () => {
    describe('formatValue', () => {
        it('formats a number to 2 decimal places by default', () => {
            expect(Utils.formatValue(10.1234)).toBe('10.12');
        });

        it('formats a number to a specific number of decimal places', () => {
            expect(Utils.formatValue(10.1234, 3)).toBe('10.123');
            expect(Utils.formatValue(10.1234, 0)).toBe('10');
        });

        it('returns N/A for null or undefined', () => {
            expect(Utils.formatValue(null)).toBe('N/A');
            expect(Utils.formatValue(undefined)).toBe('N/A');
        });

        it('returns N/A for NaN', () => {
            expect(Utils.formatValue(NaN)).toBe('N/A');
            expect(Utils.formatValue('invalid')).toBe('N/A');
        });
    });

    describe('parseDateDMY', () => {
        it('parses a valid DD-MM-YYYY string into a Date object', () => {
            const date = Utils.parseDateDMY('15-05-2024');
            expect(date).toBeInstanceOf(Date);
            expect(date.getFullYear()).toBe(2024);
            expect(date.getMonth()).toBe(4); // 0-indexed
            expect(date.getDate()).toBe(15);
        });

        it('returns null for invalid strings', () => {
            expect(Utils.parseDateDMY('invalid')).toBeNull();
            expect(Utils.parseDateDMY(null)).toBeNull();
            expect(Utils.parseDateDMY('32-13-2024')).toBeNull();
        });
    });

    describe('calculateRollingAverage', () => {
        it('returns an array of nulls if data is empty or invalid window', () => {
            expect(Utils.calculateRollingAverage([], 3)).toEqual([]);
            expect(Utils.calculateRollingAverage([1, 2], 0)).toEqual([null, null]);
        });

        it('calculates the average correctly for a simple window', () => {
            const data = [10, 20, 30, 40, 50];
            // Note: for windowSize=3, the logic in calculateRollingAverage is a bit weird as implemented in utils.js
            // It uses a queue and calculates the average of valid points in the current window.
            // Let's test the behavior directly.
            const result = Utils.calculateRollingAverage(data, 3);
            // Expected logic:
            // i=0: [10], avg = 10
            // i=1: [10, 20], avg = 15
            // i=2: [10, 20, 30], avg = 20
            // i=3: [20, 30, 40], avg = 30
            // i=4: [30, 40, 50], avg = 40
            expect(result).toEqual([10, 15, 20, 30, 40]);
        });

        it('handles nulls correctly within the window', () => {
            const data = [10, null, 30, 40];
            const result = Utils.calculateRollingAverage(data, 3);
            // i=0: window=[10], sum=10, count=1, avg=10
            // i=1: window=[10, null], sum=10, count=1, avg=10
            // i=2: window=[10, null, 30], sum=40, count=2, avg=20
            // i=3: window=[null, 30, 40], sum=70, count=2, avg=35 (10 dropped)
            expect(result).toEqual([10, 10, 20, 35]);
        });
    });

    describe('deepClone', () => {
        it('deep clones an object without mutating original', () => {
            const original = { a: 1, b: { c: 2 } };
            const clone = Utils.deepClone(original);
            clone.b.c = 3;
            expect(original.b.c).toBe(2);
            expect(clone.b.c).toBe(3);
        });

        it('clones arrays correctly', () => {
            const original = [1, [2, 3]];
            const clone = Utils.deepClone(original);
            clone[1][0] = 99;
            expect(original[1][0]).toBe(2);
            expect(clone[1][0]).toBe(99);
        });

        it('clones Dates correctly', () => {
            const original = { date: new Date('2024-01-01') };
            const clone = Utils.deepClone(original);
            clone.date.setFullYear(2025);
            expect(original.date.getFullYear()).toBe(2024);
            expect(clone.date.getFullYear()).toBe(2025);
        });
    });
});

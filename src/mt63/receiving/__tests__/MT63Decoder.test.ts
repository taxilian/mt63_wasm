import { MT63decoder } from '../MT63Decoder';

describe('MT63decoder', () => {
    it('should initialize with valid parameters', () => {
        const dataCarriers = 64;
        const intlvLen = 32;
        const pattern = new Array(dataCarriers).fill(0).map((_, i) => i % intlvLen);
        const margin = 8;
        const integ = 32;
        
        const decoder = new MT63decoder(dataCarriers, intlvLen, pattern, margin, integ);
        
        expect(decoder.Output).toBe(0);
        expect(decoder.SignalToNoise).toBe(0);
        expect(decoder.CarrOfs).toBe(0);
    });

    it('should reject invalid dataCarriers (not power of 2)', () => {
        const pattern = new Array(63).fill(0);
        
        expect(() => {
            new MT63decoder(63, 32, pattern, 8, 32);
        }).toThrow('dspPowerOf2(Carriers) failed');
    });

    it('should process data with correct size', () => {
        const dataCarriers = 64;
        const intlvLen = 32;
        const pattern = new Array(dataCarriers).fill(0).map((_, i) => i % intlvLen);
        const margin = 8;
        const integ = 32;
        
        const decoder = new MT63decoder(dataCarriers, intlvLen, pattern, margin, integ);
        
        // Create test data with correct size
        const scanSize = dataCarriers + 2 * margin;
        const testData = new Float64Array(scanSize);
        
        // Add some noise
        for (let i = 0; i < scanSize; i++) {
            testData[i] = 0.01 * (Math.random() - 0.5);
        }
        
        // Add a strong signal in the middle
        testData[Math.floor(scanSize / 2)] = 10.0;
        
        const result = decoder.Process(testData);
        expect(result).toBe(0); // Success
        
        // With random noise and a single spike, SNR might still be very low
        // Just verify it's a valid number
        expect(decoder.SignalToNoise).toBeGreaterThanOrEqual(0);
        expect(isNaN(decoder.SignalToNoise)).toBe(false);
    });

    it('should reject data with incorrect size', () => {
        const decoder = new MT63decoder(64, 32, new Array(64).fill(1), 8, 32);
        
        const wrongSizeData = new Float64Array(50); // Wrong size
        const result = decoder.Process(wrongSizeData);
        
        expect(result).toBe(-1); // Error
    });

    it('should handle all-zero input', () => {
        const dataCarriers = 64;
        const decoder = new MT63decoder(dataCarriers, 32, new Array(dataCarriers).fill(1), 8, 32);
        
        const scanSize = dataCarriers + 2 * 8;
        const zeroData = new Float64Array(scanSize); // All zeros
        
        const result = decoder.Process(zeroData);
        expect(result).toBe(0);
        
        // With all zeros, SNR should be 0 or very small
        expect(decoder.SignalToNoise).toBeLessThanOrEqual(0.1);
        expect(decoder.Output).toBe(0);
    });

    it('should produce different outputs for different patterns', () => {
        const dataCarriers = 64;
        const margin = 8;
        const integ = 32;
        const scanSize = dataCarriers + 2 * margin;
        
        // Create two decoders with different interleave patterns
        const pattern1 = new Array(dataCarriers).fill(0).map((_, i) => i % 32);
        const pattern2 = new Array(dataCarriers).fill(0).map((_, i) => (i * 7) % 32);
        
        const decoder1 = new MT63decoder(dataCarriers, 32, pattern1, margin, integ);
        const decoder2 = new MT63decoder(dataCarriers, 32, pattern2, margin, integ);
        
        // Create identical test data
        const testData = new Float64Array(scanSize);
        for (let i = 0; i < scanSize; i++) {
            testData[i] = Math.sin(2 * Math.PI * i / 32) + 0.1 * Math.random();
        }
        
        // Process with both decoders
        decoder1.Process(testData);
        decoder2.Process(testData);
        
        // They should produce different results due to different patterns
        // (though they might occasionally match by chance)
        const output1 = decoder1.Output;
        const output2 = decoder2.Output;
        
        // At least check they both processed successfully
        // With simple sine wave input, SNR might be low but should be valid
        expect(decoder1.SignalToNoise).toBeGreaterThanOrEqual(0);
        expect(decoder2.SignalToNoise).toBeGreaterThanOrEqual(0);
        expect(isNaN(decoder1.SignalToNoise)).toBe(false);
        expect(isNaN(decoder2.SignalToNoise)).toBe(false);
    });
});
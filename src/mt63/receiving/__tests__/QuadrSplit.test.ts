import { DspQuadrSplit } from '../QuadrSplit';
import { dspWindowBlackman3 } from '../../dsp';

describe('DspQuadrSplit', () => {
    it('should initialize properly', () => {
        const split = new DspQuadrSplit();
        const filterLen = 128;
        const decimateRate = 8;
        
        const result = split.preset(filterLen, null, null, decimateRate);
        expect(result).toBe(0);
    });

    it('should compute filter shape', () => {
        const split = new DspQuadrSplit();
        const filterLen = 128;
        const decimateRate = 8;
        const omega_low = 0.1 * Math.PI;
        const omega_high = 0.4 * Math.PI;
        
        split.preset(filterLen, null, null, decimateRate);
        const result = split.computeShape(omega_low, omega_high, dspWindowBlackman3);
        expect(result).toBe(0);
    });

    it('should process sine wave input', () => {
        const split = new DspQuadrSplit();
        const filterLen = 128;
        const decimateRate = 8;
        const omega_low = 0.1 * Math.PI;
        const omega_high = 0.4 * Math.PI;
        
        split.preset(filterLen, null, null, decimateRate);
        split.computeShape(omega_low, omega_high, dspWindowBlackman3);
        
        // Create test sine wave
        const inputLen = 256;
        const freq = 0.25 * Math.PI;
        const input: number[] = [];
        for (let i = 0; i < inputLen; i++) {
            input[i] = Math.sin(freq * i);
        }
        
        const output = split.process(input);
        
        // Should produce decimated output
        expect(output.length).toBe(Math.floor((inputLen - filterLen) / decimateRate) + 1);
        
        // First sample might not be zero if filter has immediate response
        // Just check it produced valid output
        expect(output[0]).toHaveProperty('re');
        expect(output[0]).toHaveProperty('im');
        expect(isNaN(output[0].re)).toBe(false);
        expect(isNaN(output[0].im)).toBe(false);
        
        // Later samples should have significant magnitude
        const midIdx = Math.floor(output.length / 2);
        const midMag = Math.sqrt(output[midIdx].re ** 2 + output[midIdx].im ** 2);
        expect(midMag).toBeGreaterThan(0.1);
    });

    it('should handle multiple process calls correctly', () => {
        const split = new DspQuadrSplit();
        const filterLen = 64;
        const decimateRate = 4;
        
        split.preset(filterLen, null, null, decimateRate);
        split.computeShape(0.2 * Math.PI, 0.3 * Math.PI);
        
        // Process in chunks
        const chunk1 = new Array(100).fill(0).map((_, i) => Math.sin(0.1 * Math.PI * i));
        const chunk2 = new Array(100).fill(0).map((_, i) => Math.sin(0.1 * Math.PI * (i + 100)));
        
        const output1 = split.process(chunk1);
        const output2 = split.process(chunk2);
        
        // Both should produce output
        expect(output1.length).toBeGreaterThan(0);
        expect(output2.length).toBeGreaterThan(0);
        
        // Total output should be consistent with decimation
        const totalInput = 200;
        const expectedOutput = Math.floor((totalInput - filterLen) / decimateRate) + 1;
        expect(output1.length + output2.length).toBeLessThanOrEqual(expectedOutput + 1);
    });

    it('should produce zero output for zero input', () => {
        const split = new DspQuadrSplit();
        split.preset(128, null, null, 8);
        split.computeShape(0.1 * Math.PI, 0.4 * Math.PI);
        
        const input = new Array(256).fill(0);
        const output = split.process(input);
        
        // All output should be zero
        for (const sample of output) {
            expect(Math.abs(sample.re)).toBeLessThan(1e-10);
            expect(Math.abs(sample.im)).toBeLessThan(1e-10);
        }
    });
});
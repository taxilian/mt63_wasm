import { dspCmpx, dspWinFirI, winFirQ, dspWindowBlackman3 } from '../dsp';

/**
 * Quadrature splitter that converts real-valued input signal to complex I/Q output
 * by applying FIR filters and decimation.
 */
export class DspQuadrSplit {
    private len: number = 0;
    private tap: Float32Array = new Float32Array(0);
    private tapLen: number = 0;
    private shapeI?: Float64Array;
    private shapeQ?: Float64Array;
    private externShape: boolean = true;
    private rate: number = 1;
    
    preset(
        filterLen: number,
        filterShapeI: number[] | null,
        filterShapeQ: number[] | null,
        decimateRate: number
    ): number {
        this.len = filterLen;
        if (!this.externShape) {
            this.shapeI = undefined;
            this.shapeQ = undefined;
        }
        
        if (filterShapeI && filterShapeQ) {
            this.shapeI = new Float64Array(filterShapeI);
            this.shapeQ = new Float64Array(filterShapeQ);
            this.externShape = true;
        } else {
            this.externShape = false;
        }
        
        // Initialize tap buffer
        this.tap = new Float32Array(filterLen);
        this.tapLen = 0;
        
        this.rate = decimateRate;
        return 0;
    }
    
    computeShape(lowOmega: number, uppOmega: number, window: (phase: number) => number = dspWindowBlackman3): number {
        this.externShape = false;
        
        // Allocate arrays for filter shapes
        this.shapeI = new Float64Array(this.len);
        this.shapeQ = new Float64Array(this.len);
        
        // Compute in-phase (I) and quadrature (Q) filter shapes
        const tempI = new Array(this.len);
        const tempQ = new Array(this.len);
        dspWinFirI(lowOmega, uppOmega, tempI, this.len, window);
        winFirQ(lowOmega, uppOmega, tempQ, this.len, window);
        
        // Copy to Float64Arrays
        for (let i = 0; i < this.len; i++) {
            this.shapeI[i] = tempI[i];
            this.shapeQ[i] = tempQ[i];
        }
        
        return 0;
    }
    
    process(input: number[]): dspCmpx[] {
        if (!this.shapeI || !this.shapeQ) {
            throw new Error('Filter shapes not initialized');
        }
        
        const inpLen = input.length;
        
        // Ensure tap buffer has enough space
        if (this.tap.length < this.tapLen + inpLen) {
            const newTap = new Float32Array(this.tapLen + inpLen);
            newTap.set(this.tap.subarray(0, this.tapLen));
            this.tap = newTap;
        }
        
        // Copy input data to tap buffer
        for (let i = 0; i < inpLen; i++) {
            this.tap[this.tapLen + i] = input[i];
        }
        this.tapLen += inpLen;
        
        
        // Process with decimation
        const output: dspCmpx[] = [];
        const maxIndex = this.tapLen - this.len;
        
        let i = 0;
        for (; i < maxIndex; i += this.rate) {
            let sumI = 0.0;
            let sumQ = 0.0;
            
            // Apply FIR filters
            for (let t = 0; t < this.len; t++) {
                const sample = this.tap[i + t];
                sumI += sample * this.shapeI[t];
                sumQ += sample * this.shapeQ[t];
            }
            
            output.push({ re: sumI, im: sumQ });
        }
        
        // Move remaining samples to beginning of tap buffer
        this.tapLen -= i;
        if (this.tapLen > 0) {
            this.tap.copyWithin(0, i, i + this.tapLen);
        }
        
        return output;
    }
}
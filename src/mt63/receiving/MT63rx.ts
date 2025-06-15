import { DataCarrSepar, SymbolLen, SymbolSepar, SymbolShape } from "../Symbol";
import { downSample } from "../downsample";
import { dsp_r2FFT } from '../FFT';
import { DspQuadrSplit } from "./QuadrSplit";
import { dspCmpx, dspLowPass2, dspLowPass2Coeff, dspPower, dspWindowBlackman3, dspAmpl, dspPhase, dspScalProd, dspFindMaxPower, dspSelFitAver, dspCmpxMult, dspCmpxMultConj } from "../dsp";
import { DspCmpxMixer } from "../dspCmpxMixer";
import { DspDelayLine } from "../DspDelayLine";
import { longInterleavePattern, shortInterleavePattern } from "../mt63intl";
import { MT63decoder } from "./MT63Decoder";

const desiredSampleRate = 8000;
const SYMBOL_DIV = 4;
const DataCarriers = 64;

export class MT63rx {
    /**
     * The buffer we use to store the audio data before we send it to be processed.
     */
    private buffer?: Float32Array;
    /**
     * The buffer we use to store the audio data after we downsample it.
     */
    private resampleBuffer?: Float32Array;
    /**
     * The size of the data in the buffer.
     */
    dataSize = 0;

    Decoder: MT63decoder;
    private firstDataCarr: number = 0;
    private aliasFilterLen: number = 0;
    private decimateRatio: number = 0;
    private windowLen = SymbolLen;
    private windowLenMask = this.windowLen - 1;
    private rxWindow = SymbolShape;
    private FFT = new dsp_r2FFT(this.windowLen);
    private inputSplit: DspQuadrSplit;
    private testOffset: DspCmpxMixer;
    private procLine: DspDelayLine<dspCmpx>;
    private spectradspPower: number[] = [];

    syncPipe: dspCmpx[][] = [];

    dataInterleave: number;
    interleavePattern: number[];
    scanFirst: number;
    scanLen: number;
    syncPhCorr: dspCmpx[];
    syncProcPtr = 0;
    syncPtr = 0;
    dataPipe: dspCmpx[][] = [];
    dataPipeLen = 0;
    dataPipePtr = 0;

    dataProcPtr = 0;
    fitLen: number;

    FFTbuff: dspCmpx[] = [];
    FFTbuff2: dspCmpx[] = [];

    dspPowerMid: number[];
    dspPowerOut: number[];

    w1: number;
    w2: number;
    w5: number;
    w1P: number;
    w2P: number;
    w5P: number;

    correlMid: dspCmpx[][] = [];
    correlOut: dspCmpx[][] = [];
    correlNorm: dspCmpx[][] = [];
    correlAver: dspCmpx[][] = [];

    // Additional properties for synchronization
    syncStep: number;
    symbPtr: number = 0;
    syncLocked: number = 0;
    syncSymbConf: number = 0.0;
    syncFreqOfs: number = 0.0;
    syncFreqDev: number = 0.0;
    syncSymbShift: number = 0.0;
    
    // Tracking pipes
    symbPipe: dspCmpx[];
    freqPipe: number[];
    trackPipeLen: number;
    trackPipePtr: number = 0;
    
    // Symbol fitting
    symbFit: dspCmpx[];
    symbFitPos: number;
    
    // Averages
    averSymb: dspCmpx = new dspCmpx(0, 0);
    averFreq: number = 0;
    
    // Thresholds
    syncHoldThres: number;
    syncLockThres: number;
    
    // Data processing
    refDataSlice: dspCmpx[];
    dataScanLen: number;
    dataScanFirst: number;
    dataVect: dspCmpx[];
    dataPwrMid: number[];
    dataPwrOut: number[];
    dataPhase: number[];
    dW1: number;
    dW2: number;
    dW5: number;
    
    // Output buffer
    Output: { Data: string[], Len: number } = { Data: [], Len: 0 };
    
    // Process delay
    procdspDelay: number;


    constructor(
        centerFrequency: number,
        // int MT63rx::Preset(float freq, int BandWidth, int LongInterleave, int Integ,
        //     void (*Display)(double *Spectra, int Len))
        private bandWidth: number,
        private longInterleave: boolean,
        private integLength: number,
        private spectraDisplay?: (spectra: number[], len: number) => void,
    ) {
        const hbw = 1.5 * bandWidth / 2;
        let omega_low = (centerFrequency - hbw);
        let omega_high = (centerFrequency + hbw);
        if (omega_low < 100) {
            omega_low = 100;
        }
        if (omega_high > 4000) {
            omega_high = 4000;
        }
        omega_low *= (Math.PI / 4000);
        omega_high *= (Math.PI / 4000);

        switch(bandWidth) {
        case 500:
            this.firstDataCarr = Math.floor((centerFrequency - bandWidth / 2.0) * 256 / 500 + .5);
            this.aliasFilterLen = 128;
            this.decimateRatio = 8;
            break;
        case 1000:
            this.firstDataCarr = Math.floor((centerFrequency - bandWidth / 2.0) * 128 / 500 + 0.5);
            this.aliasFilterLen = 64;
            this.decimateRatio = 4;
            break;
        case 2000:
            this.firstDataCarr = Math.floor((centerFrequency - bandWidth / 2.0) * 64 / 500 + 0.5);
            this.aliasFilterLen = 64;
            this.decimateRatio = 2;
            break;
        default:
            throw new Error("Invalid bandwidth: " + bandWidth + " Valid values are 500, 1000, and 2000");
        }

        const scanMargin = 8;
        this.syncStep = SymbolSepar / SYMBOL_DIV;

        this.trackPipeLen = integLength;

        if (longInterleave) {
            this.dataInterleave = 64;
            this.interleavePattern = [...longInterleavePattern];
        } else {
            this.dataInterleave = 32;
            this.interleavePattern = [...shortInterleavePattern];
        }

        const dataScanMargin = 8;

        this.inputSplit = new DspQuadrSplit(this.aliasFilterLen, this.decimateRatio);
        this.inputSplit.computeShape(omega_low, omega_high, dspWindowBlackman3);

        this.testOffset = new DspCmpxMixer();
        this.testOffset.preset(-0.25 * (2.0 * Math.PI / this.windowLen)); // for decoder tests only

        this.procdspDelay = integLength * SymbolSepar;
        // Ensure we have enough buffer space for processing
        // The C++ code seems to handle this differently, so we need a larger buffer
        const minBufferSize = this.windowLen * 8; // Ensure space for multiple windows
        const requestedSize = this.procdspDelay + this.windowLen + SymbolSepar;
        this.procLine = new DspDelayLine<dspCmpx>(requestedSize, Math.max(minBufferSize, requestedSize * 4));
        this.syncProcPtr = 0;

        this.scanFirst = this.firstDataCarr - scanMargin * DataCarrSepar; // first FFT bin to scan
        if (this.scanFirst < 0) {
            this.scanFirst += this.windowLen;
        }
        this.scanLen = (DataCarriers + 2 * scanMargin) * DataCarrSepar; // number of FFT bins to scan

        for (let s = 0; s < SYMBOL_DIV; s++) {
            this.syncPipe[s] = [];
            for (let i = 0; i < this.scanLen; i++) {
                this.syncPipe[s][i] = { re: 0, im: 0 };
            }
        }
        this.syncPtr = 0;

        this.syncPhCorr = new Array(this.scanLen);
        for (let i = 0; i < this.scanLen; i++) {
            this.syncPhCorr[i] = { re: 0, im: 0 };
        }

        this.FFTbuff = new Array(this.windowLen);
        this.FFTbuff2 = new Array(this.windowLen);
        for (let i = 0; i < this.windowLen; i++) {
            this.FFTbuff[i] = { re: 0, im: 0 };
            this.FFTbuff2[i] = { re: 0, im: 0 };
        }

        for (let c = (this.scanFirst * SymbolSepar) & this.windowLenMask, i = 0; i < this.scanLen; i++) {
            if (!this.FFT.Twiddle[c]) {
                console.error(`FFT.Twiddle[${c}] is null/undefined. FFT.Size=${this.FFT.Size}, scanFirst=${this.scanFirst}, SymbolSepar=${SymbolSepar}`);
                this.syncPhCorr[i] = { re: 0, im: 0 };
            } else {
                this.syncPhCorr[i].re = this.FFT.Twiddle[c].re * this.FFT.Twiddle[c].re -
                                   this.FFT.Twiddle[c].im * this.FFT.Twiddle[c].im;
                this.syncPhCorr[i].im = 2 * this.FFT.Twiddle[c].re * this.FFT.Twiddle[c].im;
            }
            c = (c + SymbolSepar) & this.windowLenMask;
        }

        this.fitLen = 2 * scanMargin * DataCarrSepar;

        for (let s = 0; s < SYMBOL_DIV; s++) {
            this.correlMid[s] = new Array(this.scanLen);
            this.correlOut[s] = new Array(this.scanLen);
            this.correlNorm[s] = new Array(this.scanLen);
            this.correlAver[s] = new Array(this.fitLen);
            for (let i = 0; i < this.scanLen; i++) {
                this.correlMid[s][i] = { re: 0, im: 0 };
                this.correlOut[s][i] = { re: 0, im: 0 };
                this.correlNorm[s][i] = { re: 0, im: 0 };
            }
            for (let i = 0; i < this.fitLen; i++) {
                this.correlAver[s][i] = { re: 0, im: 0 };
            }
        }
        ({ w1: this.w1, w2: this.w2, w5: this.w5 } = dspLowPass2Coeff(integLength));

        this.dspPowerMid = new Array(this.scanLen).fill(0);
        this.dspPowerOut = new Array(this.scanLen).fill(0);
        ({ w1: this.w1P, w2: this.w2P, w5: this.w5P } = dspLowPass2Coeff(integLength * SYMBOL_DIV));

        // Initialize symbol fitting
        this.symbFit = new Array(this.fitLen);
        for (let i = 0; i < this.fitLen; i++) {
            this.symbFit[i] = { re: 0, im: 0 };
        }

        // Initialize tracking pipes
        this.symbPipe = new Array(this.trackPipeLen);
        for (let i = 0; i < this.symbPipe.length; i++) {
            this.symbPipe[i] = { re: 0, im: 0 };
        }
        this.freqPipe = new Array(this.trackPipeLen).fill(0);
        this.trackPipePtr = 0;

        this.symbFitPos = scanMargin * DataCarrSepar;
        this.syncLocked = 0;
        this.syncSymbConf = 0.0;
        this.syncFreqOfs = 0.0;
        this.syncFreqDev = 0.0;
        this.symbPtr = 0;
        this.syncSymbShift = 0.0;

        this.syncHoldThres = 1.5 * Math.sqrt(1.0 / (integLength * DataCarriers));
        this.syncLockThres = 1.5 * this.syncHoldThres;

        this.dataProcPtr = (-this.procdspDelay);

        this.dataScanLen = DataCarriers + 2 * dataScanMargin;
        this.dataScanFirst = this.firstDataCarr - dataScanMargin * DataCarrSepar;

        this.refDataSlice = new Array(this.dataScanLen);
        for (let i = 0; i < this.refDataSlice.length; i++) {
            this.refDataSlice[i] = { re: 0, im: 0 };
        }

        // Initialize data pipe
        this.dataPipeLen = Math.max(1, integLength / 2); // Ensure at least 1
        this.dataPipe = new Array(this.dataPipeLen);
        for (let i = 0; i < this.dataPipeLen; i++) {
            this.dataPipe[i] = new Array(this.dataScanLen);
            for (let j = 0; j < this.dataScanLen; j++) {
                this.dataPipe[i][j] = { re: 0, im: 0 };
            }
        }
        this.dataPipePtr = 0;

        // Initialize data processing arrays
        this.dataPwrMid = new Array(this.dataScanLen).fill(0);
        this.dataPwrOut = new Array(this.dataScanLen).fill(0);
        this.dataVect = new Array(this.dataScanLen);
        for (let i = 0; i < this.dataScanLen; i++) {
            this.dataVect[i] = { re: 0, im: 0 };
        }
        this.dataPhase = new Array(this.dataScanLen).fill(0);

        // Data processing filter coefficients
        ({ w1: this.dW1, w2: this.dW2, w5: this.dW5 } = dspLowPass2Coeff(integLength));

        this.Decoder = new MT63decoder(DataCarriers, this.dataInterleave,
                             this.interleavePattern, dataScanMargin, integLength);

        if (this.spectraDisplay) {
            this.spectradspPower = new Array(this.windowLen).fill(0);
        }

    }

    processAudioResample(input: Float32Array, sampleRate: number): string {
        const ratioWeight = sampleRate / desiredSampleRate;
        if (ratioWeight === 1) {
            return this.processAudio(input);
        }

        let text = '';

        /**
         * The size of data we need to downsample evenly to get to the desired sample rate.
         */
        const desiredBufferSize = input.length * (sampleRate / desiredSampleRate);
        if (!this.buffer || this.buffer.length < desiredBufferSize) {
            // We need to downsample the audio data before we can process it.
            // So make sure the buffer is big enough to downsample evenly.
            const data = this.buffer;
            // console.log(`Resizing buffer to ${desiredBufferSize}`);
            this.buffer = new Float32Array(desiredBufferSize);
            if (data) {
                this.buffer.set(data);
            }
        }

        const remaining = this.buffer.length - this.dataSize;
        if (input.length < remaining) {
            // We don't have enough data to downsample yet.
            this.buffer.set(input, this.dataSize);
            this.dataSize += input.length;
        } else {
            // we need to split the array;
            this.buffer.set(input.subarray(0, remaining), this.dataSize);
            this.dataSize += remaining;

            const resampledSize = Math.ceil(this.buffer.length * (desiredSampleRate / sampleRate));
            if (!this.resampleBuffer || this.resampleBuffer.length < resampledSize) {
                // console.log(`Resizing resample buffer to ${resampledSize}`);
                this.resampleBuffer = new Float32Array(resampledSize);
            }

            const size = downSample(this.buffer, this.dataSize, sampleRate, desiredSampleRate, this.resampleBuffer);
            text = this.processAudio(this.resampleBuffer.subarray(0, size));

            // We should be able to keep using the same buffer.
            let remnantSize = input.length - remaining;
            this.buffer.set(input.subarray(remaining), 0);
            this.dataSize = remnantSize;
        }
        return text;
    }

    processAudio(input: Float32Array, sampleRate = 8000): string {
        let s1: number;
        let s2: number;

        // TestOfs.Omega += (-0.005 * (2.0 * Math.PI / 512)); // simulate frequency drift

        this.Output.Len = 0;

        // W1HKJ
        // convert the real data input into a complex time domain signal,
        // anti-aliased using the blackman3 filter
        // subsequent rx signal processing takes advantage of the periodic nature
        // of the resultant FFT of the anti-aliased input signal. Actual decoding
        // is at baseband.

        // In C++, this takes a float_buff which has Data, Len, Space
        // Our QuadrSplit expects a number array
        const inputArray = Array.from(input);
        
        const inputSplitResp = this.inputSplit.process(inputArray);

        this.procLine.process(inputSplitResp, inputSplitResp.length);
        //  TestOfs.Process(this.InpSplit.Output);
        //  ProcLine.Process(this.TestOfs.Output);

        // printf("New input, Len=%d/%d\n", Input.Len, ProcLine.InpLen);
        console.log(`ProcessAudio: inputSplitResp.length=${inputSplitResp.length}, procLine.inpLen=${this.procLine.inpLen}, syncProcPtr=${this.syncProcPtr}, windowLen=${this.windowLen}`);
        console.log(`Loop condition: ${this.syncProcPtr + this.windowLen} < ${this.procLine.inpLen} = ${this.syncProcPtr + this.windowLen < this.procLine.inpLen}`);

        let syncCount = 0;
        let dataCount = 0;
        while (this.syncProcPtr + this.windowLen < this.procLine.inpLen) {
            syncCount++;
            // In C++, ProcLine.InpPtr + SyncProcPtr points to the data
            // In our case, we use line with offset
            const syncOffset = this.procLine.inpOffset + this.syncProcPtr;
            this.syncProcess(this.procLine.line.slice(syncOffset));
            
            console.log(`Sync check: syncPtr=${this.syncPtr}, symbPtr=${this.symbPtr}, equal=${this.syncPtr === this.symbPtr}`);
            
            if (this.syncPtr === this.symbPtr) {
                dataCount++;
                s1 = Math.floor(
                    this.syncProcPtr -
                    this.procdspDelay +
                    (this.syncSymbShift - this.symbPtr * this.syncStep)
                );
                s2 = s1 + SymbolSepar / 2;
                
                // Calculate actual offsets into the line
                const dataOffset1 = this.procLine.inpOffset + s1;
                const dataOffset2 = this.procLine.inpOffset + s2;
                
                console.log(`Calling dataProcess: syncPtr=${this.syncPtr}, symbPtr=${this.symbPtr}, syncLocked=${this.syncLocked}`);
                
                this.dataProcess(
                    this.procLine.line.slice(dataOffset1),
                    this.procLine.line.slice(dataOffset2),
                    this.syncFreqOfs,
                    s1 - this.dataProcPtr
                );
                this.dataProcPtr = s1;
            }
            this.syncProcPtr += this.syncStep;
        }
        this.syncProcPtr -= this.procLine.inpLen;
        this.dataProcPtr -= this.procLine.inpLen;

        // Return any decoded text
        const decodedText = this.Output.Data.join('');
        this.Output.Data = [];
        this.Output.Len = 0;
        return decodedText;
    }

    doCorrelSum(correl1: dspCmpx[], correl2: dspCmpx[], aver: dspCmpx[]) {
        let sx = new dspCmpx(0, 0);

        const s = 2 * DataCarrSepar;
        const d = DataCarriers * DataCarrSepar;
        sx.re = sx.im = 0.0;
        for (let i = 0; i < d; i += s) {
            sx.re += correl1[i].re;
            sx.im += correl1[i].im;
            sx.re += correl2[i].re;
            sx.im += correl2[i].im;
        }
        aver[0].re = sx.re / DataCarriers;
        aver[0].im = sx.im / DataCarriers;
        for (let i = 0; i < (this.fitLen - s); ) {
            sx.re -= correl1[i].re;
            sx.im -= correl1[i].im;
            sx.re -= correl2[i].re;
            sx.im -= correl2[i].im;
            sx.re += correl1[i + d].re;
            sx.im += correl1[i + d].im;
            sx.re += correl2[i + d].re;
            sx.im += correl2[i + d].im;
            i += s;
            aver[i].re = sx.re / DataCarriers;
            aver[i].im = sx.im / DataCarriers;
        }
    }

    syncProcess(Slice: dspCmpx[]) {
        let i: number, j: number, k: number, r: number, s: number, s2: number;
        let pI: number, pQ: number;
        let Correl = new dspCmpx(0, 0);
        let PrevSlice: dspCmpx[];
        let I: number, Q: number;
        let dI: number, dQ: number;
        let P: number, A: number;
        let w0: number, w1: number;
        let Fl: number, F0: number, Fu: number;
        let SymbTime: dspCmpx = new dspCmpx(0, 0);
        let SymbConf: number, SymbShift: number, FreqOfs: number;
        let rms: number;
        let sel: number;

        this.syncPtr = (this.syncPtr + 1) & (SYMBOL_DIV - 1); // increment the correlators pointer

        // Perform FFT on windowed input
        for (i = 0; i < this.windowLen; i++) {
            r = this.FFT.BitRevIdx[i];
            if (i < Slice.length && Slice[i]) {
                this.FFTbuff[r].re = Slice[i].re * this.rxWindow[i];
                this.FFTbuff[r].im = Slice[i].im * this.rxWindow[i];
            } else {
                this.FFTbuff[r].re = 0;
                this.FFTbuff[r].im = 0;
            }
        }
        this.FFT.coreProc(this.FFTbuff);

        // Optional spectrum display
        if (this.spectraDisplay) {
            for (i = 0, j = this.firstDataCarr + (DataCarriers / 2) * DataCarrSepar - this.windowLen / 2;
                (i < this.windowLen) && (j < this.windowLen);
                i++, j++
            ) {
                this.spectradspPower[i] = dspPower(this.FFTbuff[j]);
            }
            for (j = 0; (i < this.windowLen) && (j < this.windowLen); i++, j++) {
                this.spectradspPower[i] = dspPower(this.FFTbuff[j]);
            }
            this.spectraDisplay(this.spectradspPower, this.windowLen);
        }

        // Process correlation with previous slice
        PrevSlice = this.syncPipe[this.syncPtr];
        for (i = 0; i < this.scanLen; i++) {
            k = (this.scanFirst + i) & this.windowLenMask;
            I = this.FFTbuff[k].re;
            Q = this.FFTbuff[k].im;
            P = I * I + Q * Q;
            A = Math.sqrt(P);
            if (P > 0.0) {
                dI = (I * I - Q * Q) / A;
                dQ = (2 * I * Q) / A;
            } else {
                dI = dQ = 0.0;
            }
            // Low-pass filter the power
            ({ mid: this.dspPowerMid[i], out: this.dspPowerOut[i] } = dspLowPass2(
                P,
                this.dspPowerMid[i],
                this.dspPowerOut[i],
                this.w1P,
                this.w2P,
                this.w5P,
            ));
            // Correlate with phase-corrected previous slice
            pI = PrevSlice[i].re * this.syncPhCorr[i].re -
                PrevSlice[i].im * this.syncPhCorr[i].im;
            pQ = PrevSlice[i].re * this.syncPhCorr[i].im +
                PrevSlice[i].im * this.syncPhCorr[i].re;
            Correl.re = dQ * pQ + dI * pI;
            Correl.im = dQ * pI - dI * pQ;
            // Low-pass filter the correlation
            const result = dspLowPass2(Correl, this.correlMid[this.syncPtr][i],
                        this.correlOut[this.syncPtr][i], this.w1, this.w2, this.w5);
            this.correlMid[this.syncPtr][i] = result.mid;
            this.correlOut[this.syncPtr][i] = result.out;
            // Store current slice for next iteration
            PrevSlice[i].re = dI;
            PrevSlice[i].im = dQ;
        }

        // Process when we've collected enough phases
        if (this.syncPtr === ((this.symbPtr ^ 2) & (SYMBOL_DIV - 1))) {
            // Normalize correlations
            for (s = 0; s < SYMBOL_DIV; s++) {
                for (i = 0; i < this.scanLen; i++) {
                    if (this.dspPowerOut[i] > 0.0) {
                        this.correlNorm[s][i].re = this.correlOut[s][i].re / this.dspPowerOut[i];
                        this.correlNorm[s][i].im = this.correlOut[s][i].im / this.dspPowerOut[i];
                    } else {
                        this.correlNorm[s][i].im = this.correlNorm[s][i].re = 0.0;
                    }
                }
            }

            // Sum correlations for each possible carrier position
            for (s = 0; s < SYMBOL_DIV; s++) {
                s2 = (s + SYMBOL_DIV / 2) & (SYMBOL_DIV - 1);
                for (k = 0; k < 2 * DataCarrSepar; k++) {
                    this.doCorrelSum(
                        this.correlNorm[s].slice(k),
                        this.correlNorm[s2].slice(k + DataCarrSepar),
                        this.correlAver[s].slice(k)
                    );
                }
            }

            // Symbol-shift phase fitting
            for (i = 0; i < this.fitLen; i++) {
                this.symbFit[i].re = dspAmpl(this.correlAver[0][i]) -
                                dspAmpl(this.correlAver[2][i]);
                this.symbFit[i].im = dspAmpl(this.correlAver[1][i]) -
                                dspAmpl(this.correlAver[3][i]);
            }

            // Find maximum power position
            const { power: maxPower, index: maxIndex } = dspFindMaxPower(this.symbFit.slice(2), this.fitLen - 4);
            P = maxPower;
            j = maxIndex + 2;

            // Adjust position to stay within carrier range
            k = Math.floor((j - this.symbFitPos) / DataCarrSepar);
            if (k > 1)
                j -= (k - 1) * DataCarrSepar;
            else if (k < -1)
                j -= (k + 1) * DataCarrSepar;
            this.symbFitPos = j;

            if (P > 0.0) {
                // Calculate symbol confidence
                SymbConf = dspAmpl(this.symbFit[j]) +
                        0.5 * (dspAmpl(this.symbFit[j + 1]) + dspAmpl(this.symbFit[j - 1]));
                SymbConf *= 0.5;
                
                // Average neighboring points
                I = this.symbFit[j].re + 0.5 * (this.symbFit[j - 1].re + this.symbFit[j + 1].re);
                Q = this.symbFit[j].im + 0.5 * (this.symbFit[j - 1].im + this.symbFit[j + 1].im);
                SymbTime.re = I;
                SymbTime.im = Q;
                
                // Calculate symbol shift
                SymbShift = (dspPhase(SymbTime) / (2 * Math.PI)) * SYMBOL_DIV;
                if (SymbShift < 0)
                    SymbShift += SYMBOL_DIV;
                
                // First estimation of frequency offset
                pI = dspScalProd(I, Q, this.symbFit[j])
                    + 0.7 * dspScalProd(I, Q, this.symbFit[j - 1])
                    + 0.7 * dspScalProd(I, Q, this.symbFit[j + 1]);
                pQ = 0.7 * dspScalProd(I, Q, this.symbFit[j + 1])
                    - 0.7 * dspScalProd(I, Q, this.symbFit[j - 1])
                    + 0.5 * dspScalProd(I, Q, this.symbFit[j + 2])
                    - 0.5 * dspScalProd(I, Q, this.symbFit[j - 2]);
                FreqOfs = j + dspPhase(pI, pQ) / (2.0 * Math.PI / 8);
                
                // Refine frequency offset
                i = Math.floor(FreqOfs + 0.5);
                s = Math.floor(SymbShift);
                s2 = (s + 1) & (SYMBOL_DIV - 1);
                w0 = (s + 1 - SymbShift);
                w1 = (SymbShift - s);
                A = (0.5 * this.windowLen) / SymbolSepar;
                I = w0 * this.correlAver[s][i].re + w1 * this.correlAver[s2][i].re;
                Q = w0 * this.correlAver[s][i].im + w1 * this.correlAver[s2][i].im;
                F0 = i + dspPhase(I, Q) / (2.0 * Math.PI) * A - FreqOfs;
                Fl = F0 - A;
                Fu = F0 + A;
                if (Math.abs(Fl) < Math.abs(F0))
                    FreqOfs += (Math.abs(Fu) < Math.abs(Fl)) ? Fu : Fl;
                else
                    FreqOfs += (Math.abs(Fu) < Math.abs(F0)) ? Fu : F0;
            } else {
                SymbTime.re = SymbTime.im = 0.0;
                SymbConf = 0.0;
                SymbShift = 0.0;
                FreqOfs = 0.0;
            }

            // Adjust based on sync lock status
            if (this.syncLocked) {
                // Flip SymbTime if it doesn't agree with average
                if (SymbTime && this.averSymb && 
                    dspScalProd(SymbTime, this.averSymb) < 0.0) {
                    SymbTime.re = -SymbTime.re;
                    SymbTime.im = -SymbTime.im;
                    FreqOfs -= DataCarrSepar;
                }
                // Reduce frequency offset towards average
                A = 2 * DataCarrSepar;
                k = Math.floor((FreqOfs - this.averFreq) / A + 0.5);
                FreqOfs -= k * A;
                
                // Correct frequency auto-correlator wrap
                A = (0.5 * this.windowLen) / SymbolSepar;
                F0 = FreqOfs - this.averFreq;
                Fl = F0 - A;
                Fu = F0 + A;
                if (Math.abs(Fl) < Math.abs(F0))
                    FreqOfs += (Math.abs(Fu) < Math.abs(Fl)) ? A : -A;
                else
                    FreqOfs += (Math.abs(Fu) < Math.abs(F0)) ? A : 0.0;
            } else {
                // Flip SymbTime if it doesn't agree with previous
                if (SymbTime && this.symbPipe[this.trackPipePtr] && 
                    dspScalProd(SymbTime, this.symbPipe[this.trackPipePtr]) < 0.0) {
                    SymbTime.re = -SymbTime.re;
                    SymbTime.im = -SymbTime.im;
                    FreqOfs -= DataCarrSepar;
                }
                // Reduce FreqOfs towards zero
                A = 2 * DataCarrSepar;
                k = Math.floor(FreqOfs / A + 0.5);
                FreqOfs -= k * A;
                
                F0 = FreqOfs - this.freqPipe[this.trackPipePtr];
                Fl = F0 - A;
                Fu = F0 + A;
                if (Math.abs(Fl) < Math.abs(F0))
                    FreqOfs += (Math.abs(Fu) < Math.abs(Fl)) ? A : -A;
                else
                    FreqOfs += (Math.abs(Fu) < Math.abs(F0)) ? A : 0.0;
            }

            // Update tracking pipes
            this.trackPipePtr += 1;
            if (this.trackPipePtr >= this.trackPipeLen)
                this.trackPipePtr -= this.trackPipeLen;
            this.symbPipe[this.trackPipePtr] = SymbTime;
            this.freqPipe[this.trackPipePtr] = FreqOfs;

            // Find average symbol time
            const symbResult = dspSelFitAver(this.symbPipe, this.trackPipeLen, 3.0, 4);
            this.averSymb = symbResult.aver as dspCmpx;
            
            // Find average frequency offset
            const freqResult = dspSelFitAver(this.freqPipe, this.trackPipeLen, 2.5, 4);
            this.averFreq = freqResult.aver as number;
            this.syncFreqDev = freqResult.rms;

            // Update sync parameters
            SymbConf = dspAmpl(this.averSymb);
            this.syncSymbConf = SymbConf;
            this.syncFreqOfs = this.averFreq;
            
            if (SymbConf > 0.0) {
                SymbShift = dspPhase(this.averSymb) / (2 * Math.PI) * SymbolSepar;
                if (SymbShift < 0.0)
                    SymbShift += SymbolSepar;
                this.symbPtr = Math.floor((dspPhase(this.averSymb) / (2 * Math.PI)) * SYMBOL_DIV);
                if (this.symbPtr < 0)
                    this.symbPtr += SYMBOL_DIV;
                this.syncSymbShift = SymbShift;
            }

            // Update lock status
            if (this.syncLocked) {
                if ((this.syncSymbConf < this.syncHoldThres) || (this.syncFreqDev > 0.250))
                    this.syncLocked = 0;
            } else {
                if ((this.syncSymbConf > this.syncLockThres) && (this.syncFreqDev < 0.125))
                    this.syncLocked = 1;
            }

            this.syncSymbConf *= 0.5;
        }
    }

    dataProcess(EvenSlice: dspCmpx[], OddSlice: dspCmpx[], FreqOfs: number, TimeDist: number) {
        let i: number, c: number, p: number, incr: number, r: number;
        let I: number, Q: number, P: number;
        let Freq: dspCmpx, Phas: dspCmpx, Dtmp: dspCmpx, Ftmp: dspCmpx;

        // Step 1: Apply frequency offset correction and window to time-domain slices
        P = (-2 * Math.PI * FreqOfs) / this.windowLen;
        Freq = new dspCmpx(Math.cos(P), Math.sin(P));
        Phas = new dspCmpx(1.0, 0.0);

        for (i = 0; i < this.windowLen; i++) {
            r = this.FFT.BitRevIdx[i];
            
            // Process even slice
            if (i < EvenSlice.length && EvenSlice[i]) {
                Dtmp = dspCmpxMult(EvenSlice[i], Phas);
                this.FFTbuff[r].re = Dtmp.re * this.rxWindow[i];
                this.FFTbuff[r].im = Dtmp.im * this.rxWindow[i];
            } else {
                this.FFTbuff[r].re = 0;
                this.FFTbuff[r].im = 0;
            }
            
            // Process odd slice
            if (i < OddSlice.length && OddSlice[i]) {
                Dtmp = dspCmpxMult(OddSlice[i], Phas);
                this.FFTbuff2[r].re = Dtmp.re * this.rxWindow[i];
                this.FFTbuff2[r].im = Dtmp.im * this.rxWindow[i];
            } else {
                this.FFTbuff2[r].re = 0;
                this.FFTbuff2[r].im = 0;
            }
            
            // Update phase rotation
            Phas = dspCmpxMult(Phas, Freq);
        }

        // Step 2: Perform FFT on both slices
        this.FFT.coreProc(this.FFTbuff);
        this.FFT.coreProc(this.FFTbuff2);

        // Step 3: Extract data carriers and perform differential phase decoding
        incr = (TimeDist * DataCarrSepar) & this.windowLenMask;
        p = (TimeDist * this.dataScanFirst) & this.windowLenMask;

        for (c = this.dataScanFirst, i = 0; i < this.dataScanLen; ) {
            // Process even carrier
            Phas = this.FFT.Twiddle[p];
            Dtmp = dspCmpxMult(this.refDataSlice[i], Phas);
            this.dataVect[i] = dspCmpxMultConj(this.FFTbuff[c & this.windowLenMask], Dtmp);
            
            // Update power measurement
            P = dspPower(this.FFTbuff[c & this.windowLenMask]);
            const pwrResult = dspLowPass2(P, this.dataPwrMid[i], this.dataPwrOut[i], 
                                         this.dW1, this.dW2, this.dW5);
            this.dataPwrMid[i] = pwrResult.mid;
            this.dataPwrOut[i] = pwrResult.out;
            
            // Store as reference for next symbol
            this.refDataSlice[i] = this.FFTbuff[c & this.windowLenMask];
            i++;
            c = (c + DataCarrSepar) & this.windowLenMask;
            p = (p + incr) & this.windowLenMask;
            
            // Process odd carrier
            if (i < this.dataScanLen) {
                Phas = this.FFT.Twiddle[p];
                Dtmp = dspCmpxMult(this.refDataSlice[i], Phas);
                this.dataVect[i] = dspCmpxMultConj(this.FFTbuff2[c & this.windowLenMask], Dtmp);
                
                // Update power measurement
                P = dspPower(this.FFTbuff2[c & this.windowLenMask]);
                const pwrResult2 = dspLowPass2(P, this.dataPwrMid[i], this.dataPwrOut[i], 
                                              this.dW1, this.dW2, this.dW5);
                this.dataPwrMid[i] = pwrResult2.mid;
                this.dataPwrOut[i] = pwrResult2.out;
                
                // Store as reference for next symbol
                this.refDataSlice[i] = this.FFTbuff2[c & this.windowLenMask];
                i++;
                c = (c + DataCarrSepar) & this.windowLenMask;
                p = (p + incr) & this.windowLenMask;
            }
        }

        // Step 4: Apply additional frequency correction to differential decoded data
        P = (-TimeDist * 2 * Math.PI * FreqOfs) / this.windowLen;
        Freq = new dspCmpx(Math.cos(P), Math.sin(P));

        for (i = 0; i < this.dataScanLen; i++) {
            Ftmp = dspCmpxMult(this.dataVect[i], Freq);
            this.dataVect[i] = this.dataPipe[this.dataPipePtr][i];
            this.dataPipe[this.dataPipePtr][i] = Ftmp;
        }
        this.dataPipePtr = (this.dataPipePtr + 1) % this.dataPipeLen;

        // Step 5: Convert to phase values (soft decisions)
        for (i = 0; i < this.dataScanLen; i++) {
            if (this.dataPwrOut[i] > 0.0) {
                P = this.dataVect[i].re / this.dataPwrOut[i];
                if (P > 1.0) P = 1.0;
                else if (P < -1.0) P = -1.0;
                this.dataPhase[i] = P;
            } else {
                this.dataPhase[i] = 0.0;
            }
        }

        // Step 6: Pass to decoder
        const decoderResult = this.Decoder.Process(new Float64Array(this.dataPhase));
        if (this.Decoder.Output !== 0) {  // Now Output is numeric
            const code = this.Decoder.Output;
            // Log sync status for debugging
            console.log(`Sync status: locked=${this.syncLocked}, conf=${this.syncSymbConf.toFixed(3)}, FreqOfs=${this.syncFreqOfs.toFixed(1)}`);
            
            // Convert numeric code to character - simplified version for debugging
            let char = '';
            if (code >= 32 && code <= 126) {
                char = String.fromCharCode(code);
            } else if (code === 10 || code === 13) {
                char = String.fromCharCode(code); // newline/carriage return
            } else {
                char = `<${code}>`;  // Show control characters as <code>
            }
            console.log(`Decoder produced character: "${char}" (code ${code})`);
            this.Output.Data.push(char);
            this.Output.Len++;
        }
    }
}

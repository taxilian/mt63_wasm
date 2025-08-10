import { DataCarrSepar, SymbolLen, SymbolSepar, SymbolShape } from './Symbol.js';
import { dsp_r2FFT } from './FFT.js';
import { DspQuadrSplit } from './QuadrSplit.js';
import { dspCmpx, dspLowPass2, dspLowPass2Coeff, dspPower, dspWindowBlackman3, dspAmpl, dspPhase, dspScalProd, dspFindMaxPower, dspSelFitAver, dspCmpxMult, dspCmpxMultConj } from './dsp.js';
import { DspCmpxMixer } from './dspCmpxMixer.js';
import { DspDelayLine } from './DspDelayLine.js';
import { longInterleavePattern, shortInterleavePattern } from './mt63intl.js';
import { MT63decoder } from './MT63Decoder.js';

const desiredSampleRate = 8000;
const SYMBOL_DIV = 4;
const DataCarriers = 64;

export class MT63rx {
    /**
     * The buffer we use to store the audio data after we downsample it.
     */
    private resampleBuffer?: Float32Array;

    Decoder!: MT63decoder;
    private FirstDataCarr: number = 0;
    private AliasFilterLen: number = 0;
    private DecimateRatio: number = 0;
    private WindowLen = SymbolLen;
    private WindowLenMask = this.WindowLen - 1;
    private RxWindow = SymbolShape;
    private FFT = new dsp_r2FFT(this.WindowLen);
    private InpSplit!: DspQuadrSplit;
    private TestOfs!: DspCmpxMixer;
    private ProcLine!: DspDelayLine<dspCmpx>;
    private SpectradspPower!: Float64Array;

    SyncPipe: dspCmpx[][] = [];

    DataInterleave!: number;
    InterleavePattern!: number[];
    ScanFirst!: number;
    ScanLen!: number;
    SyncPhCorr!: dspCmpx[];
    SyncProcPtr = 0;
    SyncPtr = 0;
    DataPipe: dspCmpx[][] = [];
    DataPipeLen = 0;
    DataPipePtr = 0;

    DataProcPtr = 0;
    FitLen!: number;

    FFTbuff: dspCmpx[] = [];
    FFTbuff2: dspCmpx[] = [];

    dspPowerMid!: number[];
    dspPowerOut!: number[];

    W1!: number;
    W2!: number;
    W5!: number;
    W1p!: number;
    W2p!: number;
    W5p!: number;

    CorrelMid: dspCmpx[][] = [];
    CorrelOut: dspCmpx[][] = [];
    CorrelNorm: dspCmpx[][] = [];
    CorrelAver: dspCmpx[][] = [];

    // Additional properties for synchronization
    SyncStep!: number;
    SymbPtr: number = 0;
    SyncLocked: number = 0;
    SyncSymbConf: number = 0.0;
    SyncFreqOfs: number = 0.0;
    SyncFreqDev: number = 0.0;
    SyncSymbShift: number = 0.0;

    // Tracking pipes
    SymbPipe!: dspCmpx[];
    FreqPipe!: Float64Array;
    TrackPipeLen!: number;
    TrackPipePtr: number = 0;

    // Symbol fitting
    SymbFit!: dspCmpx[];
    SymbFitPos!: number;

    // Averages
    AverSymb: dspCmpx = new dspCmpx(0, 0);
    AverFreq: number = 0;

    // Thresholds
    SyncHoldThres!: number;
    SyncLockThres!: number;

    // Data processing
    RefDataSlice!: dspCmpx[];
    DataScanLen!: number;
    DataScanFirst!: number;
    DataVect!: dspCmpx[];
    DataPwrMid!: Float64Array;
    DataPwrOut!: Float64Array;
    DataSqrMid!: dspCmpx[];
    DataSqrOut!: dspCmpx[];
    DatadspPhase!: Float64Array;
    DatadspPhase2!: Float64Array;
    dW1!: number;
    dW2!: number;
    dW5!: number;

    IntegLen!: number;

    // Output buffer
    Output: { Data: number[], Len: number } = { Data: [], Len: 0 };

    // Character escape handling (for characters > 127)
    private escape: number = 0;

    // Process delay
    ProcdspDelay!: number;

    SpectraDisplay: ((spectra: Float64Array, len: number) => void) | undefined;

    Preset(
        centerFrequency: number,
        // int MT63rx::Preset(float freq, int BandWidth, int LongInterleave, int Integ,
        //     void (*Display)(double *Spectra, int Len))
        BandWidth: number,
        LongInterleave: boolean,
        IntegLen: number,
        SpectraDisplay?: (spectra: Float64Array, len: number) => void,
    ) {
        const hbw = 1.5 * BandWidth / 2;
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

        switch(BandWidth) {
        case 500:
            this.FirstDataCarr = Math.floor((centerFrequency - BandWidth / 2.0) * 256 / 500 + .5);
            this.AliasFilterLen = 128;
            this.DecimateRatio = 8;
            break;
        case 1000:
            this.FirstDataCarr = Math.floor((centerFrequency - BandWidth / 2.0) * 128 / 500 + 0.5);
            this.AliasFilterLen = 64;
            this.DecimateRatio = 4;
            break;
        case 2000:
            this.FirstDataCarr = Math.floor((centerFrequency - BandWidth / 2.0) * 64 / 500 + 0.5);
            this.AliasFilterLen = 64;
            this.DecimateRatio = 2;
            break;
        default:
            throw new Error("Invalid bandwidth: " + BandWidth + " Valid values are 500, 1000, and 2000");
        }

        this.IntegLen = IntegLen;

        const scanMargin = 8;
        this.SyncStep = SymbolSepar / SYMBOL_DIV;

        this.ProcdspDelay = IntegLen * SymbolSepar;

        this.TrackPipeLen = IntegLen;

        if (LongInterleave) {
            this.DataInterleave = 64;
            this.InterleavePattern = [...longInterleavePattern];
        } else {
            this.DataInterleave = 32;
            this.InterleavePattern = [...shortInterleavePattern];
        }

        const dataScanMargin = 8;

        this.FFT.preset(this.WindowLen);

        this.FFTbuff = new Array(this.WindowLen);
        this.FFTbuff2 = new Array(this.WindowLen);
        for (let i = 0; i < this.WindowLen; i++) {
            this.FFTbuff[i] = { re: 0, im: 0 };
            this.FFTbuff2[i] = { re: 0, im: 0 };
        }
        this.WindowLenMask = this.WindowLen - 1;

        this.InpSplit = new DspQuadrSplit();
        this.InpSplit.preset(this.AliasFilterLen, null, null, this.DecimateRatio);
        this.InpSplit.computeShape(omega_low, omega_high, dspWindowBlackman3);

        this.TestOfs = new DspCmpxMixer();
        this.TestOfs.preset(-0.25 * (2.0 * Math.PI / this.WindowLen)); // for decoder tests only

        this.ProcLine = new DspDelayLine<dspCmpx>(this.ProcdspDelay + this.WindowLen + SymbolSepar); // @TODO IS THIS CORRECT?
        // this.ProcLine.Preset(this.ProcdspDelay + this.WindowLen + SymbolSepar);

        this.SyncProcPtr = 0;
        this.ScanFirst = this.FirstDataCarr - scanMargin * DataCarrSepar; // first FFT bin to scan
        if (this.ScanFirst < 0) {
            this.ScanFirst += this.WindowLen;
        }
        this.ScanLen = (DataCarriers + 2 * scanMargin) * DataCarrSepar; // number of FFT bins to scan

        for (let s = 0; s < SYMBOL_DIV; s++) {
            this.SyncPipe[s] = new Array(this.ScanLen);
            for (let i = 0; i < this.ScanLen; i++) {
                this.SyncPipe[s][i] = { re: 0, im: 0 };
            }
        }
        this.SyncPtr = 0;

        this.SyncPhCorr = new Array(this.ScanLen);
        for (let i = 0; i < this.ScanLen; i++) {
            this.SyncPhCorr[i] = { re: 0, im: 0 };
        }
        for (let c = (this.ScanFirst * SymbolSepar) & this.WindowLenMask, i = 0; i < this.ScanLen; i++) {
            this.SyncPhCorr[i].re = this.FFT.Twiddle[c].re * this.FFT.Twiddle[c].re -
                               this.FFT.Twiddle[c].im * this.FFT.Twiddle[c].im;
            this.SyncPhCorr[i].im = 2 * this.FFT.Twiddle[c].re * this.FFT.Twiddle[c].im;
            c = (c + SymbolSepar) & this.WindowLenMask;
        }

        this.FitLen = 2 * scanMargin * DataCarrSepar;

        for (let s = 0; s < SYMBOL_DIV; s++) {
            this.CorrelMid[s] = new Array(this.ScanLen);
            this.CorrelOut[s] = new Array(this.ScanLen);
            this.CorrelNorm[s] = new Array(this.ScanLen);
            this.CorrelAver[s] = new Array(this.FitLen);
            for (let i = 0; i < this.ScanLen; i++) {
                this.CorrelMid[s][i] = { re: 0, im: 0 };
                this.CorrelOut[s][i] = { re: 0, im: 0 };
                this.CorrelNorm[s][i] = { re: 0, im: 0 };
            }
            for (let i = 0; i < this.FitLen; i++) {
                this.CorrelAver[s][i] = { re: 0, im: 0 };
            }
        }
        ({ w1: this.W1, w2: this.W2, w5: this.W5 } = dspLowPass2Coeff(IntegLen));

        this.dspPowerMid = new Array(this.ScanLen).fill(0);
        this.dspPowerOut = new Array(this.ScanLen).fill(0);
        ({ w1: this.W1p, w2: this.W2p, w5: this.W5p } = dspLowPass2Coeff(IntegLen * SYMBOL_DIV));

        // Initialize symbol fitting
        this.SymbFit = new Array(this.FitLen);
        for (let i = 0; i < this.FitLen; i++) {
            this.SymbFit[i] = { re: 0, im: 0 };
        }

        // Initialize tracking pipes
        this.SymbPipe = new Array(this.TrackPipeLen);
        for (let i = 0; i < this.SymbPipe.length; i++) {
            this.SymbPipe[i] = { re: 0, im: 0 };
        }
        this.FreqPipe = new Float64Array(this.TrackPipeLen);
        this.TrackPipePtr = 0;

        this.SymbFitPos = scanMargin * DataCarrSepar;
        this.SyncLocked = 0;
        this.SyncSymbConf = 0.0;
        this.SyncFreqOfs = 0.0;
        this.SyncFreqDev = 0.0;
        this.SymbPtr = 0;
        this.SyncSymbShift = 0.0;

        this.SyncHoldThres = 1.5 * Math.sqrt(1.0 / (IntegLen * DataCarriers));
        this.SyncLockThres = 1.5 * this.SyncHoldThres;

        this.DataProcPtr = (-this.ProcdspDelay);

        this.DataScanLen = DataCarriers + 2 * dataScanMargin;
        // C++ doesn't mask FirstDataCarr when calculating DataScanFirst
        this.DataScanFirst = this.FirstDataCarr - dataScanMargin * DataCarrSepar;

        this.RefDataSlice = new Array(this.DataScanLen);
        for (let i = 0; i < this.RefDataSlice.length; i++) {
            this.RefDataSlice[i] = { re: 0, im: 0 };
        }

        // Initialize data pipe
        this.DataPipeLen = Math.max(1, IntegLen / 2); // Ensure at least 1
        // Data processing filter coefficients
        ({ w1: this.dW1, w2: this.dW2, w5: this.dW5 } = dspLowPass2Coeff(IntegLen));
        this.DataPipe = new Array(this.DataPipeLen);
        for (let i = 0; i < this.DataPipeLen; i++) {
            this.DataPipe[i] = new Array(this.DataScanLen);
            for (let j = 0; j < this.DataScanLen; j++) {
                this.DataPipe[i][j] = { re: 0, im: 0 };
            }
        }
        this.DataPipePtr = 0;

        // Initialize data processing arrays
        this.DataPwrMid = new Float64Array(this.DataScanLen);
        this.DataPwrOut = new Float64Array(this.DataScanLen);

        this.DataSqrMid = new Array(this.DataScanLen);
        this.DataSqrOut = new Array(this.DataScanLen);

        this.DataVect = new Array(this.DataScanLen);
        for (let i = 0; i < this.DataScanLen; i++) {
            this.DataVect[i] = { re: 0, im: 0 };
            this.DataSqrMid[i] = { re: 0, im: 0};
            this.DataSqrOut[i] = { re: 0, im: 0};
        }
        this.DatadspPhase = new Float64Array(this.DataScanLen);
        this.DatadspPhase2 = new Float64Array(this.DataScanLen);

        this.Decoder = new MT63decoder(DataCarriers, this.DataInterleave,
                             this.InterleavePattern, dataScanMargin, IntegLen);

        this.SpectraDisplay = SpectraDisplay;
        if (SpectraDisplay) {
            this.SpectradspPower = new Float64Array(this.WindowLen);
        }
    }

    Process(input: Float32Array): void {
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

        const inputSplitResp = this.InpSplit.process(input);

        this.ProcLine.process(inputSplitResp, inputSplitResp.length);
        //  TestOfs.Process(this.InpSplit.Output);
        //  ProcLine.Process(this.TestOfs.Output);

        // printf("New input, Len=%d/%d\n", Input.Len, ProcLine.InpLen);

        // Check if we have enough data from the current position to process a full window
        // In C++: while((SyncProcPtr+WindowLen) < ProcLine.InpLen)
        while (this.SyncProcPtr + this.WindowLen <= this.ProcLine.inpLen) {
            // Fix: Use proper offset calculation for circular buffer access
            const sliceStart = this.ProcLine.inpOffset + this.SyncProcPtr;
            this.SyncProcess(this.ProcLine.inpPtr.slice(sliceStart));

            if (this.SyncPtr === this.SymbPtr) {

                const s1 = this.SyncProcPtr - this.ProcdspDelay +
                          (Math.trunc(this.SyncSymbShift) - this.SymbPtr * this.SyncStep);
                const s2 = s1 + SymbolSepar / 2;


                // Calculate actual offsets into the line
                // In C++: DataProcess(ProcLine.InpPtr + s1, ProcLine.InpPtr + s2, ...)
                // In TypeScript: InpPtr is the whole array, and inpOffset tells us where input starts
                // When s1 is negative, we need to go back from inpOffset into the delay buffer
                // The delay buffer is at the beginning of the line array
                const dataOffset1 = this.ProcLine.inpOffset + s1;
                const dataOffset2 = this.ProcLine.inpOffset + s2;

                // Bounds check - also ensure we have enough history
                if (dataOffset1 >= 0 && dataOffset1 + this.WindowLen <= this.ProcLine.line.length &&
                    dataOffset2 >= 0 && dataOffset2 + this.WindowLen <= this.ProcLine.line.length &&
                    this.ProcLine.dataLen >= this.ProcdspDelay) {  // Need enough history!

                    const slice1 = this.ProcLine.line.slice(dataOffset1, dataOffset1 + this.WindowLen);
                    const slice2 = this.ProcLine.line.slice(dataOffset2, dataOffset2 + this.WindowLen);

                    this.DataProcess(slice1, slice2, this.SyncFreqOfs, s1 - this.DataProcPtr);
                }
                this.DataProcPtr = s1;
            }
            this.SyncProcPtr += this.SyncStep;
        }
        this.SyncProcPtr -= this.ProcLine.inpLen;
        this.DataProcPtr -= this.ProcLine.inpLen;
    }

    DoCorrelSum(Correl1: dspCmpx[], Correl2: dspCmpx[], Aver: dspCmpx[]) {
        let sx = new dspCmpx(0, 0);

        const s = 2 * DataCarrSepar;
        const d = DataCarriers * DataCarrSepar;
        sx.re = sx.im = 0.0;
        for (let i = 0; i < d; i += s) {
            sx.re += Correl1[i].re;
            sx.im += Correl1[i].im;
            sx.re += Correl2[i].re;
            sx.im += Correl2[i].im;
        }
        Aver[0].re = sx.re / DataCarriers;
        Aver[0].im = sx.im / DataCarriers;
        for (let i = 0; i < (this.FitLen - s); ) {
            sx.re -= Correl1[i].re;
            sx.im -= Correl1[i].im;
            sx.re -= Correl2[i].re;
            sx.im -= Correl2[i].im;
            sx.re += Correl1[i + d].re;
            sx.im -= Correl1[i + d].im;
            sx.re += Correl2[i + d].re;
            sx.im -= Correl2[i + d].im;
            i += s;
            Aver[i].re = sx.re / DataCarriers;
            Aver[i].im = sx.im / DataCarriers;
        }
    }

    SyncProcess(Slice: dspCmpx[]) {
        let i: number, j: number, k: number, r: number, s: number, s2: number;
        let pI: number, pQ: number;
        let Correl: dspCmpx = new dspCmpx(0, 0);
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

        this.SyncPtr = (this.SyncPtr + 1) & (SYMBOL_DIV - 1); // increment the correlators pointer

        // Perform FFT on windowed input
        for (i = 0; i < this.WindowLen; i++) {
            r = this.FFT.BitRevIdx[i];
            if (i < Slice.length && Slice[i]) {
                this.FFTbuff[r].re = Slice[i].re * this.RxWindow[i];
                this.FFTbuff[r].im = Slice[i].im * this.RxWindow[i];
            } else {
                this.FFTbuff[r].re = 0;
                this.FFTbuff[r].im = 0;
            }
        }
        this.FFT.coreProc(this.FFTbuff);

        // Optional spectrum display
        if (this.SpectraDisplay) {
            for (i = 0, j = this.FirstDataCarr + (DataCarriers / 2) * DataCarrSepar - this.WindowLen / 2;
                (i < this.WindowLen) && (j < this.WindowLen);
                i++, j++
            ) {
                this.SpectradspPower[i] = dspPower(this.FFTbuff[j]);
            }
            for (j = 0; (i < this.WindowLen) && (j < this.WindowLen); i++, j++) {
                this.SpectradspPower[i] = dspPower(this.FFTbuff[j]);
            }
            this.SpectraDisplay(this.SpectradspPower, this.WindowLen);
        }

        // Process correlation with previous slice
        PrevSlice = this.SyncPipe[this.SyncPtr];
        for (i = 0; i < this.ScanLen; i++) {
            k = (this.ScanFirst + i) & this.WindowLenMask;
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
                this.W1p,
                this.W2p,
                this.W5p,
            ));
            // Correlate with phase-corrected previous slice
            pI = PrevSlice[i].re * this.SyncPhCorr[i].re -
                PrevSlice[i].im * this.SyncPhCorr[i].im;
            pQ = PrevSlice[i].re * this.SyncPhCorr[i].im +
                PrevSlice[i].im * this.SyncPhCorr[i].re;
            Correl.re = dQ * pQ + dI * pI;
            Correl.im = dQ * pI - dI * pQ;
            // Low-pass filter the correlation
            const result = dspLowPass2(Correl, this.CorrelMid[this.SyncPtr][i],
                        this.CorrelOut[this.SyncPtr][i], this.W1, this.W2, this.W5);
            this.CorrelMid[this.SyncPtr][i] = result.mid;
            this.CorrelOut[this.SyncPtr][i] = result.out;
            // Store current slice for next iteration
            PrevSlice[i].re = dI;
            PrevSlice[i].im = dQ;
        }

        // Process when we've collected enough phases
        if (this.SyncPtr === (this.SymbPtr ^ 2)) {
            // Normalize correlations
            for (s = 0; s < SYMBOL_DIV; s++) {
                for (i = 0; i < this.ScanLen; i++) {
                    if (this.dspPowerOut[i] > 0.0) {
                        this.CorrelNorm[s][i].re = this.CorrelOut[s][i].re / this.dspPowerOut[i];
                        this.CorrelNorm[s][i].im = this.CorrelOut[s][i].im / this.dspPowerOut[i];
                    } else {
                        this.CorrelNorm[s][i].im = this.CorrelNorm[s][i].re = 0.0;
                    }
                }
            }

            // Sum correlations for each possible carrier position
            for (s = 0; s < SYMBOL_DIV; s++) {
                s2 = (s + SYMBOL_DIV / 2) & (SYMBOL_DIV - 1);
                for (k = 0; k < 2 * DataCarrSepar; k++) {
                    this.DoCorrelSum(
                        this.CorrelNorm[s].slice(k),
                        this.CorrelNorm[s2].slice(k + DataCarrSepar),
                        this.CorrelAver[s].slice(k)
                    );
                }
            }

            // Symbol-shift phase fitting
            for (i = 0; i < this.FitLen; i++) {
                this.SymbFit[i].re = dspAmpl(this.CorrelAver[0][i]) -
                                dspAmpl(this.CorrelAver[2][i]);
                this.SymbFit[i].im = dspAmpl(this.CorrelAver[1][i]) -
                                dspAmpl(this.CorrelAver[3][i]);
            }

            // Find maximum power position
            const { power: maxPower, index: maxIndex } = dspFindMaxPower(this.SymbFit.slice(2), this.FitLen - 4);
            P = maxPower;
            j = maxIndex + 2;

            // Adjust position to stay within carrier range
            k = Math.trunc((j - this.SymbFitPos) / DataCarrSepar);
            if (k > 1)
                j -= (k - 1) * DataCarrSepar;
            else if (k < -1)
                j -= (k + 1) * DataCarrSepar;
            this.SymbFitPos = j;

            if (P > 0.0) {
                // Calculate symbol confidence
                SymbConf = dspAmpl(this.SymbFit[j]) +
                        0.5 * (dspAmpl(this.SymbFit[j + 1]) + dspAmpl(this.SymbFit[j - 1]));
                SymbConf *= 0.5;

                // Average neighboring points
                I = this.SymbFit[j].re + 0.5 * (this.SymbFit[j - 1].re + this.SymbFit[j + 1].re);
                Q = this.SymbFit[j].im + 0.5 * (this.SymbFit[j - 1].im + this.SymbFit[j + 1].im);
                SymbTime.re = I;
                SymbTime.im = Q;

                // Calculate symbol shift
                SymbShift = (dspPhase(SymbTime) / (2 * Math.PI)) * SYMBOL_DIV;
                if (SymbShift < 0)
                    SymbShift += SYMBOL_DIV;

                // First estimation of frequency offset
                pI = dspScalProd(I, Q, this.SymbFit[j])
                    + 0.7 * dspScalProd(I, Q, this.SymbFit[j - 1])
                    + 0.7 * dspScalProd(I, Q, this.SymbFit[j + 1]);
                pQ = 0.7 * dspScalProd(I, Q, this.SymbFit[j + 1])
                    - 0.7 * dspScalProd(I, Q, this.SymbFit[j - 1])
                    + 0.5 * dspScalProd(I, Q, this.SymbFit[j + 2])
                    - 0.5 * dspScalProd(I, Q, this.SymbFit[j - 2]);
                FreqOfs = j + dspPhase(pI, pQ) / (2.0 * Math.PI / 8);

                // Refine frequency offset
                i = Math.floor(FreqOfs + 0.5);
                s = Math.floor(SymbShift);
                s2 = (s + 1) & (SYMBOL_DIV - 1);
                w0 = (s + 1 - SymbShift);
                w1 = (SymbShift - s);
                A = (0.5 * this.WindowLen) / SymbolSepar;
                I = w0 * this.CorrelAver[s][i].re + w1 * this.CorrelAver[s2][i].re;
                Q = w0 * this.CorrelAver[s][i].im + w1 * this.CorrelAver[s2][i].im;
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
            if (this.SyncLocked) {
                // Flip SymbTime if it doesn't agree with average
                if (SymbTime && this.AverSymb &&
                    dspScalProd(SymbTime, this.AverSymb) < 0.0) {
                    SymbTime.re = -SymbTime.re;
                    SymbTime.im = -SymbTime.im;
                    FreqOfs -= DataCarrSepar;
                }
                // Reduce frequency offset towards average
                A = 2 * DataCarrSepar;
                k = Math.floor((FreqOfs - this.AverFreq) / A + 0.5);
                FreqOfs -= k * A;

                // Correct frequency auto-correlator wrap
                A = (0.5 * this.WindowLen) / SymbolSepar;
                F0 = FreqOfs - this.AverFreq;
                Fl = F0 - A;
                Fu = F0 + A;
                if (Math.abs(Fl) < Math.abs(F0))
                    FreqOfs += (Math.abs(Fu) < Math.abs(Fl)) ? A : -A;
                else
                    FreqOfs += (Math.abs(Fu) < Math.abs(F0)) ? A : 0.0;
            } else {
                // Flip SymbTime if it doesn't agree with previous
                if (SymbTime && this.SymbPipe[this.TrackPipePtr] &&
                    dspScalProd(SymbTime, this.SymbPipe[this.TrackPipePtr]) < 0.0) {
                    SymbTime.re = -SymbTime.re;
                    SymbTime.im = -SymbTime.im;
                    FreqOfs -= DataCarrSepar;
                }
                // Reduce FreqOfs towards zero
                A = 2 * DataCarrSepar;
                k = Math.floor(FreqOfs / A + 0.5);
                FreqOfs -= k * A;

                F0 = FreqOfs - this.FreqPipe[this.TrackPipePtr];
                Fl = F0 - A;
                Fu = F0 + A;
                if (Math.abs(Fl) < Math.abs(F0))
                    FreqOfs += (Math.abs(Fu) < Math.abs(Fl)) ? A : -A;
                else
                    FreqOfs += (Math.abs(Fu) < Math.abs(F0)) ? A : 0.0;
            }

            // Update tracking pipes
            this.TrackPipePtr += 1;
            if (this.TrackPipePtr >= this.TrackPipeLen)
                this.TrackPipePtr -= this.TrackPipeLen;
            this.SymbPipe[this.TrackPipePtr] = SymbTime;
            this.FreqPipe[this.TrackPipePtr] = FreqOfs;

            // Find average symbol time
            const symbResult = dspSelFitAver(this.SymbPipe, this.TrackPipeLen, 3.0, 4);
            this.AverSymb = symbResult.aver as dspCmpx;

            // Find average frequency offset
            const freqResult = dspSelFitAver(this.FreqPipe, this.TrackPipeLen, 2.5, 4);
            this.AverFreq = freqResult.aver as number;
            this.SyncFreqDev = freqResult.rms;

            // Update sync parameters
            SymbConf = dspAmpl(this.AverSymb);
            this.SyncSymbConf = SymbConf;
            this.SyncFreqOfs = this.AverFreq;

            if (SymbConf > 0.0) {
                SymbShift = dspPhase(this.AverSymb) / (2 * Math.PI) * SymbolSepar;
                if (SymbShift < 0.0)
                    SymbShift += SymbolSepar;
                this.SymbPtr = Math.floor((dspPhase(this.AverSymb) / (2 * Math.PI)) * SYMBOL_DIV);
                if (this.SymbPtr < 0)
                    this.SymbPtr += SYMBOL_DIV;
                this.SyncSymbShift = SymbShift;
            }

            // Update lock status
            if (this.SyncLocked) {
                if ((this.SyncSymbConf < this.SyncHoldThres) || (this.SyncFreqDev > 0.250))
                    this.SyncLocked = 0;
            } else {
                if ((this.SyncSymbConf > this.SyncLockThres) && (this.SyncFreqDev < 0.125))
                    this.SyncLocked = 1;
            }

            this.SyncSymbConf *= 0.5;
        }
    }

    DataProcess(EvenSlice: dspCmpx[], OddSlice: dspCmpx[], FreqOfs: number, TimeDist: number) {
        let i: number, c: number, r: number;
        let Freq: dspCmpx, Phas: dspCmpx;
        let incr: number, p: number;
        let I: number, Q: number, P: number;
        let Dtmp: dspCmpx;
        let Ftmp: dspCmpx;

        // Step 1: Apply frequency offset correction and window to time-domain slices
        P = (-2 * Math.PI * FreqOfs) / this.WindowLen;
        Freq = new dspCmpx(Math.cos(P), Math.sin(P));
        Phas = new dspCmpx(1.0, 0.0);

        for (i = 0; i < this.WindowLen; i++) {
            r = this.FFT.BitRevIdx[i];

            // Process even slice
            if (i < EvenSlice.length && EvenSlice[i]) {
                Dtmp = dspCmpxMult(EvenSlice[i], Phas);
                this.FFTbuff[r].re = Dtmp.re * this.RxWindow[i];
                this.FFTbuff[r].im = Dtmp.im * this.RxWindow[i];
            } else {
                this.FFTbuff[r].re = 0;
                this.FFTbuff[r].im = 0;
            }

            // Process odd slice
            if (i < OddSlice.length && OddSlice[i]) {
                Dtmp = dspCmpxMult(OddSlice[i], Phas);
                this.FFTbuff2[r].re = Dtmp.re * this.RxWindow[i];
                this.FFTbuff2[r].im = Dtmp.im * this.RxWindow[i];
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
        incr = (TimeDist * DataCarrSepar) & this.WindowLenMask;
        p = (TimeDist * this.DataScanFirst) & this.WindowLenMask;

        // Store current FFT values in temporary array to update RefDataSlice AFTER processing
        const tempRefData: dspCmpx[] = new Array(this.DataScanLen);
        let tempIndex = 0;

        for (c = this.DataScanFirst, i = 0; i < this.DataScanLen; ) {
            // Process first carrier from FFTbuff

            Phas = this.FFT.Twiddle[p];
            Dtmp = dspCmpxMult(this.RefDataSlice[i], Phas);
            this.DataVect[i] = dspCmpxMultConj(this.FFTbuff[c & this.WindowLenMask], Dtmp);

            P = dspPower(this.FFTbuff[c & this.WindowLenMask]);
            const pwrResult = dspLowPass2(P, this.DataPwrMid[i], this.DataPwrOut[i],
                                         this.dW1, this.dW2, this.dW5);
            this.DataPwrMid[i] = pwrResult.mid;
            this.DataPwrOut[i] = pwrResult.out;

            // Store for delayed update of RefDataSlice
            tempRefData[tempIndex++] = { re: this.FFTbuff[c & this.WindowLenMask].re, im: this.FFTbuff[c & this.WindowLenMask].im };
            i++;
            c = (c + DataCarrSepar) & this.WindowLenMask;
            p = (p + incr) & this.WindowLenMask;


            Phas = this.FFT.Twiddle[p];
            Dtmp = dspCmpxMult(this.RefDataSlice[i], Phas);
            this.DataVect[i] = dspCmpxMultConj(this.FFTbuff2[c & this.WindowLenMask], Dtmp);

            P = dspPower(this.FFTbuff2[c & this.WindowLenMask]);
            const pwrResult2 = dspLowPass2(P, this.DataPwrMid[i], this.DataPwrOut[i],
                                          this.dW1, this.dW2, this.dW5);
            this.DataPwrMid[i] = pwrResult2.mid;
            this.DataPwrOut[i] = pwrResult2.out;

            // Store for delayed update of RefDataSlice
            tempRefData[tempIndex++] = { re: this.FFTbuff2[c & this.WindowLenMask].re, im: this.FFTbuff2[c & this.WindowLenMask].im };
            i++;
            c = (c + DataCarrSepar) & this.WindowLenMask;
            p = (p + incr) & this.WindowLenMask;
        }

        // Now update RefDataSlice with current FFT values for NEXT iteration (delayed by one chunk)
        for (i = 0; i < this.DataScanLen; i++) {
            this.RefDataSlice[i] = tempRefData[i];
        }

        // Step 4: Apply additional frequency correction to differential decoded data
        P = (-TimeDist * 2 * Math.PI * FreqOfs) / this.WindowLen;
        Freq = new dspCmpx(Math.cos(P), Math.sin(P));

        // Apply DataPipe delay line with frequency correction
        for (i = 0; i < this.DataScanLen; i++) {
            Ftmp = dspCmpxMult(this.DataVect[i], Freq);
            this.DataVect[i] = this.DataPipe[this.DataPipePtr][i];
            this.DataPipe[this.DataPipePtr][i] = Ftmp;
        }
        this.DataPipePtr = (this.DataPipePtr + 1) % this.DataPipeLen;

        // Step 5: Convert to phase values (soft decisions)
        for (i = 0; i < this.DataScanLen; i++) {
            if (this.DataPwrOut[i] > 0.0) {
                P = this.DataVect[i].re / this.DataPwrOut[i];
                if (P > 1.0) P = 1.0;
                else if (P < -1.0) P = -1.0;
                this.DatadspPhase[i] = P;
            } else {
                this.DatadspPhase[i] = 0.0;
            }
        }

        // Step 6: Pass to decoder
        this.Decoder.Process(this.DatadspPhase);
        this.Output.Data[this.Output.Len] = this.Decoder.Output;
        this.Output.Len++;
    }

    FEC_SNR() {
        return this.Decoder.SignalToNoise;
    }
}

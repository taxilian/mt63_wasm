import { dspCmpx, DspCmpxBuff } from './dsp.js';

export class dspCmpxOverlapWindow {
    public Output: DspCmpxBuff = new DspCmpxBuff();

    private Len: number = 0;
    private Buff: dspCmpx[] = [];
    private Dist: number = 0;
    private Window: number[] | null = null;
    private ExternWindow: boolean = true;

    constructor() {
        // Initialize class properties
    }

    free(): void {
        // Free method implementation
        this.Buff = [];
        this.Window = [];
    }

    preset(WindowLen: number, SlideDist: number, WindowShape: number[]): void {
        let i: number;

        if (SlideDist > WindowLen) {
            throw new Error("SlideDist > WindowLen");
        }
        this.Len = WindowLen;
        this.Dist = SlideDist;

        this.Buff.length = this.Len;

        for (i = 0; i < this.Len; i++) {
            this.Buff[i] = new dspCmpx(0.0, 0.0);
        }

        if (!this.ExternWindow) {
            this.Window = [];
        }

        this.Window = WindowShape;
        this.ExternWindow = true;
    }

    setWindow(NewWindow: ((dspPhase: number) => number) | null, Scale: number): number {
        let idx: number;

        if (NewWindow === null) {
            if (!this.ExternWindow) {
                this.Window = null;
            }
            this.Window = null;
            this.ExternWindow = true;
            return 0;
        }

        if (this.ExternWindow) {
            this.Window = null;
            this.ExternWindow = false;
        }

        this.Window = []; // new Float64Array(this.Len);

        for (idx = 0; idx < this.Len; idx++) {
            this.Window[idx] = NewWindow(2 * Math.PI * (idx - this.Len / 2 + 0.5) / this.Len) * Scale;
        }

        return 0;
    }

    process(input: DspCmpxBuff): number {
        this.Output.len = 0;
        for (let i = 0; i < input.len; i += this.Len) {
            this.Output.ensureSpace(this.Output.len + this.Dist);
            this.processToOutput(input.data.slice(i), this.Output.len);
            this.Output.len += this.Dist;
        }
        return 0;
      }

    processWithInput(Input: dspCmpx[]): number {
        this.Output.ensureSpace(this.Dist);
        this.processToOutput(Input, this.Output.len);
        this.Output.len = this.Dist;
        return 0;
    }

    processToOutput(input: dspCmpx[], outputIndex: number): void {
        const output = this.Output.data;
        if (this.Window === null) {
            for (let i = 0; i < this.Dist; i++) {
                // if (!output[i]) {
                //     output[i + outputIndex] = new dspCmpx(0, 0);
                // }
                // output[i + outputIndex].re = this.Buff[i].re + input[i].re;
                // output[i + outputIndex].im = this.Buff[i].im + input[i].im;
                output[i + outputIndex] = new dspCmpx(
                    this.Buff[i].re + input[i].re,
                    this.Buff[i].im + input[i].im,
                );
            }
            for (let i = this.Dist; i < this.Len - this.Dist; i++) {
                this.Buff[i - this.Dist].re = this.Buff[i].re + input[i].re;
                this.Buff[i - this.Dist].im = this.Buff[i].im + input[i].im;
            }
            for (let i = this.Len - this.Dist; i < this.Len; i++) {
                this.Buff[i - this.Dist].re = input[i].re;
                this.Buff[i - this.Dist].im = input[i].im;
            }
        } else {
            for (let i = 0; i < this.Dist; i++) {
                // if (!output[i + outputIndex]) {
                //     output[i + outputIndex] = new dspCmpx(0, 0);
                // }
                // output[i + outputIndex].re = this.Buff[i].re + input[i].re * this.Window[i];
                // output[i + outputIndex].im = this.Buff[i].im + input[i].im * this.Window[i];
                output[i + outputIndex] = new dspCmpx(
                    this.Buff[i].re + input[i].re * this.Window[i],
                    this.Buff[i].im + input[i].im * this.Window[i],
                );
            }
            for (let i = this.Dist; i < this.Len - this.Dist; i++) {
                this.Buff[i - this.Dist].re = this.Buff[i].re + input[i].re * this.Window[i];
                this.Buff[i - this.Dist].im = this.Buff[i].im + input[i].im * this.Window[i];
            }
            for (let i = this.Len - this.Dist; i < this.Len; i++) {
                this.Buff[i - this.Dist].re = input[i].re * this.Window[i];
                this.Buff[i - this.Dist].im = input[i].im * this.Window[i];
            }
        }
    }

    processSilence(Slides: number): number {
        this.Output.ensureSpace(Slides * this.Dist);
        this.Output.len = 0;
        for (let slide = 0; slide < Slides; slide++) {
            this.Output.data.splice(this.Output.len, this.Dist, ...this.Buff.slice(0, this.Dist));
            this.Buff.splice(0, this.Len - this.Dist, ...this.Buff.slice(this.Dist, this.Len));
            this.Output.len += this.Dist;
        }
        return 0;
    }
}

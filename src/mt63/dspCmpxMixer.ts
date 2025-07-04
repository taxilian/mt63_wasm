import { dspCmpx, DspCmpxBuff } from './dsp';

export class DspCmpxMixer {
    public dspPhase: number = 0;
    public omega: number = 0;
    public output: DspCmpxBuff = new DspCmpxBuff();

    free(): void {
        this.output.free();
    }

    preset(carrierOmega: number): number {
        this.omega = carrierOmega;
        return 0;
    }

    process(inp: dspCmpx[], inpLen: number, out: dspCmpx[]): number {
        let i: number;
        let I: number, Q: number;
        for (i = 0; i < inpLen; i++) {
            I = Math.cos(this.dspPhase);
            Q = Math.sin(this.dspPhase);
            out[i].re = I * inp[i].re + Q * inp[i].im;
            out[i].im = I * inp[i].im - Q * inp[i].re;
            this.dspPhase += this.omega;
            if (this.dspPhase >= 2 * Math.PI) {
                this.dspPhase -= 2 * Math.PI;
            }
        }
        return inpLen;
    }

    processFast(inp: dspCmpx[], inpLen: number, out: dspCmpx[]): number {
        let i: number;
        let dI: number, dQ: number, I: number, Q: number, nI: number, nQ: number, N: number;
        dI = Math.cos(this.omega);
        dQ = Math.sin(this.omega);
        I = Math.cos(this.dspPhase);
        Q = Math.sin(this.dspPhase);
        for (i = 0; i < inpLen; i++) {
            out[i].re = I * inp[i].re + Q * inp[i].im;
            out[i].im = I * inp[i].im - Q * inp[i].re;
            nI = I * dI - Q * dQ;
            nQ = Q * dI + I * dQ;
            I = nI;
            Q = nQ;
        }
        this.dspPhase += inpLen * this.omega;
        N = Math.floor(this.dspPhase / (2 * Math.PI));
        this.dspPhase -= N * 2 * Math.PI;
        return inpLen;
    }

    processInput(input: DspCmpxBuff): number {
        this.output.ensureSpace(input.len);
        this.process(input.data, input.len, this.output.data);
        this.output.len = input.len;
        return 0;
    }

    processFastInput(input: DspCmpxBuff): number {
        this.output.ensureSpace(input.len);
        this.processFast(input.data, input.len, this.output.data);
        this.output.len = input.len;
        return 0;
    }
}

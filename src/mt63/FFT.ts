import { dspCmpx } from "./dsp";

// tslint:disable max-classes-per-file
export class dsp_r2FFT {
    Size: number = 0;
    BitRevIdx: number[] = [];
    Twiddle: dspCmpx[] = [];

    constructor(size?: number) {
        if (size) {
            this.preset(size);
        }
    }

    Free(): void {
        // implementation if needed
        this.Size = 0;
        this.BitRevIdx = [];
        this.Twiddle = [];
    }

    preset(size: number): number {
        let idx: number, ridx: number, mask: number, rmask: number;
        let dspPhase: number;

        if (!dspPowerOf2(size)) {
            return -1;
        }
        this.Size = size;
        this.BitRevIdx.length = this.Size;
        this.Twiddle.length = this.Size;

        for (idx = 0; idx < this.Size; idx++) {
            dspPhase = (2 * Math.PI * idx) / this.Size;
            this.Twiddle[idx] = new dspCmpx(Math.cos(dspPhase), Math.sin(dspPhase));
            // this.Twiddle[idx].re = Math.cos(dspPhase);
            // this.Twiddle[idx].im = Math.sin(dspPhase);
        }

        for (ridx = 0, idx = 0; idx < this.Size; idx++) {
            for (ridx = 0, mask = this.Size / 2, rmask = 1; mask; mask >>= 1, rmask <<= 1) {
                if (idx & mask) {
                    ridx |= rmask;
                }
            }
            this.BitRevIdx[idx] = ridx;
        }

        return 0;
    }


    private scramble(x: dspCmpx[]): void {
        let idx: number, ridx: number;
        let tmp: dspCmpx;

        for (idx = 0; idx < this.Size; idx++) {
            if ((ridx = this.BitRevIdx[idx]) > idx) {
                tmp = x[idx];
                x[idx] = x[ridx];
                x[ridx] = tmp;
                // console.log("%d <=> %d\n", idx, ridx);
            }
        }
    }


    separTwoReals(Buff: dspCmpx[], Out0: dspCmpx[], Out1: dspCmpx[]): void {
        let idx: number;
        let HalfSize = this.Size / 2;

        Out0[0].re = Buff[0].re;
        Out1[0].re = Buff[0].im;

        for (idx = 1; idx < HalfSize; idx++) {
            Out0[idx].re = Buff[idx].re + Buff[this.Size - idx].re;
            Out0[idx].im = Buff[idx].im - Buff[this.Size - idx].im;
            Out1[idx].re = Buff[idx].im + Buff[this.Size - idx].im;
            Out1[idx].im = (-Buff[idx].re) + Buff[this.Size - idx].re;
        }

        Out0[0].im = Buff[HalfSize].re;
        Out1[0].im = Buff[HalfSize].im;
    }


    joinTwoReals(Inp0: dspCmpx[], Inp1: dspCmpx[], Buff: dspCmpx[]): void {
        let idx: number;
        let HalfSize = this.Size / 2;

        Buff[0].re = 2 * Inp0[0].re;
        Buff[0].im = (-2 * Inp1[0].re);

        for (idx = 1; idx < HalfSize; idx++) {
            Buff[idx].re = Inp0[idx].re - Inp1[idx].im;
            Buff[idx].im = (-Inp0[idx].im) - Inp1[idx].re;
            Buff[this.Size - idx].re = Inp0[idx].re + Inp1[idx].im;
            Buff[this.Size - idx].im = Inp0[idx].im - Inp1[idx].re;
        }

        Buff[HalfSize].re = 2 * Inp0[0].im;
        Buff[HalfSize].im = (-2 * Inp1[0].im);
    }


    coreProc(x: dspCmpx[]): void {
        let Bf: number;
        const HalfSize = this.Size / 2;

        for (Bf = 0; Bf < this.Size; Bf += 2) {
            this.FFT2(x[Bf], x[Bf + 1]); // first pass
        }

        for (
            let Groups = HalfSize / 2, GroupHalfSize = 2;
            Groups;
            Groups >>= 1, GroupHalfSize <<= 1
        ) {
            for (let Group = 0, Bf = 0; Group < Groups; Group++, Bf += GroupHalfSize) {
                for (let TwidIdx = 0; TwidIdx < HalfSize; TwidIdx += Groups, Bf++) {
                    this.FFTbf(x[Bf], x[Bf + GroupHalfSize], this.Twiddle[TwidIdx]);
                }
            }
        }
    }


    ProcInPlace(x: dspCmpx[]): void {
        this.scramble(x);
        this.coreProc(x);
    }

    // Private methods
    private FFTbf(x0: dspCmpx, x1: dspCmpx, W: dspCmpx): void {
        let x1W: dspCmpx = { re: 0, im: 0 };
        x1W.re = x1.re * W.re + x1.im * W.im;
        x1W.im = -x1.re * W.im + x1.im * W.re;
        x1.re = x0.re - x1W.re;
        x1.im = x0.im - x1W.im;
        x0.re = x0.re + x1W.re;
        x0.im = x0.im + x1W.im;
    }

    private FFT2(x0: dspCmpx, x1: dspCmpx): void {
        let x1W: dspCmpx = { re: x1.re, im: x1.im };
        x1.re = x0.re - x1.re;
        x1.im = x0.im - x1.im;
        x0.re += x1W.re;
        x0.im += x1W.im;
    }


    private FFT4(x0: dspCmpx, x1: dspCmpx, x2: dspCmpx, x3: dspCmpx): void {
        let x1W: dspCmpx = { re: x2.re, im: x2.im };
        x2.re = x0.re - x1W.re;
        x2.im = x0.im - x1W.im;
        x0.re += x1W.re;
        x0.im += x1W.im;

        x1W.re = x3.im;
        x1W.im = -x3.re;
        x3.re = x1.re - x1W.re;
        x3.im = x1.im - x1W.im;
        x1.re += x1W.re;
        x1.im += x1W.im;
    }
}

function dspPowerOf2(I: number): boolean {
    let c = 0;
    if (I <= 0) {
        return false;
    }
    while (I !== 0) {
        c += I & 1;
        I >>= 1;
    }
    return c === 1;
}

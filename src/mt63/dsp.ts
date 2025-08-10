// tslint:disable max-classes-per-file

export function dspWindowBlackman3(dspPhase: number): number {
  return 0.35875 + 0.48829 * Math.cos(dspPhase) + 0.14128 * Math.cos(2 * dspPhase) + 0.01168 * Math.cos(3 * dspPhase);
}

export class dspCmpx {
    constructor(
        public re: number,
        public im: number,
    ) { }
}

export function dspPowerOf2(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
}
// export function dspPowerOf2(I: number): boolean {
//     let c = 0;
//     if (I <= 0) {
//         return false;
//     }
//     for (; I !== 0; I >>= 1) {
//         c += I & 1;
//     }
//     return c === 1;
// }

export class DspSeq<T> {
    len: number = 0;
    data: T[] = [];

    ensureSpace(reqSpace: number): void {
        if (reqSpace <= this.data.length) {
            return;
        }
        this.data.length = reqSpace;
    }

    free(): void {
        this.data = [];
        this.len = 0;
    }
}

export class DspCmpxBuff extends DspSeq<dspCmpx> {}

export function dspWinFirI(
    lowOmega: number,
    uppOmega: number,
    shape: number[],
    len: number,
    window: (arg: number) => number,
    shift: number = 0,
): void {
    let i: number;
    let time: number;
    let dspPhase: number;
    let shapeValue: number;

    for (i = 0; i < len; i++) {
        time = i + (1.0 - shift) - len / 2.0;
        dspPhase = 2 * Math.PI * time / len;

        if (time === 0) {
            shapeValue = uppOmega - lowOmega;
        } else {
            shapeValue = (Math.sin(uppOmega * time) - Math.sin(lowOmega * time)) / time;
        }
        shape[i] = shapeValue * window(dspPhase) / Math.PI;
    }
}

export function winFirQ(
    lowOmega: number,
    uppOmega: number,
    shape: number[],
    len: number,
    window: (arg: number) => number,
    shift: number = 0,
): void {
    let i: number;
    let time: number;
    let dspPhase: number;
    let shapeValue: number;

    for (i = 0; i < len; i++) {
        time = i + (1.0 - shift) - len / 2.0;
        dspPhase = 2 * Math.PI * time / len;

        if (time === 0) {
            shapeValue = 0.0;
        } else {
            shapeValue = (-Math.cos(uppOmega * time) + Math.cos(lowOmega * time)) / time;
        }

        shape[i] = (-shapeValue) * window(dspPhase) / Math.PI;
    }
}


export function dspWalshTrans(Data: Float32Array | Float64Array, Len: number): void {  // Len must be 2^N
  for (let step = 1; step < Len; step *= 2) {
      for (let ptr = 0; ptr < Len; ptr += 2 * step) {
          for (let ptr2 = ptr; (ptr2 - ptr) < step; ptr2 += 1) {
              let bit1 = Data[ptr2];
              let bit2 = Data[ptr2 + step];
              Data[ptr2] = bit1 + bit2;
              Data[ptr2 + step] = bit2 - bit1;
          }
      }
  }
}
export function dspWalshInvTrans(data: number[], len: number): void {
    for (let step = len / 2; step >= 1; step /= 2) {
        for (let ptr = 0; ptr < len; ptr += 2 * step) {
            for (let ptr2 = ptr; (ptr2 - ptr) < step; ptr2 += 1) {
                let bit1 = data[ptr2];
                let bit2 = data[ptr2 + step];
                data[ptr2] = bit1 - bit2;
                data[ptr2 + step] = bit1 + bit2;
            }
        }
    }
}

export function dspLowPass2Coeff(integLen: number): { w1: number, w2: number, w5: number } {
    return {
        w1: 1 / integLen,
        w2: 2 / integLen,
        w5: 5 / integLen,
    };
}

export function dspLowPass2(input: number, mid: number, out: number, w1: number, w2: number, w5: number): { mid: number, out: number };
export function dspLowPass2(input: dspCmpx, mid: dspCmpx, out: dspCmpx, w1: number, w2: number, w5: number): { mid: dspCmpx, out: dspCmpx };
export function dspLowPass2(input: number | dspCmpx, mid: number | dspCmpx, out: number | dspCmpx, w1: number, w2: number, w5: number): { mid: number | dspCmpx, out: number | dspCmpx } {
    if (typeof input === 'number') {
        const sum = (mid as number) + (out as number);
        const diff = (mid as number) - (out as number);
        return {
            mid: (mid as number) + w2 * input - w1 * sum,
            out: (out as number) + w5 * diff,
        };
    } else {
        // Complex version
        const midC = mid as dspCmpx;
        const outC = out as dspCmpx;
        const sumRe = midC.re + outC.re;
        const sumIm = midC.im + outC.im;
        const diffRe = midC.re - outC.re;
        const diffIm = midC.im - outC.im;
        return {
            mid: new dspCmpx(
                midC.re + w2 * input.re - w1 * sumRe,
                midC.im + w2 * input.im - w1 * sumIm
            ),
            out: new dspCmpx(
                outC.re + w5 * diffRe,
                outC.im + w5 * diffIm
            ),
        };
    }
}

export function dspFindMax(Data: number[] | Float32Array | Float64Array, Len: number): { max: number, index: number } {
    let max = Data[0];
    let index = 0;
    for (let i = 1; i < Len; i++) {
        if (Data[i] > max) {
            max = Data[i];
            index = i;
        }
    }
    return { max, index };
}

export function dspFindMin(Data: number[] | Float32Array | Float64Array, Len: number): { min: number, index: number } {
    let min = Data[0];
    let index = 0;
    for (let i = 1; i < Len; i++) {
        if (Data[i] < min) {
            min = Data[i];
            index = i;
        }
    }
    return { min, index };
}

export function dspRMS(input: Float32Array | Float64Array | number[] | dspCmpx[] | DspSeq<number> | DspCmpxBuff, len: number): number {
    if ('data' in input) {
        return dspRMS(input.data, input.len);
    }
    return Math.sqrt(dspPower(input, len) / len);
}

// inline double dspPower(double X) { return X*X; }
// inline double dspPower(double I, double Q) { return I*I + Q*Q; }
// inline double dspPower(dspCmpx X) { return X.re*X.re+X.im*X.im; }

// double dspPower(double *X, int Len);
// double dspPower(double *I, double *Q, int Len);
// double dspPower(dspCmpx *X, int Len);

// inline double dspPower(double_buff *buff) { return dspPower(buff->Data,buff->Len); }
// inline double dspPower(dspCmpx_buff *buff) { return dspPower(buff->Data,buff->Len); }
export function dspPower(X: number | dspCmpx, Q?: number): number;
export function dspPower(X: Float32Array | Float64Array | number[] | dspCmpx[], len: number): number;
export function dspPower(I: Float32Array | Float64Array | number[], Q: Float32Array | Float64Array | number[], len: number): number;
export function dspPower(x: number | dspCmpx | Float32Array | Float64Array | number[] | dspCmpx[], y?: number | Float32Array | Float64Array | number[], z?: number): number {
    if (typeof x === 'number') {
        let resp = x * x;
        if (typeof y === 'number') {
            resp += y * y;
        }
        return resp;
    }
    if ('re' in x) {
        return x.re * x.re + x.im * x.im;
    }
    let len = typeof y === 'number' ? y : z as number;
    let sum = 0;
    for (let i = 0; i < len; i++) {
        const itemX = x[i];
        if (typeof itemX === 'number' && Array.isArray(y)) {
            const itemY = y[i];
            sum += itemX * itemX + itemY * itemY;
        } else if (typeof itemX === 'number') {
            sum += itemX * itemX;
        } else {
            sum += itemX.re * itemX.re + itemX.im * itemX.im;
        }
    }
    return sum;
}

export function dspCopyArray(
    source: number[] | Float32Array,
    destination: number[] | Float32Array,
    destinationOffset: number,
) {
    if (destination instanceof Float32Array) {
        destination.set(source, destinationOffset);
    } else {
        destination.splice(destinationOffset, source.length, ...source);
    }
}

// Additional DSP functions needed for MT63 receiver

export function dspAmpl(x: dspCmpx): number {
    return Math.sqrt(x.re * x.re + x.im * x.im);
}

export function dspPhase(x: dspCmpx): number;
export function dspPhase(re: number, im: number): number;
export function dspPhase(xOrRe: dspCmpx | number, im?: number): number {
    if (typeof xOrRe === 'object') {
        return Math.atan2(xOrRe.im, xOrRe.re);
    }
    return Math.atan2(im!, xOrRe);
}

export function dspScalProd(x1: dspCmpx, x2: dspCmpx): number;
export function dspScalProd(re: number, im: number, x: dspCmpx): number;
export function dspScalProd(x1OrRe: dspCmpx | number, x2OrIm: dspCmpx | number, x?: dspCmpx): number {
    if (typeof x1OrRe === 'object' && typeof x2OrIm === 'object') {
        // Two complex numbers
        return x1OrRe.re * x2OrIm.re + x1OrRe.im * x2OrIm.im;
    } else if (typeof x1OrRe === 'number' && typeof x2OrIm === 'number' && x) {
        // Real, imaginary, and complex
        return x1OrRe * x.re + x2OrIm * x.im;
    }
    throw new Error('Invalid arguments to dspScalProd');
}

export function dspFindMaxPower(data: dspCmpx[], len: number): { power: number, index: number } {
    let maxPower = dspPower(data[0]);
    let maxIndex = 0;

    for (let i = 1; i < len; i++) {
        const power = dspPower(data[i]);
        if (power > maxPower) {
            maxPower = power;
            maxIndex = i;
        }
    }

    return { power: maxPower, index: maxIndex };
}

export function dspSelFitAver(data: Float64Array, len: number, selThres: number, loops: number): { aver: number, rms: number, sel: number };
export function dspSelFitAver(data: dspCmpx[], len: number, selThres: number, loops: number): { aver: dspCmpx, rms: number, sel: number };
export function dspSelFitAver(
    data: Float64Array | dspCmpx[],
    len: number,
    selThres: number,
    loops: number
): { aver: number | dspCmpx, rms: number, sel: number } {
    if (len <= 0) {
        return typeof data[0] === 'number'
            ? { aver: 0, rms: 0, sel: 0 }
            : { aver: new dspCmpx(0, 0), rms: 0, sel: 0 };
    }

    // Initial average
    let aver: number | dspCmpx;
    let sum = 0;
    let sumRe = 0;
    let sumIm = 0;

    if (typeof data[0] === 'number') {
        for (let i = 0; i < len; i++) {
            sum += data[i] as number;
        }
        aver = sum / len;
    } else {
        for (let i = 0; i < len; i++) {
            const c = data[i] as dspCmpx;
            sumRe += c.re;
            sumIm += c.im;
        }
        aver = new dspCmpx(sumRe / len, sumIm / len);
    }

    // Iterative outlier rejection
    let sel = len;
    let rms = 0;

    for (let loop = 0; loop < loops && sel > 0; loop++) {
        // Calculate RMS deviation
        let sumSq = 0;
        if (typeof aver === 'number') {
            for (let i = 0; i < len; i++) {
                const diff = (data[i] as number) - aver;
                sumSq += diff * diff;
            }
        } else {
            for (let i = 0; i < len; i++) {
                const c = data[i] as dspCmpx;
                const diffRe = c.re - aver.re;
                const diffIm = c.im - aver.im;
                sumSq += diffRe * diffRe + diffIm * diffIm;
            }
        }
        rms = Math.sqrt(sumSq / sel);

        // Recalculate average excluding outliers
        const threshold = selThres * rms;
        sel = 0;

        if (typeof aver === 'number') {
            sum = 0;
            for (let i = 0; i < len; i++) {
                const val = data[i] as number;
                if (Math.abs(val - aver) <= threshold) {
                    sum += val;
                    sel++;
                }
            }
            if (sel > 0) aver = sum / sel;
        } else {
            sumRe = 0;
            sumIm = 0;
            for (let i = 0; i < len; i++) {
                const c = data[i] as dspCmpx;
                const diffRe = c.re - aver.re;
                const diffIm = c.im - aver.im;
                const diff = Math.sqrt(diffRe * diffRe + diffIm * diffIm);
                if (diff <= threshold) {
                    sumRe += c.re;
                    sumIm += c.im;
                    sel++;
                }
            }
            if (sel > 0) {
                aver.re = sumRe / sel;
                aver.im = sumIm / sel;
            }
        }
    }

    return { aver, rms, sel };
}

// Complex number operations for MT63 receiver

export function dspCmpxMult(a: dspCmpx, b: dspCmpx): dspCmpx {
    return new dspCmpx(
        a.re * b.re - a.im * b.im,
        a.re * b.im + a.im * b.re
    );
}

export function dspCmpxMultConj(a: dspCmpx, b: dspCmpx): dspCmpx {
    // Multiply a by conjugate of b
    return new dspCmpx(
        a.re * b.re + a.im * b.im,
        a.im * b.re - a.re * b.im
    );
}

export function dspCmpxMultReal(a: dspCmpx, r: number): dspCmpx {
    return new dspCmpx(a.re * r, a.im * r);
}

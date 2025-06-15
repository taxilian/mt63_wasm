import { dspFindMax, dspFindMin, dspLowPass2, dspLowPass2Coeff, dspPowerOf2, dspRMS, dspWalshTrans } from '../dsp';

export class MT63decoder {
  public Output: string = '';
  public SignalToNoise = 0;
  public CarrOfs = 0;

  private WalshBuff: Float32Array; // = new Float32Array(this.DataCarriers);

  private ScanLen: number; // = 2 * this.Margin + 1;
  private ScanSize: number; // = this.DataCarriers + 2 * this.Margin;
  private DecodeSnrMid: number[]; // = new Array(this.ScanLen);
  private DecodeSnrOut: number[]; // = new Array(this.ScanLen);
  private W1: number;
  private W2: number;
  private W5: number;
  private DecodeLen: number; // = this.Integ / 2;
  private DecodeSize: number; // = this.DecodeLen * this.ScanLen;
  private DecodePipe: string[]; // = new Array(this.DecodeSize);
  private DecodePtr: number; // = 0;

  private IntlvSize: number; // = (this.IntlvLen + 1) * this.ScanSize;
  private IntlvPipe: Float32Array; // = new Array(this.IntlvSize);
  private IntlvPtr: number; // = 0;
  private IntlvPatt: number[]; // = new Array(this.DataCarriers);


  constructor(
    private DataCarriers: number,
    private IntlvLen: number,
    Pattern: number[],
    private Margin: number,
    private Integ: number,
  ) {
    if (!dspPowerOf2(this.DataCarriers)) {
      throw new Error('dspPowerOf2(Carriers) failed');
    }
    const { w1, w2, w5 } = dspLowPass2Coeff(Integ);
    this.W1 = w1;
    this.W2 = w2;
    this.W5 = w5;

    this.ScanLen = 2 * this.Margin + 1;
    this.ScanSize = this.DataCarriers + 2 * this.Margin;
    this.DecodeSnrMid = new Array(this.ScanLen);
    this.DecodeSnrOut = new Array(this.ScanLen);
    this.DecodeLen = this.Integ / 2;
    this.DecodeSize = this.DecodeLen * this.ScanLen;
    this.DecodePipe = new Array(this.DecodeSize);
    this.DecodePtr = 0;

    this.IntlvSize = (this.IntlvLen + 1) * this.ScanSize;
    this.IntlvPipe = new Float32Array(this.IntlvSize);
    this.IntlvPtr = 0;
    this.IntlvPatt = new Array(this.DataCarriers);

    this.WalshBuff = new Float32Array(this.DataCarriers);

    for (let p = 0, i = 0; i < this.DataCarriers; i++) {
      this.IntlvPatt[i] = p * this.ScanSize;
      p += Pattern[i];
      if (p >= this.IntlvLen) {
        p -= this.IntlvLen;
      }
    }
  }

  public Process(data: Float64Array): number {
    let Min: number, Max: number, Sig: number, Noise: number, SNR: number;
    let MinPos: number, MaxPos: number, code: number;

    this.IntlvPipe.set(data.subarray(0, this.ScanSize), this.IntlvPtr);

    for (let s = 0; s < this.ScanLen; s++) {
      for (let i = 0; i < this.DataCarriers; i++) {
        let k = this.IntlvPtr - this.ScanSize - this.IntlvPatt[i];
        if (k < 0) {
          k += this.IntlvSize;
        }
        if ((s & 1) && (i & 1)) {
          k += this.ScanSize;
          if (k >= this.IntlvSize) {
            k -= this.IntlvSize;
          }
        }
        this.WalshBuff[i] = this.IntlvPipe[k + s + i];
      }
      dspWalshTrans(this.WalshBuff, this.DataCarriers);
      ({ min: Min, index: MinPos } = dspFindMin(this.WalshBuff, this.DataCarriers));
      ({ max: Max, index: MaxPos } = dspFindMax(this.WalshBuff, this.DataCarriers));
      if (Math.abs(Max) > Math.abs(Min)) {
        code = MaxPos + this.DataCarriers;
        Sig = Math.abs(Max);
        this.WalshBuff[MaxPos] = 0.0;
      } else {
        code = MinPos;
        Sig = Math.abs(Min);
        this.WalshBuff[MinPos] = 0.0;
      }
      Noise = dspRMS(this.WalshBuff, this.DataCarriers);
      if (Noise > 0.0) {
        SNR = Sig / Noise;
      } else {
        SNR = 0.0;
      }
      let { mid, out } = dspLowPass2(SNR, this.DecodeSnrMid[s], this.DecodeSnrOut[s], this.W1, this.W2, this.W5);
      this.DecodeSnrMid[s] = mid;
      this.DecodeSnrOut[s] = out;
      this.DecodePipe[this.DecodePtr + s] = String.fromCharCode(code);
    }
    this.IntlvPtr += this.ScanSize;
    if (this.IntlvPtr >= this.IntlvSize) {
      this.IntlvPtr = 0;
    }
    this.DecodePtr += this.ScanLen;
    if (this.DecodePtr >= this.DecodeSize) {
      this.DecodePtr = 0;
    }
    ({ max: Max, index: MaxPos } = dspFindMax(this.DecodeSnrOut, this.ScanLen));
    // Get the decoded character from the pipe at the best carrier offset
    const pipeIndex = this.DecodePtr - this.DecodeLen + MaxPos;
    if (pipeIndex >= 0 && pipeIndex < this.DecodeSize) {
      this.Output = this.DecodePipe[pipeIndex];
    } else {
      this.Output = '';
    }
    this.SignalToNoise = Max;
    this.CarrOfs = MaxPos - (this.ScanLen - 1) / 2;

    return 0;
  }
}


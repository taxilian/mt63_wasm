import { dspFindMax, dspFindMin, dspLowPass2, dspLowPass2Coeff, dspPowerOf2, dspRMS, dspWalshTrans } from '../dsp';

export class MT63decoder {
  public Output: number = 0;  // C++ uses char but we use number
  public SignalToNoise = 0;
  public CarrOfs = 0;

  private DataCarriers: number;
  private IntlvPipe: Float64Array;  // C++ uses double*
  private IntlvLen: number;
  private IntlvSize: number;
  private IntlvPtr: number = 0;
  private IntlvPatt: Int32Array;  // C++ uses int*

  private WalshBuff: Float64Array;  // C++ uses double*

  private ScanLen: number;
  private ScanSize: number;
  private DecodeSnrMid: Float64Array;  // C++ uses double*
  private DecodeSnrOut: Float64Array;  // C++ uses double*
  private W1: number;
  private W2: number;
  private W5: number;
  private DecodePipe: Uint8Array;  // C++ uses char*
  private DecodeLen: number;
  private DecodeSize: number;
  private DecodePtr: number = 0;

  constructor(
    Carriers: number,
    Intlv: number,
    Pattern: number[] | Int32Array,
    Margin: number,
    Integ: number,
  ) {
    this.DataCarriers = Carriers;
    this.IntlvLen = Intlv;
    if (!dspPowerOf2(Carriers)) {
      throw new Error('dspPowerOf2(Carriers) failed');
    }
    const { w1, w2, w5 } = dspLowPass2Coeff(Integ);
    this.W1 = w1;
    this.W2 = w2;
    this.W5 = w5;

    this.ScanLen = 2 * Margin + 1;
    this.ScanSize = this.DataCarriers + 2 * Margin;
    this.DecodeSnrMid = new Float64Array(this.ScanLen);
    this.DecodeSnrOut = new Float64Array(this.ScanLen);
    this.DecodeLen = Integ / 2;
    this.DecodeSize = this.DecodeLen * this.ScanLen;
    this.DecodePipe = new Uint8Array(this.DecodeSize);
    this.DecodePtr = 0;

    this.IntlvSize = (this.IntlvLen + 1) * this.ScanSize;
    this.IntlvPipe = new Float64Array(this.IntlvSize);
    this.IntlvPtr = 0;
    this.IntlvPatt = new Int32Array(this.DataCarriers);

    this.WalshBuff = new Float64Array(this.DataCarriers);

    let p = 0;
    for (let i = 0; i < this.DataCarriers; i++) {
      this.IntlvPatt[i] = p * this.ScanSize;
      p += Pattern[i];
      if (p >= this.IntlvLen) p -= this.IntlvLen;
    }
  }

  public Process(data: Float64Array): number {
    let s: number, i: number, k: number;
    let Min: number, Max: number, Sig: number, Noise: number, SNR: number;
    let MinPos: number, MaxPos: number, code: number;
    
    if (data.length !== this.ScanSize) {
      return -1;
    }

    this.IntlvPipe.set(data, this.IntlvPtr);
    
    // Debug IntlvPipe data
    if (this.Output < 3) {
      const nonZeroIntlv = Array.from(this.IntlvPipe).filter(x => Math.abs(x) > 0.001).length;
      const dataRange = `min=${Math.min(...data).toFixed(3)}, max=${Math.max(...data).toFixed(3)}`;
      console.log(`IntlvPipe: ${nonZeroIntlv}/${this.IntlvPipe.length} non-zero, input data range: ${dataRange}`);
    }

    for (s = 0; s < this.ScanLen; s++) {
      for (i = 0; i < this.DataCarriers; i++) {
        k = this.IntlvPtr - this.ScanSize - this.IntlvPatt[i];
        if (k < 0) k += this.IntlvSize;
        if ((s & 1) && (i & 1)) {
          k += this.ScanSize;
          if (k >= this.IntlvSize) k -= this.IntlvSize;
        }
        const index = k + s + i;
        
        // Access array directly like C++ but with safer bounds handling
        if (index >= 0 && index < this.IntlvSize) {
          this.WalshBuff[i] = this.IntlvPipe[index];
        } else {
          // Handle out of bounds access - this shouldn't happen in correct implementation
          console.log(`INDEX OUT OF BOUNDS: ${index} >= ${this.IntlvSize}, using 0`);
          this.WalshBuff[i] = 0.0;
        }
        
        // Debug indexing for first few cases
        if (this.Output < 1 && s === 0 && i < 3) {
          const value = (index >= 0 && index < this.IntlvSize) ? this.IntlvPipe[index] : 0;
          console.log(`Walsh[${i}] = IntlvPipe[${index}] = ${value.toFixed(3)} (k=${k}, s=${s}, i=${i}, IntlvPtr=${this.IntlvPtr})`);
        }
      }
      
      // Debug Walsh coefficients before transform (first few times)
      if (this.Output < 3 && s === 0) {
        const nonZeroWalsh = this.WalshBuff.filter(x => Math.abs(x) > 0.001).length;
        const maxWalsh = Math.max(...this.WalshBuff.map(x => Math.abs(x)));
        console.log(`Pre-Walsh: ${nonZeroWalsh}/${this.DataCarriers} non-zero, max=${maxWalsh.toFixed(3)}`);
      }
      
      dspWalshTrans(this.WalshBuff, this.DataCarriers);
      
      // Debug Walsh coefficients after transform
      if (this.Output < 3 && s === 0) {
        const sortedWalsh = Array.from(this.WalshBuff).map((val, idx) => ({val, idx}))
          .sort((a, b) => Math.abs(b.val) - Math.abs(a.val)).slice(0, 3);
        console.log(`Post-Walsh top 3: ${sortedWalsh.map(x => `${x.idx}:${x.val.toFixed(3)}`).join(', ')}`);
      }
      
      const minResult = dspFindMin(this.WalshBuff, this.DataCarriers);
      Min = minResult.min;
      MinPos = minResult.index;
      const maxResult = dspFindMax(this.WalshBuff, this.DataCarriers);
      Max = maxResult.max;
      MaxPos = maxResult.index;
      if (Math.abs(Max) > Math.abs(Min)) {
        code = MaxPos + this.DataCarriers;
      // console.log(`Walsh s=${s}: MaxPos=${MaxPos}, code=${code} -> '${String.fromCharCode(code)}'`);
        Sig = Math.abs(Max);
        this.WalshBuff[MaxPos] = 0.0;
      } else {
        code = MinPos;
        Sig = Math.abs(Min);
        this.WalshBuff[MinPos] = 0.0;
      }
      Noise = dspRMS(this.WalshBuff, this.DataCarriers);
      if (Noise > 0.0)
        SNR = Sig / Noise;
      else SNR = 0.0;
      const snrResult = dspLowPass2(SNR, this.DecodeSnrMid[s], this.DecodeSnrOut[s], this.W1, this.W2, this.W5);
      this.DecodeSnrMid[s] = snrResult.mid;
      this.DecodeSnrOut[s] = snrResult.out;
      this.DecodePipe[this.DecodePtr + s] = code;
      
      // Debug: print non-zero codes
      // if (code > 0 && code < 128) {
      //   console.log(`DecodePipe[${this.DecodePtr + s}] = ${code} ('${String.fromCharCode(code)}'), SNR=${this.DecodeSnrOut[s].toFixed(2)}`);
      // }
    }
    this.IntlvPtr += this.ScanSize;
    if (this.IntlvPtr >= this.IntlvSize) this.IntlvPtr = 0;
    this.DecodePtr += this.ScanLen;
    if (this.DecodePtr >= this.DecodeSize) this.DecodePtr = 0;
    const finalMaxResult = dspFindMax(this.DecodeSnrOut, this.ScanLen);
    Max = finalMaxResult.max;
    MaxPos = finalMaxResult.index;
    this.Output = this.DecodePipe[this.DecodePtr + MaxPos];
    this.SignalToNoise = Max;
    this.CarrOfs = MaxPos - (this.ScanLen - 1) / 2;
    
    // Debug output
    // if (this.Output && this.Output !== 0) {
    //   console.log(`MT63Decoder: Output char ${this.Output} ('${String.fromCharCode(this.Output)}'), SNR=${Max.toFixed(2)}, CarrOfs=${this.CarrOfs}`);
    // }

    return 0;
  }
}


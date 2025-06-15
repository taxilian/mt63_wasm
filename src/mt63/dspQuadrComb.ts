import { dspCmpx, DspCmpxBuff, dspWinFirI, winFirQ } from './dsp';

export class DspQuadrComb {
  private Tap: number[] = [];
  private ExternShape: boolean = true;
  private ShapeI: number[] = [];
  private ShapeQ: number[] = [];
  Output: number[] = [];
  private Len: number = 0;
  private TapPtr: number = 0;
  private Rate: number = 0;

  Free(): void {
    if (!this.ExternShape) {
      this.ShapeI = [];
      this.ShapeQ = [];
    }
    this.ShapeI = [];
    this.ShapeQ = [];
    this.Output = [];
  }

  preset(
    FilterLen: number,
    FilterShape_I: number[] | null,
    FilterShape_Q: number[] | null,
    DecimateRate: number,
  ): void {
    this.Len = FilterLen;
    this.Tap.length = this.Len;
    if (!this.ExternShape) {
      this.ShapeI = [];
      this.ShapeQ = [];
    }
    this.ShapeI = FilterShape_I || [];
    this.ShapeQ = FilterShape_Q || [];
    this.ExternShape = true;
    for (let i = 0; i < this.Len; i++) {
      this.Tap[i] = 0.0;
    }
    this.TapPtr = 0;
    this.Rate = DecimateRate;
  }

  computeShape(
    LowOmega: number,
    UppOmega: number,
    Window: (value: number) => number,
  ) {
    if (this.ExternShape) {
      this.ShapeI = [];
      this.ShapeQ = [];
      this.ExternShape = false;
    }
    this.ShapeI.length = this.Len;
    this.ShapeQ.length = this.Len;

    dspWinFirI(LowOmega, UppOmega, this.ShapeI, this.Len, Window);
    winFirQ(LowOmega, UppOmega, this.ShapeQ, this.Len, Window);
  }

  process(Input: DspCmpxBuff): number {
    let i: number, o: number, r: number, t: number, len: number;
    let Inp: dspCmpx[];
    let Out: number[];
    let InpLen = Input.len;
    let I: number, Q: number;
    Inp = Input.data;
    Out = this.Output;

    for (o = 0, i = 0; i < InpLen; i++) {
      I = Inp[i].re;
      Q = Inp[i].im;
      for (r = 0, t = this.TapPtr; t < this.Len; t++, r++) {
        this.Tap[t] += I * this.ShapeI[r] + Q * this.ShapeQ[r];
      }
      for (t = 0; t < this.TapPtr; t++, r++) {
        this.Tap[t] += I * this.ShapeI[r] + Q * this.ShapeQ[r];
      }
      len = this.Len - this.TapPtr;
      if (len < this.Rate) {
        for (r = 0; r < len; r++) {
          Out[o++] = this.Tap[this.TapPtr];
          this.Tap[this.TapPtr++] = 0.0;
        }
        this.TapPtr = 0;
        for (; r < this.Rate; r++) {
          Out[o++] = this.Tap[this.TapPtr];
          this.Tap[this.TapPtr++] = 0.0;
        }
      } else {
        for (r = 0; r < this.Rate; r++) {
          Out[o++] = this.Tap[this.TapPtr];
          this.Tap[this.TapPtr++] = 0.0;
        }
      }
    }
    return 0;
  }
}

import { dspCmpx, dspWinFirI, winFirQ } from "../dsp";

export class DspQuadrSplit {
  output: dspCmpx[] = [];

  private tap: number[] = [];

  constructor(
    private filterLen: number,
    private decimateRate: number,
    private shapeI: number[] = [],
    private shapeQ: number[] = [],
  ) {
    this.tap.length = this.filterLen;
  }

  computeShape(
    lowOmega: number,
    uppOmega: number,
    Window: (value: number) => number,
  ) {
    dspWinFirI(lowOmega, uppOmega, this.shapeI, this.filterLen, Window);
    winFirQ(lowOmega, uppOmega, this.shapeQ, this.filterLen, Window);
  }

  public process(input: number[]) {
    const output = this.output;
    let i: number, s: number, t: number, o: number, l: number;
    let sumI: number, sumQ: number;
    this.tap.push(...input);

    for (l = this.tap.length - this.filterLen, o = 0, i = 0; i < l; i += this.decimateRate) {
      for (sumI = sumQ = 0.0, s = i,t = 0; t < this.filterLen; t++,s++) {
        sumI += (this.tap[s] || 0) * this.shapeI[t];
        sumQ += (this.tap[s] || 0) * this.shapeQ[t];
      }
      output[o] = new dspCmpx(sumI, sumQ);
      o++;
    }
    this.tap = this.tap.splice(-i);

    return output;
  }
}

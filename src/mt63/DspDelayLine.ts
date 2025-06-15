import { DspSeq } from "./dsp";

export class DspDelayLine<T> {
  public line: T[] = []; // line storage
  public dspDelay: number; // how many (at least) backward samples are stored
  public lineSize: number; // allocated size
  public dataLen: number; // length of the valid data
  public inpPtr: T[]; // first sample for the most recent processed batch
  public inpData: T[]; // alias for inpPtr for compatibility
  public inpLen: number; // number of samples for the most recent input

  constructor(
    maxDspDelay: number,
    maxSize: number = 0,
  ) {
    this.lineSize = maxSize;
    if (this.lineSize < 2 * maxDspDelay) {
      this.lineSize = 2 * maxDspDelay;
    }
    this.dataLen = maxDspDelay;
    this.dspDelay = maxDspDelay;
    this.line = new Array<T>(this.lineSize);
    this.clearArray(this.line, this.lineSize);
    this.inpPtr = this.line.slice(this.dataLen);
    this.inpData = this.inpPtr; // alias
    this.inpLen = 0;
  }

  public process(inp: T[], len: number): number {
    if (this.dataLen + len > this.lineSize) {
      this.moveArray(this.line, this.line.slice(this.dataLen - this.dspDelay), this.dspDelay);
      this.dataLen = this.dspDelay;
    }
    if (this.dataLen + len > this.lineSize) {
      return -1;
    }
    this.copyArray(this.line.slice(this.dataLen), inp, len);
    this.inpPtr = this.line.slice(this.dataLen);
    this.inpData = this.inpPtr; // keep alias in sync
    this.inpLen = len;
    this.dataLen += len;
    return 0;
  }

  public processSeq(input: DspSeq<T>): number {
    return this.process(input.data, input.len);
  }

  private clearArray(arr: T[], size: number): void {
    for (let i = 0; i < size; i++) {
      arr[i] = null as any; // Replace with the appropriate 'zero' value for the generic type T
    }
  }

  private copyArray(dest: T[], src: T[], len: number): void {
    for (let i = 0; i < len; i++) {
      dest[i] = src[i];
    }
  }

  private moveArray(dest: T[], src: T[], len: number): void {
    for (let i = 0; i < len; i++) {
      dest[i] = src[i];
    }
  }
}

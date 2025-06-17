import { MT63tx } from './MT63tx';

export class MT63Client {
  TX = new MT63tx();
  sampleRate = 8000;
  centerFreq = 1500;
  txLevel = -6.0;
  sigLimit = 0.95;
  TONE_AMP = 0.8;
  bufferSeconds = 600;

  get bufferMaxSize() {
    return this.sampleRate * this.bufferSeconds; // 8000Hz sample rate, 600 seconds (10 minutes)
  }

  sourceBuffer?: Float32Array;
  dataSize = 0;

  ensureBufferSpace(increase: number) {
    const sourceBufferSize = this.sourceBuffer?.length || 0;
    const sizeDiff = this.dataSize + increase - sourceBufferSize;
    if (sizeDiff > 0) {
      // This is not good! We will overflow the buffer.
      // The only thing to do is to resize that sucker!

      // We will increase the size by 125% of the difference or 50% of the max size, whichever
      // is larger; this is so that we don't resize it too often, so the minimum size increase
      // is 5 minutes but if there is more than 5 minutes of data we'll add more than that
      this.sourceBuffer = new Float32Array(sourceBufferSize + Math.max(sizeDiff * 1.25, this.bufferMaxSize * 0.5));
    }
  }
  /**
   * The actual used size, rather than the length of the Float32Array
   * or in other words the number of bytes used.
   */
  flushToBuffer(multiplier: number = 1.0): void {
    this.ensureBufferSpace(this.TX.Comb.Output.length);
    let maxVal = 0.0;
    for (const x of this.TX.Comb.Output) {
      const a = Math.abs(x);
      if (a > maxVal) { maxVal = a; }
    }

    if (multiplier > this.sigLimit) {
      multiplier = this.sigLimit;
    }

    for (const x of this.TX.Comb.Output) {
      let val = x * 1.0 / maxVal * multiplier;
      if (val > this.sigLimit) {
        val = this.sigLimit;
      }
      if (val < -this.sigLimit) {
        val = -this.sigLimit;
      }
      this.sourceBuffer![this.dataSize] = val;
      this.dataSize++;
    }
  }

  interleaveFlush() {
    for (let i = 0; i < this.TX.DataInterleave; ++i) {
      this.TX.sendChar(String.fromCharCode(0));
      this.flushToBuffer();
    }
  }

  encodeString(
    text: string,
    bandwidth: number,
    longInterleave: boolean,
    audioCtx: AudioContext,
  ) {
    if (bandwidth !== 500 && bandwidth !== 1000 && bandwidth !== 2000) {
      throw new Error('Invalid bandwidth');
    }
    this.sourceBuffer = new Float32Array();
    this.dataSize = 0;

    const multiplier = Math.pow(10, this.txLevel / 20);
    // console.log(`Using txlevel multiplier of ${multiplier}`);

    this.TX.preset(1500, bandwidth, longInterleave);
    this.sendTone(2, bandwidth);

    // console.log(`Sending string: ${text}`);
    for (let curChar of text) {
      let charCode = curChar.charCodeAt(0);
      // MT63 can only encode characters 0-127 (128 total)
      // For short interleave (32), we have 2*32=64 valid codes
      // For long interleave (64), we have 2*64=128 valid codes
      const maxCode = 2 * this.TX.DataInterleave;
      if (charCode >= maxCode) {
        // Send escape character and modified character
        this.TX.sendChar(String.fromCharCode(127));
        this.flushToBuffer();
        charCode = charCode % maxCode;
      }
      this.TX.sendChar(String.fromCharCode(charCode));
      this.flushToBuffer();
    }
    this.interleaveFlush();

    this.TX.SendJam();
    this.flushToBuffer();

    const audioBuffer = audioCtx.createBuffer(1, this.dataSize, this.sampleRate * 3); // why multiple sample rate by 3?
    audioBuffer.copyToChannel(new Float32Array(this.sourceBuffer.subarray(0, this.dataSize)), 0);

    let source = audioCtx.createBufferSource();
    source.playbackRate.value = 1 / 3; // why?
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    return {
      source,
      buffer: audioBuffer,
      length: this.sourceBuffer.length,
      sampleRate: this.sampleRate,
    };
  }

  sendTone(seconds: number, bandwidth: number): void {
    const numsmpls = Math.floor((this.sampleRate * seconds) / 512);
    const w1 = 2.0 * Math.PI * (this.centerFreq - bandwidth / 2.0) / this.sampleRate;
    const w2 = 2.0 * Math.PI * (this.centerFreq + 31.0 * bandwidth / 64.0) / this.sampleRate;
    let phi1 = 0.0;
    let phi2 = 0.0;
    this.ensureBufferSpace(numsmpls * 512);
    for (let i = 0; i < numsmpls; i++) {
      for (let j = 0; j < 512; j++) {
        this.sourceBuffer![this.dataSize] = this.TONE_AMP * 0.5 * Math.cos(phi1) + this.TONE_AMP * 0.5 * Math.cos(phi2);
        this.dataSize++;
        phi1 += w1;
        phi2 += w2;
        if (i === 0) {
          this.sourceBuffer![this.dataSize - 1] *= 1.0 - Math.exp(-1.0 * j / 40.0);
        }
        if (i === seconds - 1) {
          this.sourceBuffer![this.dataSize - 1] *= 1.0 - Math.exp(-1.0 * (this.sampleRate - j) / 40.0);
        }
      }
    }
    for (let i = 0; i < this.TX.DataInterleave; ++i) {
      this.TX.sendChar(String.fromCharCode(0));
    }
  }
}

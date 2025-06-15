import { DspCmpxBuff, dspWindowBlackman3 } from "./dsp";
import { MT63Encoder, MT63encoderOld } from "./MT63encoder";
import { longInterleavePattern, shortInterleavePattern } from "./mt63intl";
import { DataCarrSepar, SymbolLen, SymbolSepar, SymbolShape } from './Symbol';
import { dspCmpxOverlapWindow } from './dspCmpxOverlapWindow';
import { dsp_r2FFT } from './FFT';
import { DspQuadrComb } from './dspQuadrComb';
import { DspCmpxMixer } from './dspCmpxMixer';


export class MT63tx {
  public DataInterleave: 64 | 32 = 32;
  public Comb: DspQuadrComb = new DspQuadrComb();

  private DataCarriers: number = 0;
  private FirstDataCarr: number = 0;
  private WindowLen = SymbolLen;
  private TxWindow = SymbolShape;
  private AliasFilterLen: number = 0;
  private DecimateRatio: number = 0;
  private InterleavePattern: readonly number[] = shortInterleavePattern;
  private TxAmpl: number = 0;
  // private CarrMarkCode: number;
  // private CarrMarkAmpl: number;
  private Encoder!: MT63Encoder;
  private EncoderOld: MT63encoderOld = new MT63encoderOld();
  private TxVect: number[] = [];
  private dspPhaseCorr: number[] = [];
  private WindowBuff = new DspCmpxBuff();
  private FFT: dsp_r2FFT = new dsp_r2FFT();
  private txmixer: DspCmpxMixer = new DspCmpxMixer();
  private Window = new dspCmpxOverlapWindow();

  public Free(): void {
    this.TxVect = [];
    this.dspPhaseCorr = [];
    // this.Encoder.Free();
    this.FFT.Free();
    this.Window.free();
    this.Comb.Free();
    this.WindowBuff.free();
  }

  public preset(freq: number, BandWidth: number = 1000, LongInterleave: boolean = false): boolean {
    // values used to computer the blackman3 passband filter shape
    const hbw = 1.5 * BandWidth / 2;
    let omega_low = (freq - hbw);
    let omega_high = (freq + hbw);
    if (omega_low < 100) {
      omega_low = 100;
    }
    if (omega_high > 4000) {
      omega_high = 4000;
    }
    omega_low *= (Math.PI / 4000);
    omega_high *= (Math.PI / 4000);

    let mask = this.FFT.Size - 1;
    this.DataCarriers = 64;

    switch(BandWidth) {
      case 500:
        this.FirstDataCarr = Math.floor((freq - BandWidth / 2.0) * 256 / 500 + .5);
        this.AliasFilterLen = 128;
        this.DecimateRatio = 8;
        break;
      case 1000:
        this.FirstDataCarr = Math.floor((freq - BandWidth / 2.0) * 128 / 500 + 0.5);
        this.AliasFilterLen = 64;
        this.DecimateRatio = 4;
        break;
      case 2000:
        this.FirstDataCarr = Math.floor((freq - BandWidth / 2.0) * 64 / 500 + 0.5);
        this.AliasFilterLen = 64;
        this.DecimateRatio = 2;
        break;
      default:
        return false;
    }
    this.WindowLen = SymbolLen;
    this.TxWindow = SymbolShape;
    this.TxAmpl = 4.0 / this.DataCarriers; // for maximum undistorted output
    // this.CarrMarkCode = 375593022; // 0x16918BBEL;
    // this.CarrMarkAmpl = 0;

    if (LongInterleave) {
      this.DataInterleave = 64;
      this.InterleavePattern = longInterleavePattern;
    } else {
      this.DataInterleave = 32;
      this.InterleavePattern = shortInterleavePattern;
    }

    this.TxVect.length = this.DataCarriers;
    this.dspPhaseCorr.length = this.DataCarriers;

    this.WindowBuff.ensureSpace(2 * this.WindowLen);
    this.WindowBuff.len = 2 * this.WindowLen;

    this.Encoder = new MT63Encoder(this.DataCarriers, this.DataInterleave, [...this.InterleavePattern], true);
    if (this.FFT.preset(this.WindowLen)) {
      return false;
    }
    this.Window.preset(this.WindowLen, SymbolSepar / 2, this.TxWindow);

    // Preset the combining instance, NULL pointers in lieu of fixed filter shapes
    // blackman3 filter provides flat passband and sufficient out-of-band rejection
    // to insure that all unwanted FFT components (periodic signal) are suppressed
    // by 70 dB or more
    this.Comb.preset(this.AliasFilterLen, null, null, this.DecimateRatio);
    // compute new combining filter shape
    this.Comb.computeShape(omega_low, omega_high, dspWindowBlackman3);

    // Preset the initial dspPhase for each data carrier.
    // Here we only compute indexes to the FFT twiddle factors
    // so the actual vector is FFT.Twiddle[TxVect[i]]

    for (let step = 0, incr = 1, p = 0, i = 0; i < this.DataCarriers; i++) {
      this.TxVect[i] = p;
      step += incr;
      p = (p + step) & mask;
    }

    // compute dspPhase correction between successive FFTs separated by SymbolSepar
    // Like above we compute indexes to the FFT.Twiddle[]

    let incr = (SymbolSepar * DataCarrSepar) & mask;
    for (let p = (SymbolSepar * this.FirstDataCarr) & mask, i = 0; i < this.DataCarriers; i++) {
      this.dspPhaseCorr[i] = p;
      p = (p + incr) & mask;
    }
    return true;
  }

  public SendTune(twotones: boolean): void {
    // SendTune and ProcessTxVect are both modified to allow the FirstDataCarr
    // to be other than WindowLen / 2 as in the original design
    // The peridocity of the FFT is taken advantage of by computing the positions
    // of the bit indices modulo FFT.size, i.e. r = FFT.BitRevIdx[c &  (FFT.Size - 1)]

    let Ampl;

    let mask = this.FFT.Size - 1;
    Ampl = this.TxAmpl * Math.sqrt(this.DataCarriers / 2);

    for (let i = 0; i < this.DataCarriers; i++) {
      this.TxVect[i] = (this.TxVect[i] + this.dspPhaseCorr[i]) & mask;
    }

    for (let i = 0; i < 2 * this.WindowLen; i++) {
      this.WindowBuff.data[i].im = this.WindowBuff.data[i].re = 0.0;
    }

    // W1HKJ
    // first tone at the lowest most MT63 carrier
    let i = 0;
    let c = this.FirstDataCarr;
    let r = this.FFT.BitRevIdx[c & mask];
    this.WindowBuff.data[r].re = Ampl * this.FFT.Twiddle[this.TxVect[i]].re;
    this.WindowBuff.data[r].im = (-Ampl) * this.FFT.Twiddle[this.TxVect[i]].im;

    // W1HKJ
    // 2nd tone at the highest most MT63 carrier + 1
    // MT63 is specified as 500, 1000 and 2000 Hz wide signal format, but in
    // fact are narrower by one carrier spacing, i.e. 0 to N-1 carriers where
    // N = 64

    if (twotones) {
      i = this.DataCarriers - 1;
      c = (this.FirstDataCarr + i * DataCarrSepar);
      r = this.WindowLen + this.FFT.BitRevIdx[c & mask];
      this.WindowBuff.data[r].re = Ampl * this.FFT.Twiddle[this.TxVect[i]].re;
      this.WindowBuff.data[r].im = (-Ampl) * this.FFT.Twiddle[this.TxVect[i]].im;
    }

    // inverse FFT: WindowBuff is already scrambled
    this.FFT.coreProc(this.WindowBuff.data);
    // this.FFT.CoreProc(this.WindowBuff.Data + this.WindowLen);

    // negate the imaginary part for the IFFT
    for (let i = 0; i < 2 * this.WindowLen; i++) {
      this.WindowBuff.data[i].im *= (-1.0);
    }

    // process the FFT values to produce a complex time domain vector
    this.Window.process(this.WindowBuff);

    // W1HKJ
    // convert the complex time domain vector to a real time domain signal
    // suitably filtered by the anti-alias filter used in the combiner
    this.Comb.process(this.Window.Output);
  }

  public sendChar(char: string): void {
    const encodedOutput = this.Encoder.process(char); // encode and interleave the character
    // console.log(encodedOutput);

    // print the character and the DataBlock being sent
    // console.log(`0x${char.charCodeAt(0).toString(16).padStart(2, '0')} [${char >= ' ' ? char : '.'}] => ${encodedOutput.join('')}`);



    // here we encode the encodedOutput into dspPhase flips

    // console.log('FFT size: ' + this.FFT.Size, this.TxVect, this.dspPhaseCorr);
    let mask = this.FFT.Size - 1;
    let flip = this.FFT.Size / 2;
    for (let i = 0; i < this.DataCarriers; i++) {
      // data bit = 1 => only dspPhase correction
      if (encodedOutput[i]) {
        this.TxVect[i] = (this.TxVect[i] + this.dspPhaseCorr[i]) & mask;
      } else {
        // data bit = 0 => dspPhase flip + dspPhase correction
        this.TxVect[i] = (this.TxVect[i] + this.dspPhaseCorr[i] + flip) & mask;
      }
    }

    this.processTxVect();
  }

  public SendJam(): void {
    let j = 0;

    let mask = this.FFT.Size - 1;
    let left = Math.floor(this.FFT.Size / 4);
    let right = 3 * Math.floor(this.FFT.Size / 4);

    for (let i = 0; i < this.DataCarriers; i++) {
      j = i & mask;
      if (!Math.floor(Math.random() * 256)) { // 255/256 chance of being false
        // turn left 90 degrees
        this.TxVect[j] = (this.TxVect[j] + this.dspPhaseCorr[j] + left) & mask;
      } else {
        // turn right 90 degrees
        this.TxVect[j] = (this.TxVect[j] + this.dspPhaseCorr[j] + right) & mask;
      }
    }

    this.processTxVect();
  }

  public SendSilence(): void {
    this.Window.processSilence(2);
    this.Comb.process(this.Window.Output);
  }

  private processTxVect(): void {
    const mask = this.FFT.Size - 1;

    for (let i = 0; i < 2 * this.WindowLen; i++) {
      this.WindowBuff.data[i] = { re: 0.0, im: 0.0 };
    }

    for (let i = 0, c = this.FirstDataCarr; i < this.DataCarriers; i++, c += DataCarrSepar) {
      let r = (this.FFT.BitRevIdx[c & mask]) + this.WindowLen * (i & 1);
      this.WindowBuff.data[r].re = this.TxAmpl * this.FFT.Twiddle[this.TxVect[i]].re;
      this.WindowBuff.data[r].im = (-this.TxAmpl) * this.FFT.Twiddle[this.TxVect[i]].im;
    }

    this.FFT.coreProc(this.WindowBuff.data.slice());
    this.FFT.coreProc(this.WindowBuff.data.slice(this.WindowLen));

    // negate the imaginary part for the IFFT
    for (let i = 0; i < 2 * this.WindowLen; i++) {
      this.WindowBuff.data[i].im *= (-1.0);
    }

    this.Window.process(this.WindowBuff);

    // audio output to be sent out is in Comb.Output
    this.Comb.process(this.Window.Output);
  }

}

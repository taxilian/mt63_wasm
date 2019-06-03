import { wasmModule } from "./wasmModule";

const module = wasmModule.mod;

export { module };

export function setFileLocation(file: string, location: string) {
  module._setFileLocation(file, location);
}

function subarray(arr: Float32Array | number[], len: number) {
  if ("subarray" in arr) {
    return arr.subarray(0, len);
  } else {
    return arr.slice(0, len);
  }
}

export class MT63Client {
  constructor() {
    if (!wasmModule._getSampleRate) {
      throw new Error("wASM module not initialized!");
    }

    // Initialize for rx; we may not use it, but it doesn't hurt to have it ready
    // all the time, so we just always do this
    wasmModule._initMT63Rx(2000, 1, 16, 5.0);
    this.getSampleRate = wasmModule._getSampleRate;
  }

  lzmaEncode(input: string) {
    let outputSize = wasmModule._lzmaEncode(input, input.length);
    if (outputSize === 0) {
      // Error!
      throw new Error(wasmModule._getLzmaOutputStr());
    }
    let outputPtr = wasmModule._getLzmaOutputPtr();
    return wasmModule.mod.HEAPU8.slice(outputPtr, outputPtr + outputSize);
  }
  lzmaDecode(input: string | Uint8Array) {
    if (typeof input == "string") {
      // convert to array
      var ptr = wasmModule.mod._malloc(input.length);
      wasmModule.mod.HEAPU8.set(input.split("").map(c => c.charCodeAt(0)), ptr);
    } else {
      var ptr = wasmModule.mod._malloc(input.length);
      wasmModule.mod.HEAPU8.set(input, ptr);
    }
    let outputSize = wasmModule._lzmaDecode(ptr, input.length);
    wasmModule.mod._free(ptr);
    if (outputSize === 0) {
      // Error!
      throw new Error(wasmModule._getLzmaOutputStr());
    }
    let outputPtr = wasmModule._getLzmaOutputPtr();
    let outputArr = wasmModule.mod.HEAPU8.subarray(outputPtr, outputPtr + outputSize);

    var chunkSize = 5000;
    let chunks = Math.ceil(outputArr.length / chunkSize);
    let outStr = "";
    for (var i = 0; i < chunks; ++i) {
      outStr += String.fromCharCode.apply(
        String,
        outputArr.subarray(chunkSize * i, chunkSize * (i + 1)) as any
      );
    }
    return outStr;
  }

  encodeString(
    str: string,
    bandwidth: number,
    interleave: 0 | 1,
    audioCtx: AudioContext
  ) {
    const sampleRate = wasmModule._getSampleRate();
    const length = wasmModule._encodeString(str, bandwidth, interleave ? 1 : 0);
    const srcPtr = wasmModule._getBuffer();

    // Get a reference to the actual array from the pointer returned by _getBuffer
    let srcData = wasmModule.mod.HEAPF32.subarray(
      srcPtr / 4,
      srcPtr / 4 + length
    );
    let buffer = audioCtx.createBuffer(1, length, sampleRate * 3);
    buffer.copyToChannel(srcData, 0);

    let source = audioCtx.createBufferSource();
    source.playbackRate.value = 1 / 3;
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    return {
      source,
      buffer,
      length,
      sampleRate
    };
  }
  getSampleRate(): number {
    return 0;
  }
  processAudio(floatArr: Float32Array, len: number) {
    let size = 8;
    let numBytes = len * size;
    let ptr = wasmModule.mod._malloc(numBytes);
    wasmModule.mod.HEAPF64.set(subarray(floatArr, len), ptr / size);

    let outStr = wasmModule._processMT63Rx(ptr, len);

    wasmModule.mod._free(ptr);
    return outStr;
  }
}

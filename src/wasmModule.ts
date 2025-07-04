/// <reference path="../emscripten.d.ts" />

// Note: We use dynamic import for the WASM module since it needs to be loaded asynchronously
// const Module = require('./mt63Wasm');

import {polyfill} from './polyfill.js';

let mod: typeof EmscriptenModule;
let polyfillRun = false;

let pathPrefix = "/wasm"; // Default search path is /wasm/filename.wasm

// tslint:disable
export namespace wasmModule {
  export let _encodeString: (str: string, bandwidth: number, interleave: 0 | 1) => number;
  export let _getBuffer: () => number;
  export let _getSampleRate: () => number;
  export let _initMT63Rx: (bandwidth: number, interleave: number, integration: number, squelch: number) => void;
  export let _processMT63Rx: (dataPtr: number, length: number) => string;
  export let _processResampleMT63Rx: (dataPtr: number, sampleRate: number, length: number) => string;
  export let _crc16: (str: string) => string;
  export let _lzmaEncode: (str: string, len: number) => number;
  export let _lzmaDecode: (str: number, len: number) => number;
  export let _getLzmaOutputPtr: () => number;
  export let _getLzmaOutputStr: () => string;
  export let _downSampleCpp: (inputPtr: number, bufferLength: number, from: number, to: number, outputPtr: number) => number;
  export let readyDfd: Promise<typeof wasmModule>;
  export let mod: typeof EmscriptenModule;
}
// tslint:enable

const fileMap: {[filename: string]: string} = {};

export function setFileLocation(file: string, location: string) {
    fileMap[file] = location;
}

export type ModuleCustomFn = (mod: Partial<typeof EmscriptenModule>) => Partial<typeof EmscriptenModule>;

function initMod(customizeFn?: ModuleCustomFn): Promise<typeof wasmModule> {
  return new Promise((res, rej) => {
    let moduleTpl: Partial<typeof EmscriptenModule> = {
        onRuntimeInitialized(this: typeof mod) {
          wasmModule.mod = mod = this;
          wasmModule._encodeString = mod.cwrap('encodeString', 'number', ['string', 'number', 'number']);
          wasmModule._getBuffer = mod.cwrap('getBuffer', 'number');
          wasmModule._getSampleRate = mod.cwrap('getSampleRate', 'number');
          wasmModule._initMT63Rx = mod.cwrap('initRx', 'void', ['number', 'number', 'number', 'number']);
          wasmModule._processMT63Rx = mod.cwrap('processAudio', 'string', ['number', 'number']);
          wasmModule._processResampleMT63Rx = mod.cwrap('processAudioResample', 'string', ['number', 'number', 'number']);
          wasmModule._crc16 = mod.cwrap("crc16", "string", ["string"]);
          wasmModule._lzmaEncode = mod.cwrap('lzmaEncode', 'number', ['string', 'number']);
          wasmModule._lzmaDecode = mod.cwrap('lzmaDecode', 'number', ['number', 'number']);
          wasmModule._getLzmaOutputStr = mod.cwrap('getLzmaOutput', 'string');
          wasmModule._getLzmaOutputPtr = mod.cwrap('getLzmaOutput', 'number');
          wasmModule._downSampleCpp = mod.cwrap('downSampleCpp', 'number', ['number', 'number', 'number', 'number', 'number']) as any;
          res(wasmModule);
        },
        locateFile: function locateFile(fname: string) {
          if (fname in fileMap) {
              return fileMap[fname];
          } else {
              return fname;
          }
        },
    };
    if (customizeFn) {
        moduleTpl = customizeFn(moduleTpl);
    }

    // Use dynamic import instead of require for ES module compatibility
    const modulePromise = new Function('return import("./mt63Wasm.js")')() as Promise<any>;
    modulePromise.then((moduleImport: any) => {
      const Module = moduleImport.default || moduleImport;
      Module(moduleTpl).catch(rej);
    }).catch(rej);
  });
}
// By the time this runs we can safely start initializing things
export function initialize(customizeFn?: ModuleCustomFn) : Promise<typeof wasmModule> {
    if (!wasmModule.readyDfd) {
        wasmModule.readyDfd = initMod(customizeFn);
    }
    return wasmModule.readyDfd;
}

if (!polyfillRun) {
  polyfill();
  polyfillRun = true;
}

export default wasmModule;

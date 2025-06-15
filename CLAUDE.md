# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MT63 WASM is a WebAssembly implementation of the MT63 digital mode for amateur radio communications. It enables encoding/decoding of MT63 messages in web browsers by porting the MT63 implementation from fldigi to WebAssembly using Emscripten.

## Build Commands

### Prerequisites
- Emscripten SDK must be installed and in PATH
- Node.js and npm

### Common Development Commands

```bash
# Install dependencies
npm install

# Build native WASM module only
npm run build_native

# Build TypeScript only
npm run build

# Build everything (WASM + TypeScript)
npm run build_all

# Run tests (Jest framework)
npm test

# Prepare for publishing
npm run prepublish
```

### Build Configuration Note
The CMakeLists.txt currently has DEBUG flags enabled (line 36). For production builds, you may want to comment line 36 and uncomment line 35 to use release flags.

## Architecture

### Directory Structure
- `/native_src/` - C++ source code for MT63 and LZMA
  - `mt63_wasm.cxx` - Main C++ entry point
  - `lzma_wasm.cxx` - LZMA compression implementation
  - `mt63/` - Core MT63 implementation from fldigi
  - `lzma/` - LZMA compression library
- `/src/` - TypeScript/JavaScript wrapper
  - `MT63Client.ts` - Main client class for encoding/decoding
  - `wasmModule.ts` - WebAssembly module wrapper
  - `resampler.ts` - Audio resampling functionality
  - `index.ts` - Main entry point
  - `mt63/` - Pure TypeScript MT63 implementation (alternative to WASM)
    - `MT63tx.ts` - MT63 transmitter implementation
    - `MT63Client.ts` - Client for TypeScript-based encoding
    - `receiving/` - MT63 receiver implementation
      - `MT63rx.ts` - Main receiver class
      - `MT63Decoder.ts` - Walsh-Hadamard decoder
      - `QuadrSplit.ts` - Quadrature splitting filter
- `/dist/` - Compiled output (generated)
- `/native_build/` - CMake build output (generated)

### Key Technical Details

1. **WebAssembly Exports**: The WASM module exports functions for MT63 encoding/decoding, buffer management, LZMA compression, and CRC16 calculation.

2. **Audio Processing**: 
   - Native sample rate: 8000 Hz
   - Automatic resampling for other sample rates
   - Web Audio API integration

3. **MT63 Parameters**:
   - Supported bandwidths: 500, 1000, 2000 Hz
   - Interleave modes: 0 (short), 1 (long)

4. **Data Flow**:
   - Encoding: Text → MT63 encoding → Audio buffer → Playback
   - Decoding: Audio input → Resampling → MT63 decoding → Text

### Testing
Manual testing can be done using `test.html` in a local web server. The project has Jest configured for automated tests, though test files need to be added.

## Development Notes

- The TypeScript API provides a clean interface over the WASM functions
- The build process copies WASM artifacts to the dist folder
- The project is published as `@hamstudy/mt63-wasm` on npm
- Used by the HamStudy.org Runner-tracker application

## TypeScript MT63 Implementation

The project includes a pure TypeScript port of the MT63 protocol in `/src/mt63/`, providing an alternative to the WASM implementation:

### Transmitter (MT63tx.ts)
- Fully functional MT63 encoder
- Supports all three bandwidths (500, 1000, 2000 Hz)
- Implements both short and long interleave modes
- Generates audio at 8000 Hz sample rate

### Receiver (MT63rx.ts)
- Complete MT63 decoder implementation
- Synchronization tracking with frequency offset correction
- Walsh-Hadamard transform for error correction
- Differential phase decoding

### Key Implementation Details

1. **Buffer Size Requirements**: The receiver requires sufficient input samples due to decimation:
   - 500 Hz mode: ~4800 input samples (decimation 8:1)
   - 1000 Hz mode: ~2400 input samples (decimation 4:1)
   - 2000 Hz mode: ~1200 input samples (decimation 2:1)

2. **Typed Arrays for Performance**: The implementation uses typed arrays matching C++ types:
   ```typescript
   // MT63Decoder uses:
   this.IntlvPipe = new Float64Array(this.IntlvSize);      // C++ double*
   this.WalshBuff = new Float64Array(this.DataCarriers);   // C++ double*
   this.DecodePipe = new Int8Array(this.DecodeSize);       // C++ char*
   this.IntlvPatt = new Int32Array(this.DataCarriers);     // C++ int*
   
   // MT63rx uses:
   this.dataPwrMid = new Float64Array(this.dataScanLen);   // C++ double*
   this.dataPhase = new Float64Array(this.dataScanLen);    // C++ double*
   ```

3. **Complex Number Handling**: Complex arrays use objects for clarity:
   ```typescript
   // Complex numbers remain as objects {re: number, im: number}
   // for better code readability and direct operations
   this.FFTbuff[i] = { re: 0, im: 0 };
   ```

4. **Critical Differences from C++**:
   - TypeScript uses return values instead of reference parameters
   - Array bounds must be explicitly checked
   - All arrays must be properly initialized to avoid undefined values
   - Complex number arrays use object notation rather than interleaved arrays

### Testing

Test files can be generated using `test/generate-test-files.ts`:
```bash
npx tsx test/generate-test-files.ts
```

Decode test files using `test/decode-test-files.ts`:
```bash
npx tsx test/decode-test-files.ts
```

## Development Tips
- To run test files written in typescript use npx tsx
- When debugging the decoder, ensure input chunks are large enough for the decimation ratio
- The decoder needs time to achieve synchronization lock before producing clean text
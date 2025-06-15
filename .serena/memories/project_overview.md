# MT63 WASM Project Overview

## Purpose
MT63 WASM is a WebAssembly implementation of the MT63 digital mode for amateur radio communications. It enables encoding/decoding of MT63 messages in web browsers by porting the MT63 implementation from fldigi to WebAssembly using Emscripten.

## Tech Stack
- **C++**: Core MT63 implementation (native_src/)
- **TypeScript**: Web wrapper and API (src/)
- **WebAssembly**: Runtime target using Emscripten
- **Node.js**: Build toolchain and testing
- **CMake**: Build system for native code
- **Jest**: Testing framework

## Architecture
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
- `/dist/` - Compiled output (generated)
- `/native_build/` - CMake build output (generated)

## Key Features
- MT63 encoding/decoding
- Audio resampling (native 8000 Hz)
- LZMA compression
- CRC16 calculation
- Web Audio API integration
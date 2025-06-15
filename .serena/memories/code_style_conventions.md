# Code Style and Conventions

## C++ Code (native_src/)
- Based on fldigi MT63 implementation
- Class naming: PascalCase (e.g., `MT63decoder`, `MT63encoder`)
- Function naming: PascalCase (e.g., `Process`, `Preset`)
- Member variables: camelCase or lowercase
- Header guards and includes follow standard C++ practices
- DSP-specific naming conventions (e.g., `dspCmpx`, `dspPower`)

## TypeScript Code (src/)
- Modern TypeScript with strict type checking
- Class naming: PascalCase (e.g., `MT63Client`)
- Method naming: camelCase (e.g., `encode`, `decode`)
- Interface naming: PascalCase with 'I' prefix when needed
- Export/import using ES6 modules
- JSDoc comments for API documentation

## File Naming
- C++ files: `.cxx` extension (not `.cpp`)
- Header files: `.h` extension
- TypeScript files: `.ts` extension
- WebAssembly files: `.wasm` extension

## Build Configuration
- tsconfig.json configured for ES2020 target
- Emscripten build flags defined in CMakeLists.txt
- Package.json defines build scripts and dependencies
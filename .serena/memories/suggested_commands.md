# Suggested Commands for MT63 WASM

## Build Commands
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

## Development Commands
```bash
# View package.json for available scripts
cat package.json

# Check TypeScript compilation
npx tsc --noEmit

# Manual testing using test.html
# Requires local web server due to CORS restrictions
```

## System Commands (Darwin/macOS)
```bash
# Standard file operations
ls -la
find . -name "*.cxx" -o -name "*.h"
grep -r "pattern" native_src/
cd directory

# Git operations
git status
git add .
git commit -m "message"
git log --oneline
```

## Build Configuration Notes
- CMakeLists.txt has DEBUG flags enabled by default (line 36)
- For production builds, comment line 36 and uncomment line 35
- Emscripten SDK must be installed and in PATH
- Output goes to dist/ folder for deployment
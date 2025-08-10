#!/usr/bin/env node

// Test script to compare debug output between WASM and TypeScript implementations
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { wasmModule, initialize } from './dist/wasmModule.js';
import { initRx, processAudioResample } from './dist/mt63/MT63typescript.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('='.repeat(80));
console.log('MT63 DEBUG COMPARISON TEST');
console.log('='.repeat(80));

// Load the test audio data
const audioDataFile = JSON.parse(fs.readFileSync('./mt63-captured-data-audio.json', 'utf8'));
const audioData = audioDataFile.audio;  // Extract the actual audio array
console.log(`Loaded ${audioData.length} audio samples for testing`);

console.log('\n' + '='.repeat(40));
console.log('TESTING WASM VERSION');
console.log('='.repeat(40));

try {
    console.log('WASM: Initializing MT63...');

    // Load the WASM file as buffer
    const wasmPath = path.join(__dirname, 'dist/mt63Wasm.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    // Initialize with the buffer
    await initialize((moduleTpl) => {
        moduleTpl.wasmBinary = wasmBuffer;
        return moduleTpl;
    });

    wasmModule._initMT63Rx(2000, 1, 16, 5.0);

    console.log('WASM: Processing audio samples...');

    // Process in chunks like simple_test.mjs
    const chunkSize = 6 * 128 * 3;
    const numChunks = Math.ceil(audioData.length / chunkSize);
    let allDecoded = '';

    console.log(`WASM: Processing ${numChunks} chunks of ${chunkSize} samples each...`);

    // Allocate buffer once for efficiency
    const audioPtr = wasmModule.mod._malloc((chunkSize + 10) * 4);

    for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, audioData.length);
        let chunk = audioData.slice(start, end);

        // Pad if necessary
        if (chunk.length < chunkSize) {
            const padded = new Array(chunkSize).fill(0);
            padded.splice(0, chunk.length, ...chunk);
            chunk = padded;
        }

        // Copy to WASM memory
        wasmModule.mod.HEAPF32.set(chunk, audioPtr / 4);

        // Process with WASM
        if (i % 50 === 0) { // Show progress periodically and first 10 chunks
            console.log(`WASM: Processing chunk ${i}/${numChunks}...`);
        }
        const result = wasmModule._processResampleMT63Rx(audioPtr, 48000, chunkSize);
        if (result && result.length > 0) {
            // console.log(`WASM: CHUNK ${i}: DECODED "${result}"`);
            allDecoded += result;
        }
        // if (i > 9) break; // REMOVE THIS: Debugging only, remove
    }

    console.log(`WASM: Result length: ${allDecoded.length}`);
    console.log(`WASM: Result: "${allDecoded}"\n`);

} catch (error) {
    console.error('WASM Error:', error);
}

console.log('\n' + '='.repeat(40));
console.log('TESTING TYPESCRIPT VERSION');
console.log('='.repeat(40));

try {
    console.log('TS: Initializing MT63...');
    initRx(2000, true, 16, 5.0);  // bandwidth=2000, longInterleave=true, integration=16, squelch=5.0

    console.log('TS: Processing audio samples...');

    // Process in chunks like the WASM version
    const chunkSize = 6 * 128 * 3;
    const numChunks = Math.ceil(audioData.length / chunkSize);
    let allDecoded = '';

    console.log(`TS: Processing ${numChunks} chunks of ${chunkSize} samples each...`);

    for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, audioData.length);
        const chunk = audioData.slice(start, end);
        const chunkFloat32 = new Float32Array(chunk);

        if (i % 50 === 0) { // Show progress periodically and first 10 chunks
            console.log(`TS: Processing chunk ${i}/${numChunks}...`);
        }
        const result = processAudioResample(chunkFloat32, 48000, chunkFloat32.length);  // Fixed: added length parameter
        if (result && result.length > 0) {
            // console.log(`TS: CHUNK ${i}: DECODED "${result}"`);
            allDecoded += result;
        }
        // if (i > 9) break; // REMOVE THIS: Debugging only, remove
    }

    console.log(`TS: Result length: ${allDecoded.length}`);
    console.log(`TS: Result: "${allDecoded}"\n`);

} catch (error) {
    console.error('TypeScript Error:', error);
}

console.log('\n' + '='.repeat(40));
console.log('COMPARISON COMPLETE');
console.log('='.repeat(40));

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { wasmModule, initialize } from './dist/wasmModule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testWasm() {
    console.log('Loading WASM module...');

    // Load the WASM file as buffer
    const wasmPath = path.join(__dirname, 'dist/mt63Wasm.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    console.log('WASM file loaded, size:', wasmBuffer.length, 'bytes');

    // Initialize with the buffer
    await initialize((moduleTpl) => {
        moduleTpl.wasmBinary = wasmBuffer;
        return moduleTpl;
    });

    console.log('WASM module initialized!');
    // console.log('Available functions:', Object.keys(wasmModule).filter(key => typeof wasmModule[key] === 'function'));

    // Test basic functionality
    if (wasmModule._getSampleRate) {
        console.log('Sample rate:', wasmModule._getSampleRate());
    }

    // Initialize MT63 receiver
    if (wasmModule._initMT63Rx) {
        console.log('Initializing MT63 receiver...');
        wasmModule._initMT63Rx(2000, 1, 16, 5.0);
        console.log('MT63 receiver ready!');
    }

    // Test with real data processing
    try {
        // Load real captured data
        const dataPath = path.join(__dirname, 'mt63-captured-data-audio.json');

        if (!fs.existsSync(dataPath)) {
            console.log('❌ Real captured data not found at:', dataPath);
            return;
        }

        console.log('📁 Loading real captured MT63 data...');
        const capturedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // Extract audio data from all chunks
        let allAudio = [];

        allAudio = capturedData.audio;

        if (allAudio.length === 0) {
            console.log('❌ No audio data found in captured data');
            return;
        }

        console.log(`📊 Loaded ${allAudio.length} audio samples`);

        // Process in chunks like real-time
        const chunkSize = 6 * 128 * 3;
        const numChunks = Math.ceil(allAudio.length / chunkSize);
        let allDecoded = '';
        let decodedChunks = 0;

        console.log(`🔄 Processing ${numChunks} chunks of ${chunkSize} samples each...`);
        console.log(capturedData.length);

        // Allocate buffer once for efficiency
        const audioPtr = wasmModule.mod._malloc((chunkSize + 10) * 4);
        const audioBuffer = wasmModule.mod.HEAPF32.subarray(audioPtr/4, audioPtr/4 + chunkSize);

        for (let i = 0; i < numChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, allAudio.length);
            let chunk = allAudio.slice(start, end);

            // Pad if necessary
            if (chunk.length < chunkSize) {
                const padded = new Array(chunkSize).fill(0);
                padded.splice(0, chunk.length, ...chunk);
                chunk = padded;
            }

            // Copy to WASM memory
            wasmModule.mod.HEAPF32.set(chunk, audioPtr / 4);

            // Process with WASM
            const result = wasmModule._processResampleMT63Rx(audioPtr, 48000, chunkSize);
            if (result && result.length > 0) {
                console.log(`✨ CHUNK ${i}: DECODED "${result}"`);
                allDecoded += result;
                decodedChunks++;
            } else if (i % 100 === 0) {
                // Progress indicator
                // console.log(`⏳ Processed ${i}/${numChunks} chunks...`);
            }
        }

        // Clean up
        // wasmModule.mod._free(audioPtr);

        console.log('\n📋 REAL DATA TEST RESULTS:');
        console.log(`🔢 Total chunks processed: ${numChunks}`);
        console.log(`✅ Chunks with decode: ${decodedChunks}`);
        // console.log(`📝 Total decoded text: \n"${allDecoded}"\n`);

        if (capturedData.text === allDecoded) {
            console.log('✅ Captured data matches decoded text!');
            console.log(`📝 Total decoded text: \n"${allDecoded}"\n`);
        } else {
            console.log('❌ Captured data does NOT match decoded text!');
            console.log('   Original text:', capturedData.text);
            console.log('   Decoded text:', allDecoded);
        }

        if (allDecoded.length > 0) {
            console.log('🎉 WASM SUCCESSFULLY DECODED MT63 DATA!');

            // Analyze the decoded content
            const hasProtocolMarkers = allDecoded.includes('<') && allDecoded.includes('>');
            const hasFileMarkers = allDecoded.includes('FILE') || allDecoded.includes('DATA');

            if (hasProtocolMarkers || hasFileMarkers) {
                console.log('📡 Decoded data contains MT63 protocol markers');
            } else {
                console.log('📄 Decoded data appears to be plain text');
            }
        } else {
            console.log('❌ WASM did not decode any MT63 data');
            console.log('   This could indicate:');
            console.log('   - Signal too weak or noisy');
            console.log('   - Wrong receiver parameters');
            console.log('   - Incompatible signal format');
        }

        return allDecoded;

    } catch (error) {
        console.error('❌ Error testing with real data:', error);
        return '';
    }
}

testWasm().catch(console.error);

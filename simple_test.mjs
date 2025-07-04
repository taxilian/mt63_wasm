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
    console.log('Available functions:', Object.keys(wasmModule).filter(key => typeof wasmModule[key] === 'function'));

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
    if (wasmModule._processResampleMT63Rx) {
        console.log('Testing MT63 processing...');

        const testSize = 1024;
        const testPtr = wasmModule.mod._malloc((testSize + 10) * 4);

        // Create test signal (1500Hz tone)
        const testData = new Float32Array(testSize);
        for (let i = 0; i < testSize; i++) {
            testData[i] = Math.sin(2 * Math.PI * 1500 * i / 8000) * 0.1;
        }

        wasmModule.mod.HEAPF32.subarray(testPtr/4, testPtr/4 + testSize);
        // wasmModule.mod.HEAPF32.set(testData, testPtr / 4);

        const result = wasmModule._processResampleMT63Rx(testPtr, 8000, testSize);
        console.log('MT63 processing result:', result || '(no decode)');

        // wasmModule.mod._free(testPtr);
    }

    // Test with real captured MT63 data
    console.log('\n🎵 Testing with real captured MT63 data...');
    await testWithRealData();

    console.log('✅ WASM test completed!');
}

async function testWithRealData() {
    try {
        // Load real captured data
        const dataPath = path.join(__dirname, 'mt63-captured-data.json');

        if (!fs.existsSync(dataPath)) {
            console.log('❌ Real captured data not found at:', dataPath);
            return;
        }

        console.log('📁 Loading real captured MT63 data...');
        const capturedDataArray = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        // The JSON file is an array of chunk objects
        if (!Array.isArray(capturedDataArray)) {
            console.log('❌ Expected array of chunks, got:', typeof capturedDataArray);
            return;
        }

        console.log(`📦 Found ${capturedDataArray.length} captured chunks`);

        // Extract audio data from all chunks
        let allAudio = [];
        let totalDuration = 0;
        let avgRMS = 0;

        for (const chunk of capturedDataArray) {
            if (chunk.audio && Array.isArray(chunk.audio)) {
                allAudio = allAudio.concat(chunk.audio);
                totalDuration += chunk.duration || 0;
                avgRMS += chunk.signalRMS || 0;

                console.log(`📊 Chunk: ${chunk.audio.length} samples, RMS: ${(chunk.signalRMS || 0).toFixed(6)}, Duration: ${(chunk.duration || 0).toFixed(2)}s`);
            }
        }

        if (capturedDataArray.length > 0) {
            avgRMS /= capturedDataArray.length;
        }

        if (allAudio.length === 0) {
            console.log('❌ No audio data found in captured data');
            return;
        }

        console.log(`📊 Loaded ${allAudio.length} audio samples from ${capturedDataArray.length} chunks`);
        console.log(`📈 Total duration: ${totalDuration.toFixed(2)}s, Avg RMS: ${avgRMS.toFixed(6)}`);

        // Analyze the combined signal in chunks to avoid stack overflow
        let rms = 0;
        let max = -Infinity;
        let min = Infinity;

        const statsChunkSize = 10000;
        for (let i = 0; i < allAudio.length; i += statsChunkSize) {
            const end = Math.min(i + statsChunkSize, allAudio.length);
            const chunk = allAudio.slice(i, end);

            // Calculate RMS contribution
            rms += chunk.reduce((sum, x) => sum + x * x, 0);

            // Find local min/max
            const localMax = Math.max(...chunk);
            const localMin = Math.min(...chunk);

            if (localMax > max) max = localMax;
            if (localMin < min) min = localMin;
        }

        rms = Math.sqrt(rms / allAudio.length);

        console.log(`📈 Signal stats - RMS: ${rms.toFixed(6)}, Range: ${min.toFixed(3)} to ${max.toFixed(3)}`);

        // Process in chunks like real-time
        const chunkSize = 6 * 128 * 3;
        // const chunkSize = 1024;
        const numChunks = Math.ceil(allAudio.length / chunkSize);
        let allDecoded = '';
        let decodedChunks = 0;

        console.log(`🔄 Processing ${numChunks} chunks of ${chunkSize} samples each...`);

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
            console.log('result: ', result);

            if (result && result.length > 0) {
                console.log(`✨ CHUNK ${i}: DECODED "${result}"`);
                allDecoded += result;
                decodedChunks++;
            } else if (i % 100 === 0) {
                // Progress indicator
                console.log(`⏳ Processed ${i}/${numChunks} chunks...`);
            }
        }

        // Clean up
        // wasmModule.mod._free(audioPtr);

        console.log('\n📋 REAL DATA TEST RESULTS:');
        console.log(`🔢 Total chunks processed: ${numChunks}`);
        console.log(`✅ Chunks with decode: ${decodedChunks}`);
        console.log(`📝 Total decoded text: "${allDecoded}"`);
        console.log(`📊 Decode success rate: ${(decodedChunks/numChunks*100).toFixed(1)}%`);

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

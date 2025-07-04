import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { wasmModule, initialize } from './dist/wasmModule.js';
import { downSample } from './dist/mt63/downsample.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function generateTestSignal(length, frequency, sampleRate) {
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        signal[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    return signal;
}

function compareArrays(arr1, arr2, tolerance = 1e-6) {
    if (arr1.length !== arr2.length) {
        return { match: false, reason: `Length mismatch: ${arr1.length} vs ${arr2.length}` };
    }

    for (let i = 0; i < arr1.length; i++) {
        const diff = Math.abs(arr1[i] - arr2[i]);
        if (diff > tolerance) {
            return {
                match: false,
                reason: `Value mismatch at index ${i}: ${arr1[i]} vs ${arr2[i]} (diff: ${diff})`,
                index: i,
                value1: arr1[i],
                value2: arr2[i],
                diff: diff
            };
        }
    }

    return { match: true };
}

async function testDownSampleComparison() {
    console.log('🔧 Loading WASM module...');
    
    // Load test data from JSON file
    console.log('📂 Loading test data from testData.json...');
    const testDataPath = path.join(__dirname, 'testData.json');
    const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
    
    console.log(`📊 Test data loaded: ${testData.audio.length} samples at ${testData.sampleRate}Hz`);
    console.log(`   Duration: ${testData.duration}s, RMS: ${testData.signalRMS.toFixed(6)}, Peak: ${testData.signalPeak.toFixed(6)}`);
    
    // Convert to Float32Array for processing
    const realAudioData = new Float32Array(testData.audio);

    // Load the WASM file as buffer
    const wasmPath = path.join(__dirname, 'dist/mt63Wasm.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    console.log(`📦 WASM file loaded, size: ${wasmBuffer.length} bytes`);

    // Initialize with the buffer
    await initialize((moduleTpl) => {
        moduleTpl.wasmBinary = wasmBuffer;
        return moduleTpl;
    });

    console.log('✅ WASM module initialized!');

    // Check if downSampleCpp is available
    if (!wasmModule._downSampleCpp) {
        console.log('❌ downSampleCpp function not available in WASM module');
        console.log('Available functions:', Object.keys(wasmModule).filter(key => typeof wasmModule[key] === 'function'));
        return;
    }

    console.log('✅ downSampleCpp function found in WASM module');

    // Test cases using real audio data - only testing 48kHz to 8kHz since that's what the data is designed for
    const testCases = [
        {
            name: "Real audio 48kHz to 8kHz (6:1 ratio)",
            sourceSampleRate: testData.sampleRate,
            targetSampleRate: 8000,
            inputData: realAudioData
        }
    ];

    let allTestsPassed = true;

    for (const testCase of testCases) {
        console.log(`\n🧪 Testing: ${testCase.name}`);

        // Use real audio data
        const inputSignal = testCase.inputData;

        console.log(`   📊 Input: ${inputSignal.length} samples at ${testCase.sourceSampleRate}Hz`);

        // Test TypeScript implementation
        console.log('   🟦 Running TypeScript implementation...');
        const tsOutput = new Float32Array(Math.ceil(inputSignal.length * testCase.targetSampleRate / testCase.sourceSampleRate) + 10);
        const tsResult = downSample(
            inputSignal,
            inputSignal.length,
            testCase.sourceSampleRate,
            testCase.targetSampleRate,
            tsOutput
        );

        console.log(`   📊 TS Output: ${tsResult} samples`);

        // Test C++ implementation
        console.log('   🟨 Running C++ implementation...');

        // Allocate memory for input
        const inputPtr = wasmModule.mod._malloc(inputSignal.length * 4);
        wasmModule.mod.HEAPF32.set(inputSignal, inputPtr / 4);

        // Allocate memory for output (generous size)
        const expectedOutputLength = Math.ceil(inputSignal.length * testCase.targetSampleRate / testCase.sourceSampleRate) + 10;
        const outputPtr = wasmModule.mod._malloc(expectedOutputLength * 4);

        // Call C++ downSample
        const actualOutputLength = wasmModule._downSampleCpp(
            inputPtr,
            inputSignal.length,
            testCase.sourceSampleRate,
            testCase.targetSampleRate,
            outputPtr
        );

        // Extract the result
        const cppResult = new Float32Array(
            wasmModule.mod.HEAPF32.buffer,
            outputPtr,
            actualOutputLength
        ).slice(); // Create a copy

        // Clean up memory
        wasmModule.mod._free(inputPtr);
        wasmModule.mod._free(outputPtr);

        console.log(`   📊 C++ Output: ${actualOutputLength} samples`);

        // Get the TypeScript output array (only the valid portion)
        const tsResultArray = tsOutput.slice(0, tsResult);

        // Compare results
        const comparison = compareArrays(tsResultArray, cppResult, 1e-5);

        if (comparison.match) {
            console.log('   ✅ Results match!');
        } else {
            console.log(`   ❌ Results don't match: ${comparison.reason}`);
            allTestsPassed = false;

            // Show first few values for debugging
            console.log('   🔍 First 10 values comparison:');
            for (let i = 0; i < Math.min(10, tsResultArray.length, cppResult.length); i++) {
                const diff = Math.abs(tsResultArray[i] - cppResult[i]);
                const symbol = diff > 1e-5 ? '❌' : '✅';
                console.log(`      [${i}] TS: ${tsResultArray[i].toFixed(6)}, C++: ${cppResult[i].toFixed(6)}, diff: ${diff.toFixed(8)} ${symbol}`);
            }
        }
    }

    console.log('\n📋 Test Summary:');
    if (allTestsPassed) {
        console.log('🎉 All tests passed! TypeScript and C++ implementations match.');
    } else {
        console.log('❌ Some tests failed. There are differences between implementations.');
    }
}

testDownSampleComparison().catch(console.error);

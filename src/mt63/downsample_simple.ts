// Simple downsample function that matches the C++ implementation
export function downSampleSimple(
    input: Float32Array, 
    length: number, 
    sourceSampleRate: number, 
    targetSampleRate: number, 
    outputBuffer: Float32Array
): number {
    // If the source and target sample rates are the same, just copy the input to the output
    if (sourceSampleRate === targetSampleRate) {
        const copyLength = Math.min(length, outputBuffer.length);
        outputBuffer.set(input.subarray(0, copyLength));
        return copyLength;
    }
    
    // Otherwise we need to downsample
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.ceil(length / ratio);
    
    // Ensure output buffer is large enough
    if (newLength > outputBuffer.length) {
        console.error(`Output buffer too small: ${outputBuffer.length} < ${newLength}`);
        return 0;
    }
    
    for (let i = 0; i < newLength; i++) {
        const index = i * ratio;
        const indexFloor = Math.floor(index);
        const indexRemainder = index - indexFloor;
        
        if (indexFloor + 1 < length) {
            // Linear interpolation between two samples
            outputBuffer[i] = (1 - indexRemainder) * input[indexFloor] + 
                            indexRemainder * input[indexFloor + 1];
        } else {
            // Use the last sample if we're at the end
            outputBuffer[i] = input[indexFloor];
        }
    }
    
    return newLength;
}
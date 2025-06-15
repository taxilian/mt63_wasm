
let tailExists = false;
let lastOutput = 0;
let lastWeight = 0;

export function downSample(input: Float32Array, bufferLength: number, from: number, to: number, output: Float32Array) {
    const ratioWeight = from / to;
    let outputOffset = 0;
    if (bufferLength > 0) {
        const buffer = input;
        let weight = 0;
        let output0 = 0;
        let actualPosition = 0;
        let amountToNext = 0;
        let alreadyProcessedTail = !tailExists;
        tailExists = false;
        const outputBuffer = output;
        let currentPosition = 0;
        do {
            if (alreadyProcessedTail) {
                weight = ratioWeight;
                output0 = 0;
            } else {
                weight = lastWeight;
                output0 = lastOutput;
                alreadyProcessedTail = true;
            }
            while (weight > 0 && actualPosition < bufferLength) {
                amountToNext = 1 + actualPosition - currentPosition;
                if (weight >= amountToNext) {
                    output0 += buffer[actualPosition++] * amountToNext;
                    currentPosition = actualPosition;
                    weight -= amountToNext;
                } else {
                    output0 += buffer[actualPosition] * weight;
                    currentPosition += weight;
                    weight = 0;
                    break;
                }
            }
            if (weight <= 0) {
                outputBuffer[outputOffset++] = output0 / ratioWeight;
            } else {
                lastWeight = weight;
                lastOutput = output0;
                tailExists = true;
                break;
            }
        } while (actualPosition < bufferLength);
    }
    return outputOffset;
}

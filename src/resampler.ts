"use strict";
//JavaScript Audio Resampler
//Copyright (C) 2011-2015 Grant Galitz
//Released to Public Domain
//Ported to typescript by Richard Bateman in 2019

function getBufferConstructor<T extends Float32Array | Float64Array | number[]>(input: Float32Array | Float64Array) {
    if (input instanceof Float32Array) {
        return Float32Array;
    } else if (input instanceof Float64Array) {
        return Float64Array;
    } else {
        return Array;
    }
}

export class Resampler<T extends Float32Array|Float64Array> {
    BufferType = getBufferConstructor(this.inputBuffer);
    outputBuffer!: T;
    lastOutput!: T;

    ratioWeight = 1;
    lastWeight = 1;
    tailExists = false;

    resampler = this.bypassResampler;
    constructor (private fromSampleRate: number, private toSampleRate: number, private channels: number, private inputBuffer: T) {
        //Input Sample Rate:
        this.fromSampleRate = +fromSampleRate;
        //Output Sample Rate:
        this.toSampleRate = +toSampleRate;
        //Number of channels:
        this.channels = channels | 0;
        //Type checking the input buffer:
        if (typeof inputBuffer != "object") {
            throw(new Error("inputBuffer is not an object."));
        }
        if (!(inputBuffer instanceof Array) && !(inputBuffer instanceof Float32Array) && !(inputBuffer instanceof Float64Array)) {
            throw(new Error("inputBuffer is not an array or a float32 or a float64 array."));
        }
        this.inputBuffer = inputBuffer;
        //Initialize the resampler:
        this.initialize();
    }

    initialize() {
        //Perform some checks:
        if (this.fromSampleRate > 0 && this.toSampleRate > 0 && this.channels > 0) {
            if (this.fromSampleRate == this.toSampleRate) {
                //Setup a resampler bypass:
                this.resampler = this.bypassResampler;		//Resampler just returns what was passed through.
                this.ratioWeight = 1;
                this.outputBuffer = this.inputBuffer as any;
            }
            else {
                this.ratioWeight = this.fromSampleRate / this.toSampleRate;
                if (this.fromSampleRate < this.toSampleRate) {
                    /*
                        Use generic linear interpolation if upsampling,
                        as linear interpolation produces a gradient that we want
                        and works fine with two input sample points per output in this case.
                    */
                    this.compileLinearInterpolationFunction();
                    this.lastWeight = 1;
                }
                else {
                    /*
                        Custom resampler I wrote that doesn't skip samples
                        like standard linear interpolation in high downsampling.
                        This is more accurate than linear interpolation on downsampling.
                    */
                    this.compileMultiTapFunction();
                    this.tailExists = false;
                    this.lastWeight = 0;
                }
                this.initializeBuffers();
            }
        }
        else {
            throw(new Error("Invalid settings specified for the resampler."));
        }
    }
    bypassResampler (upTo: number) {
        return upTo;
    }
    compileLinearInterpolationFunction() {
        var toCompile = "var outputOffset = 0;\
        if (bufferLength > 0) {\
            var buffer = this.inputBuffer;\
            var weight = this.lastWeight;\
            var firstWeight = 0;\
            var secondWeight = 0;\
            var sourceOffset = 0;\
            var outputOffset = 0;\
            var outputBuffer = this.outputBuffer;\
            for (; weight < 1; weight += " + this.ratioWeight + ") {\
                secondWeight = weight % 1;\
                firstWeight = 1 - secondWeight;";
                for (var channel = 0; channel < this.channels; ++channel) {
                    toCompile += "outputBuffer[outputOffset++] = (this.lastOutput[" + channel + "] * firstWeight) + (buffer[" + channel + "] * secondWeight);";
                }
            toCompile += "}\
            weight -= 1;\
            for (bufferLength -= " + this.channels + ", sourceOffset = Math.floor(weight) * " + this.channels + "; sourceOffset < bufferLength;) {\
                secondWeight = weight % 1;\
                firstWeight = 1 - secondWeight;";
                for (var channel = 0; channel < this.channels; ++channel) {
                    toCompile += "outputBuffer[outputOffset++] = (buffer[sourceOffset" + ((channel > 0) ? (" + " + channel) : "") + "] * firstWeight) + (buffer[sourceOffset + " + (this.channels + channel) + "] * secondWeight);";
                }
                toCompile += "weight += " + this.ratioWeight + ";\
                sourceOffset = Math.floor(weight) * " + this.channels + ";\
            }";
            for (var channel = 0; channel < this.channels; ++channel) {
                toCompile += "this.lastOutput[" + channel + "] = buffer[sourceOffset++];";
            }
            toCompile += "this.lastWeight = weight % 1;\
        }\
        return outputOffset;";
        this.resampler = Function("bufferLength", toCompile) as any;
    }
    compileMultiTapFunction() {
        var toCompile = "var outputOffset = 0;\
        if (bufferLength > 0) {\
            var buffer = this.inputBuffer;\
            var weight = 0;";
            for (var channel = 0; channel < this.channels; ++channel) {
                toCompile += "var output" + channel + " = 0;"
            }
            toCompile += "var actualPosition = 0;\
            var amountToNext = 0;\
            var alreadyProcessedTail = !this.tailExists;\
            this.tailExists = false;\
            var outputBuffer = this.outputBuffer;\
            var currentPosition = 0;\
            do {\
                if (alreadyProcessedTail) {\
                    weight = " + this.ratioWeight + ";";
                    for (channel = 0; channel < this.channels; ++channel) {
                        toCompile += "output" + channel + " = 0;"
                    }
                toCompile += "}\
                else {\
                    weight = this.lastWeight;";
                    for (channel = 0; channel < this.channels; ++channel) {
                        toCompile += "output" + channel + " = this.lastOutput[" + channel + "];"
                    }
                    toCompile += "alreadyProcessedTail = true;\
                }\
                while (weight > 0 && actualPosition < bufferLength) {\
                    amountToNext = 1 + actualPosition - currentPosition;\
                    if (weight >= amountToNext) {";
                        for (channel = 0; channel < this.channels; ++channel) {
                            toCompile += "output" + channel + " += buffer[actualPosition++] * amountToNext;"
                        }
                        toCompile += "currentPosition = actualPosition;\
                        weight -= amountToNext;\
                    }\
                    else {";
                        for (channel = 0; channel < this.channels; ++channel) {
                            toCompile += "output" + channel + " += buffer[actualPosition" + ((channel > 0) ? (" + " + channel) : "") + "] * weight;"
                        }
                        toCompile += "currentPosition += weight;\
                        weight = 0;\
                        break;\
                    }\
                }\
                if (weight <= 0) {";
                    for (channel = 0; channel < this.channels; ++channel) {
                        toCompile += "outputBuffer[outputOffset++] = output" + channel + " / " + this.ratioWeight + ";"
                    }
                toCompile += "}\
                else {\
                    this.lastWeight = weight;";
                    for (channel = 0; channel < this.channels; ++channel) {
                        toCompile += "this.lastOutput[" + channel + "] = output" + channel + ";"
                    }
                    toCompile += "this.tailExists = true;\
                    break;\
                }\
            } while (actualPosition < bufferLength);\
        }\
        return outputOffset;";
        this.resampler = Function("bufferLength", toCompile) as any;
    }
    initializeBuffers() {
        //Initialize the internal buffer:
        var outputBufferSize = (Math.ceil(this.inputBuffer.length * this.toSampleRate / this.fromSampleRate / this.channels * 1.000000476837158203125) * this.channels) + this.channels;
        this.outputBuffer = new this.BufferType(outputBufferSize) as any;
        this.lastOutput = new this.BufferType(this.channels) as any;
    }
}
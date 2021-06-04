
#include "mt63/mt63base.h"
#include <stdio.h>
#include <memory>
#include <vector>
#include <string>
#include "crc16.h"

using BufferType = float;

const double txLevel = -6.0;
const double SIGLIMIT = 0.95;

#define TONE_AMP 0.8
#define k_SAMPLERATE 8000
#define k_BUFFERSECONDS 600
#define k_BUFFER_MAX_SIZE k_SAMPLERATE * k_BUFFERSECONDS // 8000Hz sample rate, 600 seconds (10 minutes)
const float CenterFreq = 1500;
std::vector<BufferType> buffer(k_BUFFER_MAX_SIZE);
unsigned int bufferSize = 0;
MT63tx Tx;
MT63rx Rx;

void resetBuffer() {
    buffer[0] = 0;
    bufferSize = 0;
}
void flushToBuffer(MT63tx *Tx, float mult = 1.0) {
    while (bufferSize + Tx->Comb.Output.Len > k_BUFFER_MAX_SIZE) {
        // This is not good! We will overflow the buffer.
        // The only thing to do is to resize that sucker!
        buffer.resize(buffer.size() + k_BUFFER_MAX_SIZE * 0.5);
    }
    auto lBuffer = &buffer[0];
    float maxVal = 0.0;
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        auto a = fabs(Tx->Comb.Output.Data[i]);
        if (a > maxVal) { maxVal = a; }
    }
    // maxVal = 1.0;
    if (mult > SIGLIMIT) { mult = SIGLIMIT; }
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        auto val = Tx->Comb.Output.Data[i] * 1.0f / maxVal * mult;
        if (val > SIGLIMIT) val = SIGLIMIT;
        if (val < -SIGLIMIT) val = -SIGLIMIT;
        lBuffer[bufferSize++] = static_cast<BufferType>(val);
    }
}
void interleaveFlush(MT63tx *Tx) {
    for (auto i = 0; i < Tx->DataInterleave; ++i) {
        Tx->SendChar(0);
        flushToBuffer(Tx);
    }
}

void sendTone(MT63tx *Tx, int seconds, int bandwidth) {
    auto lBuffer = &buffer[0];
    auto samplerate = k_SAMPLERATE;
    int numsmpls = samplerate * seconds / 512;
    float w1 = 2.0f * M_PI * (CenterFreq - bandwidth / 2.0) / samplerate;
    float w2 = 2.0f * M_PI * (CenterFreq + 31.0 * bandwidth / 64.0) / samplerate;
    float phi1 = 0.0;
    float phi2 = 0.0;
    for (int i = 0; i < numsmpls; i++) {
        for (int j = 0; j < 512; j++) {
            lBuffer[bufferSize++] = TONE_AMP * 0.5 * cos(phi1) +
                                    TONE_AMP * 0.5 * cos(phi2);
            phi1 += w1;
            phi2 += w2;
            if (i == 0) lBuffer[bufferSize-1] *= (1.0 - exp(-1.0 * j / 40.0));
            if (i == seconds - 1)
                lBuffer[bufferSize-1] *= (1.0 - exp(-1.0 * (samplerate - j) / 40.0));
        }
    }
    for (auto i = 0; i < Tx->DataInterleave; ++i) {
        Tx->SendChar(0);
    }
}

std::string lastString;
std::string lastCRCString;

int escape = 0;

double sqlVal = 8.0;

bool tailExists = false;
float lastOutput = 0.0;
float lastWeight = 0;

size_t inputBufferSize = 10;
std::vector<float> inputBuffer(10);

size_t downSample(float* input, size_t bufferLength, float from, float to, float* output) {
    const auto ratioWeight = from / to;
    size_t outputOffset = 0;
    if (bufferLength > 0) {
        auto buffer = input;
        auto weight = 0;
        auto output0 = 0.0f;
        size_t actualPosition = 0;
        size_t amountToNext = 0;
        bool alreadyProcessedTail = !tailExists;
        tailExists = false;
        const auto outputBuffer = output;
        size_t currentPosition = 0;
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




extern "C" {

    const char* crc16(const char* inStr) {
        Ccrc16 crcObj;
        lastCRCString = crcObj.scrc16(inStr);
        return lastCRCString.c_str();
    }

    void initRx(int bandwidth, int interleave, int integration, double squelch) {
        Rx.Preset(CenterFreq, bandwidth, interleave, integration, nullptr);
        sqlVal = squelch;
    }

    const char* processAudio(float* samples, int len) {
        float_buff inBuff;
        inBuff.Data = samples;
        inBuff.Len = len;
        inBuff.Space = len;

        Rx.Process(&inBuff);
        if (Rx.FEC_SNR() < sqlVal) {
            return "";
        }

        lastString = std::string();
        for (auto i = 0; i < Rx.Output.Len; ++i) {
            auto c = Rx.Output.Data[i];
            if ((c < 8) && escape == 0) {
                continue;
            }
            if (c == 127) {
                escape = 1;
                continue;
            }
            if (escape) {
                c += 128;
                escape = 0;
            }
            lastString.push_back(c);
        }
        // if (!lastString.empty()) {
        //     printf("Something decoded with SNR of %f: %s\n", Rx.FEC_SNR(), lastString.c_str());
        // }
        return lastString.c_str();
    }

    // Note: for reasons that I haven't been able to track down, len must be
    // an exact multiple of (sampleRate / 8000) -- so if your sample rate is 
    // 48000 then it needs to be evenly divisible by 6. Otherwise you end up
    // with output that isn't always the same length and realloc calls elsewhere
    // in the code blow up and die.
    const char* processAudioResample(float* samples, size_t sampleRate, size_t len) {
        auto ratioWeight = sampleRate / k_SAMPLERATE;
        if (ratioWeight == 1) {
            return processAudio(samples, len);
        } else if (ratioWeight < 1) {
            return "ERROR BAD SAMPLE RATE";
        }
        // We need to downsample
        size_t maxOutputSize = static_cast<int>(len / ratioWeight) + 10;
        if (inputBufferSize < maxOutputSize) {
            printf("Resizing buffer to %lu\n", maxOutputSize);
            inputBuffer.resize(maxOutputSize);
            inputBufferSize = maxOutputSize;
        }
        const auto newLen = downSample(samples, len, sampleRate, k_SAMPLERATE, &inputBuffer[0]);
        // printf("After downsample length is %lu\n", newLen);
        
        return processAudio(&inputBuffer[0], newLen);
    }

    int getSampleRate() {
        return k_SAMPLERATE;
    }

    int encodeString(const char* inStr, int bandwidth, int interleave) {
        if (bandwidth != 500 && bandwidth != 1000 && bandwidth != 2000) {
            return 0; // Invalid entry
        }
        if (interleave < 0 || interleave > 1) {
            return 0; // Invalid entry
        }
        resetBuffer();

        double mult = pow(10, txLevel / 20);
        printf("Using txlevel multiplier of %f\n", mult);

        Tx.Preset(1500, bandwidth, interleave);
        sendTone(&Tx, 2, bandwidth);
        // Tx.SendTune(true);
        // flushToBuffer(&Tx);
        // Tx.SendTune(true);
        // flushToBuffer(&Tx);
        // Tx.SendTune(true);
        // flushToBuffer(&Tx);

        // interleaveFlush(&Tx);

        printf("Sending string: %s\n", inStr);
        for (auto cur = inStr; *cur != NULL; ++cur) {
            unsigned char c = *cur;
            if (c > 127) {
                c &= 127;
                Tx.SendChar(127);
                flushToBuffer(&Tx);
            }
            Tx.SendChar(*cur);
            flushToBuffer(&Tx);
        }
        interleaveFlush(&Tx);

        Tx.SendJam();
        flushToBuffer(&Tx);

        // Tx.SendSilence();
        // interleaveFlush(&Tx);


        return bufferSize;
    }

    BufferType* getBuffer() {
        return &buffer[0];
    }

}


#include "mt63base.h"
#include <stdio.h>
#include <memory>

const auto TONE_AMP = 0.8;
const auto k_SAMPLERATE = 8000;
const auto k_BUFFERSECONDS = 600;
const auto k_BUFFER_MAX_SIZE = k_SAMPLERATE*k_BUFFERSECONDS; // 8000Hz sample rate, 600 seconds (10 minutes)
const auto CenterFreq = 1500;
// float buffer[k_BUFFER_MAX_SIZE];
std::unique_ptr<float> buffer(new float[k_BUFFER_MAX_SIZE]);
unsigned int bufferSize = 0;
MT63tx Tx;

void resetBuffer() {
    buffer.get()[0] = 0;
    bufferSize = 0;
}
void flushToBuffer(MT63tx *Tx) {
    auto lBuffer = buffer.get();
    if (bufferSize + Tx->Comb.Output.Len > k_BUFFER_MAX_SIZE) {
        // This is not good! We will overflow the buffer.
        // TODO: Handle this more gracefully
        printf("Refusing to overrun the buffer!");
        return;
    }
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        lBuffer[bufferSize++] = static_cast<float>(Tx->Comb.Output.Data[i]);
    }
}
void interleaveFlush(MT63tx *Tx) {
    for (auto i = 0; i < Tx->DataInterleave; ++i) {
        Tx->SendChar(0);
        flushToBuffer(Tx);
    }
}

void sendTone(MT63tx *Tx, int seconds, int bandwidth) {
    auto lBuffer = buffer.get();
    auto samplerate = k_SAMPLERATE;
    int numsmpls = samplerate * seconds / 512;
    double w1 = 2.0 * M_PI * (CenterFreq - bandwidth / 2.0) / samplerate;
    double w2 = 2.0 * M_PI * (CenterFreq + 31.0 * bandwidth / 64.0) / samplerate;
    double phi1 = 0.0;
    double phi2 = 0.0;
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
}

extern "C" {

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

        Tx.Preset(1500, bandwidth, interleave);
        sendTone(&Tx, 2, bandwidth);
        flushToBuffer(&Tx);
        interleaveFlush(&Tx);

        for (auto cur = inStr; *cur != NULL; ++cur) {
            Tx.SendChar(*cur);
            flushToBuffer(&Tx);
        }
        interleaveFlush(&Tx);

        Tx.SendJam();
        interleaveFlush(&Tx);

        return bufferSize;
    }

    float* getBuffer() {
        return buffer.get();
    }

}

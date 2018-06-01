
#include "mt63base.h"
#include <stdio.h>

const auto k_SAMPLERATE = 8000;
const auto k_BUFFERSECONDS = 600;
const auto k_BUFFER_MAX_SIZE = k_SAMPLERATE*k_BUFFERSECONDS; // 8000Hz sample rate, 600 seconds (10 minutes)
float buffer[k_BUFFER_MAX_SIZE];
unsigned int bufferSize = 0;
MT63tx Tx;

void resetBuffer() {
    buffer[0] = 0;
    bufferSize = 0;
}
void flushToBuffer(MT63tx *Tx) {
    if (bufferSize + Tx->Comb.Output.Len > k_BUFFER_MAX_SIZE) {
        // This is not good! We will overflow the buffer.
        // TODO: Handle this more gracefully
        printf("Refusing to overrun the buffer!");
        return;
    }
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        buffer[bufferSize++] = static_cast<float>(Tx->Comb.Output.Data[i]);
    }
}

extern "C" {

    int getSampleRate() {
        return 8000;
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
        Tx.SendTune(false);

        flushToBuffer(&Tx);

        for (auto cur = inStr; *cur != NULL; ++cur) {
            Tx.SendChar(*cur);
            flushToBuffer(&Tx);
        }
        for (auto i = 0; i < Tx.DataInterleave; ++i) {
            Tx.SendChar(0);
            flushToBuffer(&Tx);
        }
        Tx.SendJam();

        return bufferSize;
    }

    float* getBuffer() {
        return buffer;
    }

}
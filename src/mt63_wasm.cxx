
#include "mt63base.h"
#include <stdio.h>
#include <memory>

using BufferType = float;

const double txLevel = -6.0;
const double SIGLIMIT = 0.95;

#define TONE_AMP 0.8
#define k_SAMPLERATE 8000
#define k_BUFFERSECONDS 600
#define k_BUFFER_MAX_SIZE k_SAMPLERATE * k_BUFFERSECONDS // 8000Hz sample rate, 600 seconds (10 minutes)
const auto CenterFreq = 1500;
std::unique_ptr<BufferType> buffer(new BufferType[k_BUFFER_MAX_SIZE]);
unsigned int bufferSize = 0;
MT63tx Tx;

void resetBuffer() {
    buffer.get()[0] = 0;
    bufferSize = 0;
}
void flushToBuffer(MT63tx *Tx, double mult = 1.0) {
    auto lBuffer = buffer.get();
    if (bufferSize + Tx->Comb.Output.Len > k_BUFFER_MAX_SIZE) {
        // This is not good! We will overflow the buffer.
        // TODO: Handle this more gracefully
        printf("Refusing to overrun the buffer!");
        return;
    }
    double maxVal = 0.0;
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        auto a = fabs(Tx->Comb.Output.Data[i]);
        if (a > maxVal) { maxVal = a; }
    }
    // maxVal = 1.0;
    if (mult > SIGLIMIT) { mult = SIGLIMIT; }
    for (auto i = 0; i < Tx->Comb.Output.Len; ++i) {
        auto val = Tx->Comb.Output.Data[i] * 1.0 / maxVal * mult;
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
    for (auto i = 0; i < Tx->DataInterleave; ++i) {
        Tx->SendChar(0);
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
        return buffer.get();
    }

}

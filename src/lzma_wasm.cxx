
#include "LzmaLib.h"
#include <string>
#include <memory>
#include <vector>
#include <unistd.h>
#include <cmath>

#define LZMA_STR "\1LZMA"

std::string lastLzmaOutput;

std::vector<uint8_t> globalBuf;

bool StartsWith(const char *a, const char *b)
{
   return strncmp(a, b, strlen(b)) == 0;
}

extern "C" {
    const char* getLzmaOutput() {
        return lastLzmaOutput.c_str();
    }
    uint32_t lzmaEncode(const char* inBuf, uint32_t origlen) {
        size_t outlen = (size_t)std::ceil(origlen * 1.1);
        if (globalBuf.size() < outlen) {
            // We use a std::vector so we can resize it if needed
            globalBuf.resize(outlen);
        }
        unsigned char* buf = &globalBuf[0];

        size_t plen = LZMA_PROPS_SIZE;
        unsigned char outprops[LZMA_PROPS_SIZE];

        std::string bufstr;
        int r;
		bufstr.assign(LZMA_STR);
        if ((r = LzmaCompress(
                              buf, &outlen,
                              (const unsigned char*)inBuf, origlen,
                              outprops, &plen, 9, 0, -1, -1, -1, -1, -1)) == SZ_OK) {
            bufstr.append((const char*)&origlen, sizeof(origlen));
            bufstr.append((const char*)&outprops, sizeof(outprops));
            bufstr.append((const char*)buf, outlen);
            if (origlen < bufstr.length()) {
                printf("%s", "Lzma could not compress data\n");
                lastLzmaOutput.assign("Could not compress data");
                return 0;
            }
        } else {
            printf("Lzma Compress failed: %s\n", LZMA_ERRORS[r]);
            lastLzmaOutput = std::string("Compress ERROR:") + LZMA_ERRORS[r];
            return 0;
        }

        lastLzmaOutput = bufstr;
        return lastLzmaOutput.size();
    }

    uint32_t lzmaDecode(const char *inBuf, uint32_t origlen) {
        for (int8_t i = 0; i < 5; ++i) {
            if (inBuf[i] != LZMA_STR[i]) {
                printf("Expected %c (%d) but got %c (%d) at index %d\n", LZMA_STR[i], LZMA_STR[i], inBuf[i], inBuf[i], i);
            }
        }
        if (origlen < 5 || !StartsWith(inBuf, LZMA_STR)) {
            lastLzmaOutput = "Invalid input";
            return 0; // Not an LZMA string, don't
        }

        const char* in = inBuf + 5; // Start after the string prefix
        size_t outlen = *reinterpret_cast<const uint32_t*>(in);
        if (outlen > 1 << 24) {
            fprintf(stderr, "Refusing to decompress data (> 16 MiB)\n");
            lastLzmaOutput = "Output too large";
            return 0;
        }
        in += sizeof(outlen); // Move to after the size block

        if (globalBuf.size() < outlen) {
            globalBuf.resize(outlen);
        }
        unsigned char* buf = &globalBuf[0];
        unsigned char inprops[LZMA_PROPS_SIZE];

        memcpy(inprops, in, LZMA_PROPS_SIZE);
        in += LZMA_PROPS_SIZE; // Move to after the LZMA properties

        size_t inlen = origlen - (in - inBuf); // Get the size of the remaining buffer

        int r;
        if ((r = LzmaUncompress(buf, &outlen, (const unsigned char*)in, &inlen,
                                inprops, LZMA_PROPS_SIZE)) != SZ_OK) {
            fprintf(stderr, "Lzma Uncompress failed: %s\n", LZMA_ERRORS[r]);
            lastLzmaOutput = std::string("ERROR:") + LZMA_ERRORS[r];
            return 0;
        } else {
            lastLzmaOutput = std::string((const char*)buf, outlen);
        }

        return lastLzmaOutput.size();
    }
}
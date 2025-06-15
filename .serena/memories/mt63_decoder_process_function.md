# MT63decoder::Process Function Implementation

## Location
File: `native_src/mt63/mt63base.cxx`
Lines: 521-579

## Function Signature
```cpp
int MT63decoder::Process(double *data)
```

## Full Implementation
```cpp
int MT63decoder::Process(double *data)
{
	int s, i, k;
	double  Min, Max, Sig, Noise, SNR;
	int MinPos,MaxPos,code;

	dspCopyArray(IntlvPipe + IntlvPtr, data, ScanSize);

// printf("Decoder [%d/%d/%d]: \n",IntlvPtr,IntlvSize,ScanSize);
	for (s = 0; s < ScanLen; s++) {
// printf(" %2d:",s);
		for (i = 0; i < DataCarriers; i++) {
			k = IntlvPtr - ScanSize - IntlvPatt[i];
			if (k < 0) k += IntlvSize;
			if ((s & 1) && (i & 1)) {
				k += ScanSize;
				if (k >= IntlvSize) k-=IntlvSize;
			}
			WalshBuff[i] = IntlvPipe[k + s + i];
// printf(" %4d",k/ScanSize);
		}
// printf("\n");
		dspWalshTrans(WalshBuff, DataCarriers);
		Min = dspFindMin(WalshBuff, DataCarriers, MinPos);
		Max = dspFindMax(WalshBuff, DataCarriers, MaxPos);
		if (fabs(Max) > fabs(Min)) {
			code = MaxPos + DataCarriers;
			Sig = fabs(Max);
			WalshBuff[MaxPos] = 0.0;
		} else {
			code = MinPos;
			Sig = fabs(Min);
			WalshBuff[MinPos] = 0.0;
		}
		Noise = dspRMS(WalshBuff, DataCarriers);
		if (Noise > 0.0)
			SNR = Sig/Noise;
		else SNR = 0.0;
		dspLowPass2(SNR, DecodeSnrMid[s], DecodeSnrOut[s], W1, W2, W5);
// printf("%2d: %02x => %c,  %5.2f/%5.2f=>%5.2f  <%5.2f>\n",
//	   s,code,code<' ' ? '.' : (char)code,
//	   Sig,Noise,SNR,DecodeSnrOut[s]);
		DecodePipe[DecodePtr+s]=code;
	}
	IntlvPtr += ScanSize;
	if (IntlvPtr >= IntlvSize) IntlvPtr = 0;
	DecodePtr += ScanLen;
	if (DecodePtr >= DecodeSize) DecodePtr = 0;
	Max = dspFindMax(DecodeSnrOut, ScanLen, MaxPos);
	Output = DecodePipe[DecodePtr + MaxPos];
	SignalToNoise = Max;
	CarrOfs = MaxPos - (ScanLen - 1) / 2;
/*
  code=Output;
  if ((code>=' ')||(code=='\n')||(code=='\r')) printf("%c",code);
  else if (code!='\0') printf("<%02X>",code);
*/
	return 0;
}
```

## Key Parameters and Variables
- `data`: Input array of double values representing demodulated carriers
- `ScanSize`: Size of data being processed 
- `ScanLen`: Length of scan window
- `DataCarriers`: Number of data carriers (64)
- `IntlvPipe`: Interleave pipeline buffer
- `WalshBuff`: Walsh function buffer for decoding
- `DecodePipe`: Decoded character pipeline
- `DecodeSnrOut`: Signal-to-noise ratio output buffer

## Algorithm Overview
1. Copy input data into interleave pipeline
2. For each scan position:
   - Extract data using deinterleave pattern
   - Apply Walsh transform for error correction
   - Find min/max values to determine transmitted character
   - Calculate signal-to-noise ratio
   - Store decoded character in pipeline
3. Select best decoded character based on highest SNR
4. Update pipeline pointers and return decoded character
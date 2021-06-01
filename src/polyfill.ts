
export function polyfill() {
  if (typeof navigator !== 'undefined') {
    navigator.getUserMedia = (navigator.getUserMedia ||
        (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia ||
        (navigator as any).msGetUserMedia);
  }

  if (typeof AudioBuffer === 'undefined' || AudioBuffer.prototype.hasOwnProperty("copyToChannel")) {
      return;
  }

  //// ### AudioBuffer.prototype.copyToChannel
  //// The `copyToChannel` method copies the samples to the specified channel of the **`AudioBuffer`**, from the `source` array.
  ////
  //// #### Parameters
  //// - `source: Float32Array`
  ////   - The array the channel data will be copied from.
  //// - `channelNumber: number`
  ////   - The index of the channel to copy the data to.
  //// - `startInChannel: number = 0`
  ////   - An optional offset to copy the data to.
  ////
  //// #### Return
  //// - `void`
  AudioBuffer.prototype.copyToChannel = function(source, channelNumber, startInChannel) {
      let clipped = source.subarray(0, Math.min(source.length, this.length - (startInChannel || 0)));

      this.getChannelData(channelNumber || 0).set(clipped, startInChannel || 0);
  };
}

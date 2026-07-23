// MediaRecorder가 만드는 포맷(주로 webm/opus)은 Gemini STT가 공식 지원하지 않으므로,
// 브라우저에서 디코딩해 WAV(PCM)로 다시 인코딩한 뒤 서버로 보낸다.
export async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return new Blob([encodeWav(audioBuffer)], { type: 'audio/wav' });
  } finally {
    audioCtx.close();
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;

  const samples =
    numChannels === 2
      ? interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1))
      : audioBuffer.getChannelData(0);

  const dataLength = samples.length * (bitDepth / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  floatTo16BitPCM(view, 44, samples);

  return buffer;
}

// 두 채널의 길이가 다를 수 있으므로, 공통 길이(min)까지만 안전하게 인터리브한다.
// (길이가 다른 입력에서 NaN이나 0 패딩이 섞여 들어가는 것을 방지)
export function interleave(left, right) {
  const length = Math.min(left.length, right.length);
  const result = new Float32Array(length * 2);
  let index = 0;
  for (let i = 0; i < length; i++) {
    result[index++] = left[i];
    result[index++] = right[i];
  }
  return result;
}

function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
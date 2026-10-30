export const MAX_CLIP_SECONDS = 10
export const VIDEO_START_STEP = 4 / 24
export const MIN_H264_CRF = 14
export const DEFAULT_H264_CRF = 18
export const MAX_H264_CRF = 28

const webmRecordingTypes = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

const mp4RecordingTypes = [
  'video/mp4;codecs="avc1.640028"',
  'video/mp4;codecs="avc1.4D4028"',
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4',
]

export function findWebmRecordingType(isTypeSupported: (type: string) => boolean) {
  return webmRecordingTypes.find(isTypeSupported) ?? ''
}

export function findMp4RecordingType(isTypeSupported: (type: string) => boolean) {
  return mp4RecordingTypes.find(isTypeSupported) ?? ''
}

export function buildH264EncodingArguments(duration: number, inputFile = 'input.webm', crf = DEFAULT_H264_CRF) {
  const normalizedCrf = Math.round(Math.max(MIN_H264_CRF, Math.min(MAX_H264_CRF, Number.isFinite(crf) ? crf : DEFAULT_H264_CRF)))
  return [
    '-i', inputFile,
    '-t', duration.toFixed(3),
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(normalizedCrf),
    '-profile:v', 'high',
    '-level:v', '4.2',
    '-color_range', 'pc',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    'output.mp4',
  ]
}

export function getEncodingProgress(progress: number, time: number, duration: number) {
  const progressRatio = Number.isFinite(progress) ? progress : 0
  const timeRatio = Number.isFinite(time) && Number.isFinite(duration) && duration > 0
    ? time / (duration * 1_000_000)
    : 0
  return Math.max(0, Math.min(1, Math.max(progressRatio, timeRatio)))
}

export function getEncodingLogProgress(message: string, duration: number) {
  const match = message.match(/\btime=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match || !Number.isFinite(duration) || duration <= 0) return null
  const timeInSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return getEncodingProgress(0, timeInSeconds * 1_000_000, duration)
}

export function getOutputDuration(sourceDuration: number, startTime: number) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || !Number.isFinite(startTime)) return 0
  const start = Math.max(0, Math.min(startTime, sourceDuration))
  return start >= sourceDuration ? 0 : MAX_CLIP_SECONDS
}

export function getMaxVideoStart(sourceDuration: number) {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return 0
  const lastValidFrame = sourceDuration - 1 / 24
  return lastValidFrame <= 0
    ? 0
    : Math.floor(lastValidFrame / VIDEO_START_STEP + 1e-9) * VIDEO_START_STEP
}

export function getCanvasScaleFactor(outputWidth: number, previewWidth: number) {
  const referenceWidth = Number.isFinite(previewWidth) && previewWidth > 0 ? previewWidth : 334
  return outputWidth / referenceWidth
}

export function getBackgroundVideoOpacity(time: number) {
  void time
  return 1
}

export function getEndCardOpacity(time: number) {
  return Math.max(0, Math.min(1, (time - 5.5) / 0.9))
}

export function getExportDimensions(format: string) {
  if (format.includes('4:5')) return { width: 1080, height: 1350 }
  if (format.includes('1.91:1')) return { width: 1920, height: 1006 }
  if (format.includes('9:16')) return { width: 1080, height: 1920 }
  return { width: 1080, height: 1080 }
}

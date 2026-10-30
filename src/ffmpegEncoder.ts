import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { buildH264EncodingArguments, getEncodingLogProgress, getEncodingProgress } from './videoExport'

const workerLoadTimeoutMs = 30_000
const encodeTimeoutMs = 300_000

let ffmpeg: FFmpeg | null = null
let ffmpegLoad: Promise<FFmpeg> | null = null

async function getFFmpeg() {
  if (ffmpeg?.loaded) return ffmpeg
  if (!ffmpegLoad) {
    const instance = new FFmpeg()
    let timeoutId: ReturnType<typeof setTimeout>
    const loading = Promise.resolve().then(() => instance.load({ coreURL, wasmURL }))
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('FFmpeg worker did not load within 30 seconds. Reload the page and try again.'))
        instance.terminate()
      }, workerLoadTimeoutMs)
    })
    ffmpegLoad = Promise.race([loading, timeout]).then(() => {
      ffmpeg = instance
      return instance
    }).catch(error => {
      instance.terminate()
      ffmpegLoad = null
      throw error
    }).finally(() => {
      clearTimeout(timeoutId)
    })
  }
  return ffmpegLoad
}

export async function encodeCapturedVideoToH264Mp4(
  source: Blob,
  duration: number,
  crf: number,
  onProgress: (progress: number) => void,
  onStatus: (status: string) => void,
) {
  onStatus('Loading FFmpeg encoder…')
  const encoder = await getFFmpeg()
  onStatus('Encoding H.264 MP4 locally with FFmpeg…')
  const inputFile = source.type.startsWith('video/mp4') ? 'input.mp4' : 'input.webm'
  let lastProgress = 0
  const reportProgress = (progress: number) => {
    lastProgress = Math.max(lastProgress, progress)
    onProgress(lastProgress)
  }
  const progressListener = ({ progress, time }: { progress: number; time: number }) => {
    reportProgress(getEncodingProgress(progress, time, duration))
  }
  const logListener = ({ message }: { message: string }) => {
    const progress = getEncodingLogProgress(message, duration)
    if (progress !== null) reportProgress(progress)
  }
  encoder.on('progress', progressListener)
  encoder.on('log', logListener)

  try {
    await encoder.writeFile(inputFile, new Uint8Array(await source.arrayBuffer()))
    const exitCode = await encoder.exec(buildH264EncodingArguments(duration, inputFile, crf), encodeTimeoutMs)
    if (exitCode !== 0) throw new Error('FFmpeg could not encode this video as H.264 MP4 before the 5-minute limit.')
    const output = await encoder.readFile('output.mp4')
    if (typeof output === 'string' || !output.length) throw new Error('FFmpeg produced an empty MP4 file.')
    return new Blob([output.slice().buffer as ArrayBuffer], { type: 'video/mp4' })
  } finally {
    encoder.off('progress', progressListener)
    encoder.off('log', logListener)
    await Promise.all([inputFile, 'output.mp4'].map(async file => {
      try {
        await encoder.deleteFile(file)
      } catch {
        // The file may not have been created if encoding failed early.
      }
    }))
  }
}

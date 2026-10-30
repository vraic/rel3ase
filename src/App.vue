<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { encodeCapturedVideoToH264Mp4 } from './ffmpegEncoder'
import { DEFAULT_H264_CRF, findMp4RecordingType, findWebmRecordingType, getBackgroundVideoOpacity, getEndCardOpacity, getExportDimensions, getMaxVideoStart, getOutputDuration, MAX_CLIP_SECONDS, MAX_H264_CRF, MIN_H264_CRF, VIDEO_START_STEP } from './videoExport'
import { getExportTypographySize, getPreviewTypographySize, getWordRevealProgress, layoutOverlayWords } from './textLayout'

type Destination = 'Instagram' | 'Spotify' | 'TikTok'
type FilterName = 'None' | 'Film' | 'Cool' | 'Tape damage'
type StagedImage = { file: File; url: string }

const formats: Record<Destination, string[]> = {
  Instagram: ['Square · 1:1', 'Portrait · 4:5', 'Landscape · 1.91:1', 'Story / Reel · 9:16'],
  Spotify: ['Canvas · 9:16'],
  TikTok: ['Video · 9:16'],
}
const destinations: Destination[] = ['Instagram', 'Spotify', 'TikTok']
const filters: FilterName[] = ['None', 'Film', 'Cool', 'Tape damage']
const fonts = ['DM Sans', 'Playfair Display', 'Space Grotesk', 'Cormorant Garamond', 'Georgia']
const alignments: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']
const origins = [
  { name: 'Top left', x: 'flex-start', y: 'flex-start' },
  { name: 'Top center', x: 'center', y: 'flex-start' },
  { name: 'Top right', x: 'flex-end', y: 'flex-start' },
  { name: 'Middle left', x: 'flex-start', y: 'center' },
  { name: 'Center', x: 'center', y: 'center' },
  { name: 'Middle right', x: 'flex-end', y: 'center' },
  { name: 'Bottom left', x: 'flex-start', y: 'flex-end' },
  { name: 'Bottom center', x: 'center', y: 'flex-end' },
  { name: 'Bottom right', x: 'flex-end', y: 'flex-end' },
]
const selectedFiles = ref<File[]>([])
const stagedImages = ref<StagedImage[]>([])
const videoFile = ref<File | null>(null)
const videoUrl = ref('')
const artworkUrl = ref('')
const artworkName = ref('')
const customFontName = ref('')
const customFontUrl = ref('')
const uploadProgress = ref(0)
const uploadState = ref<'idle' | 'loading' | 'ready'>('idle')
const uploadError = ref('')
const destination = ref<Destination>('Instagram')
const format = ref(formats.Instagram[0])
const filter = ref<FilterName>('None')
const overlayText = ref('your next release, in motion')
const textSize = ref(36)
const textPadding = ref(9)
const lineSpacing = ref(1.08)
const alignment = ref<'left' | 'center' | 'right'>('center')
const origin = ref(4)
const textColor = ref('#fffaf0')
const textEffect = ref('None')
const fontName = ref('DM Sans')
const pulseArtwork = ref(false)
const caption = ref('OUT NOW')
const captionSize = ref(16)
const outputCrf = ref(DEFAULT_H264_CRF)
const outputQuality = computed({
  get: () => MIN_H264_CRF + MAX_H264_CRF - outputCrf.value,
  set: (quality: number) => { outputCrf.value = MIN_H264_CRF + MAX_H264_CRF - quality },
})
const isPlaying = ref(true)
const volume = ref(0)
const previewTime = ref(0)
const previewDuration = ref(10)
const sourceDuration = ref(10)
const videoStart = ref(0)
const maxVideoStart = computed(() => getMaxVideoStart(sourceDuration.value))
const videoElement = ref<HTMLVideoElement | null>(null)
const previewAnimationCycle = ref(0)
let playbackRequest = 0
let playbackStartedAt = 0
const previewCanvasElement = ref<HTMLDivElement | null>(null)
const previewCanvasWidth = ref(334)
const previewCanvasHeight = ref(334)
const previewFontMetricsRevision = ref(0)
let previewResizeObserver: ResizeObserver | null = null
const textMeasureContext = typeof document !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined'
  ? document.createElement('canvas').getContext('2d')
  : null
const artworkElement = ref<HTMLImageElement | null>(null)
const isExporting = ref(false)
const exportProgress = ref(0)
const exportMessage = ref('')
const exportUrl = ref('')

const acceptedTypes = 'video/mp4,image/jpeg,image/png,image/gif'
const selectedFormatClass = computed(() => {
  if (format.value.includes('4:5')) return 'ratio-portrait'
  if (format.value.includes('1.91:1')) return 'ratio-landscape'
  if (format.value.includes('9:16')) return 'ratio-tall'
  return 'ratio-square'
})
const originStyle = computed(() => ({
  inset: '0',
  justifyContent: origins[origin.value].x,
  alignItems: origins[origin.value].y,
}))
const previewMeasureFont = computed(() => {
  const fontSize = getPreviewTypographySize(textSize.value, previewCanvasWidth.value)
  return `600 ${fontSize}px ${JSON.stringify(fontName.value)}, sans-serif`
})
const previewOverlayWords = computed(() => {
  void previewFontMetricsRevision.value
  const width = previewCanvasWidth.value
  const height = previewCanvasHeight.value
  const fontSize = getPreviewTypographySize(textSize.value, width)
  const words = layoutOverlayWords({
    text: overlayText.value,
    width,
    height,
    fontSize,
    lineSpacing: lineSpacing.value,
    paddingPercent: textPadding.value,
    alignment: alignment.value,
    originX: origins[origin.value].x as 'flex-start' | 'center' | 'flex-end',
    originY: origins[origin.value].y as 'flex-start' | 'center' | 'flex-end',
    measureText: text => textMeasureContext?.measureText(text).width ?? Array.from(text).length * fontSize * 0.6,
  })
  const wordCount = overlayText.value.trim().split(/\s+/).filter(Boolean).length
  const wordStagger = wordCount <= 1 ? 0 : 2.4 / (wordCount - 1)
  return words.map(word => ({
    ...word,
    style: {
      left: `${word.x}px`,
      top: `${word.y}px`,
      width: `${word.width}px`,
      '--word-index': word.wordIndex,
      '--word-delay': `${(0.35 + word.wordIndex * wordStagger).toFixed(3)}s`,
    },
  }))
})
const textStyle = computed(() => ({
  fontSize: `${getPreviewTypographySize(textSize.value, previewCanvasWidth.value)}px`,
  lineHeight: lineSpacing.value,
  letterSpacing: '0px',
  textAlign: alignment.value,
  color: textColor.value,
  fontFamily: `'${fontName.value}', sans-serif`,
}))
const captionStyle = computed(() => ({
  fontSize: `${getPreviewTypographySize(captionSize.value, previewCanvasWidth.value)}px`,
  letterSpacing: `${2 * previewCanvasWidth.value / 334}px`,
}))
const volumeLabel = computed(() => volume.value === 0 ? 'Muted' : `${Math.round(volume.value * 100)}% volume`)
const formattedPreviewTime = computed(() => {
  const seconds = Math.floor(previewTime.value)
  return seconds < 10 ? `00:0${seconds}` : `00:${seconds}`
})
const formattedPreviewDuration = computed(() => {
  const seconds = Math.floor(previewDuration.value)
  return seconds < 10 ? `00:0${seconds}` : `00:${seconds}`
})
const formattedVideoStart = computed(() => {
  return formatVideoTimecode(videoStart.value)
})
const formattedSourceDuration = computed(() => {
  return formatVideoTimecode(sourceDuration.value)
})
const supportedRecordingType = computed(() => typeof MediaRecorder === 'undefined'
  ? ''
  : findWebmRecordingType(type => MediaRecorder.isTypeSupported(type))
    || findMp4RecordingType(type => MediaRecorder.isTypeSupported(type)))

async function refreshPreviewFontMetrics() {
  if (!document.fonts) return
  const fontSize = getPreviewTypographySize(textSize.value, previewCanvasWidth.value)
  await document.fonts.load(`600 ${fontSize}px ${JSON.stringify(fontName.value)}, sans-serif`, overlayText.value)
  previewFontMetricsRevision.value++
}

watch([fontName, textSize, overlayText], () => {
  void refreshPreviewFontMetrics()
}, { flush: 'post' })

watch(previewMeasureFont, font => {
  if (textMeasureContext) textMeasureContext.font = font
}, { flush: 'sync', immediate: true })

watch(previewCanvasElement, element => {
  previewResizeObserver?.disconnect()
  if (!element) return
  const bounds = element.getBoundingClientRect()
  previewCanvasWidth.value = bounds.width || 334
  previewCanvasHeight.value = bounds.height || 334
  previewResizeObserver?.observe(element)
}, { flush: 'post' })

onMounted(() => {
  void document.fonts?.ready.then(() => { previewFontMetricsRevision.value++ })
  if (typeof ResizeObserver === 'undefined') return
  previewResizeObserver = new ResizeObserver(([entry]) => {
    previewCanvasWidth.value = entry.contentRect.width || 334
    previewCanvasHeight.value = entry.contentRect.height || 334
  })
  if (previewCanvasElement.value) {
    const bounds = previewCanvasElement.value.getBoundingClientRect()
    previewCanvasWidth.value = bounds.width || 334
    previewCanvasHeight.value = bounds.height || 334
    previewResizeObserver.observe(previewCanvasElement.value)
  }
})

function isAllowedFile(file: File) {
  const name = file.name.toLowerCase()
  if (file.type === 'video/mp4') return /\.mp4$/.test(name)
  if (file.type.startsWith('video/')) return false
  if (file.type.startsWith('image/')) return /\.(jpe?g|png|gif)$/.test(name)
  return /\.(mp4|jpe?g|png|gif)$/.test(name)
}

function revoke(url: string) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function formatVideoTimecode(time: number) {
  const totalFrames = Math.max(0, Math.floor(time * 24))
  const totalMinutes = Math.floor(totalFrames / (24 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = Math.floor(totalFrames / 24) % 60
  const frames = totalFrames % 24
  const timeParts = [seconds, frames].map(value => String(value).padStart(2, '0'))
  if (hours > 0) timeParts.unshift(String(minutes).padStart(2, '0'))
  else timeParts.unshift(String(totalMinutes).padStart(2, '0'))
  if (hours > 0) timeParts.unshift(String(hours).padStart(2, '0'))
  return timeParts.join(':')
}

async function stageFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  await prepareFiles(files)
}

async function dropFiles(event: DragEvent) {
  event.preventDefault()
  await prepareFiles(Array.from(event.dataTransfer?.files ?? []))
}

async function prepareFiles(files: File[]) {
  if (!files.length) return

  uploadError.value = ''
  const invalid = files.filter(file => !isAllowedFile(file))
  const validFiles = files.filter(isAllowedFile)
  if (invalid.length) {
    uploadError.value = `${invalid.map(file => file.name).join(', ')} ${invalid.length === 1 ? 'is' : 'are'} not a supported image or MP4 video.`
    return
  }
  const video = validFiles.find(file => file.type.startsWith('video/') || /\.mp4$/i.test(file.name))
  if (!video) {
    uploadError.value = 'Choose an MP4 video. You can add images as well.'
    return
  }

  uploadState.value = 'loading'
  uploadProgress.value = 0
  selectedFiles.value = validFiles
  const totalBytes = validFiles.reduce((sum, file) => sum + file.size, 0) || 1
  let completedBytes = 0
  for (const file of validFiles) {
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
      await file.slice(offset, Math.min(offset + 1024 * 1024, file.size)).arrayBuffer()
      completedBytes += Math.min(1024 * 1024, file.size - offset)
      uploadProgress.value = Math.min(100, Math.round(completedBytes / totalBytes * 100))
    }
  }
  uploadProgress.value = 100

  revoke(videoUrl.value)
  stagedImages.value.forEach(image => revoke(image.url))
  videoFile.value = video
  videoUrl.value = URL.createObjectURL(video)
  stagedImages.value = validFiles
    .filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|gif)$/i.test(file.name))
    .map(file => ({ file, url: URL.createObjectURL(file) }))
  uploadState.value = 'ready'
}

function selectArtwork(image: StagedImage) {
  revoke(artworkUrl.value)
  artworkUrl.value = URL.createObjectURL(image.file)
  artworkName.value = image.file.name
}

function uploadArtwork(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAllowedFile(file) || file.type.startsWith('video/') || /\.mp4$/i.test(file.name)) {
    uploadError.value = 'Artwork must be JPG, PNG, or GIF format.'
    return
  }
  uploadError.value = ''
  revoke(artworkUrl.value)
  artworkUrl.value = URL.createObjectURL(file)
  artworkName.value = file.name
}

async function uploadFont(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const name = file.name.replace(/\.[^.]+$/, '')
  const url = URL.createObjectURL(file)
  try {
    const face = new FontFace(name, `url(${url})`)
    await face.load()
    document.fonts.add(face)
    revoke(customFontUrl.value)
    customFontUrl.value = url
    customFontName.value = name
    fontName.value = name
  } catch {
    revoke(url)
    uploadError.value = 'Font could not be loaded. Try WOFF, WOFF2, TTF, or OTF formats.'
  }
}

function chooseDestination(value: Destination) {
  destination.value = value
  format.value = formats[value][0]
}

function togglePlayback() {
  const video = videoElement.value
  if (isPlaying.value) {
    playbackRequest++
    isPlaying.value = false
    video?.pause()
    return
  }

  void seekPreviewToStart(true)
}

async function seekPreviewToStart(resumePlayback = false) {
  const video = videoElement.value
  previewTime.value = 0
  if (!video) return

  const request = ++playbackRequest
  isPlaying.value = false
  video.pause()
  try {
    await waitForSeek(video, videoStart.value, () => request === playbackRequest)
  } catch {
    return
  }
  if (request === playbackRequest) {
    if (resumePlayback) {
      previewAnimationCycle.value++
      playbackStartedAt = performance.now()
      isPlaying.value = true
    }
  }
}

function cycleVolume() {
  volume.value = volume.value === 0 ? 0.55 : volume.value < 0.6 ? 1 : 0
}

function updatePreviewTime(event: Event) {
  const video = event.currentTarget as HTMLVideoElement
  if (video.seeking || !isPlaying.value || !playbackStartedAt) return
  const elapsed = (performance.now() - playbackStartedAt) / 1000
  if (elapsed >= previewDuration.value) {
    void seekPreviewToStart(true)
    return
  }
  previewTime.value = elapsed
}

function updatePreviewDuration(event: Event) {
  const video = event.currentTarget as HTMLVideoElement
  if (!Number.isFinite(video.duration)) return
  sourceDuration.value = video.duration
  videoStart.value = Math.min(videoStart.value, maxVideoStart.value)
  previewDuration.value = getOutputDuration(video.duration, videoStart.value)
  previewTime.value = 0
}

function updateVideoStart(event: Event) {
  const start = Number((event.currentTarget as HTMLInputElement).value)
  const frameStep = Math.round(start / VIDEO_START_STEP) * 4
  videoStart.value = Math.max(0, Math.min(frameStep / 24, maxVideoStart.value))
  previewDuration.value = getOutputDuration(sourceDuration.value, videoStart.value)
  previewTime.value = 0
  const video = videoElement.value
  if (!video) return
  playbackRequest++
  playbackStartedAt = 0
  isPlaying.value = false
  video.pause()
  video.currentTime = videoStart.value
}

function seekPreview(event: Event) {
  const time = Math.max(0, Math.min(Number((event.currentTarget as HTMLInputElement).value), previewDuration.value))
  const video = videoElement.value
  if (!video) return
  video.currentTime = (videoStart.value + time) % sourceDuration.value
  previewTime.value = time
  if (isPlaying.value) playbackStartedAt = performance.now() - time * 1000
}

function drawExportFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, video: HTMLVideoElement, time: number) {
  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#11120f'
  context.fillRect(0, 0, width, height)

  if (time < 5.45 && video.videoWidth && video.videoHeight) {
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
    const drawWidth = video.videoWidth * scale
    const drawHeight = video.videoHeight * scale
    context.save()
    context.filter = filter.value === 'Film'
      ? 'sepia(.2) saturate(1.28) contrast(1.04) brightness(1.02)'
      : filter.value === 'Cool'
        ? 'saturate(.82) contrast(1.06) brightness(1.03) hue-rotate(8deg)'
        : filter.value === 'Tape damage'
          ? 'saturate(.75) contrast(1.15) brightness(.91)'
          : 'none'
    context.globalAlpha = getBackgroundVideoOpacity(time)
    context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
    context.restore()

    const fadeIn = Math.min(1, time / 0.8)
    const fadeOut = Math.max(0, Math.min(1, (5.1 - time) / 0.8))
    context.globalAlpha = Math.min(fadeIn, fadeOut)
    const fontSize = getExportTypographySize(textSize.value, width)
    context.font = `600 ${fontSize}px ${JSON.stringify(fontName.value)}, sans-serif`
    context.letterSpacing = '0px'
    context.fillStyle = textColor.value
    context.textBaseline = 'top'
    context.textAlign = 'left'
    context.shadowColor = '#00000099'
    context.shadowBlur = width * 0.025
    const originPoint = origins[origin.value]
    const placements = layoutOverlayWords({
      text: overlayText.value,
      width,
      height,
      fontSize,
      lineSpacing: lineSpacing.value,
      paddingPercent: textPadding.value,
      alignment: alignment.value,
      originX: originPoint.x as 'flex-start' | 'center' | 'flex-end',
      originY: originPoint.y as 'flex-start' | 'center' | 'flex-end',
      measureText: text => context.measureText(text).width,
    })
    const wordCount = overlayText.value.trim().split(/\s+/).filter(Boolean).length
    placements.forEach(word => {
      const progress = textEffect.value === 'None'
        ? 1
        : textEffect.value === 'Typewriter'
          ? getWordRevealProgress(time, word.wordIndex, wordCount)
          : Math.max(0, Math.min(1, (time - 0.35 - word.wordIndex * 0.14) / 0.22))
      if (progress <= 0) return
      context.globalAlpha = Math.min(fadeIn, fadeOut) * progress
      if (textEffect.value === 'Word pop') {
        context.save()
        context.translate(word.x + word.width / 2, word.y + fontSize / 2)
        context.scale(0.82 + progress * 0.18, 0.82 + progress * 0.18)
        context.fillText(word.text, -word.width / 2, -fontSize / 2)
        context.restore()
      } else {
        context.fillText(word.text, word.x, word.y)
      }
    })
    context.globalAlpha = 1
    context.shadowBlur = 0
    context.letterSpacing = '0px'
  }

  if (time > 4.3 && time < 5.45) {
    context.globalAlpha = Math.min(1, (time - 4.3) / 1.15)
    context.fillStyle = '#050605'
    context.fillRect(0, 0, width, height)
    context.globalAlpha = 1
  }

  if (time >= 5.35) {
    const artworkOpacity = getEndCardOpacity(time)
    context.fillStyle = '#050605'
    context.fillRect(0, 0, width, height)
    if (artworkOpacity > 0) {
      const baseSize = Math.min(width, height) * 0.45
      const pulse = pulseArtwork.value ? 1 + Math.sin(time * Math.PI * 2) * 0.035 : 1
      const size = baseSize * pulse
      const x = (width - size) / 2
      const y = (height - size) / 2
      context.globalAlpha = artworkOpacity
      if (artworkElement.value?.complete && artworkElement.value.naturalWidth) {
        context.drawImage(artworkElement.value, x, y, size, size)
      } else {
        context.fillStyle = '#73715d'
        context.fillRect(x, y, size, size)
      }
      if (caption.value) {
        context.fillStyle = '#f8f6ec'
        const captionFontSize = getExportTypographySize(captionSize.value, width)
        context.font = `400 ${captionFontSize}px "DM Mono", monospace`
        context.letterSpacing = `${2 * width / 334}px`
        context.textAlign = 'center'
        context.textBaseline = 'top'
        context.fillText(caption.value, width / 2, (height - baseSize) / 2 + baseSize + height * 0.025, width * 0.8)
        context.letterSpacing = '0px'
      }
      context.globalAlpha = 1
    }
  }
}

function waitForSeek(video: HTMLVideoElement, time: number, isCurrentSeek: () => boolean = () => true) {
  if (!video.seeking && Math.abs(video.currentTime - time) < 0.01) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    const onSeeked = () => {
      if (isCurrentSeek() && (video.seeking || Math.abs(video.currentTime - time) >= 0.01)) return
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Source video could not seek to the start point.'))
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = time
  })
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('error', onError)
    }
    const onLoadedMetadata = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Source video could not be loaded.'))
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.load()
  })
}

async function saveMp4() {
  if (!supportedRecordingType.value) {
    exportMessage.value = 'This browser cannot capture a video for local H.264 encoding.'
    return
  }
  const previewVideo = videoElement.value
  if (!previewVideo || !previewDuration.value) {
    exportMessage.value = 'Source video is not ready to export.'
    return
  }
  const exportVideo = document.createElement('video')
  exportVideo.preload = 'auto'
  exportVideo.muted = true
  exportVideo.playsInline = true
  exportVideo.src = videoUrl.value

  const canvas = document.createElement('canvas')
  const dimensions = getExportDimensions(format.value)
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context || !canvas.captureStream || typeof MediaRecorder === 'undefined') {
    exportMessage.value = 'Canvas video recording is not available in this browser.'
    return
  }

  isExporting.value = true
  exportProgress.value = 0
  exportMessage.value = 'Preparing high definition composition.'
  previewVideo.pause()
  playbackStartedAt = 0
  isPlaying.value = false
  let animationFrame = 0
  let canvasStream: MediaStream | null = null
  let sourceStream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  try {
    await nextTick()
    await document.fonts.load(`600 ${getExportTypographySize(textSize.value, dimensions.width)}px ${JSON.stringify(fontName.value)}, sans-serif`, overlayText.value)
    await document.fonts.load(`400 ${getExportTypographySize(captionSize.value, dimensions.width)}px "DM Mono", monospace`, caption.value)
    await document.fonts.ready
    await waitForVideoMetadata(exportVideo)
    await waitForSeek(exportVideo, videoStart.value)
    canvasStream = canvas.captureStream(30)
    const sourceVideo = exportVideo as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
    sourceStream = sourceVideo.captureStream?.() ?? sourceVideo.mozCaptureStream?.() ?? null
    sourceStream?.getAudioTracks().forEach(track => canvasStream?.addTrack(track))
    recorder = new MediaRecorder(canvasStream, {
      mimeType: supportedRecordingType.value,
      videoBitsPerSecond: 14_000_000,
      audioBitsPerSecond: 192_000,
    })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data)
    }
    const duration = Math.min(MAX_CLIP_SECONDS, previewDuration.value)
    const finished = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve()
      recorder!.onerror = () => reject(new Error('Browser encoder stopped unexpectedly.'))
    })

    exportVideo.loop = true
    await exportVideo.play()
    const startedAt = performance.now()
    drawExportFrame(context, canvas, exportVideo, 0)
    recorder.start(250)
    const render = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      if (elapsed >= duration) {
        exportProgress.value = 50
        recorder?.stop()
        return
      }
      drawExportFrame(context, canvas, exportVideo, elapsed)
      exportProgress.value = Math.min(49, Math.floor(elapsed / duration * 50))
      animationFrame = requestAnimationFrame(render)
    }
    animationFrame = requestAnimationFrame(render)
    await finished

    const captureBlob = new Blob(chunks, { type: recorder.mimeType || supportedRecordingType.value })
    if (!captureBlob.size) throw new Error('Browser could not capture the composition for encoding.')
    const blob = await encodeCapturedVideoToH264Mp4(captureBlob, duration, outputCrf.value, progress => {
      exportProgress.value = 50 + Math.floor(progress * 49)
    }, status => {
      exportMessage.value = status
    })
    exportProgress.value = 100
    if (!blob.size) throw new Error('FFmpeg produced an empty MP4 file.')
    revoke(exportUrl.value)
    exportUrl.value = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = exportUrl.value
    link.download = `${videoFile.value?.name.replace(/\.mp4$/i, '') || 'rel3ase'}-edit.mp4`
    link.click()
    exportMessage.value = `Saved ${dimensions.width} × ${dimensions.height} H.264 MP4 · ${duration.toFixed(1)} seconds.`
  } catch (error) {
    exportMessage.value = error instanceof Error ? error.message : 'Video could not be exported.'
  } finally {
    cancelAnimationFrame(animationFrame)
    if (recorder?.state === 'recording') recorder.stop()
    exportVideo.pause()
    exportVideo.removeAttribute('src')
    exportVideo.load()
    sourceStream?.getTracks().forEach(track => track.stop())
    canvasStream?.getTracks().forEach(track => track.stop())
    isExporting.value = false
  }
}

watch([isPlaying, volume, videoUrl], async () => {
  const video = videoElement.value
  if (!video) return
  video.volume = volume.value
  video.muted = volume.value === 0
  if (isPlaying.value) {
    try {
      await video.play()
      if (!playbackStartedAt) playbackStartedAt = performance.now() - previewTime.value * 1000
    } catch {
      isPlaying.value = false
    }
  } else {
    playbackStartedAt = 0
    video.pause()
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect()
  revoke(videoUrl.value)
  stagedImages.value.forEach(image => revoke(image.url))
  revoke(artworkUrl.value)
  revoke(customFontUrl.value)
  revoke(exportUrl.value)
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="wordmark" href="#top" aria-label="Rel3ase home">rel<span>3</span>ase<span class="wordmark-dot">.</span></a>
      <div class="topbar-right"><span class="status-dot"></span><span>OPEN SOURCE RELEASE STUDIO</span><span v-if="selectedFiles.length" class="media-count">{{ selectedFiles.length }} MEDIA FILE{{ selectedFiles.length === 1 ? '' : 'S' }}</span><span class="topbar-divider"></span><span class="duration-tag">VIDEO AD GENERATOR</span></div>
    </header>

    <section v-if="uploadState !== 'ready'" id="top" class="upload-screen">
      <div class="upload-copy">
        <p class="eyebrow">LET'S GET STARTED</p>
        <h1>Make your next release move</h1>
      </div>

      <label class="upload-card" for="media-files" :class="{ 'is-loading': uploadState === 'loading' }" @dragover.prevent @drop="dropFiles">
        <input id="media-files" class="visually-hidden" type="file" :accept="acceptedTypes" multiple aria-label="Choose video and image files" @change="stageFiles" />
        <template v-if="uploadState === 'loading'">
          <div class="progress-wrap" role="progressbar" :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100" aria-label="Preparing selected media">
            <svg viewBox="0 0 84 84" aria-hidden="true"><circle class="progress-track" cx="42" cy="42" r="36" /><circle class="progress-value" cx="42" cy="42" r="36" :style="{ strokeDashoffset: 226 - 226 * uploadProgress / 100 }" /></svg>
            <span class="progress-number">{{ uploadProgress }}<small>%</small></span>
          </div>
          <strong>Getting files ready</strong>
          <span class="card-caption">Preparing locally · {{ uploadProgress }}%</span>
        </template>
        <template v-else>
          <span class="upload-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 21V5m0 0L9.5 11.5M16 5l6.5 6.5M6 20v6h20v-6" /></svg></span>
          <strong>Drop a video in the mix</strong>
          <span class="card-caption">or <span class="browse-link">browse files</span> from your device</span>
          <span class="file-pills"><span>MP4 VIDEO</span></span>
        </template>
      </label>
      <p v-if="uploadError" class="error-message" role="alert">{{ uploadError }}</p>
      <p class="privacy-note"><span aria-hidden="true">◈</span> All files stay on this device.</p>
      <div class="upload-footer"><span>Built by the team at <a href="https://www.twofoldrecords.com" target="_blank">Twofold Records</a></span></div>
    </section>

    <section v-else class="studio-screen">
      <div class="studio-heading">
        <div><h1>Set the scene</h1></div>
        <button class="text-button" type="button" @click="uploadState = 'idle'; uploadProgress = 0">← Change media</button>
      </div>

      <div class="studio-grid">
        <section class="editor-column" aria-label="Video settings">
          <div class="media-summary">
            <div class="media-thumb"><video :src="videoUrl" muted playsinline preload="metadata"></video></div>
            <div class="media-summary-copy"><span class="field-kicker">BACKGROUND VIDEO</span><strong>{{ videoFile?.name }}</strong><span>{{ videoFile ? (videoFile.size / 1024 / 1024).toFixed(1) : '0' }} MB · MP4</span></div>
            <span class="ready-mark" aria-label="Ready">✓</span>
          </div>

          <section class="editor-section">
            <div class="section-title"><div><span class="step-number">01</span><h2>Format and vibe</h2></div></div>
            <span class="field-label">DESTINATION</span>
            <div class="destination-tabs" role="group" aria-label="Destination">
              <button v-for="item in destinations" :key="item" type="button" :class="{ active: destination === item }" :aria-pressed="destination === item" @click="chooseDestination(item)">{{ item }}</button>
            </div>
            <label class="field-label" for="format-select">FORMAT</label>
            <select id="format-select" v-model="format" class="select-control"><option v-for="item in formats[destination]" :key="item">{{ item }}</option></select>
            <label class="field-label" for="filter-select">FILTER</label>
            <select id="filter-select" v-model="filter" class="select-control"><option v-for="item in filters" :key="item">{{ item }}</option></select>
          </section>

          <section class="editor-section">
            <div class="section-title"><div><span class="step-number">02</span><h2>Words & type</h2></div><span class="section-hint">{{ overlayText.length }} / 120</span></div>
            <div v-if="stagedImages.length" class="staged-images" aria-label="Selected images">
              <span class="field-label">YOUR IMAGES</span>
              <button v-for="image in stagedImages" :key="image.url" type="button" class="staged-image" :class="{ selected: artworkUrl === image.url }" :aria-label="`Use ${image.file.name} as artwork`" @click="selectArtwork(image)"><img :src="image.url" :alt="image.file.name" /><span>{{ image.file.name }}</span></button>
            </div>
            <label class="field-label" for="overlay-text">YOUR MESSAGE</label>
            <textarea id="overlay-text" v-model="overlayText" maxlength="120" rows="3" placeholder="Write something worth a second look…"></textarea>
            <div class="control-row">
              <label class="field-label" for="font-select">FONT</label>
              <label class="field-label" for="size-select">SIZE</label>
            </div>
            <div class="control-row">
              <select id="font-select" v-model="fontName" class="select-control"><option v-for="item in fonts" :key="item">{{ item }}</option><option v-if="customFontName" :value="customFontName">{{ customFontName }} · uploaded</option></select>
              <select id="size-select" v-model.number="textSize" class="select-control"><option :value="14">Extra small</option><option :value="20">Small</option><option :value="32">Medium</option><option :value="44">Large</option><option :value="56">Extra large</option></select>
            </div>
            <div class="control-row setting-labels"><span class="field-label">ALIGNMENT</span><span class="field-label">TEXT COLOR</span></div>
            <div class="control-row">
              <div class="segmented-control" role="group" aria-label="Text alignment"><button v-for="value in alignments" :key="value" type="button" :aria-label="`${value} align`" :aria-pressed="alignment === value" :class="{ active: alignment === value }" @click="alignment = value">{{ value === 'left' ? '≡' : value === 'center' ? '☰' : '≡' }}</button></div>
              <label class="color-picker"><input v-model="textColor" type="color" aria-label="Text color" /><span>{{ textColor.toUpperCase() }}</span></label>
            </div>
            <div class="control-row setting-labels"><span class="field-label">ORIGIN POINT</span><label class="field-label" for="effect-select">TEXT EFFECT</label></div>
            <div class="control-row origin-effect-row">
              <div class="origin-grid" role="group" aria-label="Text origin point">
                <button v-for="(point, index) in origins" :key="point.name" type="button" :aria-label="point.name" :aria-pressed="origin === index" :class="{ active: origin === index }" @click="origin = index"><i></i></button>
              </div>
              <select id="effect-select" v-model="textEffect" class="select-control"><option>None</option><option>Typewriter</option><option>Word pop</option></select>
            </div>
            <label class="field-label padding-label" for="text-padding">TEXT PADDING <span>{{ textPadding }}%</span></label>
            <input id="text-padding" v-model.number="textPadding" class="padding-control" type="range" min="0" max="24" step="1" aria-label="Text padding" />
            <label class="field-label padding-label" for="line-spacing">LINE SPACING <span>{{ lineSpacing.toFixed(2) }}</span></label>
            <input id="line-spacing" v-model.number="lineSpacing" class="padding-control" type="range" min="1" max="2" step="0.05" aria-label="Line spacing" />
            <label class="upload-inline">＋ Upload a local font<input class="visually-hidden" type="file" accept=".woff,.woff2,.ttf,.otf,font/*" aria-label="Upload a local font" @change="uploadFont" /></label>
            <span class="font-note">Choose a local font file. Google Fonts choices are included above.</span>
          </section>

          <section class="editor-section">
            <div class="section-title"><div><span class="step-number">03</span><h2>Artwork</h2></div></div>
            <label class="artwork-drop" :class="{ 'has-artwork': artworkUrl }">
              <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/gif" aria-label="Upload artwork image" @change="uploadArtwork" />
              <img v-if="artworkUrl" ref="artworkElement" :src="artworkUrl" alt="Selected artwork" />
              <span v-else class="artwork-placeholder" aria-hidden="true">＋</span>
              <span><strong>{{ artworkName || 'Add your cover art' }}</strong><br><small>{{ artworkName ? 'Click to replace artwork' : 'JPG, PNG, or GIF · square works best' }}</small></span>
            </label>
            <label class="checkbox-row"><input v-model="pulseArtwork" type="checkbox" /><span class="custom-checkbox">✓</span><span>Pulse artwork with the beat</span><span class="optional-tag">OPTIONAL</span></label>
            <label class="field-label" for="caption-input">END CAPTION <span class="char-count">{{ caption.length }} / 40</span></label>
            <input id="caption-input" v-model="caption" class="text-control" type="text" maxlength="40" placeholder="A little something underneath…" />
            <label class="field-label padding-label" for="caption-size">CAPTION SIZE <span>{{ captionSize }}px</span></label>
            <input id="caption-size" v-model.number="captionSize" class="padding-control" type="range" min="8" max="32" step="1" aria-label="Caption size" />
          </section>
        </section>

        <aside class="preview-column" aria-label="Video preview">
          <div class="preview-header"><div><span class="field-kicker">LIVE PREVIEW</span></div></div>
          <div class="preview-stage" :class="selectedFormatClass">
            <div ref="previewCanvasElement" class="preview-canvas" :class="[selectedFormatClass, { paused: !isPlaying }]">
              <video ref="videoElement" :src="videoUrl" class="preview-video" muted playsinline loop preload="metadata" :class="`filter-${filter.toLowerCase().replace(' ', '-')}`" @click="togglePlayback" @loadedmetadata="updatePreviewDuration" @durationchange="updatePreviewDuration" @timeupdate="updatePreviewTime" @seeked="updatePreviewTime"></video>
              <div :key="`text-${previewAnimationCycle}`" class="preview-text-origin" :data-text-padding="textPadding" :style="originStyle">
                <p v-if="overlayText" class="preview-text" :aria-label="overlayText" :class="[`effect-${textEffect.toLowerCase().replace(' ', '-')}`, { 'text-visible': isPlaying }]" :style="textStyle"><span v-for="(word, index) in previewOverlayWords" :key="`${word.wordIndex}-${word.lineIndex}-${index}`" class="animated-word" :data-word-index="word.wordIndex" :data-line-index="word.lineIndex" :style="word.style">{{ word.text }}</span></p>
              </div>
              <div :key="`blackout-${previewAnimationCycle}`" class="blackout"></div>
              <div :key="`artwork-${previewAnimationCycle}`" class="preview-artwork">
                <div class="preview-artwork-image" :class="{ 'pulse-artwork': pulseArtwork }">
                  <img v-if="artworkUrl" :src="artworkUrl" alt="" />
                  <div v-else class="artwork-empty"><span>✳</span><small>ARTWORK</small></div>
                </div>
                <span v-if="caption" class="preview-caption" :style="captionStyle">{{ caption }}</span>
              </div>
              <div class="preview-grain" :class="`grain-${filter.toLowerCase().replace(' ', '-')}`" aria-hidden="true"></div>
              <div class="preview-overlay-label"><span>REL3ASE - AD PREVIEW</span></div>
            </div>
          </div>
          <div class="player-controls">
            <div class="player-controls-top">
              <div class="player-meta"><span class="player-time">{{ formattedPreviewTime }} <span>/ {{ formattedPreviewDuration }}</span></span></div>
              <div class="player-buttons">
                <button type="button" class="player-button primary" :aria-label="isPlaying ? 'Pause preview' : 'Play preview'" @click="togglePlayback">
                  <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.75 5.25A2.25 2.25 0 0 1 9 7.5v9a2.25 2.25 0 0 1-4.5 0v-9a2.25 2.25 0 0 1 2.25-2.25Zm10.5 0A2.25 2.25 0 0 1 19.5 7.5v9a2.25 2.25 0 0 1-4.5 0v-9a2.25 2.25 0 0 1 2.25-2.25Z" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.25 5.653c0-1.427 1.546-2.334 2.806-1.645l11.54 6.347a1.875 1.875 0 0 1 0 3.29l-11.54 6.347c-1.26.693-2.806-.218-2.806-1.645V5.653Z" /></svg>
                </button>
                <button type="button" class="player-button" :aria-label="volumeLabel" @click="cycleVolume">
                  <svg v-if="volume === 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.25 5.25 6 9.75H3.75v4.5H6l5.25 4.5V5.25Z" /><path d="m16.5 9 4.5 6m0-6-4.5 6" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.25 5.25 6 9.75H3.75v4.5H6l5.25 4.5V5.25Z" /><path d="M15.75 9.75a3.75 3.75 0 0 1 0 4.5m2.25-7.5a7.5 7.5 0 0 1 0 10.5" /></svg>
                </button>
              </div>
            </div>
            <input class="preview-scrubber" type="range" min="0" :max="previewDuration" step="0.1" :value="previewTime" aria-label="Seek preview" :style="{ '--scrub-progress': `${previewDuration ? previewTime / previewDuration * 100 : 0}%` }" @input="seekPreview" />
          </div>
          <div class="start-point-control">
            <label class="field-label padding-label" for="video-start">BACKGROUND VIDEO START POINT <span>{{ formattedVideoStart }} / {{ formattedSourceDuration }}</span></label>
            <input id="video-start" class="preview-scrubber" type="range" min="0" :max="maxVideoStart" :step="VIDEO_START_STEP" :value="videoStart" aria-label="Background video start point" :style="{ '--scrub-progress': `${maxVideoStart ? videoStart / maxVideoStart * 100 : 0}%` }" @input="updateVideoStart" />
          </div>
          <div class="export-controls">
            <label class="field-label padding-label" for="output-quality">OUTPUT QUALITY <span>CRF {{ outputCrf }}</span></label>
            <input id="output-quality" v-model.number="outputQuality" class="padding-control" type="range" :min="MIN_H264_CRF" :max="MAX_H264_CRF" step="1" aria-label="Output quality" :disabled="isExporting" />
            <p class="quality-note">Slide to the right for higher quality, larger files</p>
            <button class="export-button" type="button" :disabled="isExporting || !supportedRecordingType" @click="saveMp4">
              {{ isExporting ? `Encoding ${exportProgress}%` : 'Save MP4 · H.264' }}
            </button>
            <p v-if="exportMessage" class="export-message" role="status">{{ exportMessage }}</p>
            <p v-else-if="!supportedRecordingType" class="export-message" role="status">This browser cannot capture a video for local encoding.</p>
          </div>
        </aside>
      </div>
    </section>
    <footer v-if="uploadState === 'ready'" class="studio-footer"><span>Built by the team at <a href="https://www.twofoldrecords.com" target="_blank">Twofold Records</a></span></footer>
  </main>
</template>
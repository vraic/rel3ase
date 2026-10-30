import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { getMaxVideoStart } from './videoExport'

async function openEditor() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-video')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  render(App)
  const video = new File([], 'release.mp4', { type: 'video/mp4' })
  await fireEvent.change(screen.getByLabelText(/choose video and image files/i), { target: { files: [video] } })
  await screen.findByRole('heading', { name: /set the scene/i })
}

async function setSourceDuration(seconds: number) {
  const video = document.querySelector('.preview-video') as HTMLVideoElement
  Object.defineProperty(video, 'duration', { configurable: true, value: seconds })
  await fireEvent(video, new Event('loadedmetadata'))
  return video
}

describe('Rel3ase editor', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('starts with a media picker and explains that files stay in the browser', () => {
    render(App)

    expect(screen.getByRole('heading', { name: /make your next release move/i })).toBeTruthy()
    expect(screen.getByLabelText(/choose video and image files/i)).toBeTruthy()
    expect(screen.getByText(/all files stay on this device/i)).toBeTruthy()
  })

  it('asks for a video when only an image is selected', async () => {
    render(App)
    const image = new File([], 'cover.png', { type: 'image/png' })

    await fireEvent.change(screen.getByLabelText(/choose video and image files/i), { target: { files: [image] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an mp4 video/i)
  })

  it('stages a selected video and opens the creative editor with format options', async () => {
    await openEditor()

    expect(screen.getByText('release.mp4')).toBeTruthy()
    expect(screen.getByLabelText(/format/i)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Square · 1:1' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Preview destination' })).toBeNull()
  })

  it('updates the available format when a destination changes', async () => {
    await openEditor()

    await fireEvent.click(screen.getByRole('button', { name: /^Spotify$/ }))

    await waitFor(() => expect(screen.getByRole('option', { name: 'Canvas · 9:16' })).toBeTruthy())
    expect(screen.queryByRole('option', { name: 'Square · 1:1' })).toBeNull()
  })

  it('seeks the preview video with the timeline slider', async () => {
    await openEditor()
    const scrubber = screen.getByRole('slider', { name: 'Seek preview' })

    await fireEvent.input(scrubber, { target: { value: '6' } })

    expect(scrubber).toHaveValue('6')
    expect(screen.getByText('00:06')).toBeTruthy()
  })

  it('fills the selected preview stage and renders playback controls with SVG icons', async () => {
    await openEditor()

    expect(document.querySelector('.preview-stage')).toHaveClass('ratio-square')
    expect(document.querySelector('.preview-canvas')).toHaveClass('ratio-square')
    expect(document.querySelector('.video-shade')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause preview' }).querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Muted' }).querySelector('svg')).toBeTruthy()
  })

  it('allows a full ten-second edit to start at 43 seconds in a 60-second background video', async () => {
    await openEditor()
    await setSourceDuration(60)
    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })

    expect(startPoint).toHaveAttribute('max', String(getMaxVideoStart(60)))
    await fireEvent.input(startPoint, { target: { value: '43' } })

    expect(startPoint).toHaveValue('43')
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveAttribute('max', '10')
    expect(screen.getByText('00:43:00 / 01:00:00')).toBeTruthy()
  })

  it('reaches the final valid source frame while retaining a ten-second output timeline', async () => {
    await openEditor()
    const video = await setSourceDuration(60)
    let currentTime = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time
        video.dispatchEvent(new Event('seeked'))
      },
    })
    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })
    const lastStart = getMaxVideoStart(60)

    await fireEvent.input(startPoint, { target: { value: String(lastStart) } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Seek preview' }), { target: { value: '5' } })

    expect(startPoint).toHaveValue(String(lastStart))
    expect(screen.getByText('00:59:20 / 01:00:00')).toBeTruthy()
    expect(video.currentTime).toBeCloseTo(lastStart + 5 - 60)
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveAttribute('max', '10')
  })

  it('restarts preview playback from the selected source start point', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await openEditor()

    const video = await setSourceDuration(60)
    let currentTime = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time
        video.dispatchEvent(new Event('seeked'))
      },
    })
    await fireEvent.input(screen.getByRole('slider', { name: 'Background video start point' }), { target: { value: '3' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Seek preview' }), { target: { value: '4' } })
    expect(video.currentTime).toBe(7)

    await fireEvent.click(screen.getByRole('button', { name: 'Play preview' }))

    expect(video.currentTime).toBe(3)
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveValue('0')
  })

  it('restarts the composition animation at frame one when playback starts from a later source point', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await openEditor()

    const video = await setSourceDuration(60)
    let currentTime = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time
        video.dispatchEvent(new Event('seeked'))
      },
    })
    await fireEvent.input(screen.getByRole('slider', { name: 'Background video start point' }), { target: { value: '43' } })

    const textLayer = document.querySelector('.preview-text-origin')
    const blackoutLayer = document.querySelector('.blackout')
    const artworkLayer = document.querySelector('.preview-artwork')
    expect(video.currentTime).toBe(43)

    await fireEvent.click(screen.getByRole('button', { name: 'Play preview' }))

    expect(video.currentTime).toBe(43)
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveValue('0')
    expect(document.querySelector('.preview-text-origin')).not.toBe(textLayer)
    expect(document.querySelector('.blackout')).not.toBe(blackoutLayer)
    expect(document.querySelector('.preview-artwork')).not.toBe(artworkLayer)
  })

  it('keeps the selected source frame visible and paused while dragging the start point', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await openEditor()
    await setSourceDuration(60)
    play.mockClear()

    const video = document.querySelector('.preview-video') as HTMLVideoElement
    let currentTime = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time
        video.dispatchEvent(new Event('seeked'))
      },
    })
    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })
    await fireEvent.input(startPoint, { target: { value: '2' } })
    await fireEvent.input(startPoint, { target: { value: '4' } })

    expect(video.currentTime).toBe(4)
    expect(pause).toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveValue('0')
    expect(screen.getByText('00:04:00 / 01:00:00')).toBeTruthy()
  })

  it('starts playback from the selected start frame only after Play is pressed', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await openEditor()
    await setSourceDuration(60)
    play.mockClear()

    const video = document.querySelector('.preview-video') as HTMLVideoElement
    let currentTime = 0
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (time: number) => { currentTime = time },
    })
    await fireEvent.input(screen.getByRole('slider', { name: 'Background video start point' }), { target: { value: '3' } })
    video.dispatchEvent(new Event('seeked'))

    expect(play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Play preview' }))

    await waitFor(() => expect(play).toHaveBeenCalled())
    expect(video.currentTime).toBe(3)
    expect(screen.getByRole('button', { name: 'Pause preview' })).toBeTruthy()
  })

  it('exposes the full source duration in the start-point scrubber', async () => {
    await openEditor()

    const video = document.querySelector('.preview-video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 45 })
    await fireEvent(video, new Event('loadedmetadata'))

    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })
    expect(startPoint).toHaveAttribute('max', String(getMaxVideoStart(45)))
    expect(screen.getByText('00:00:00 / 00:45:00')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveAttribute('max', '10')
  })

  it('updates the start-point range when the browser reports a longer source duration', async () => {
    await openEditor()
    const video = document.querySelector('.preview-video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 })
    await fireEvent(video, new Event('loadedmetadata'))

    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })
    expect(startPoint).toHaveAttribute('max', String(getMaxVideoStart(60)))
    expect(screen.getByText('00:00:00 / 01:00:00')).toBeTruthy()

    Object.defineProperty(video, 'duration', { configurable: true, value: 3600 })
    await fireEvent(video, new Event('durationchange'))

    expect(startPoint).toHaveAttribute('max', String(getMaxVideoStart(3600)))
    expect(screen.getByText('00:00:00 / 01:00:00:00')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Seek preview' })).toHaveAttribute('max', '10')
  })

  it('offers an MP4 H.264 export', async () => {
    await openEditor()

    expect(screen.getByRole('button', { name: /save mp4.*h\.264/i })).toBeTruthy()
  })

  it('adjusts the end-caption size and omits preview expand arrows', async () => {
    await openEditor()

    const captionSize = screen.getByRole('slider', { name: 'Caption size' })
    await fireEvent.input(captionSize, { target: { value: '24' } })

    expect(captionSize).toHaveValue('24')
    expect(document.querySelector('.preview-caption')).toHaveStyle({ fontSize: '24px' })
    expect(document.querySelector('.preview-caption')).toHaveStyle({ letterSpacing: '2px' })
    expect(screen.queryByRole('button', { name: 'Preview is scaled to fit' })).toBeNull()
    expect(document.querySelector('.artwork-arrow')).toBeNull()
  })

  it('keeps the caption outside the beat-pulsing artwork and exposes export quality', async () => {
    await openEditor()

    const quality = screen.getByRole('slider', { name: 'Output quality' })
    expect(quality).toHaveValue('24')
    expect(screen.getByText(/slide to the right for higher quality/i)).toBeTruthy()
    await fireEvent.input(quality, { target: { value: '26' } })
    expect(screen.getByText('CRF 16')).toBeTruthy()

    const pulseToggle = screen.getByRole('checkbox', { name: /pulse artwork with the beat/i })
    await fireEvent.click(pulseToggle)

    const pulseArtwork = document.querySelector('.preview-artwork-image.pulse-artwork')
    expect(pulseArtwork).toBeTruthy()
    expect(pulseArtwork?.contains(document.querySelector('.preview-caption'))).toBe(false)
  })

  it('scrubs the video start point in four-frame increments at 24 fps', async () => {
    await openEditor()
    await setSourceDuration(60)

    const startPoint = screen.getByRole('slider', { name: 'Background video start point' })
    expect(startPoint).toHaveAttribute('step', String(4 / 24))
    await fireEvent.input(startPoint, { target: { value: '0.5' } })

    expect(screen.getByText('00:00:12 / 01:00:00')).toBeTruthy()
  })

  it('updates the live filter, text size, padding, and word effects', async () => {
    await openEditor()

    await fireEvent.change(screen.getByLabelText('FILTER'), { target: { value: 'Film' } })
    expect(document.querySelector('.preview-video')).toHaveClass('filter-film')

    await fireEvent.change(screen.getByLabelText('SIZE'), { target: { value: '14' } })
    expect(document.querySelector('.preview-text')).toHaveStyle({ fontSize: '14px' })

    const padding = screen.getByRole('slider', { name: 'Text padding' })
    await fireEvent.input(padding, { target: { value: '16' } })
    expect(document.querySelector('.preview-text-origin')).toHaveAttribute('data-text-padding', '16')

    await fireEvent.change(screen.getByLabelText('SIZE'), { target: { value: '20' } })
    expect(document.querySelector('.preview-text')).toHaveStyle({ fontSize: '20px' })

    const lineSpacing = screen.getByRole('slider', { name: 'Line spacing' })
    expect(lineSpacing).toHaveAttribute('min', '1')
    await fireEvent.input(lineSpacing, { target: { value: '1.5' } })
    expect(document.querySelector('.preview-text')).toHaveStyle({ lineHeight: '1.5' })

    const effect = screen.getByLabelText('TEXT EFFECT')
    await fireEvent.change(effect, { target: { value: 'Word pop' } })
    const text = document.querySelector('.preview-text')
    expect(text).toHaveClass('effect-word-pop')
    const words = text?.querySelectorAll('.animated-word')
    expect(words).toHaveLength(5)
    expect(words?.[0]).toHaveStyle({ '--word-index': '0' })
    expect(words?.[1]).toHaveStyle({ '--word-index': '1' })

    await fireEvent.change(effect, { target: { value: 'Typewriter' } })
    expect(text).toHaveClass('effect-typewriter')
    const typewriterWords = text?.querySelectorAll('.animated-word')
    expect(typewriterWords?.[0]).toHaveStyle({ '--word-delay': '0.350s' })
    expect(typewriterWords?.[4]).toHaveStyle({ '--word-delay': '2.750s' })
  })

  it('keeps overlay word order and explicit line breaks visible in the preview', async () => {
    await openEditor()
    const overlayInput = screen.getByLabelText('YOUR MESSAGE')
    await fireEvent.update(overlayInput, 'FIRST WORDS\nSECOND LINE')

    const text = document.querySelector('.preview-text')
    const words = Array.from(text?.querySelectorAll('.animated-word') ?? [])
    expect(text).toHaveStyle({ letterSpacing: '0px' })
    expect(words.map(word => word.textContent)).toEqual(['FIRST', 'WORDS', 'SECOND', 'LINE'])
    expect(text).toHaveAttribute('aria-label', 'FIRST WORDS\nSECOND LINE')
    expect(words.map(word => word.getAttribute('data-line-index'))).toEqual(['0', '0', '1', '1'])
    expect(words.map(word => word.getAttribute('style')?.match(/--word-index:\s*(\d+)/)?.[1])).toEqual(['0', '1', '2', '3'])
  })

  it('keeps long preview messages readable and non-overlapping across layout controls', async () => {
    await openEditor()
    const overlayInput = screen.getByLabelText('YOUR MESSAGE')
    await fireEvent.update(overlayInput, 'WORDS SHOULD WRAP WITHOUT COLLIDING WITH EACH OTHER\nINCLUDING THIS SECOND EXPLICIT LINE')
    await fireEvent.change(screen.getByLabelText('SIZE'), { target: { value: '56' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Text padding' }), { target: { value: '24' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Line spacing' }), { target: { value: '1.5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'right align' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Bottom right' }))

    const words = Array.from(document.querySelectorAll('.preview-text .animated-word')) as HTMLElement[]
    const placements: Array<{ left: number; right: number; top: number; bottom: number }> = []
    words.forEach(word => {
      const left = Number.parseFloat(word.style.left)
      const top = Number.parseFloat(word.style.top)
      const fontSize = Number.parseFloat(getComputedStyle(word.parentElement!).fontSize)
      placements.push({ left, right: left + Number.parseFloat(word.style.width), top, bottom: top + fontSize })
    })

    expect(words.length).toBeGreaterThan(10)
    expect(new Set(words.map(word => word.dataset.lineIndex)).size).toBeGreaterThan(2)
    for (let first = 0; first < placements.length; first++) {
      for (let second = first + 1; second < placements.length; second++) {
        const a = placements[first]
        const b = placements[second]
        const overlapsHorizontally = a.left < b.right - 0.01 && b.left < a.right - 0.01
        const overlapsVertically = a.top < b.bottom - 0.01 && b.top < a.bottom - 0.01
        expect(overlapsHorizontally && overlapsVertically).toBe(false)
      }
    }
  })

  it('moves the overlay block according to the selected origin point', async () => {
    await openEditor()
    await fireEvent.click(screen.getByRole('button', { name: 'Bottom right' }))

    expect(document.querySelector('.preview-text-origin')).toHaveStyle({
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
    })
  })
})
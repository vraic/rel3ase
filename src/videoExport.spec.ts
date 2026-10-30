import { describe, expect, it } from 'vitest'
import { buildH264EncodingArguments, findMp4RecordingType, findWebmRecordingType, getBackgroundVideoOpacity, getCanvasScaleFactor, getEncodingLogProgress, getEncodingProgress, getEndCardOpacity, getExportDimensions, getMaxVideoStart, getOutputDuration, VIDEO_START_STEP } from './videoExport'

describe('browser video export helpers', () => {
  it('selects a browser-supported temporary recording type for FFmpeg', () => {
    expect(findWebmRecordingType(type => type.includes('vp8'))).toBe('video/webm;codecs=vp8,opus')
    expect(findWebmRecordingType(() => false)).toBe('')
    expect(findMp4RecordingType(type => type.startsWith('video/mp4'))).toContain('video/mp4')
    expect(findMp4RecordingType(() => false)).toBe('')
  })

  it('uses consistent high-quality H.264 and AAC settings for the final MP4', () => {
    const args = buildH264EncodingArguments(8.5)

    expect(args).toContain('libx264')
    expect(args).toContain('18')
    expect(args).toContain('high')
    expect(args).toContain('aac')
    expect(args.slice(args.indexOf('-color_range'), args.indexOf('-color_range') + 2)).toEqual(['-color_range', 'pc'])
    expect(args).toContain('8.500')
    expect(args[args.length - 1]).toBe('output.mp4')
    expect(buildH264EncodingArguments(8.5, 'input.mp4')).toContain('input.mp4')
  })

  it('passes the selected CRF to FFmpeg and bounds it to supported quality levels', () => {
    const args = buildH264EncodingArguments(8.5, 'input.webm', 24)
    const crfArgument = (encodingArgs: string[]) => encodingArgs.slice(encodingArgs.indexOf('-crf'), encodingArgs.indexOf('-crf') + 2)

    expect(crfArgument(args)).toEqual(['-crf', '24'])
    expect(crfArgument(buildH264EncodingArguments(8.5, 'input.webm', 0))).toEqual(['-crf', '14'])
    expect(crfArgument(buildH264EncodingArguments(8.5, 'input.webm', 100))).toEqual(['-crf', '28'])
  })

  it('keeps the output at ten seconds for every valid source start, including near the end', () => {
    expect(getOutputDuration(24, 3)).toBe(10)
    expect(getOutputDuration(60, 43)).toBe(10)
    expect(getOutputDuration(60, 50)).toBe(10)
    expect(getOutputDuration(15, 14.9)).toBe(10)
    expect(getOutputDuration(8, 7.5)).toBe(10)
    expect(getOutputDuration(8, 8)).toBe(0)
  })

  it('allows background start selection across the full source in four-frame increments', () => {
    expect(getMaxVideoStart(60)).toBeCloseTo(59 + 20 / 24)
    expect(getMaxVideoStart(45)).toBeCloseTo(44 + 20 / 24)
    expect(getMaxVideoStart(10)).toBeCloseTo(9 + 20 / 24)
    expect(getMaxVideoStart(8)).toBeCloseTo(7 + 20 / 24)
    expect(getMaxVideoStart(Number.NaN)).toBe(0)
    expect(getMaxVideoStart(60.1)).toBeLessThan(60.1)
    expect(getMaxVideoStart(60.1)).toBeGreaterThan(60.1 - VIDEO_START_STEP * 2)
    expect((getMaxVideoStart(60.1) / VIDEO_START_STEP) % 1).toBeCloseTo(0)
  })

  it('uses FFmpeg transcoded time when its experimental progress ratio is zero', () => {
    expect(getEncodingProgress(0, 5_000_000, 10)).toBe(0.5)
    expect(getEncodingProgress(0.4, 7_000_000, 10)).toBe(0.7)
    expect(getEncodingProgress(0, 15_000_000, 10)).toBe(1)
    expect(getEncodingProgress(Number.NaN, 0, 10)).toBe(0)
  })

  it('derives encoding progress from FFmpeg output logs when progress events are missing', () => {
    expect(getEncodingLogProgress('frame=120 fps=30 time=00:00:04.00 bitrate=1500kbits/s', 10)).toBe(0.4)
    expect(getEncodingLogProgress('time=00:00:12.00', 10)).toBe(1)
    expect(getEncodingLogProgress('frame=1 time=N/A', 10)).toBeNull()
  })

  it('uses 1080-scale dimensions for each output aspect ratio', () => {
    expect(getExportDimensions('Square · 1:1')).toEqual({ width: 1080, height: 1080 })
    expect(getExportDimensions('Portrait · 4:5')).toEqual({ width: 1080, height: 1350 })
    expect(getExportDimensions('Landscape · 1.91:1')).toEqual({ width: 1920, height: 1006 })
    expect(getExportDimensions('Story / Reel · 9:16')).toEqual({ width: 1080, height: 1920 })
  })

  it('scales canvas typography from the rendered preview width', () => {
    expect(getCanvasScaleFactor(1080, 540)).toBe(2)
    expect(getCanvasScaleFactor(1080, 0)).toBeCloseTo(1080 / 334)
  })

  it('keeps the source video fully opaque and holds the end card through the final frame', () => {
    expect(getBackgroundVideoOpacity(0)).toBe(1)
    expect(getBackgroundVideoOpacity(5.05)).toBe(1)
    expect(getBackgroundVideoOpacity(9.9)).toBe(1)
    expect(getEndCardOpacity(5.5)).toBe(0)
    expect(getEndCardOpacity(6.4)).toBe(1)
    expect(getEndCardOpacity(9.9)).toBe(1)
    expect(getEndCardOpacity(10)).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { getExportTypographySize, getPreviewTypographySize, getWordRevealProgress, layoutOverlayWords } from './textLayout'

const measureText = (text: string) => text.length * 10

describe('overlay text layout', () => {
  it('wraps at available width and preserves explicit line breaks and word order', () => {
    const words = layoutOverlayWords({
      text: 'one two three\nfour',
      width: 100,
      height: 100,
      fontSize: 10,
      lineSpacing: 1.5,
      paddingPercent: 10,
      alignment: 'center',
      originX: 'center',
      originY: 'center',
      measureText,
    })

    expect(words.map(word => word.text)).toEqual(['one', 'two', 'three', 'four'])
    expect(words.map(word => word.lineIndex)).toEqual([0, 0, 1, 2])
    expect(words[0].x).toBeCloseTo(15)
    expect(words[0]).toMatchObject({ y: 27.5, wordIndex: 0 })
    expect(words[1].x).toBeCloseTo(55)
    expect(words[1]).toMatchObject({ y: 27.5, wordIndex: 1 })
    expect(words[2]).toMatchObject({ x: 25, y: 42.5, wordIndex: 2 })
    expect(words[3]).toMatchObject({ x: 30, y: 57.5, wordIndex: 3 })
  })

  it('places right-aligned text at the bottom-right padded origin', () => {
    const words = layoutOverlayWords({
      text: 'one two three\nfour',
      width: 100,
      height: 120,
      fontSize: 10,
      lineSpacing: 1.5,
      paddingPercent: 10,
      alignment: 'right',
      originX: 'flex-end',
      originY: 'flex-end',
      measureText,
    })

    expect(words[0].x).toBeCloseTo(20)
    expect(words[0].y).toBe(63)
    expect(words[2].x).toBeCloseTo(40)
    expect(words[2].y).toBe(78)
    expect(words[3].x).toBeCloseTo(50)
    expect(words[3].y).toBe(93)
  })

  it('breaks long words inside the available text width without changing their animation index', () => {
    const words = layoutOverlayWords({
      text: 'abcdefghijk',
      width: 60,
      height: 80,
      fontSize: 10,
      lineSpacing: 1,
      paddingPercent: 10,
      alignment: 'left',
      originX: 'flex-start',
      originY: 'flex-start',
      measureText,
    })

    expect(words.map(word => word.text)).toEqual(['abcd', 'efgh', 'ijk'])
    expect(words.map(word => word.wordIndex)).toEqual([0, 0, 0])
    expect(words.map(word => word.lineIndex)).toEqual([0, 1, 2])
    expect(words[0].width).toBeLessThanOrEqual(48)
    expect(words[1].width).toBeLessThanOrEqual(48)
    expect(words[2].width).toBeLessThanOrEqual(48)
  })

  it('uses the measured glyph width without compressing character spacing', () => {
    const words = layoutOverlayWords({
      text: 'readable text',
      width: 200,
      height: 100,
      fontSize: 20,
      lineSpacing: 1,
      paddingPercent: 0,
      alignment: 'left',
      originX: 'flex-start',
      originY: 'flex-start',
      measureText,
    })

    expect(words.map(word => word.width)).toEqual([80, 40])
    expect(words[1].x - (words[0].x + words[0].width)).toBe(10)
  })

  it.each(['left', 'center', 'right'] as const)('keeps variable-width wrapped words separated for %s alignment at all origins', alignment => {
    const text = 'Wide WWW words should wrap predictably\nAverylongwordneedsbreaking too'
    const fontSize = 18
    const paddingPercent = 12
    const inset = 240 * paddingPercent / 100
    const measuredGlyphs = (value: string) => Array.from(value).reduce((width, character) => width + (character === 'W' ? 15 : character === 'i' ? 5 : 10), 0)

    for (const originX of ['flex-start', 'center', 'flex-end'] as const) {
      for (const originY of ['flex-start', 'center', 'flex-end'] as const) {
        const words = layoutOverlayWords({
          text,
          width: 240,
          height: 240,
          fontSize,
          lineSpacing: 1.25,
          paddingPercent,
          alignment,
          originX,
          originY,
          measureText: measuredGlyphs,
        })
        const lines = new Map<number, typeof words>()
        words.forEach(word => lines.set(word.lineIndex, [...(lines.get(word.lineIndex) ?? []), word]))

        expect([...new Set(words.map(word => word.wordIndex))]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
        for (const line of lines.values()) {
          for (let index = 0; index < line.length; index++) {
            expect(line[index].x).toBeGreaterThanOrEqual(inset - 0.01)
            expect(line[index].x + line[index].width).toBeLessThanOrEqual(240 - inset + 0.01)
            if (index > 0) {
              expect(line[index].x).toBeGreaterThanOrEqual(line[index - 1].x + line[index - 1].width)
            }
          }
        }
      }
    }
  })

  it('keeps every word rectangle separate at dense line spacing across sizes and origins', () => {
    const text = 'WIDE WWW text with mixed widths\nand averylongwordthatmustwrap safely'
    const measureVariableText = (value: string) => Array.from(value).reduce((width, character) => {
      return width + (character === 'W' ? 19 : character === 'i' ? 5 : character === ' ' ? 8 : 11)
    }, 0)

    for (const fontSize of [14, 20, 56]) {
      for (const lineSpacing of [0.8, 1, 1.5]) {
        for (const alignment of ['left', 'center', 'right'] as const) {
          for (const originX of ['flex-start', 'center', 'flex-end'] as const) {
            for (const originY of ['flex-start', 'center', 'flex-end'] as const) {
              const words = layoutOverlayWords({
                text,
                width: 320,
                height: 320,
                fontSize,
                lineSpacing,
                paddingPercent: 12,
                alignment,
                originX,
                originY,
                measureText: measureVariableText,
              })

              expect(words.length).toBeGreaterThan(8)
              for (let first = 0; first < words.length; first++) {
                for (let second = first + 1; second < words.length; second++) {
                  const a = words[first]
                  const b = words[second]
                  const overlapsHorizontally = a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01
                  const overlapsVertically = a.y < b.y + fontSize - 0.01 && b.y < a.y + fontSize - 0.01
                  expect(overlapsHorizontally && overlapsVertically).toBe(false)
                }
              }
            }
          }
        }
      }
    }
  })

  it('returns no placements for empty text and handles repeated whitespace consistently', () => {
    const layout = (text: string) => layoutOverlayWords({
      text,
      width: 160,
      height: 120,
      fontSize: 16,
      lineSpacing: 1.2,
      paddingPercent: 8,
      alignment: 'center',
      originX: 'center',
      originY: 'center',
      measureText,
    })

    expect(layout('  \n\t')).toEqual([])
    expect(layout('  alpha    beta  ').map(word => word.text)).toEqual(['alpha', 'beta'])
  })

  it('uses a smooth, ordered reveal and responsive type sizes for preview and export', () => {
    expect(getWordRevealProgress(0.35, 0, 5)).toBe(0)
    expect(getWordRevealProgress(0.47, 0, 5)).toBeCloseTo(0.875)
    expect(getWordRevealProgress(0.95, 1, 5)).toBe(0)
    expect(getWordRevealProgress(2.99, 4, 5)).toBe(1)
    expect(getPreviewTypographySize(16, 668)).toBe(32)
    expect(getExportTypographySize(16, 1080)).toBeCloseTo(51.74)
  })
})
export type TextAlignment = 'left' | 'center' | 'right'
export type TextOrigin = 'flex-start' | 'center' | 'flex-end'

export type OverlayWordPlacement = {
  text: string
  wordIndex: number
  lineIndex: number
  x: number
  y: number
  width: number
}

type TextLayoutOptions = {
  text: string
  width: number
  height: number
  fontSize: number
  lineSpacing: number
  paddingPercent: number
  alignment: TextAlignment
  originX: TextOrigin
  originY: TextOrigin
  measureText: (text: string) => number
}

type LayoutLine = { words: Array<{ text: string; wordIndex: number; width: number; gap: number }>; width: number }

export function layoutOverlayWords(options: TextLayoutOptions): OverlayWordPlacement[] {
  const { text, width, height, fontSize, lineSpacing, paddingPercent, alignment, originX, originY, measureText } = options
  const insetX = width * paddingPercent / 100
  const insetY = height * paddingPercent / 100
  const maxWidth = Math.max(1, width - insetX * 2)
  const measuredWidth = measureText
  const spaceWidth = measureText(' ')
  const lines: LayoutLine[] = []
  let wordIndex = 0

  const pushLine = (words: LayoutLine['words']) => {
    lines.push({ words, width: words.reduce((total, word) => total + word.gap + word.width, 0) })
  }

  for (const paragraph of text.split(/\r?\n/)) {
    let words: LayoutLine['words'] = []
    let lineWidth = 0
    const flushLine = () => {
      pushLine(words)
      words = []
      lineWidth = 0
    }

    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const currentWordIndex = wordIndex++
      const characters = Array.from(word)
      const chunks: string[] = []
      let chunk = ''
      for (const character of characters) {
        if (chunk && measuredWidth(chunk + character) > maxWidth) {
          chunks.push(chunk)
          chunk = character
        } else {
          chunk += character
        }
      }
      if (chunk) chunks.push(chunk)

      chunks.forEach((part, partIndex) => {
        const partWidth = measuredWidth(part)
        const gap = words.length && partIndex === 0 ? spaceWidth : 0
        if (words.length && lineWidth + gap + partWidth > maxWidth) {
          flushLine()
        }
        const lineGap = words.length && partIndex === 0 ? spaceWidth : 0
        words.push({ text: part, wordIndex: currentWordIndex, width: partWidth, gap: lineGap })
        lineWidth += lineGap + partWidth
      })
    }
    flushLine()
  }

  const safeLineSpacing = Number.isFinite(lineSpacing) ? Math.max(1, lineSpacing) : 1
  const lineHeight = fontSize * safeLineSpacing
  const blockHeight = lines.length * lineHeight
  const blockWidth = Math.max(0, ...lines.map(line => line.width))
  const availableHeight = Math.max(0, height - insetY * 2)
  const top = originY === 'flex-start'
    ? insetY
    : originY === 'flex-end'
      ? height - insetY - blockHeight
      : insetY + (availableHeight - blockHeight) / 2
  const left = originX === 'flex-start'
    ? insetX
    : originX === 'flex-end'
      ? width - insetX - blockWidth
      : insetX + (maxWidth - blockWidth) / 2

  return lines.flatMap((line, lineIndex) => {
    const lineLeft = left + (alignment === 'left' ? 0 : alignment === 'right' ? blockWidth - line.width : (blockWidth - line.width) / 2)
    let x = lineLeft
    return line.words.map(word => {
      x += word.gap
      const placement = { ...word, lineIndex, x, y: top + lineIndex * lineHeight }
      x += word.width
      return placement
    })
  })
}

export function getWordRevealProgress(time: number, wordIndex: number, wordCount: number) {
  if (wordCount <= 0) return 1
  const revealDuration = 0.24
  const revealWindow = 2.4
  const stagger = wordCount <= 1 ? 0 : revealWindow / (wordCount - 1)
  const linearProgress = Math.max(0, Math.min(1, (time - 0.35 - wordIndex * stagger) / revealDuration))
  return 1 - (1 - linearProgress) ** 3
}

export function getPreviewTypographySize(size: number, canvasWidth: number) {
  return size * Math.max(canvasWidth, 1) / 334
}

export function getExportTypographySize(size: number, outputWidth: number) {
  return size * outputWidth / 334
}
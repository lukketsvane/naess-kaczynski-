"use client"

import { useEffect, useState, useRef, useCallback, ReactNode, Children, isValidElement, cloneElement, ReactElement } from "react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"

// Ekstraherer avsnittsnummer fra overskrift (§1, §2, osv. eller note-nummer som "29", "30")
function extractSectionId(text: string): string | null {
  const sectionMatch = text.match(/§(\d+)/)
  if (sectionMatch) return `avsnitt-${sectionMatch[1]}`

  const noteMatch = text.match(/^(\d+)\s*\(/)
  if (noteMatch) return `note-${noteMatch[1]}`

  return null
}

// Unik nøkkel-teller for React keys
let keyCounter = 0

// Gjør referanser i en tekststreng klikkbare
function processTextString(text: string): ReactNode {
  const patterns = [
    { regex: /avsnittene\s+(\d+)[–-](\d+)/gi, type: 'range' },
    { regex: /avsnitt\s+(\d+)/gi, type: 'single' },
    { regex: /note[ne]*\s+(\d+)/gi, type: 'note' },
    { regex: /\$\^\{(\d+)\}\$/g, type: 'footnote' },
  ]

  const allMatches: { index: number; length: number; replacement: ReactNode }[] = []

  for (const pattern of patterns) {
    let match
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    while ((match = regex.exec(text)) !== null) {
      const num = match[1]
      let targetId: string
      let displayText = match[0]

      switch (pattern.type) {
        case 'range':
        case 'single':
          targetId = `avsnitt-${num}`
          break
        case 'note':
          targetId = `note-${num}`
          break
        case 'footnote':
          targetId = `note-${num}`
          displayText = `[${num}]`
          break
        default:
          targetId = `avsnitt-${num}`
      }

      allMatches.push({
        index: match.index,
        length: match[0].length,
        replacement: (
          <a
            key={`ref-${keyCounter++}`}
            href={`#${targetId}`}
            onClick={(e) => {
              e.preventDefault()
              const element = document.getElementById(targetId)
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                element.classList.add('highlight-ref')
                setTimeout(() => element.classList.remove('highlight-ref'), 2000)
              }
            }}
            className="text-primary hover:underline cursor-pointer"
          >
            {displayText}
          </a>
        )
      })
    }
  }

  if (allMatches.length === 0) return text

  allMatches.sort((a, b) => a.index - b.index)

  const result: ReactNode[] = []
  let lastIndex = 0

  for (const match of allMatches) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index))
    }
    result.push(match.replacement)
    lastIndex = match.index + match.length
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }

  return <>{result}</>
}

// Rekursivt prosesser React children og gjør referanser klikkbare
function processChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return processTextString(child)
    }

    if (typeof child === 'number') {
      return child
    }

    if (isValidElement(child)) {
      const element = child as ReactElement<{ children?: ReactNode }>
      if (element.props.children) {
        return cloneElement(element, {
          ...element.props,
          children: processChildren(element.props.children)
        })
      }
      return child
    }

    return child
  })
}

// Hent ren tekst fra children
function getTextContent(children: ReactNode): string {
  let text = ''
  Children.forEach(children, (child) => {
    if (typeof child === 'string') {
      text += child
    } else if (typeof child === 'number') {
      text += String(child)
    } else if (isValidElement(child)) {
      const element = child as ReactElement<{ children?: ReactNode }>
      if (element.props.children) {
        text += getTextContent(element.props.children)
      }
    }
  })
  return text
}

interface TranslatorProps {
  initialText: string
}

// Generer liste over alle avsnittsnumre fra teksten
function extractSectionNumbers(text: string): number[] {
  const matches = text.matchAll(/## §(\d+)/g)
  const numbers = Array.from(matches, m => parseInt(m[1]))
  return [...new Set(numbers)].sort((a, b) => a - b)
}

export function Translator({ initialText }: TranslatorProps) {
  const [currentSection, setCurrentSection] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [showScrubber, setShowScrubber] = useState(false)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const scrubberTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sectionNumbers = extractSectionNumbers(initialText)
  const maxSection = sectionNumbers.length > 0 ? Math.max(...sectionNumbers) : 232

  // Naviger til avsnitt
  const navigateToSection = useCallback((sectionNum: number) => {
    const element = document.getElementById(`avsnitt-${sectionNum}`)
    if (element) {
      element.scrollIntoView({ behavior: 'auto', block: 'start' })
      element.classList.add('highlight-ref')
      setTimeout(() => element.classList.remove('highlight-ref'), 1000)
    }
  }, [])

  // Håndter touch/mouse på scrubber
  const handleScrubberInteraction = useCallback((clientY: number) => {
    if (!scrubberRef.current) return

    const rect = scrubberRef.current.getBoundingClientRect()
    const relativeY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const sectionNum = Math.max(1, Math.min(maxSection, Math.round(relativeY * maxSection)))

    setCurrentSection(sectionNum)
    navigateToSection(sectionNum)
  }, [maxSection, navigateToSection])

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    handleScrubberInteraction(e.touches[0].clientY)
  }, [handleScrubberInteraction])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging) {
      e.preventDefault()
      handleScrubberInteraction(e.touches[0].clientY)
    }
  }, [isDragging, handleScrubberInteraction])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    handleScrubberInteraction(e.clientY)
  }, [handleScrubberInteraction])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleScrubberInteraction(e.clientY)
    }
  }, [isDragging, handleScrubberInteraction])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Vis scrubber ved touch på høyre kant
  useEffect(() => {
    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0]
      const screenWidth = window.innerWidth
      // Vis scrubber hvis touch er på høyre 15% av skjermen
      if (touch.clientX > screenWidth * 0.85) {
        setShowScrubber(true)
        if (scrubberTimeoutRef.current) {
          clearTimeout(scrubberTimeoutRef.current)
        }
      }
    }

    const handleTouchEnd = () => {
      scrubberTimeoutRef.current = setTimeout(() => {
        if (!isDragging) {
          setShowScrubber(false)
        }
      }, 2000)
    }

    window.addEventListener('touchstart', handleTouch)
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('touchstart', handleTouch)
      window.removeEventListener('touchend', handleTouchEnd)
      if (scrubberTimeoutRef.current) {
        clearTimeout(scrubberTimeoutRef.current)
      }
    }
  }, [isDragging])

  // Oppdater currentSection basert på scroll
  useEffect(() => {
    const handleScroll = () => {
      if (isDragging) return

      const sections = sectionNumbers.map(num => {
        const el = document.getElementById(`avsnitt-${num}`)
        if (!el) return { num, top: Infinity }
        return { num, top: el.getBoundingClientRect().top }
      })

      const current = sections.find(s => s.top > 50) || sections[sections.length - 1]
      if (current && current.num !== currentSection) {
        setCurrentSection(current.num)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sectionNumbers, currentSection, isDragging])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + P for PDF download
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault()
        downloadPDF()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const downloadPDF = async () => {
    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    const title = "Det industrielle samfunnet og dets framtid"
    const titleWidth = doc.getTextWidth(title)
    doc.text(title, (210 - titleWidth) / 2, 30)

    doc.setFontSize(14)
    doc.setFont("helvetica", "italic")
    const subtitle = "Omdiktet av Arne Næss"
    const subtitleWidth = doc.getTextWidth(subtitle)
    doc.text(subtitle, (210 - subtitleWidth) / 2, 42)

    doc.setFont("helvetica", "normal")
    doc.text("1995", (210 - doc.getTextWidth("1995")) / 2, 52)

    doc.setLineWidth(0.5)
    doc.line(20, 70, 190, 70)

    doc.setFontSize(11)
    let y = 85
    const margin = 20
    const pageWidth = 170
    const pageHeight = doc.internal.pageSize.height
    const lineHeight = 6

    const lines = initialText.split('\n')

    lines.forEach((line) => {
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }

      const trimmedLine = line.trim()

      if (trimmedLine.startsWith('##')) {
        doc.setFont("helvetica", "bold")
        const headerText = trimmedLine.replace(/^##\s*/, '')

        if (y + lineHeight * 2 > pageHeight - margin) {
            doc.addPage()
            y = margin
        }

        doc.text(headerText, margin, y)
        y += lineHeight * 1.5
        doc.setFont("helvetica", "normal")
      } else if (trimmedLine === '') {
        if (y > margin) {
           y += lineHeight
        }
      } else {
        doc.setFont("helvetica", "normal")
        const wrappedLines = doc.splitTextToSize(line, pageWidth)

        wrappedLines.forEach((wrappedLine: string) => {
          if (y + lineHeight > pageHeight - margin) {
            doc.addPage()
            y = margin
          }
          doc.text(wrappedLine, margin, y)
          y += lineHeight
        })
      }
    })

    doc.save("det-industrielle-samfunnet.pdf")
  }

  const markdownComponents = {
    h1: ({ children }: { children?: ReactNode }) => <h1 className="text-2xl font-bold mt-8 mb-4">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => {
      const text = getTextContent(children)
      const id = extractSectionId(text)
      // Vanlige seksjonsoverskrifter (ikke §-avsnitt, de er nå inline i teksten)
      return <h2 id={id || undefined} className="text-xl font-bold mt-6 mb-2 scroll-mt-4">{children}</h2>
    },
    h3: ({ children }: { children?: ReactNode }) => <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => {
      const content = getTextContent(children);
      if (content.length > 3 && content === content.toUpperCase() && !content.includes('\n')) {
        return <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>
      }
      return <p className="mb-4 leading-relaxed">{processChildren(children)}</p>
    },
  }

  // Pre-prosesser tekst for å kombinere §-linjer med påfølgende paragraf
  const processText = (text: string) => {
    // Fjern ekstra linjeskift
    let processed = text.replace(/\n{3,}/g, '\n\n')

    // Kombiner "## §X" eller "## §X (Avsnitt Y)" med neste paragraf, gjør § bold og større
    processed = processed.replace(
      /## §(\d+)(\s*\(Avsnitt \d+\))?\s*\n+([^\n#])/g,
      (_, num, parenPart, firstChar) => {
        const suffix = parenPart ? ` ${parenPart.trim()}` : ''
        return `<span id="avsnitt-${num}" class="font-bold text-lg">§${num}${suffix}</span> ${firstChar}`
      }
    )

    return processed
  }

  return (
    <>
      {/* Section Scrubber - iOS-style navigation */}
      <div
        ref={scrubberRef}
        className={`fixed right-0 top-1/2 -translate-y-1/2 h-[70vh] w-8 z-50 flex flex-col items-center justify-between py-4 transition-opacity duration-300 ${
          showScrubber || isDragging ? 'opacity-100' : 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto md:hover:opacity-100'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Track */}
        <div className="absolute inset-x-0 top-4 bottom-4 mx-auto w-0.5 bg-muted-foreground/20 rounded-full" />

        {/* Current position indicator */}
        <div
          className="absolute right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-lg transition-all duration-75"
          style={{ top: `calc(${((currentSection - 1) / (maxSection - 1)) * 100}% + 1rem - 0.75rem)` }}
        >
          {currentSection}
        </div>

        {/* Section markers - show every 50 */}
        {[1, 50, 100, 150, 200, maxSection].filter((n, i, arr) => n <= maxSection && arr.indexOf(n) === i).map((num) => (
          <div
            key={num}
            className="absolute right-6 text-[9px] text-muted-foreground font-mono"
            style={{ top: `calc(${((num - 1) / (maxSection - 1)) * 100}% + 1rem - 0.5rem)` }}
          >
            {num}
          </div>
        ))}
      </div>

      {/* Section number popup when dragging */}
      {isDragging && (
        <div className="fixed right-12 top-1/2 -translate-y-1/2 bg-foreground text-background px-4 py-2 rounded-lg text-2xl font-bold shadow-xl z-50">
          §{currentSection}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-center text-foreground mb-6 text-balance">
          Det industrielle samfunnet og dets framtid
        </h1>

      <p className="font-serif text-lg text-center text-muted-foreground italic mb-1">Omdiktet av Arne Næss</p>

      <p className="font-serif text-lg text-center text-muted-foreground mb-8">1995</p>

      <p className="font-serif text-base text-foreground leading-relaxed mb-8">
        Dette essayet ble først publisert i <em>The New York Times</em> og <em>The Washington Post</em> den 19.
        september 1995. Det ble utgitt under pseudonymet FC, for <em>Freedom Club</em>.
      </p>

      <hr className="border-foreground mb-10" />

      <div className="font-serif text-base leading-relaxed">
        <ReactMarkdown
          components={markdownComponents}
          rehypePlugins={[rehypeRaw]}
        >
          {processText(initialText)}
        </ReactMarkdown>
      </div>

      <div className="mt-16 text-center text-xs text-muted-foreground/40 font-serif">
        laga av{" "}
        <a
          href="https://github.com/lukketsvane/naess-kaczynski-"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          @lukketsvane
        </a>{" "}
        med &lt;3.{" "}
        <button onClick={downloadPDF} className="hover:underline">
          last ned pdf her
        </button>
      </div>
      </div>
    </>
  )
}

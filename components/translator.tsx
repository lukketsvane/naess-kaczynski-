"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, RotateCcw } from "lucide-react"
import ReactMarkdown from "react-markdown"

export function Translator() {
  const [status, setStatus] = useState<"idle" | "loading" | "translating" | "done" | "error">("loading")
  const [translatedText, setTranslatedText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const checkCache = async () => {
      try {
        const response = await fetch("/api/translate")
        const data = await response.json()

        if (data.cached && data.text) {
          setTranslatedText(data.text)
          if (data.complete) {
            setStatus("done")
          } else {
            setStatus("error")
            setError("Trykk enter for å fortsette.")
          }
        } else {
          setStatus("idle")
        }
      } catch {
        setStatus("idle")
      }
    }
    checkCache()
  }, [])

  const startTranslation = useCallback(
    async (resume = false) => {
      if (status === "translating") return

      const resumeLen = resume ? translatedText.length : 0
      setStatus("translating")
      setTranslatedText("")
      setError(null)

      abortControllerRef.current = new AbortController()

      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeFrom: resumeLen }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          throw new Error("Translation failed")
        }

        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          const data = await response.json()
          if (data.complete) {
            setTranslatedText(data.text)
            setStatus("done")
            return
          }
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error("No response body")
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          if (chunk.includes("[FEIL:")) {
            setError("Tilkoblingen ble avbrutt. Trykk enter for å fortsette.")
            setStatus("error")
            // Still append the text we got
            setTranslatedText((prev) => prev + chunk.split("[FEIL:")[0])
            return
          }

          setTranslatedText((prev) => prev + chunk)
        }

        setStatus("done")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
        setError("Tilkoblingen ble avbrutt. Trykk enter for å fortsette.")
        setStatus("error")
      }
    },
    [status, translatedText.length],
  )

  const resetTranslation = useCallback(() => {
    setTranslatedText("")
    setStatus("idle")
    setError(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD/CTRL + P for PDF download
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault()
        if (translatedText) {
          downloadPDF()
        }
        return
      }

      if (e.key === "Enter") {
        if (status === "idle") {
          startTranslation(false)
        } else if (status === "error") {
          startTranslation(true)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [status, startTranslation, translatedText]) // Added translatedText dependency for PDF download

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
    const subtitle = "Oversatt av Arne Næss"
    const subtitleWidth = doc.getTextWidth(subtitle)
    doc.text(subtitle, (210 - subtitleWidth) / 2, 42)

    doc.setFont("helvetica", "normal")
    doc.text("1995", (210 - doc.getTextWidth("1995")) / 2, 52)

    doc.setLineWidth(0.5)
    doc.line(20, 70, 190, 70)

    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    
    const splitText = doc.splitTextToSize(translatedText, 170)
    let y = 85
    const pageHeight = doc.internal.pageSize.height
    const marginBottom = 20
    const lineHeight = 6

    splitText.forEach((line: string) => {
      if (y + lineHeight > pageHeight - marginBottom) {
        doc.addPage()
        y = 20 
      }
      doc.text(line, 20, y)
      y += lineHeight
    })

    doc.save("det-industrielle-samfunnet.pdf")
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      {/* Header */}
      <h1 className="font-serif text-3xl md:text-4xl font-bold text-center text-foreground mb-6 text-balance">
        Det industrielle samfunnet og dets framtid
      </h1>

      <p className="font-serif text-lg text-center text-muted-foreground italic mb-1">Oversatt av Arne Næss</p>

      <p className="font-serif text-lg text-center text-muted-foreground mb-8">1995</p>

      {/* Intro text */}
      <p className="font-serif text-base text-foreground leading-relaxed mb-8">
        Dette essayet ble først publisert i <em>The New York Times</em> og <em>The Washington Post</em> den 19.
        september 1995. Det ble utgitt under pseudonymet FC, for <em>Freedom Club</em>. Versjonen du leser her er skrevet ved bruk av en språkmodell, med Arne Næss sin stil som mål. Trykk på enter for å starte
      </p>

      {/* Divider */}
      <hr className="border-foreground mb-10" />

      {/* Content area */}
      <div className="min-h-[200px]">
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {status === "idle" && (
          <p className="font-serif text-sm text-foreground/60 italic">
          </p>
        )}

        {status === "translating" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <span className="text-sm"></span>
            </div>
            <div className="font-serif text-base leading-relaxed">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>,
                  p: ({ children }) => {
                    const content = String(children);
                    // Check if it's an all-caps title that wasn't caught as a header
                    if (content.length > 3 && content === content.toUpperCase() && !content.includes('\n')) {
                      return <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>
                    }
                    return <p className="mb-4 leading-relaxed">{children}</p>
                  },
                }}
              >
                {translatedText.replace(/\n{3,}/g, '\n\n')}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            {translatedText && (
              <div className="font-serif text-base leading-relaxed">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>,
                    p: ({ children }) => {
                      const content = String(children);
                       if (content.length > 3 && content === content.toUpperCase() && !content.includes('\n')) {
                        return <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>
                      }
                      return <p className="mb-4 leading-relaxed">{children}</p>
                    },
                  }}
                >
                  {translatedText.replace(/\n{3,}/g, '\n\n')}
                </ReactMarkdown>
              </div>
            )}
            <p className="font-serif text-sm text-amber-600 italic">
            </p>
            {error && <p className="text-sm text-muted-foreground text-center">{error}</p>}
          </div>
        )}

        {status === "done" && (
          <div className="space-y-6">
            <div className="font-serif text-base leading-relaxed">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-bold mt-6 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-0">{children}</h3>,
                  p: ({ children }) => {
                      const content = String(children);
                       if (content.length > 3 && content === content.toUpperCase() && !content.includes('\n')) {
                        return <h3 className="text-lg font-bold mt-4 mb-0 text-primary">{children}</h3>
                      }
                      return <p className="mb-4 leading-relaxed">{children}</p>
                  },
                }}
              >
                {translatedText.replace(/\n{3,}/g, '\n\n')}
              </ReactMarkdown>
            </div>


            <div className="flex gap-3">
              <Button onClick={downloadPDF} className="gap-2">
                <Download className="h-4 w-4" />
                Last ned PDF
              </Button>
              <Button onClick={resetTranslation} variant="outline" className="gap-2 bg-transparent">
                <RotateCcw className="h-4 w-4" />
                Start på nytt
              </Button>
            </div>
          </div>
        )}
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
  )
}

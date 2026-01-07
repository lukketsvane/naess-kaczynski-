import { GoogleGenAI } from "@google/genai"
import fs from "fs" // needs fs promises? fs is usually not available in edge, but default Node runtime is fine.
import path from "path"
import yaml from "js-yaml"

export const maxDuration = 60; // Allow longer timeouts for translation
export const dynamic = 'force-dynamic';


const BOOK_PATH = path.join(process.cwd(), 'public', 'book.yaml');
const INSTRUCTION_PATH = path.join(process.cwd(), 'public', 'arne_naess_system_instruction.md');
const PROGRESS_PATH = path.join(process.cwd(), 'translation_progress.json');
const MODEL = "gemini-3-pro-preview"

interface TranslationProgress {
  lastCompletedPage: string | null;
  translations: Record<string, string>;
  isComplete: boolean;
  paragraphIndex?: Record<string, string>;
  sections?: Record<string, string>;
  notes?: string;
}

function getSortedPages(poemsDict: Record<string, string>) {
  return Object.keys(poemsDict).sort((a, b) => {
    const numA = parseInt(a.replace('Page ', ''));
    const numB = parseInt(b.replace('Page ', ''));
    return numA - numB;
  });
}

function loadProgress(): TranslationProgress {
  try {
    if (fs.existsSync(PROGRESS_PATH)) {
      const data = fs.readFileSync(PROGRESS_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading progress file:", error);
  }
  return { lastCompletedPage: null, translations: {}, isComplete: false };
}

function saveProgress(progress: TranslationProgress) {
  try {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error("Error writing progress file:", error);
  }
}

function getFullTranslatedText(progress: TranslationProgress, sortedKeys: string[]): string {
  let text = "";
  for (const key of sortedKeys) {
    if (progress.translations[key]) {
      text += progress.translations[key];
    }
  }
  return text;
}


export async function GET() {
  const progress = loadProgress();
  let bookData: any;
  try {
     const fileContents = fs.readFileSync(BOOK_PATH, 'utf8');
     bookData = yaml.load(fileContents);
  } catch (e) {
      return Response.json({ cached: false, text: "", complete: false, error: "Could not load book.yaml" });
  }

  const pages = bookData['Industrial Society and Its Future']?.dict || bookData.dict;
  if (!pages) {
    return Response.json({ cached: false, text: "", complete: false, error: "Invalid book format" });
  }
  const sortedKeys = getSortedPages(pages);
  const text = getFullTranslatedText(progress, sortedKeys);
  
  return Response.json({
    cached: text.length > 0,
    text: text,
    complete: progress.isComplete,
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const resume = body.resumeFrom !== undefined ? body.resumeFrom > 0 : false;

  let progress = loadProgress();
  
  // If not resuming, reset progress
  if (!resume) {
      // Preserve metadata if present
      const { paragraphIndex, sections, notes } = progress;
      progress = { 
          lastCompletedPage: null, 
          translations: {}, 
          isComplete: false,
          paragraphIndex,
          sections,
          notes
      };
      saveProgress(progress);
  }

  let bookData: any;
  try {
    const fileContents = fs.readFileSync(BOOK_PATH, 'utf8');
    bookData = yaml.load(fileContents);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to load book.yaml" }), { status: 500 });
  }

  const pages = bookData['Industrial Society and Its Future']?.dict || bookData.dict;
  if (!pages) {
     return new Response(JSON.stringify({ error: "Invalid book format: missing dict" }), { status: 500 });
  }
  const sortedKeys = getSortedPages(pages);

  let systemInstruction = "";
  try {
    if (fs.existsSync(INSTRUCTION_PATH)) {
       systemInstruction = fs.readFileSync(INSTRUCTION_PATH, 'utf8');
       // Append technical formatting instructions that are not in the file
       systemInstruction += `

VIKTIGE TEKNISKE INSTRUKSJONER:
1. Hvis en overskrift er skrevet med KUN STORE BOKSTAVER (f.eks. "INNLEDNING"), behold den slik, men sett '## ' foran den slik at den blir en Markdown-overskrift.
2. Merk kvart nummerert punkt med overskrift som '## §1', '## §2' osv.
3. Punkt som går over fleire sider skal merkast med '' etter nummeret (f.eks. '## §16 ').
4. Ikke legg til mer enn ett linjeskift mellom avsnitt. Unngå store mellomrom.
5. VIKTIG: IKKE skriv innledende tekst som "Her er oversettelsen" eller "I Arne Næss sin stil". Start rett på selve oversettelsen. Kun oversett teksten.`;
    } else {
        console.warn("System instruction file not found:", INSTRUCTION_PATH);
        systemInstruction = "Du er en oversetter. Oversett til norsk i stilen til Arne Næss."; // Fallback
    }
  } catch (error) {
      console.error("Error reading system instruction:", error);
      systemInstruction = "Du er en oversetter. Oversett til norsk i stilen til Arne Næss."; // Fallback
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // First, yield everything we already have
        for (const key of sortedKeys) {
             if (progress.translations[key]) {
                 controller.enqueue(encoder.encode(progress.translations[key]));
             } else {
                 // This page needs translation.
                 // We stop the loop of "already translated" and start processing this and subsequent pages.
                 break; 
             }
        }
        
        // Find where to start
        let startIndex = 0;
        if (progress.lastCompletedPage) {
            startIndex = sortedKeys.indexOf(progress.lastCompletedPage) + 1;
        }

        if (startIndex >= sortedKeys.length) {
             progress.isComplete = true;
             saveProgress(progress);
             controller.close();
             return;
        }

        for (let i = startIndex; i < sortedKeys.length; i++) {
            const pageKey = sortedKeys[i];
            const pageContent = pages[pageKey];
            
            // Skip empty pages or very short content if appropriate, or translate them.
            if (!pageContent || !pageContent.trim()) {
                progress.translations[pageKey] = "\n";
                progress.lastCompletedPage = pageKey;
                saveProgress(progress);
                controller.enqueue(encoder.encode("\n"));
                continue;
            }

            // Translate this page
             const response = await ai.models.generateContentStream({
                model: MODEL,
                contents: [
                    {
                    role: "user",
                    parts: [
                        {
                        text: `Omset følgende tekst (side ${pageKey}) til norsk i Arne Næss sin stil. Behold strukturen. Skriv naturlig og flytende. IKKE inkluder introduksjonstekst, start rett på oversettelsen.\n\n${pageContent}`,
                        },
                    ],
                    },
                ],
                config: {
                    systemInstruction: systemInstruction,
                    thinkingConfig: {
                        thinkingBudget: 2000, 
                    },
                },
            });

            let pageTranslation = "";
            for await (const chunk of response) {
                const text = chunk.text;
                if (text) {
                    pageTranslation += text;
                    controller.enqueue(encoder.encode(text));
                }
            }
            
            // Page done. Save progress.
            progress.translations[pageKey] = pageTranslation;
            progress.lastCompletedPage = pageKey;
            saveProgress(progress);
        }

        progress.isComplete = true;
        saveProgress(progress);
        controller.close()

      } catch (error) {
        console.error("Translation error:", error)
        controller.enqueue(
          encoder.encode(
            `\n\n[FEIL: ${error instanceof Error ? error.message : "Ukjent feil"} - Trykk enter for å fortsette]`,
          ),
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  })
}

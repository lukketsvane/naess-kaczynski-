import { Translator } from "@/components/translator"
import fs from "fs"
import path from "path"

export default function Home() {
  // Les teksten direkte på server-side
  const filePath = path.join(process.cwd(), "translation_progress.json")
  const fileContent = fs.readFileSync(filePath, "utf-8")
  const data = JSON.parse(fileContent)

  const text = Object.keys(data.translations)
    .sort((a, b) => {
      const numA = parseInt(a.replace("Page ", ""))
      const numB = parseInt(b.replace("Page ", ""))
      return numA - numB
    })
    .map((key) => data.translations[key])
    .join("\n\n")

  return (
    <main className="min-h-screen bg-background">
      <Translator initialText={text} />
    </main>
  )
}

type VerseReference = {
  book: string; // slug que usa la API (en inglés, ej. "proverbs")
  chapter: number;
  verse: number;
  label: string; // cómo se muestra, en español (ej. "Proverbios 16:3")
};

// Curamos las referencias para evitar caer en genealogías o pasajes poco
// significativos — la API solo nos da el TEXTO, nosotros elegimos CUÁL.
const VERSE_REFERENCES: VerseReference[] = [
  { book: "proverbs", chapter: 16, verse: 3, label: "Proverbios 16:3" },
  { book: "philippians", chapter: 4, verse: 13, label: "Filipenses 4:13" },
  { book: "psalms", chapter: 23, verse: 1, label: "Salmos 23:1" },
  { book: "isaiah", chapter: 41, verse: 10, label: "Isaías 41:10" },
  { book: "jeremiah", chapter: 29, verse: 11, label: "Jeremías 29:11" },
  { book: "psalms", chapter: 46, verse: 1, label: "Salmos 46:1" },
  { book: "romans", chapter: 8, verse: 28, label: "Romanos 8:28" },
  { book: "proverbs", chapter: 3, verse: 5, label: "Proverbios 3:5" },
  { book: "joshua", chapter: 1, verse: 9, label: "Josué 1:9" },
  { book: "psalms", chapter: 121, verse: 1, label: "Salmos 121:1" },
];

const FALLBACK_TEXT: Record<string, string> = {
  "Proverbios 16:3": "Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.",
  "Filipenses 4:13": "Todo lo puedo en Cristo que me fortalece.",
  "Salmos 23:1": "Jehová es mi pastor; nada me faltará.",
};

type DailyVerse = {
  text: string;
  label: string;
};

function pickReferenceForToday(): VerseReference {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const index = dayOfYear % VERSE_REFERENCES.length;
  return VERSE_REFERENCES[index];
}

export async function getDailyVerse(): Promise<DailyVerse> {
  const reference = pickReferenceForToday();
  const url = `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/es-rv09/books/${reference.book}/chapters/${reference.chapter}/verses/${reference.verse}.json`;

  try {
    const response = await fetch(url, {
      // Revalida una vez al día (86400s) para no pegarle a la API en cada visita
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error(`Bible API respondió ${response.status}`);
    }

    const data = await response.json();
    const text = typeof data.text === "string" ? data.text.trim() : "";

    if (!text) {
      throw new Error("Respuesta sin texto");
    }

    return { text, label: reference.label };
  } catch (error) {
    console.error("[bible/daily-verse] No se pudo obtener el versículo externo", {
      message: error instanceof Error ? error.message : "Error desconocido",
      reference: reference.label,
    });

    return {
      text: FALLBACK_TEXT[reference.label] ?? "Todo lo puedo en Cristo que me fortalece.",
      label: reference.label,
    };
  }
}
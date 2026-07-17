type DailyVerse = {
  text: string;
  label: string;
};

// El login no debe depender de un servicio externo para poder renderizar.
const DAILY_VERSES: DailyVerse[] = [
  {
    label: "Proverbios 16:3",
    text: "Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.",
  },
  {
    label: "Filipenses 4:13",
    text: "Todo lo puedo en Cristo que me fortalece.",
  },
  {
    label: "Salmos 23:1",
    text: "Jehová es mi pastor; nada me faltará.",
  },
  {
    label: "Isaías 41:10",
    text: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios.",
  },
  {
    label: "Jeremías 29:11",
    text: "Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová.",
  },
  {
    label: "Salmos 46:1",
    text: "Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.",
  },
  {
    label: "Romanos 8:28",
    text: "A los que aman a Dios, todas las cosas les ayudan a bien.",
  },
  {
    label: "Proverbios 3:5",
    text: "Fíate de Jehová de todo tu corazón, y no te apoyes en tu propia prudencia.",
  },
  {
    label: "Josué 1:9",
    text: "Esfuérzate y sé valiente; no temas ni desmayes.",
  },
  {
    label: "Salmos 121:1",
    text: "Alzaré mis ojos a los montes; ¿de dónde vendrá mi socorro?",
  },
];

export async function getDailyVerse(): Promise<DailyVerse> {
  const startOfYear = new Date(new Date().getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((Date.now() - startOfYear) / 86_400_000);

  return DAILY_VERSES[dayOfYear % DAILY_VERSES.length];
}

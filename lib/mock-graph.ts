import type { FactGraph } from "./graph-types";

// Hardcoded mock for P0 — the El Mencho / Guadalajara-airport demo story, shaped exactly
// like the pipeline (P1) will emit. Lets us build the renderer before the backend exists.
// NOTE: evidence here is illustrative, not live-retrieved.
export const MOCK_GRAPH: FactGraph = {
  source: {
    id: "src",
    verdict: "conflicting",
    text: "ÚLTIMA HORA: Tras la muerte de 'El Mencho' el 22 de febrero, comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses. Mientras tanto, Puerto Vallarta arde en llamas.",
  },
  claims: [
    {
      id: "c1",
      original: "Tras la muerte de 'El Mencho' el 22 de febrero",
      text: "Nemesio Oseguera Cervantes ('El Mencho'), leader of the CJNG, died on or around 22 February 2026.",
      verdict: "supported",
      rationale: "Multiple news-wire outlets report the death; consistent dates.",
      checkable: true,
    },
    {
      id: "c2",
      original:
        "comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses",
      text: "In February 2026, armed CJNG members seized Guadalajara International Airport and are holding US tourists hostage.",
      verdict: "refuted",
      rationale: "Mexican authorities publicly denied any airport takeover or hostages.",
      checkable: true,
    },
    {
      id: "c3",
      original: "Puerto Vallarta arde en llamas",
      text: "In February 2026, Puerto Vallarta is engulfed in flames.",
      verdict: "nei",
      rationale:
        "Claim rests on imagery this text-only build cannot verify (provenance/synthetic media).",
      checkable: false,
    },
  ],
  questions: [
    {
      id: "q1",
      claimId: "c1",
      text: "Did Nemesio Oseguera 'El Mencho' die in February 2026?",
      status: "answered",
    },
    {
      id: "q2",
      claimId: "c2",
      text: "Did the CJNG seize Guadalajara International Airport in February 2026?",
      status: "answered",
    },
    {
      id: "q3",
      claimId: "c2",
      text: "Were US tourists taken hostage at Guadalajara airport?",
      status: "answered",
    },
    {
      id: "q4",
      claimId: "c3",
      text: "Is there primary evidence Puerto Vallarta was on fire in February 2026?",
      status: "answered",
    },
  ],
  evidence: [
    {
      id: "e1",
      questionId: "q1",
      title: "Última hora: confirman la muerte de Nemesio Oseguera, 'El Mencho'",
      url: "https://cnnespanol.cnn.com/mexico/live-news/ultima-hora-nemesio-mencho-oseguera",
      domain: "cnnespanol.cnn.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=cnnespanol.cnn.com&sz=64",
      publishedDate: "2026-02-22",
      passage:
        "Autoridades federales confirmaron la muerte de Nemesio Oseguera Cervantes, alias 'El Mencho', líder del CJNG.",
      stance: "supports",
      reliability: "high",
      sourceType: "primary",
      stanceConfidence: 0.92,
    },
    {
      id: "e2",
      questionId: "q2",
      title: "¿Sicarios en el Aeropuerto de Guadalajara? La versión de las autoridades",
      url: "https://www.infobae.com/mexico/2026/02/22/sicarios-en-el-aeropuerto-de-guadalajara-la-version-de-las-autoridades",
      domain: "infobae.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=infobae.com&sz=64",
      publishedDate: "2026-02-22",
      passage:
        "La Fiscalía y la Guardia Nacional desmintieron que existiera una toma del aeropuerto; las operaciones continuaron con normalidad.",
      stance: "refutes",
      reliability: "high",
      sourceType: "primary",
      stanceConfidence: 0.88,
    },
    {
      id: "e3",
      questionId: "q3",
      title: "Autoridades niegan secuestro de turistas en Jalisco",
      url: "https://www.infobae.com/mexico/2026/02/23/autoridades-niegan-secuestro-de-turistas",
      domain: "infobae.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=infobae.com&sz=64",
      publishedDate: "2026-02-23",
      passage:
        "No existe reporte alguno de turistas estadounidenses retenidos; la versión circuló únicamente en redes sociales.",
      stance: "refutes",
      reliability: "medium",
      sourceType: "primary",
      stanceConfidence: 0.8,
    },
    // q4 deliberately has NO usable primary evidence → claim c3 resolves to NEI.
  ],
};

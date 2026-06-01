// Pre-captured known-good runs for the demo chips — the "wifi-death" fallback
// (PLAN.md top risk). If live /api/check fails AND the source text matches a chip
// exactly, the workbench replays the cached graph as a simulated stream so the
// "watch it think" demo still works offline. Captured de novo (zero fact-checkers).
// Regenerate by running the chips against a live server and re-exporting.
import type { FactGraph } from "./graph-types";

export const DEMO_CACHE: Record<string, FactGraph> = {
  "ÚLTIMA HORA: Tras la muerte de 'El Mencho' el 22 de febrero, comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses. Mientras tanto, Puerto Vallarta arde en llamas.":
    {
      source: {
        id: "src",
        text: "ÚLTIMA HORA: Tras la muerte de 'El Mencho' el 22 de febrero, comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses. Mientras tanto, Puerto Vallarta arde en llamas.",
        verdict: "conflicting",
      },
      claims: [
        {
          id: "c1",
          text: "CJNG leader 'El Mencho' (Nemesio Oseguera Cervantes) died on 22 February 2026.",
          original: "la muerte de 'El Mencho' el 22 de febrero",
          checkable: true,
          verdict: "supported",
          rationale: "Supported by bbc.co.uk, bbc.com and others.",
        },
        {
          id: "c2",
          text: "Armed CJNG commandos seized Guadalajara International Airport around 22 February 2026 and are holding American tourists hostage.",
          original:
            "comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses",
          checkable: true,
          verdict: "refuted",
          rationale:
            "Refuted by proceso.com.mx and cobertura360.mx (e.g. an official denial or contradicting report).",
        },
        {
          id: "c3",
          text: "Puerto Vallarta, Mexico, is burning (under large-scale fire or violent attack) around 22 February 2026.",
          original: "Puerto Vallarta arde en llamas",
          checkable: false,
          verdict: "nei",
          rationale: "Rests on imagery or media provenance this text-only build cannot verify.",
        },
      ],
      questions: [
        {
          id: "c1-q1",
          claimId: "c1",
          text: "Has Nemesio Oseguera Cervantes ('El Mencho'), leader of the Jalisco New Generation Cartel (CJNG), been reported dead as of or around 22 February 2026?",
          status: "answered",
        },
        {
          id: "c1-q2",
          claimId: "c1",
          text: "Have Mexican or U.S. authorities officially confirmed the death of CJNG leader Nemesio Oseguera Cervantes ('El Mencho') on or around 22 February 2026?",
          status: "answered",
        },
        {
          id: "c2-q1",
          claimId: "c2",
          text: "Were there any confirmed reports or official statements from Mexican authorities or Guadalajara International Airport officials regarding a CJNG armed seizure of the airport around February 22, 2026?",
          status: "answered",
        },
        {
          id: "c2-q2",
          claimId: "c2",
          text: "Did the U.S. Embassy in Mexico or U.S. government agencies issue any alerts or statements about American tourists being held hostage at Guadalajara International Airport in February 2026?",
          status: "answered",
        },
      ],
      evidence: [
        {
          id: "c2-q1-e1",
          questionId: "c2-q1",
          title:
            "No hay afectación a las operaciones del aeropuerto de Guadalajara; es “psicosis de pasajeros”: GAP - Proceso",
          url: "https://www.proceso.com.mx/nacional/2026/2/22/no-hay-afectacion-las-operaciones-del-aeropuerto-de-guadalajara-es-psicosis-de-pasajeros-gap-368932.html",
          domain: "proceso.com.mx",
          faviconUrl:
            "https://www.proceso.com.mx/u/plantillas/p/proceso/imgs/favicons/apple-touch-icon.png",
          publishedDate: "2026-02-22",
          passage:
            "No hay afectación a las operaciones del aeropuerto de Guadalajara; es “psicosis de pasajeros”: GAP - Proceso\n[...]\n# No hay afectación a las operaciones del aeropuerto de Guadalajara; es “psicosis de pasajeros”: GAP\n[...]\nEl GAP manifestó que no se han registrado incidentes al interior de las instalaciones ni existe riesgo para pasajeros, colaboradores o visitantes.\n[...]\ndomingo, 22 de febrero de 2026 · 14:26\n[...]\nGUADALAJARA, JAL. (apro).- El Grupo Aeropuerto del Pacífico (GAP) descartó afectaciones a la operación del aeropuerto internacional de Guadalajara, por los narcobloqueos que afectan distintos puntos de Jalisco ante el abatimiento de Nemesio Oseguera Cervantes, “El Mencho”.",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c2-q1-e2",
          questionId: "c2-q1",
          title:
            "El operativo de captura del líder del Cártel Jalisco Nueva Generación no impactó a los aeropuertos de Guadalajara y Puerto Vallarta • Cobertura 360",
          url: "https://cobertura360.mx/2026/02/22/seguridad/el-operativo-de-captura-del-lider-del-cartel-jalisco-nueva-generacion-no-impacto-a-los-aeropuertos-de-guadalajara-y-puerto-vallarta/",
          domain: "cobertura360.mx",
          faviconUrl:
            "https://editorial.cobertura360.mx/wp-content/uploads/2019/06/favicon-cobertura360.png",
          publishedDate: "2026-02-22",
          passage:
            "El operativo de captura del líder del Cártel Jalisco Nueva Generación no impactó a los aeropuertos de Guadalajara y Puerto Vallarta • Cobertura 360\n[...]\nGrupo Aeroportuario del Pacífico (GAP) informó que la violencia y el crimen desatados por el operativo de captura de Nemesio El Mencho Rubén Oseguera Cervantes, líder y fundador del Cártel Jalisco Nueva Generación, no impactaron la operación interna de las terminales ni la seguridad dentro de las instalaciones del Aeropuerto Internacional de Guadalajara y del Aeropuerto Internacional de Puerto Vallarta.\n[...]\nLos aeropuertos de Guadalajara y Puerto Vallarta están bajo la protección de los elementos de la Guardia Nacional (GN) y de la Secretaría de la Defensa Nacional (SEDENA), como parte de las acciones de coordinación permanente con las autoridade",
          stance: "refutes",
          reliability: "medium",
          sourceType: "secondary",
          stanceConfidence: 0.93,
        },
        {
          id: "c1-q1-e1",
          questionId: "c1-q1",
          title:
            "Mexico's most wanted drug lord 'El Mencho' killed in military operation - BBC News",
          url: "https://www.bbc.co.uk/news/articles/cy4wywnrdd8o",
          domain: "bbc.co.uk",
          faviconUrl:
            "https://static.files.bbci.co.uk/core/website/assets/static/icons/favicon/news/favicon-32.5cf4e6db02.png",
          publishedDate: "2026-02-22",
          passage:
            "Mexico's most wanted drug lord 'El Mencho' killed in military operation - BBC News\n[...]\nNemesio Oseguera Cervantes, known as 'El Mencho', was leader of the Jalisco New Generation (CJNG) drug cartel\n[...]\n22 February 2026\n[...]\n23 February\n[...]\n026\n[...]\nMexico's most wanted man and the leader of the feared Jalisco New Generation (CJNG) drug cartel has been killed during a security operation to arrest him, the defence ministry has said.\n[...]\nNemesio Oseguera Cervantes, known as \"El Mencho\", died on Sunday as he was being taken to the capital Mexico City, after being seriously injured in clashes between his supporters and the army.\n[...]\nFour CJNG members were killed in the town of Tapalpa, the central-western Jalisco state. Three army personnel were also in",
          stance: "supports",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c1-q1-e2",
          questionId: "c1-q1",
          title: "Mexico's most wanted drug lord 'El Mencho' killed in military operation",
          url: "https://www.bbc.com/news/articles/cy4wywnrdd8o",
          domain: "bbc.com",
          faviconUrl:
            "https://static.files.bbci.co.uk/bbcdotcom/web/20260527-122213-f92e6ec078-web-3.7.0-4/favicon-32x32.png",
          publishedDate: "2026-02-22",
          passage:
            "Mexico's most wanted drug lord 'El Mencho' killed in military operation\n[...]\n# Mexico's most wanted drug lord 'El Mencho' killed in military operation\n[...]\n23 February 2026\n[...]\nNemesio Oseguera Cervantes, known as 'El Mencho', was leader of the Jalisco New Generation (CJNG) drug cartel\n[...]\nMexico's most wanted man and the leader of the feared Jalisco New Generation (CJNG) drug cartel has been killed during a security operation to arrest him, the defence ministry has said.\n[...]\nNemesio Oseguera Cervantes, known as \"El Mencho\", died on Sunday as he was being taken to the capital Mexico City, after being ser",
          stance: "supports",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c1-q2-e1",
          questionId: "c1-q2",
          title:
            "White House confirms providing ‘intelligence support’ to Mexican govt for operation that killed cartel leader El Mencho - The Hindu",
          url: "https://www.thehindu.com/news/international/white-house-confirms-providing-intelligence-support-to-mexican-govt-for-operation-that-killed-cartel-leader-el-mencho/article70665679.ece",
          domain: "thehindu.com",
          faviconUrl: "https://www.thehindu.com/favicon.ico",
          publishedDate: "2026-02-23",
          passage:
            "White House confirms providing ‘intelligence support’ to Mexican govt for operation that killed cartel leader El Mencho - The Hindu\n[...]\n# White House confirms providing ‘intelligence support’ to Mexican govt for operation that killed cartel leader El Mencho\n[...]\n## In a post on X, Karoline Leavitt said El Mencho was a top target for both the Mexican and U.S. governments\n[...]\nUpdated - February 23, 202",
          stance: "supports",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.92,
        },
        {
          id: "c1-q2-e2",
          questionId: "c1-q2",
          title: "Mexico's most wanted drug lord 'El Mencho' killed in military operation",
          url: "https://www.bbc.com/news/articles/cy4wywnrdd8o",
          domain: "bbc.com",
          faviconUrl:
            "https://static.files.bbci.co.uk/bbcdotcom/web/20260527-122213-f92e6ec078-web-3.7.0-4/favicon-32x32.png",
          publishedDate: "2026-02-22",
          passage:
            "# Mexico's most wanted drug lord 'El Mencho' killed in military operation\n[...]\n23 February 2026\n[...]\nNemesio Oseguera Cervantes, known as 'El Mencho', was leader of the Jalisco New Generation (CJNG) drug cartel\n[...]\nMexico's most wanted man and the leader of the feared Jalisco New Generation (CJNG) drug cartel has been killed during a security operation to arrest him, the defence ministry has said.\n[...]\nNemesio Oseguera Cervantes, known as \"El Mencho\", died on Sunday as he was being taken to the capital Mexico City, after being ser",
          stance: "supports",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.97,
        },
        {
          id: "c2-q2-e1",
          questionId: "c2-q2",
          title:
            "Security Alert Update 7: Widespread (Mexico), Ongoing Security Operations (Feb. 24)",
          url: "https://www.osac.gov/Content/Report/90be5f43-618e-497f-b3c2-297c4a960c21",
          domain: "osac.gov",
          faviconUrl: "https://www.google.com/s2/favicons?domain=osac.gov&sz=64",
          passage:
            "Security Alert Update 7: Widespread (Mexico), Ongoing Security Operations (Feb. 24)\n[...]\n2/24/2026 | Report Alerts\n[...]\n*OSAC does not issue alerts. These notices are sourced from the issuing U.S. Embassy & Consulate\n[...]\n# Security Alert Update 7: Widespread (Mexico), Ongoing Security Operations (Feb. 24)\n[...]\nBy U.S. Mission to Mexico\n[...]\nFebruary 24, 2026\n[...]\nLocation: Mexico\n[...]\nAll restrictions related to the events of February 22 on U.S. government staff in Tijuana (Baja California) and Monterrey (Nuevo Leon) have been lifted.\n[...]\nU.S. government staff in Guadalajara (Jalisco), Puerto Vallarta (Jalisco/Nayarit), and Ciudad Guzman (Jalisco) are subject to a curfew during ni",
          stance: "contextualizes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.72,
        },
        {
          id: "c2-q2-e2",
          questionId: "c2-q2",
          title:
            "Security Alert Update 3: Widespread (Mexico), Ongoing Security Operations - Shelter in Place",
          url: "https://www.osac.gov/Content/Report/24d981d6-a749-40e9-8409-29783bf471d2",
          domain: "osac.gov",
          faviconUrl: "https://www.google.com/s2/favicons?domain=osac.gov&sz=64",
          passage:
            "Security Alert Update 3: Widespread (Mexico), Ongoing Security Operations - Shelter in Place\n[...]\nOSAC Bureau of Diplomatic Security U.S. Department of State\n[...]\n2/22/2026 | Report Alerts\n[...]\n*OSAC does not issue alerts. These notices are sourced from the issuing U.S. Embassy & Consulate\n[...]\n# Security Alert Update 3: Widespread (Mexico), Ongoing Security Operations - Shelter in Place\n[...]\nBy U.S. Mission to Mexico\n[...]\nFebruary 22, 2026\n[...]\nLocations: Widespread, including Jalisco State (including Puerto Vallarta, Chapala, and Guadalajara), Baja California State (including Tijuana, Tecate, and Ensenada), Quintana Roo State (including Cancun, Cozumel, Playa del Carmen, and Tulum), Nayarit State (including the Nuevo Nayarit/Nuevo Vallarta area",
          stance: "contextualizes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.68,
        },
      ],
    },
  "In Springfield, they're eating the dogs. The people that came in, they're eating the cats, they're eating the pets of the people that live there.":
    {
      source: {
        id: "src",
        text: "In Springfield, they're eating the dogs. The people that came in, they're eating the cats, they're eating the pets of the people that live there.",
        verdict: "refuted",
      },
      claims: [
        {
          id: "c1",
          text: "Immigrants who arrived in Springfield, Ohio are eating dogs belonging to local residents.",
          original:
            "In Springfield, they're eating the dogs. The people that came in, they're eating the cats, they're eating the pets of the people that live there.",
          checkable: true,
          verdict: "refuted",
          rationale:
            "Refuted by nbcnews.com, cnn.com and others (e.g. an official denial or contradicting report).",
        },
        {
          id: "c2",
          text: "Immigrants who arrived in Springfield, Ohio are eating cats belonging to local residents.",
          original:
            "they're eating the cats, they're eating the pets of the people that live there.",
          checkable: true,
          verdict: "refuted",
          rationale:
            "Refuted by nbcnews.com, bbc.com and others (e.g. an official denial or contradicting report).",
        },
      ],
      questions: [
        {
          id: "c1-q1",
          claimId: "c1",
          text: "Have Springfield, Ohio authorities or law enforcement agencies confirmed any verified incidents of immigrants stealing or eating pets belonging to local residents?",
          status: "answered",
        },
        {
          id: "c1-q2",
          claimId: "c1",
          text: "What did local officials, animal control, or investigative news organizations report about claims that immigrants in Springfield, Ohio were eating dogs or cats owned by residents?",
          status: "answered",
        },
        {
          id: "c2-q1",
          claimId: "c2",
          text: "Have Springfield, Ohio authorities or animal control agencies confirmed reports of immigrants killing or eating residents' pets?",
          status: "answered",
        },
        {
          id: "c2-q2",
          claimId: "c2",
          text: "What evidence, if any, have local officials, law enforcement, or credible news investigations found to support or refute claims of immigrants in Springfield, Ohio eating cats?",
          status: "answered",
        },
      ],
      evidence: [
        {
          id: "c2-q2-e1",
          questionId: "c2-q2",
          title:
            "Contradicting JD Vance’s claim, Ohio police have no reports of Haitian immigrants harming pets",
          url: "https://www.nbcnews.com/tech/misinformation/jd-vance-ohio-police-no-reports-haitian-immigrants-harming-pets-rcna170271",
          domain: "nbcnews.com",
          faviconUrl:
            "https://nodeassets.nbcnews.com/cdnassets/projects/ramen/favicon/nbcnews/all-other-sizes-PNG.ico/favicon.ico",
          publishedDate: "2024-09-09",
          passage:
            "Contradicting JD Vance’s claim, Ohio police have no reports of Haitian immigrants harming pets\n[...]\nPolice in Springfield, Ohio, said Monday they had received no credible reports of immigrants harming pets, contradicting a claim by Republican vice presidential nominee Sen. JD Vance.\n[...]\nThe senator from Ohio, as well as other Republican lawmakers and several conservative commentators, have in recent days asserted without evidence that the arrival of thousands of immigrants from Haiti had created chaos in",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c2-q2-e2",
          questionId: "c2-q2",
          title:
            "Donald Trump repeats baseless claim about Haitian immigrants eating cats and dogs in Springfield, Ohio",
          url: "https://www.bbc.com/news/articles/c77l28myezko",
          domain: "bbc.com",
          faviconUrl:
            "https://static.files.bbci.co.uk/bbcdotcom/web/20260427-074339-4d487e3684-web-3.2.0-4/apple-touch-icon.png",
          publishedDate: "2024-09-10",
          passage:
            'Donald Trump repeats baseless claim about Haitian immigrants eating cats and dogs in Springfield, Ohio\n[...]\n# Trump repeats baseless claim about Haitian immigrants eating pets\n[...]\nA baseless claim that illegal immigrants from Haiti have been eating domestic pets in a small Ohio city has been repeated by Donald Trump.\n[...]\nDuring ABC\'s presidential debate, Trump said: "In Springfield, they are eating the dogs. The people that came in, they are eating the cats. They’re eating – they are eating the pets of the people that live there."\n[...]\nBut city officials have told',
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c1-q1-e1",
          questionId: "c1-q1",
          title:
            "Contradicting JD Vance’s claim, Ohio police have no reports of Haitian immigrants harming pets",
          url: "https://www.nbcnews.com/tech/misinformation/jd-vance-ohio-police-no-reports-haitian-immigrants-harming-pets-rcna170271",
          domain: "nbcnews.com",
          faviconUrl:
            "https://nodeassets.nbcnews.com/cdnassets/projects/ramen/favicon/nbcnews/all-other-sizes-PNG.ico/favicon.ico",
          publishedDate: "2024-09-09",
          passage:
            "Contradicting JD Vance’s claim, Ohio police have no reports of Haitian immigrants harming pets\n[...]\nPolice in Springfield, Ohio, said Monday they had received no credible reports of immigrants harming pets, contradicting a claim by Republican vice presidential nominee Sen. JD Vance.\n[...]\nThe senator from Ohio, as well as other Republican lawmakers and several conservative commentators, have in recent days asserted without evidence that the arrival of thousands of immigrants from Haiti had created chaos in",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.97,
        },
        {
          id: "c1-q1-e2",
          questionId: "c1-q1",
          title: "What to know about the false rumor targeting Haitian immigrants in Ohio town",
          url: "https://www.cnn.com/2024/09/17/politics/haitian-immigrants-springfield-false-rumor-what-to-know/index.html",
          domain: "cnn.com",
          faviconUrl: "https://www.cnn.com/media/sites/cnn/apple-touch-icon.png",
          publishedDate: "2024-09-17",
          passage:
            "What to know about the false rumor targeting Haitian immigrants in Ohio town | CNN Politics\n[...]\n# What to know about the false rumor targeting Haitian immigrants in Ohio town",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c2-q1-e1",
          questionId: "c2-q1",
          title: "Springfield Police on claims of Haitian crimes: ‘no credible reports’",
          url: "https://www.wdtn.com/as-seen-on-2-news/springfield-police-on-claims-of-haitian-crimes-no-credible-reports/",
          domain: "wdtn.com",
          faviconUrl:
            "https://www.wdtn.com/wp-content/uploads/sites/45/2021/07/cropped-Artboard-1icon-1.png?w=32",
          publishedDate: "2024-09-10",
          passage:
            "Springfield Police on claims of Haitian crimes: ‘no credible reports’ | WDTN.com\nSkip to content\nWDTN.com\n[...]\nToggle MenuOpen Navigation\n[...]\nAs Seen on 2 NEWS\n# Springfield Police on claims of Haitian crimes: ‘no credible reports’\nby:Evan Bales,Alex Pearson\nPosted:Sep 9, 2024 / 11:02 PM EDT\nUpdated:Jun 14, 2025 / 11:55 AM EDT",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c2-q1-e2",
          questionId: "c2-q1",
          title: "JD Vance repeats baseless claims about Haitian immigrants eating pets : NPR",
          url: "https://www.npr.org/2024/09/10/nx-s1-5107320/jd-vance-springfield-ohio-haitians-pets",
          domain: "npr.org",
          faviconUrl: "https://media.npr.org/chrome/favicon/favicon-180x180.png",
          publishedDate: "2024-09-10",
          passage:
            "JD Vance repeats baseless claims about Haitian immigrants eating pets Local police say they've seen no evidence of crimes against pets alleged by Vance and GOP allies. The claims appear to have been spread by a neo-Nazi group before gaining a wider audience online.\n[...]\n#### Vance repeats debunked rumor of Haitians in Springfield OH",
          stance: "refutes",
          reliability: "high",
          sourceType: "secondary",
          stanceConfidence: 0.97,
        },
        {
          id: "c1-q2-e1",
          questionId: "c1-q2",
          title:
            "Police: No local reports of pets being eaten in Springfield, Ohio, despite online claims",
          url: "https://fox59.com/news/national-world/police-no-local-reports-of-pets-being-eaten-in-springfield-ohio-despite-online-claims/",
          domain: "fox59.com",
          faviconUrl:
            "https://fox59.com/wp-content/uploads/sites/21/2024/09/cropped-FOX59_512x512-2.png?w=32",
          publishedDate: "2024-09-11",
          passage:
            "Police: No reports of pets being eaten in Ohio city\nSkip to content\n[...]\nFox 59",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.95,
        },
        {
          id: "c1-q2-e2",
          questionId: "c1-q2",
          title: "Ohio governor reaffirms Haitian immigrants are not eating animals",
          url: "https://www.bbc.com/news/articles/cj35kk42k5vo",
          domain: "bbc.com",
          faviconUrl:
            "https://static.files.bbci.co.uk/bbcdotcom/web/20260527-122213-f92e6ec078-web-3.7.0-4/apple-touch-icon.png",
          publishedDate: "2024-09-12",
          passage:
            "Ohio governor reaffirms Haitian immigrants are not eating animals\n[...]\n# Ohio leaders dismiss claims of migrants eating pets\n[...]\nDonald Trump used the presidential debate to invoke baseless claims about migrants in Springfield, Ohio\n[...]\nLeaders in the US state of Ohio are trying to douse baseless claims that Haitian immigrants in a town there have been eating residents' pets as food.\n[...]\nThe allegations carried in right-wing media were amplified by Donald Trump at his presidential debate with Kamala Harris on Tuesday.",
          stance: "refutes",
          reliability: "high",
          sourceType: "primary",
          stanceConfidence: 0.97,
        },
      ],
    },
};

# Fontes do Fôlego

O Fôlego tem dois tipos de fonte: os **artigos científicos**, que vêm do módulo `literatura` (buscas salvas no PubMed), e as **notícias**, que vêm de feeds RSS e páginas de lista de sociedades, reguladores, registros de ensaios, centros de referência e imprensa (`industry/sources.json`). Perfis, pesquisas e hashtags do X e do Instagram entram como notícias também (veja [Redes sociais](#redes-sociais-x-instagram-e-linkedin)).

## Artigos científicos (módulo literatura)

A cada 6 horas, o módulo roda as buscas de `industry/literatura.json` no PubMed, sobre os registros que entraram nos últimos 7 dias. Cada artigo novo é tratado uma única vez:

1. **Procura uma cópia gratuita e legal**: o Unpaywall diz onde o artigo pode ser lido de graça (editora, PubMed Central, repositório) e com que licença; o Europe PMC entrega o texto completo quando o artigo está no PubMed Central. O Unpaywall só conhece um DOI novo um ou dois dias depois de ele ser registrado e até lá responde que não o conhece; por isso, um artigo cujo DOI ele ainda não conhece é consultado de novo nas execuções seguintes por até 3 dias depois de entrar no PubMed, e só então é escrito sem saber se há cópia gratuita.
2. **Se a licença permite republicar uma tradução** (CC BY, CC BY-SA, CC0, domínio público; CC BY-NC só com `LITERATURA_ALLOW_NC=true`), o artigo entra pela fonte **PubMed · texto integral em acesso aberto** com o texto completo, figuras e tabelas, e o crédito aos autores e à licença. Quando é selecionado, o motor traduz o texto inteiro para o português.
3. **Nos outros casos**, o modelo escreve uma **matéria própria** do Fôlego (contexto, como foi feito, o que encontraram, limitações, uma parte para o pediatra e outra para o especialista) e o artigo entra pela fonte **PubMed · matérias do Fôlego**. A matéria é escrita a partir do texto completo quando há uma cópia aberta legível, ou a partir do resumo. O texto completo vem do PubMed Central e, quando o PMC ainda não o tem, da cópia gratuita que o Unpaywall indica na editora ou num repositório, com qualquer licença, porque ler para escrever um texto próprio é sempre permitido. A página é pedida uma vez, com o nome do robô do site, sem login e sem contornar bloqueio; se a editora recusa o robô (desafio anti-robô, como ScienceDirect, Wiley, Taylor & Francis e MDPI fazem hoje), se a cópia é só PDF ou se a página mostra só o resumo, a matéria é escrita a partir do resumo, como antes. O texto da página nunca é republicado: a regra de republicação abaixo continua valendo só para o texto do PMC. Em `raw.basis` fica a base da matéria (`full` ou `abstract`) e, quando é `full`, em `raw.fullTextFrom` de onde veio o texto (`pmc` ou `copy`); o rodapé diz qual foi a base, traz a referência, o DOI, o link para o texto gratuito quando existe e, quando o artigo é pago, sugere pedir a cópia ao autor.

Licenças CC BY-ND e CC BY-NC-ND nunca são republicadas, porque uma tradução é obra derivada. Sites como Sci-Hub e Anna's Archive não são usados.

Depois disso, os artigos seguem o mesmo caminho de qualquer material: pré-triagem, duas notas, seleção, agrupamento e entrada na edição semanal.

Para o leitor, a fonte de cada artigo é a revista que o publicou (o título do periódico no registro do PubMed, como “The New England Journal of Medicine”), nas edições (inclusive as já publicadas), no e-mail, na página da matéria, nas listas, no RSS, no quadro **Seleção recente** da página Sobre e nas respostas de Agent e MCP; a busca também acha o artigo pelo nome da revista. As listas de fontes de **Em alta** também, a partir do cálculo seguinte da lista. Quando o registro não traz a revista, aparece o nome da fonte acima; o Painel continua com o nome da fonte.

### Configuração

- `LITERATURA_EMAIL`: e-mail de contato exigido pelo Unpaywall e recomendado pelo NCBI. Sem ele, só o PubMed Central é consultado.
- `NCBI_API_KEY` (opcional, gratuita): libera 10 requisições por segundo no PubMed.
- `MATERIA_MODEL` (opcional): modelo da etapa que escreve as matérias; por padrão, o mesmo `LLM_MODEL`. Também pode ser trocado no Painel → Modelos.
- `industry/literatura.json`: as buscas (`queries`, na sintaxe do PubMed), quantos dias para trás (`days`), quantos artigos novos por execução (`perRun`) e os idiomas aceitos (`languages`). Para testar uma busca, cole o `term` em pubmed.ncbi.nlm.nih.gov.
- `industry/revistas.json`: as revistas vigiadas e o filtro de tema (veja [Revistas de cirurgia torácica vigiadas](#revistas-de-cirurgia-torácica-vigiadas) e [Revistas de pediatria vigiadas](#revistas-de-pediatria-vigiadas)).
- `industry/pistas.json`: as notícias dos centros pediátricos, lidas só para achar o artigo original (veja [Pistas: notícias dos centros pediátricos](#pistas-notícias-dos-centros-pediátricos)).

Cada artigo tratado fica registrado na tabela `literatura_papers` (PMID, DOI, destino e artigo criado), e por isso não é escrito duas vezes. Se um serviço falha (PubMed, Unpaywall, Europe PMC ou o modelo), o artigo não é escrito com menos informação: ele é tentado de novo nas execuções seguintes, até 3 vezes, e depois fica marcado como `falhou`.

A republicação vale pela URL de licença que o próprio artigo declara no PMC, nunca só pela frase de licença. Figuras cuja legenda indica material de terceiros ("reprinted with permission", "©") são omitidas, e o crédito avisa. Quando o Unpaywall diz que o artigo é aberto com licença que permite republicar mas o PMC ainda não tem o texto (o PMC costuma chegar dias depois do PubMed), o artigo espera até 36 horas; passado isso, vira matéria. As duas fontes do PubMed não seguem a regra do motor que arquiva como histórico o que é encontrado mais de 48 horas depois da data do material: um artigo de alguns dias ainda entra na nota diária e na edição semanal.

### Revistas de cirurgia torácica vigiadas

Em 31/10/2026 o dono mandou um levantamento das revistas de cirurgia torácica do mundo e pediu que o Fôlego não ficasse só no que as buscas temáticas do PubMed trazem: as 41 revistas do núcleo do levantamento, mais o *Journal of Thoracic Disease*, o *Journal of Thoracic Oncology* e o *Journal of Heart and Lung Transplantation*, ficam vigiadas, sempre nos temas do jornal (cirurgia torácica e via aérea da criança, pneumologia pediátrica). Os artigos só de adultos ficam de fora. As revistas complementares, as de verificação pendente e os títulos históricos do levantamento não entram. A lista está em `industry/revistas.json`, e a mesma execução de 6 em 6 horas do módulo literatura as lê:

- **Filtro de tema.** Um artigo só é considerado se o título ou o resumo tiver uma palavra de cada lista de `filtro`: uma de idade (criança, lactente, recém-nascido, adolescente, prematuro, feto…) e uma de tema (traqueia, via aérea, laringe, brônquio, pulmão, pleura, empiema, pneumotórax, toracoscopia, parede torácica, pectus, mediastino, esôfago, diafragma, lobectomia, CPAM, sequestro, fibrose cística, bronquiectasia, estridor, intubação, corpo estranho…), que cobre a cirurgia torácica e a via aérea, e também a pneumologia pediátrica: asma, `respirat*` (insuficiência respiratória, doença respiratória), apneia do sono, ventilação domiciliar ou prolongada e ECMO; displasia broncopulmonar, discinesia ciliar primária, doença pulmonar intersticial da criança, pneumonia e transplante pulmonar já entram por `bronch*`, `ciliary dyskinesia`, `lung*` e `pneumon*`. `child*` quer dizer a palavra e as que começam por ela. A sigla chILD não está na lista, porque o filtro não diferencia maiúsculas e ela leria "child" como tema. A lista de tema não tem "cardíaco" nem "thoracic" sozinho: a cirurgia cardíaca congênita, que é a maior parte do que essas revistas publicam sobre crianças, fica de fora.
- **Busca no PubMed por revista.** As revistas que o PubMed indexa (`nlm`, a abreviatura do título no NLM) formam uma busca a mais, `revistas-vigiadas`: as revistas em `[ta]`, com as duas listas do filtro em `[tiab]`. Ela se soma às buscas de `industry/literatura.json` e segue as mesmas regras (últimos 7 dias, idiomas, `perRun`).
- **Sumário aberto.** As revistas com `sumario` são lidas também no sumário: o feed RSS ou Atom da editora (`rss`), ou, quando a editora não tem feed que o coletor leia, a lista pública do Crossref pelo ISSN (`crossref`), que traz os artigos com DOI na ordem em que o DOI foi criado. Só se lê o que está aberto, como o robô do site, sem login e sem contornar bloqueio. O Crossref é lido uma revista por segundo, porque responde 429 a leituras seguidas. Um sumário que falha não impede os outros e é lido de novo na execução seguinte.
- **Um artigo só.** Cada artigo do sumário que passa no filtro é procurado no PubMed pelo DOI. Se o PubMed já o tem, entra pelo registro do PubMed, como os outros. Se não tem e o sumário traz o resumo, o artigo é escrito já, a partir do resumo ou da cópia gratuita que o Unpaywall indicar, e fica em `literatura_papers` com a chave `doi:<DOI>`. Quando o registro do PubMed chega depois, o DOI o liga ao mesmo artigo, com o estado `sumario`, e nada é escrito de novo. Se o sumário de uma revista indexada não traz resumo (Elsevier, AME e J-STAGE não o depositam), o artigo espera pela busca do PubMed, que traz o resumo. Um artigo de revista fora do PubMed sem DOI (a africana) é identificado pelo endereço da página (`url:<endereço>`), e a referência da matéria aponta para essa página.
- **Nome da revista.** O artigo que entra pelo sumário mostra o nome da revista como está em `name`, e o que entra pelo PubMed mostra o título do periódico no registro, como os outros artigos científicos.

Depois disso, o artigo segue o caminho de todo artigo científico: matéria do Fôlego (ou texto integral, se a licença permitir), pré-triagem, duas notas, os mesmos limiares, seleção e edição.

Volume medido em 31/10/2026 (busca do PubMed, por data de entrada, seis janelas de 7 dias, de 10/09 a 21/10/2026, com o filtro de idioma): as revistas indexadas registraram 863 artigos; 45 tinham palavra de idade (quase todos de cardiopatia congênita), e 13 passaram no filtro inteiro, cerca de 2 por semana. Exemplos: lobectomia robótica pediátrica, torção pulmonar numa criança, pectus excavatum com várias barras, as considerações pediátricas do consenso da ISHLT sobre fragilidade no transplante pulmonar. A leitura dos sumários em 31/10/2026 (últimos 7 dias) achou 2 artigos no filtro (uma traqueia comprimida por duplo arco aórtico no JTCVS Techniques e pneumonia em crianças no JTD). Com os termos de pneumologia pediátrica acrescentados no mesmo dia (asma, `respirat*`, apneia, ventilação domiciliar ou prolongada, ECMO), a mesma busca passou de 13 para 16 artigos nas seis semanas; os 3 a mais eram de cirurgia cardíaca pediátrica (dois sobre dispositivo de assistência ventricular, um sobre valva mitral), que entraram por citar ECMO ou complicação respiratória no resumo. São cerca de 2 a 3 matérias por semana, cada uma com uma chamada ao modelo.

| Nº | Revista | PubMed (`nlm`) | Sumário | X | Observação |
|---|---|---|---|---|---|
| 1 | The Annals of Thoracic Surgery | `Ann Thorac Surg` | feed da editora | [@annalsthorsurg](https://x.com/annalsthorsurg) | A conta do X está na página da revista no site da STS. |
| 2 | The Journal of Thoracic and Cardiovascular Surgery | `J Thorac Cardiovasc Surg` | feed da editora |  |  |
| 3 | European Journal of Cardio-Thoracic Surgery | `Eur J Cardiothorac Surg` | Crossref (ISSN 1010-7940) |  | O site da Oxford (academic.oup.com) responde 403 (Cloudflare) e não mostra o endereço do feed. |
| 4 | Interdisciplinary CardioVascular and Thoracic Surgery | `Interdiscip Cardiovasc Thorac Surg` | Crossref (ISSN 2753-670X) |  | Idem EJCTS. |
| 5 | Journal of Cardiothoracic Surgery | `J Cardiothorac Surg` | feed da editora |  |  |
| 6 | General Thoracic and Cardiovascular Surgery | `Gen Thorac Cardiovasc Surg` | feed da editora |  |  |
| 7 | Annals of Thoracic and Cardiovascular Surgery | `Ann Thorac Cardiovasc Surg` | feed da editora (WebAPI do J-STAGE) | [@ATCS_journal](https://x.com/ATCS_journal) | O RSS de novidades do J-STAGE traz só 4 itens; a WebAPI lista todos os artigos do ano. |
| 8 | Annals of Cardiothoracic Surgery | `Ann Cardiothorac Surg` | Crossref (ISSN 2225-319X) |  | O feed (OJS da AME) não traz DOI. |
| 9 | Asian Cardiovascular and Thoracic Annals | `Asian Cardiovasc Thorac Ann` | feed da editora |  |  |
| 10 | The Thoracic and Cardiovascular Surgeon | `Thorac Cardiovasc Surg` | feed da editora |  |  |
| 11 | Thoracic Surgery Clinics | `Thorac Surg Clin` | feed da editora |  |  |
| 12 | Seminars in Thoracic and Cardiovascular Surgery | `Semin Thorac Cardiovasc Surg` | feed da editora |  |  |
| 13 | Operative Techniques in Thoracic and Cardiovascular Surgery | não | feed da editora |  | Sem registros de 2026 no PubMed. |
| 14 | Multimedia Manual of Cardio-Thoracic Surgery | `Multimed Man Cardiothorac Surg` | Crossref (ISSN 1813-9175) | [@MMCTS_Manual](https://x.com/MMCTS_Manual) | Sem feed encontrado; a conta do X está na etiqueta `twitter:site` do site da revista. |
| 15 | Innovations: Technology and Techniques in Cardiothoracic and Vascular Surgery | `Innovations (Phila)` | feed da editora | [@Innovationsjour](https://x.com/Innovationsjour) |  |
| 16 | Annals of Thoracic Surgery Short Reports | `Ann Thorac Surg Short Rep` | Crossref (ISSN 2772-9931) |  | Só há o feed do ScienceDirect, sem data e sem DOI. |
| 17 | JTCVS Open | `JTCVS Open` | feed da editora |  |  |
| 18 | JTCVS Techniques | `JTCVS Tech` | feed da editora |  |  |
| 19 | General Thoracic and Cardiovascular Surgery Cases | `Gen Thorac Cardiovasc Surg Cases` | feed da editora |  |  |
| 20 | The Thoracic and Cardiovascular Surgeon Reports | `Thorac Cardiovasc Surg Rep` | feed da editora |  |  |
| 21 | Kardiochirurgia i Torakochirurgia Polska / Polish Journal of Thoracic and Cardiovascular Surgery | `Kardiochir Torakochirurgia Pol` | Crossref (ISSN 1731-5530) |  | Sem feed encontrado. |
| 22 | Turkish Journal of Thoracic and Cardiovascular Surgery | `Turk Gogus Kalp Damar Cerrahisi Derg` | Crossref (ISSN 1301-5680) |  | Sem feed encontrado. |
| 23 | Current Thoracic Surgery | não | Crossref (ISSN 2548-0316) |  | Sem feed encontrado. |
| 24 | Portuguese Journal of Cardiac Thoracic and Vascular Surgery | `Port J Card Thorac Vasc Surg` | — |  | O feed (OJS) não traz DOI, e o artigo do sumário não se juntaria ao registro do PubMed; fica só a busca do PubMed. |
| 25 | Russian Journal of Thoracic and Cardiovascular Surgery | não | Crossref (ISSN 0236-2791) |  | Sem registros de 2026 no PubMed; o Crossref recebe os artigos em lotes. |
| 26 | Journal of Chest Surgery | `J Chest Surg` | Crossref (ISSN 2765-1606) | [@Jchestsurg](https://x.com/Jchestsurg) | Sem feed encontrado. |
| 27 | Kyobu Geka (The Japanese Journal of Thoracic Surgery) | `Kyobu Geka` | — |  | Sem sumário aberto. |
| 28 | Journal of the Japanese Society of Thoracic Surgeons | não | feed da editora (WebAPI do J-STAGE) |  |  |
| 29 | Chinese Journal of Thoracic and Cardiovascular Surgery (中华胸心血管外科杂志) | não | — |  | Fora do PubMed e do Crossref; não há sumário aberto que o coletor leia. |
| 30 | Chinese Journal of Clinical Thoracic and Cardiovascular Surgery (中国胸心血管外科临床杂志) | não | — |  | Fora do PubMed e do Crossref; o site (tcsurg.org) responde 405 com página de bloqueio. |
| 31 | Chinese Journal of Thoracic Surgery (Electronic Edition) (中华胸部外科电子杂志) | não | — |  | Fora do PubMed e do Crossref; não há sumário aberto que o coletor leia. |
| 32 | Indian Journal of Thoracic and Cardiovascular Surgery | `Indian J Thorac Cardiovasc Surg` | feed da editora |  |  |
| 33 | The Vietnam Journal of Cardiovascular and Thoracic Surgery | não | — |  | O feed (OJS) só tem títulos e resumos em vietnamita, que o filtro, em inglês, não lê; fora do PubMed e do Crossref. |
| 34 | Sri Lanka Journal of Cardiothoracic Surgery (SLJCTS) | não | — |  | A página da associação só tem PDFs, sem sumário nem DOI. |
| 35 | The Cardiothoracic Surgeon | não | feed da editora |  | Sem registros de 2026 no PubMed. |
| 36 | African Annals of Thoracic and Cardiovascular Surgery | não | feed da editora, sem DOI: o artigo é identificado pelo endereço |  |  |
| 37 | Revista Mexicana de Cirugía Torácica General | não | — |  | O feed do site da sociedade é de notícias (última em 2024), não de sumário. |
| 38 | Current Challenges in Thoracic Surgery | não | Crossref (ISSN 2664-3278) |  | O feed (OJS da AME) não traz DOI; sem registros de 2026 no PubMed. |
| 39 | Video-Assisted Thoracic Surgery | não | Crossref (ISSN 2519-0792) |  | Idem CCTS. |
| 40 | Journal of Visualized Surgery | `J Vis Surg` | Crossref (ISSN 2221-2965) |  | O feed (OJS da AME) não traz DOI. |
| 41 | Shanghai Chest | não | Crossref (ISSN 2521-3768) |  | Idem CCTS. |
| JTD | Journal of Thoracic Disease | `J Thorac Dis` | Crossref (ISSN 2072-1439) |  | Os feeds respondem 200 sem nenhum item. |
| JTO | Journal of Thoracic Oncology | `J Thorac Oncol` | feed da editora |  | O feed de artigos no prelo (`inpress.rss`); o da edição traz os resumos de congresso. |
| JHLT | The Journal of Heart and Lung Transplantation | `J Heart Lung Transplant` | feed da editora |  |  |

Os números são os do levantamento do dono. As revistas sem PubMed e sem sumário (29 a 31, 33, 34 e 37) não estão em `industry/revistas.json`. Uma revista sai do PubMed (`nlm` ausente) quando o NLM a lista mas ela não tem registro de 2026.

### Revistas de pediatria vigiadas

Em 31/10/2026 o dono recebeu um relatório sobre as fontes do jornal e pediu que entrasse tudo o que ele recomendava. O jornal cobre dois temas, a cirurgia torácica e a via aérea da criança e a pneumologia pediátrica, e o relatório concluiu que as revistas de pediatria cobrem melhor esses temas do que mais revistas gerais de tórax. Por isso as nove revistas abaixo entraram em `industry/revistas.json`, com o mesmo filtro de tema, a mesma busca no PubMed por `[ta]` (dentro de `revistas-vigiadas`), o mesmo sumário aberto e a mesma junção pelo DOI das revistas de cirurgia torácica. Da ERJ Open Research, da Laryngoscope e da JAMA Otolaryngology, que publicam sobretudo sobre adultos, só entra o que tem palavra de idade. Das revistas de otorrinolaringologia e anestesia só entra o que tem palavra de tema: a otologia, a rinologia e a anestesia que não trata da via aérea ficam de fora.

| Revista | PubMed (`nlm`) | Sumário | Observação |
|---|---|---|---|
| Pediatric Pulmonology | `Pediatr Pulmonol` | feed da editora (Wiley) | O feed traz o sumário do número com o resumo. A fonte de notícias `rss-j-pediatric-pulmonology`, que lê o mesmo feed, continua cadastrada. |
| International Journal of Pediatric Otorhinolaryngology (IJPORL) | `Int J Pediatr Otorhinolaryngol` | Crossref (ISSN 0165-5876) | O site da Elsevier (ijporlonline.com) responde 403 ao coletor. A Elsevier não deposita o resumo no Crossref, então o artigo espera pela busca do PubMed. É a revista dos consensos do IPOG. |
| Paediatric Respiratory Reviews | `Paediatr Respir Rev` | Crossref (ISSN 1526-0542) | prrjournal.com responde 403; sem resumo no Crossref, como a IJPORL. |
| ERJ Open Research | `ERJ Open Res` | Crossref (ISSN 2312-0541) | publications.ersnet.org responde 403 (Cloudflare). O Crossref traz o resumo de cerca de 2 em cada 3 artigos. |
| Journal of Pediatric Surgery | `J Pediatr Surg` | Crossref (ISSN 0022-3468) | O feed `inpress.rss` não traz DOI nem resumo; sem resumo no Crossref. |
| European Journal of Pediatric Surgery | `Eur J Pediatr Surg` | Crossref (ISSN 0939-7248) | O feed da Thieme não foi encontrado; o Crossref traz o resumo de cerca de 4 em cada 5 artigos. |
| Pediatric Anesthesia | `Paediatr Anaesth` | feed da editora (Wiley) |  |
| The Laryngoscope | `Laryngoscope` | feed da editora (Wiley) | A fonte de notícias `rss-j-laryngoscope` lê o mesmo feed e continua cadastrada. |
| JAMA Otolaryngology–Head & Neck Surgery | `JAMA Otolaryngol Head Neck Surg` | Crossref (ISSN 2168-6181) | jamanetwork.com responde 403 ao coletor. |

Volume medido em 31/10/2026 (busca do PubMed por data de entrada, últimos 42 dias, contra as 51 buscas de `industry/literatura.json`): as nove revistas registraram 406 artigos, 85 passaram no filtro, e 49 deles não vinham de nenhuma outra busca. São cerca de 8 artigos novos por semana, cada um com uma chamada ao modelo, quase todos de pneumologia pediátrica (fibrose cística, asma, bronquiolite e VSR, discinesia ciliar, ventilação domiciliar, apneia do sono), que as buscas por tema, feitas para a via aérea e a cirurgia, não traziam. Também passam alguns artigos de anestesia ou otorrinolaringologia que só citam a respiração (rinossinusite, tireoidectomia); a pré-triagem os descarta. A leitura dos sumários em 31/10/2026 (últimos 7 dias) achou 21 artigos no filtro, a maioria na Pediatric Anesthesia e na Laryngoscope.

### Consensos e diretrizes das sociedades e dos grupos pediátricos

O mesmo relatório pediu que o jornal acompanhasse os grupos que produzem consensos e diretrizes nos seus temas: IPOG, a Assembleia de Pediatria da ATS, a Assembleia de Pediatria da ERS, a Cystic Fibrosis Foundation, a ERNICA (atresia de esôfago, hérnia diafragmática), a ESPO, a EUPSA, a SBP (Departamento de Pneumologia, consensos e diretrizes), a SBPT (consensos e diretrizes), o Global Tracheostomy Collaborative e a diretriz da ATS sobre a criança traqueostomizada. Esses documentos saem em revistas indexadas, e por isso entram por duas buscas do PubMed, com a data real de publicação (um documento antigo que reaparece numa página nova não é notícia):

- `consensos-grupos-pediatricos`: o que os grupos pediátricos publicam (IPOG, ERNICA, EUPSA, ESPO, SBP e Global Tracheostomy Collaborative, pelo nome no título ou no resumo), com uma palavra de tema do jornal (traqueia, via aérea, laringe, brônquio, pulmão, pleura, tórax, esôfago, diafragma, fibrose cística, asma, respiração…). Sem a palavra de tema, a busca trazia sobretudo Hirschsprung, malformação anorretal e intestino curto, da ERNICA e da EUPSA.
- `diretrizes-sociedades-pediatria`: diretrizes, consensos, declarações e recomendações (tipos de publicação Guideline, Practice Guideline e Consensus Development Conference, ou guideline, consensus, statement, recommendation e position paper no título, ou Delphi) da ATS, da ERS, da Cystic Fibrosis Foundation e da SBPT (também pelos nomes em inglês, Brazilian Thoracic Association e Brazilian Society of Pulmonology), sempre com o bloco de idade da criança. As assembleias de pediatria não assinam os documentos com o nome delas; o bloco de idade separa os documentos pediátricos. É por essa busca que entra a diretriz da ATS *Care of Infants and Children with Tracheostomies* (2025).

Em dois anos (busca do PubMed por data de entrada, até 31/10/2026), a primeira trouxe 20 registros (o consenso da EUPSA sobre íleo meconial, os artigos do GTC na revista *Tracheostomy*, a atresia de esôfago da ERNICA) e a segunda, 13 (a diretriz da ATS sobre a criança traqueostomizada, a atualização da ATS sobre doença pulmonar intersticial da criança, o posicionamento da Cystic Fibrosis Foundation sobre saúde reprodutiva, o consenso sobre discinesia ciliar primária na ERJ Open Research). Nos últimos 42 dias, nenhuma das duas trouxe artigo: são buscas raras e precisas, para não perder o documento quando ele sair.

As páginas das sociedades foram verificadas em 31/10/2026 e não entraram como fonte de notícias: a Cystic Fibrosis Foundation e a SBP (Departamento de Pneumologia e documentos científicos) respondem 403 ao coletor; o IPOG e o Global Tracheostomy Collaborative não têm página de notícias nem feed (o GTC já entra pelo canal do YouTube, `rss-youtube-gtc`); a lista de notícias da ERNICA mostra a data do evento (webinários e cursos, alguns de 2027), e não a da publicação; o feed da EUPSA só tem uma página de teste; a página de documentos oficiais da ATS é montada por JavaScript. Continuam ativas as fontes que já existiam: SBP (`rss-sbp-pneumologia`, `rss-sbp-traqueostomia`), SBPT (`rss-sbpt`), ERS (`rss-ers-paediatric`, `rss-ers-guideline`, `web-ers-guidelines-in-focus`), ATS (`web-ats-press`) e ESPO (`rss-gnews-site-espo`).

### Pistas: notícias dos centros pediátricos

As notícias de Cincinnati Children's, Boston Children's, CHOP, SickKids e Children's Hospital Colorado são lidas só como pista para o artigo original: uma notícia de hospital nunca vira matéria. As seis páginas estão em `industry/pistas.json`, com `kind` e `config` de uma fonte do mesmo tipo (`rss` ou `web_list`), e a execução de 6 em 6 horas do módulo literatura as lê:

1. Cada post dos últimos 7 dias, com data, é aberto uma vez (como o robô do site, sem login e sem contornar bloqueio). Um post sem data não é lido.
2. Do texto da página saem os DOIs e os links do PubMed, até 10 por post. Cada DOI é procurado no PubMed; um DOI com caminho a mais no link (`10.1182/blood.123/568832/Titulo`) é procurado de novo sem ele.
3. Só segue o artigo que entrou no PubMed até um ano antes do post e que passa no filtro de tema de `industry/revistas.json`. Assim, as referências antigas que o post cita e as notícias do hospital sobre outros temas ficam de fora.
4. O artigo segue o caminho de todo artigo científico (matéria do Fôlego ou texto integral, pré-triagem, notas, seleção), e quem aparece como fonte é a revista. Um artigo que outra busca já trouxe não é escrito de novo.
5. O post fica em `literatura_papers` com a chave `pista:<endereço>`: `pista` quando trouxe artigo, `pista-sem-artigo` quando não trouxe. Enquanto um artigo dele ainda espera (pelo PMC, pelo Unpaywall, pela cota da execução) ou falhou e vai ser tentado de novo, o post não é registrado e é aberto de novo na execução seguinte. Um post que não abre também é lido na execução seguinte.

Medido em 31/10/2026 nos últimos 60 dias: os seis endereços publicaram 65 posts, cerca de 8 por semana, quase todos prêmios, eventos, histórias de pacientes e pesquisa de outras áreas. Um post trouxe artigo do tema: o da CHOP sobre posição prona e ventilação de alta frequência na síndrome do desconforto respiratório agudo pediátrico (*The Lancet*). Cada post custa uma leitura da página e algumas consultas ao PubMed, sem chamada ao modelo.

Até 31/10/2026, essas seis páginas eram fontes de notícias: `rss-boston-childrens-answers`, `rss-cincinnati-research-horizons`, `web-cincinnati-releases`, `web-chop-news`, `web-sickkids-news` e `web-childrens-colorado`. Elas saíram de `industry/sources.json`. Num site que já está no ar, continuam cadastradas e ativas até alguém pausá-las no Painel → Fontes (veja [deploy.md](deploy.md#更新)). As outras notícias de hospitais (Nationwide, Great Ormond Street, Lurie, Beijing Children's, Sant Joan de Déu, Pequeno Príncipe, HCPA, Mayo Clinic, Instituto Nacional del Tórax), o EurekAlert! e as buscas do Google News pelos sites dos centros continuam como notícias.

### Acrescentar um artigo por PMID ou DOI

As buscas só olham os últimos 7 dias. Para um artigo mais antigo ou que elas não trouxeram, o editor usa o Painel → Conteúdo → **Adicionar artigo** (botão *Adicionar artigo*, com PMID, DOI ou o link doi.org; o DOI é procurado no PubMed). O artigo segue o mesmo caminho dos outros (texto integral se a licença permitir, senão matéria própria, com recibo e teto de orçamento), escrito pelo worker em instantes; a página lista os últimos acrescentados e o que virou cada um. Diferente das buscas, nada retoma um artigo acrescentado que não pôde ser escrito porque o PMC ainda não tem o texto aberto, porque o Unpaywall ainda não conhece o DOI, porque as chamadas de modelo estão desligadas ou porque a fonte está pausada: a página e o script o mostram como *Não incluído*, com o motivo, e o editor o acrescenta de novo mais tarde. Um PMID que já está em `literatura_papers`, ou um artigo já escrito pelo DOI a partir do sumário de uma revista vigiada, não é escrito de novo. O artigo entra como notícia de agora (linha do tempo no momento da inclusão), então vai para a próxima nota diária e para a edição semanal se for selecionado; a opção *Marcar Seleção = sim* faz a mesma correção manual da página do item, com auditoria. Pela linha de comando, veja `scripts/literatura-adicionar.ts` em [deploy.md](deploy.md#按-pmid-或-doi-加一篇论文).

### Custo

Cada matéria é uma chamada ao modelo, com algo entre 3 mil e 15 mil tokens de entrada e até 4 mil de saída. As 25 buscas temáticas (via aérea da criança ao adulto, incluindo as anomalias congênitas da laringe e da traqueia e os anéis vasculares, cirurgia torácica pediátrica e, na interface com a via aérea, transplante pulmonar e ECMO) trazem cerca de 93 artigos novos por semana. As 25 buscas do diretório de fontes do dono (as quatro buscas prontas, os ajustes recomendados, as consultas do Google Scholar e os periódicos sem feed; veja [diretorio-fontes.md](diretorio-fontes.md)) acrescentavam cerca de 78 por semana, e o total fica em cerca de 171 (de 139 a 201 nas seis semanas medidas). Quase todo o acréscimo vem das buscas amplas do diretório (bloco temático sem idade, manejo anestésico, doença estrutural e a busca de adultos, que saiu em 31/10/2026), e numa amostra dos títulos só cerca de 1 em 5 era de via aérea: o resto era ventilação mecânica e UTI, apneia do sono e câncer de laringe, porque os MeSH "Intubation, Intratracheal", "Airway Obstruction" e "Laryngeal Neoplasms" casam com esses artigos. As buscas de traqueostomia no adulto e de via aérea na anestesia pediátrica exigem o termo no título ou como assunto principal (MeSH `[majr]`), porque com o termo em qualquer ponto do resumo traziam muito artigo de UTI, ventilação e anestesia que só cita a via aérea de passagem. Os textos integrais não passam por essa etapa; a tradução deles só acontece quando são selecionados.

### Buscas avaliadas e deixadas de fora

Em 22/10/2026, uma lista de temas de via aérea pediátrica foi medida no PubMed (registros por data de entrada, seis semanas de 10/09 a 21/10/2026, contando só o que as buscas já existentes não traziam e julgando os títulos). Entraram três mudanças: `estenose-via-aerea` passou a aceitar "airway stenosis", "laryngeal stenosis" e "glottic stenosis" no resumo (+1,2 artigo por semana, ~70% no tema); `malacias-laringe` ganhou hemangioma subglótico, membranas e atresia laríngeas, agenesia traqueal, fenda laringotraqueoesofágica, anéis traqueais completos, split cricoide posterior e alteração de mobilidade das pregas vocais (+0,7 por semana, ~75% no tema); e a busca nova `aneis-vasculares` (anéis vasculares, duplo arco aórtico, sling da artéria pulmonar, compressão pela artéria inominada, com termo de via aérea), com 1,5 por semana, metade nova, ~60% no tema. Os termos de estenose entram com `[tiab]` também porque o MeSH "Laryngostenosis" só casa depois da indexação, dias depois de o registro entrar no PubMed.

Ficaram de fora:

- **Lacunas de tratamento** (mitomicina C e triancinolona; corticoide e antibiótico tópicos, incluindo ciprofloxacino-dexametasona; antibiótico, MRSA e Pseudomonas na reconstrução laringotraqueal; dexmedetomidina, extubação planejada e tempo de stent; inibidor de bomba de prótons; critério de falha da dilatação): entre 0 e 0,3 artigo novo por semana. Esses artigos citam estenose subglótica ou reconstrução laringotraqueal e já chegam por `estenose-via-aerea`. O que sobrava era ruído (lesão elétrica da laringe, estenose de nasofaringe).
- **"airway reconstruction"** e **"airway surgery"**: o que traziam de novo era sobretudo reconstrução 3D de imagem e cirurgia do sono.
- **22q11 com via aérea**, **esofagite eosinofílica e refluxo com via aérea**, **Cochrane** (revisões com termos de via aérea, tórax e intubação) e **disfagia com termo de via aérea na criança**: nada novo, ou menos de 0,5 por semana. As revisões Cochrane estão no PubMed e as de via aérea já entram pelas buscas por tema.
- **Disfagia pediátrica em geral** (FEES, videofluoroscopia, penetração laríngea): 1,3 por semana nova, só ~25% no tema (doenças neuromusculares, síndrome de Down, custos).
- **Aerodigestivo / endoscopia tripla**: menos de 0,2 por semana, fora do tema.
- **Consensos e diretrizes** (consenso, diretriz, Delphi, IPOG com termo de via aérea na criança): 0,5 por semana nova, nenhum no tema (óxido nítrico exalado, tosse crônica, provocação nasal). Os consensos do IPOG saem no *International Journal of Pediatric Otorhinolaryngology*, com cerca de 3 por ano, e os de via aérea já são pegos pelas buscas por tema. Desde 31/10/2026 a IJPORL é vigiada e os consensos dos grupos pediátricos têm busca própria (veja [Consensos e diretrizes das sociedades e dos grupos pediátricos](#consensos-e-diretrizes-das-sociedades-e-dos-grupos-pediátricos)).
- **Afiliação dos centros de referência** (HCPA, Unicamp, UFMG, Cincinnati, CHUV, Great Ormond Street, Lurie) com termo de via aérea: 4,5 por semana nova, ~10% no tema (asma, apneia do sono, oncologia). Com termos estritos de via aérea e criança, não sobrou nada que as buscas por tema não trouxessem.

## Notícias (feeds e páginas de lista)

| Grupo | Fontes | Observação |
|---|---|---|
| Sociedades | SBP (buscas "pneumologia" e "traqueostomia"), ABORL-CCF, ERS (buscas "paediatric" e "airway") | Os feeds de busca do WordPress (`/feed/?s=termo`) dão um feed temático. |
| Sociedades (outras) | SBPT e CIPE (feeds), SBCT (API do WordPress), ATS, CHEST e STS (comunicados), ESTS (notícias) | A SBCT entra pela API do WordPress (`json-sbct`); a página de lista (`web-sbct`, em `https://www.sbct.com.br/noticias/`) continua cadastrada e desligada, e o motivo está logo abaixo da tabela. ATS, CHEST, STS e ESTS são páginas de lista (`web_list`); a CHEST não traz data na lista, e cada comunicado é aberto (`detail`) para lê-la. Não há filtro por tema: a pré-triagem descarta o que é de adultos e não trata da via aérea. |
| Reguladores | FDA MedWatch | Alertas de segurança e recalls; a pré-triagem deixa passar só os de via aérea, traqueostomia e ventilação. |
| Ensaios registrados | ClinicalTrials.gov: estenose subglótica, estenose traqueal, pectus, malformações pulmonares, hérnia diafragmática, traqueomalácia, traqueostomia pediátrica, laringomalácia, fenda laríngea, paralisia de pregas vocais em crianças; e, desde 23/10/2026, traqueostomia em adultos, via aérea difícil, manejo da via aérea, obstrução central e próteses, corpo estranho, traqueobroncomalácia, paralisia de pregas vocais em todas as idades, decanulação, trauma de via aérea e ECMO com via aérea | Só estudos novos (`dateField=StudyFirstPostDate`). Entram como "Ensaio registrado". A fenda laríngea vai entre aspas (`cond=%22laryngeal+cleft%22`): sem elas, a busca traz estudos de fenda labiopalatina. |
| Centros de referência | Nationwide Children's (Pediatrics Nationwide), Mayo Clinic News Network | Nenhum desses centros tem feed só de via aérea ou cirurgia torácica: são feeds gerais, e a pré-triagem descarta o que é de outras áreas. |
| Centros de referência (notícias) | Nationwide Children's (comunicados), Great Ormond Street, Lurie Children's, Beijing Children's Hospital (páginas de lista); Sant Joan de Déu, Hospital Pequeno Príncipe e Hospital de Clínicas de Porto Alegre (feeds) | Notícias gerais dos hospitais (prêmios, eventos, campanhas), por isso nível T2. Veja "Páginas de lista" abaixo. Cincinnati Children's, Boston Children's, CHOP, SickKids e Children's Colorado são lidos só como pista para o artigo original (veja [Pistas](#pistas-notícias-dos-centros-pediátricos)). |
| Pacientes e imprensa | Unidos pela Vida (fibrose cística), Respiratory Therapy | Nível T2: só entram com nota alta. |
| Imprensa | ENTtoday | Nível T2. |
| Google News | buscas "traqueostomia", "cirurgia torácica" criança, "hérnia diafragmática", "fibrose cística" (pt-BR) e "pediatric airway" OR "subglottic stenosis" OR "tracheal stenosis" (en), e as 22 consultas de Google Alerts do diretório | Nível T2. O link do item é o redirecionamento do Google, então em geral só entram título e resumo. |
| Diretórios de fontes e de redes sociais (23/10/2026) | sociedades de via aérea (AAO-HNS, SAM, DAS, ELS, JSRE, ALAT, SAESP, NTSP e outras), periódicos (feeds de sumário e o Crossref), registros (CTIS, ISRCTN, ReBEC), preprints (medRxiv, bioRxiv, arXiv), podcast e canais no YouTube, Healio, Medscape, EurekAlert! e o Instituto Nacional del Tórax | O destino de cada item dos dois diretórios, inclusive os perfis de redes que entram pela integração das redes (tarefa à parte), está em [diretorio-fontes.md](diretorio-fontes.md). Os congressos estão na agenda (`industry/congressos.json`, página `/agenda`). |

Fontes avaliadas e deixadas de fora por estarem paradas ou sem feed: Healio (pediatria), AARC, APSA, AABIP, ESPO. A AABIP e a ESPO entram pelas buscas do Google News `rss-gnews-aabip` e `rss-gnews-site-espo`. O feed de pneumologia do Healio voltou a publicar e entrou em 23/10/2026. A ANVISA não tem feed de alertas de tecnovigilância.

Também foram testados e deixados de fora: STAT News, porque o feed devolve HTTP 403 ao servidor; OMS (notícias), porque o feed está quase parado (1 item em 28 dias); e FDA (comunicados), Jornal da USP (ciências da saúde), Agência Brasil (saúde) e Medicina S/A, porque nenhum dos itens amostrados passou na pré-triagem (0 de 8 em cada) e juntos somavam cerca de 85 itens por semana sem nada do tema. Para pegar o item raro desses veículos, uma busca do Google News com termo específico rende mais.

Em 22/10/2026 também foram avaliados consensos, revistas, órgãos e centros de referência brasileiros e estrangeiros de via aérea pediátrica, e estes ficaram de fora:

- **Cochrane:** os feeds da Cochrane Library devolvem HTTP 403, e a página de notícias da Cochrane é geral (cannabis para insônia, coletes lombares). As revisões chegam pelo PubMed.
- **IPOG, ASPO, SENTAC e ESPGHAN:** não têm página de notícias com data nem feed. O IPOG só lista seus consensos, que chegam pelo PubMed (veja "Buscas avaliadas" acima e, desde 31/10/2026, a busca `consensos-grupos-pediatricos`).
- **ABOPe:** o feed está parado desde outubro de 2025 e só traz editais e eleições.
- **AAP:** a lista de comunicados é montada por JavaScript, e o feed da AAP News pede login. As declarações de política da AAP saem na *Pediatrics*, que está no PubMed.
- **NASPGHAN:** o feed funciona, mas trata de gastroenterologia geral e podcasts. Nas buscas "eosinophilic" e "guideline", não houve nada de via aérea em um ano.
- **BJORL e Jornal de Pediatria (SciELO):** os feeds Atom funcionam (`https://www.scielo.br/journal/bjorl/feed/`), mas trazem o sumário do número inteiro de uma vez, com atraso (o último número da BJORL no SciELO é de março de 2026). Dos 99 artigos da BJORL, 2 eram de via aérea pediátrica, e o resto era otologia, rinologia e câncer de laringe. As duas revistas estão no PubMed, e os artigos de via aérea já entram pelas buscas.
- **CONITEC:** a página de notícias no gov.br não traz os itens no HTML e não tem RSS. Uma busca do Google News por "Conitec incorporação SUS" trouxe só temas de fora (canetas emagrecedoras, PrEP, mieloma). As incorporações de via aérea chegam pela SBPT, como a da criobiópsia no rol da ANS.
- **Jornal da Unicamp:** é um feed geral da universidade, com cerca de 20 itens por semana, como o Jornal da USP. Os feeds de busca respondem HTTP 404 e trouxeram um item do tema desde 2025.
- **HC-UFMG (HU Brasil/Ebserh):** a lista mostra a data como "21/10/2026", e as matérias respondem HTTP 500 ao coletor. Desde 23/10/2026 o coletor lê essa data, mas a fonte não foi reavaliada: só chegariam o título e a data de cada notícia.
- **CHUV (Lausanne):** a lista de comunicados mostra a data como "23.04.2026" (e "04.23.2026" na versão em inglês), e o comunicado a escreve em francês ("3 septembre 2026"). Desde 23/10/2026 o coletor lê esses formatos, mas a fonte continua de fora: são cerca de 11 comunicados em 10 meses, e gerais.
- **Iowa (UI Health Care, Stead Family Children's):** a lista de notícias é montada por JavaScript (Algolia), e o feed de `medicine.uiowa.edu` é da faculdade (alunos, prêmios).
- **ReBEC:** não tem feed, e a lista de ensaios novos não filtra por tema (a busca é ignorada). Desde 23/10/2026 a lista entra como `web-rebec`, com as datas em mm/dd/aaaa declaradas na fonte; a pré-triagem descarta os ensaios de outros temas.
- **ClinicalTrials.gov, hemangioma infantil:** nos últimos 12 meses foram 10 estudos, todos de pele (laser, propranolol tópico). Nenhum estudo registrado cita hemangioma de via aérea.

### Páginas de lista

Testadas em 22/10/2026 com a pré-visualização e uma coleta completa (`scripts/collect.ts`), com título, link e data conferidos com a página:

| Fonte | Página | Como é lida |
|---|---|---|
| ATS | https://site.thoracic.org/press-releases | Data na lista, fuso `-05:00` |
| CHEST | https://www.chestnet.org/newsroom/press-releases | A lista não tem data: ela vem da linha de data do comunicado (`detail`), fuso `-06:00` |
| STS | https://www.sts.org/press-releases | Data na lista, fuso `-06:00` |
| ESTS | https://www.ests.org/news | Data na lista, fuso `+01:00` |
| CHOP | https://www.chop.edu/newsroom/search | Data e hora na lista. Desde 31/10/2026, só pista (`industry/pistas.json`) |
| Nationwide Children's (comunicados) | https://www.nationwidechildrens.org/newsroom/news-releases | Data na lista, fuso `-05:00` |
| Cincinnati Children's (comunicados) | https://www.cincinnatichildrens.org/news/release | Data na lista, fuso `-05:00`; só os 5 mais recentes aparecem. Desde 31/10/2026, só pista |
| Great Ormond Street | https://www.gosh.nhs.uk/news/ | Dia lido por expressão regular ("21 Oct 2026, 3:58 p.m." não é lido inteiro), fuso `+00:00` |
| SickKids | https://www.sickkids.ca/en/news/newsroom/ | Data na lista, fuso `-05:00`. Desde 31/10/2026, só pista |
| Lurie Children's | https://www.luriechildrens.org/en/news-stories/ | A lista não tem data: ela vem da matéria (`.news-page__date`, `detail`), fuso `-06:00`. Testada só com a pré-visualização. |
| Beijing Children's Hospital (北京儿童医院) | https://www.bch.com.cn/Html/News/Columns/5/Index.html | Na lista, o dia e um título cortado ("…"); o título inteiro e a hora vêm da matéria (`detail`), fuso `+08:00` |

Sant Joan de Déu e Pequeno Príncipe têm feed, mais simples que a página de lista: `https://www.sjdhospitalbarcelona.org/es/rss.xml` (só os links em `/es/noticias/`, sem as versões em catalão) e `https://pequenoprincipe.org.br/noticia/feed/`. O Hospital de Clínicas de Porto Alegre tem o feed do Joomla na página inicial (`https://www.hcpa.edu.br/?format=feed&type=rss`), com notícias gerais do hospital, cerca de 3 por semana. O endereço antigo do Beijing Children's (`Columns/1`) é a página da direção do hospital, e não a de notícias (`Columns/5`). A CDN do Beijing Children's às vezes responde com uma página de erro curta; quando isso acontece na lista, a coleta falha e é repetida na rodada seguinte, e quando acontece na matéria, a notícia fica com o título cortado da lista.

O endereço antigo da SBCT (`sbct.org.br`) tem certificado autoassinado e responde 403, por isso a fonte `rss-sbct` saiu desta lista. No site novo, sbct.com.br, o feed foi desligado. A página de notícias dá títulos e links limpos, mas não tem data nem na lista nem nas matérias (sem `article:published_time`, sem JSON-LD, sem `<time>`), e o coletor segura itens sem data; por isso a fonte `web-sbct` fica desligada. Desde 23/10/2026, as notícias da SBCT entram pela fonte `json-sbct`, que lê a API do WordPress (`/wp-json/wp/v2/posts`, categoria Notícias) com a data de cada post. A API entrega os títulos com entidades HTML (`&#8211;`) que o `json_list` não decodifica, então o título vem da `<title>` da página do post (`detail`). Em um site que já está no ar, a importação só acrescenta fontes novas: as fontes de ATS, CHEST, STS, ESTS e dos centros entram na próxima atualização, mas SBPT e CIPE continuam desligadas até alguém ligá-las no Painel → Fontes (ou com `node --env-file=.env scripts/enable-sources.ts rss --ids=rss-sbpt,rss-cipe`); a antiga `rss-sbct` continua cadastrada e desligada.

Não foi possível verificar Royal Children's Melbourne, Necker, Stanford, Sabará, ICr-HCFMUSP, Calvo Mackenna, Shanghai Children's Medical Center, Fudan, Chongqing e as revistas chinesas (中华小儿外科杂志, 中华耳鼻咽喉头颈外科杂志), que não têm RSS encontrado. Vale testá-los do próprio servidor.

### China

A produção chinesa relevante chega principalmente pelo PubMed: as buscas aceitam artigos em chinês (`chi` em `languages`), e a matéria é escrita a partir do resumo em inglês que o PubMed traz. Os portais de notícias médicas chineses (dxy.cn, medlive.cn) publicam sobretudo por WeChat e não têm seção de cirurgia torácica pediátrica.

As fontes desta lista são importadas na primeira vez que o site sobe. Depois disso, mexa nelas no Painel → Fontes.

## Redes sociais (X, Instagram e LinkedIn)

Em 23/10/2026 o dono do Fôlego mandou um diretório de perfis, pesquisas e hashtags de via aérea nas redes sociais e escolheu como cada rede entra: o **X** pela SocialData (fontes `x_search`), o **Instagram** pela API paga da ScrapeCreators (módulo `modules/instagram`) e o **LinkedIn** só pelos sites das organizações, porque a API oficial do LinkedIn só lê páginas que a própria conta administra e o contrato de uso proíbe raspagem.

Os itens das redes passam pela mesma pré-triagem, pelas mesmas notas e pelos mesmos limiares de qualquer material. Perfis comerciais (fabricantes) servem só para descobrir tecnologia, nunca como fonte primária de eficácia: entram no nível T2 (o limiar mais alto), com a etiqueta `comercial` e "（comercial）" no nome (a observação entre parênteses largos só aparece no Painel), e a nota de seleção já limita a publicidade de dispositivo sem dado clínico.

### Como ligar

Num site que já está no ar, estas fontes entram na próxima atualização, porque a importação só acrescenta as fontes novas.

**X.** As 25 fontes `x_search` (16 perfis e 9 pesquisas) entram desligadas, porque sem chave a coleta só falharia. Para ligar:

1. Crie uma conta na SocialData, faça um depósito pequeno (US$ 10–20 duram meses) e ponha `SOCIALDATA_API_KEY=` no `.env` do servidor.
2. Reinicie a API e o worker e confira o limite da SocialData em Painel → Configurações (o padrão é 10 por minuto, 100 por hora e 1000 por dia).
3. Ligue as fontes: `node --env-file=.env scripts/enable-sources.ts x_search` (no Docker, `docker compose exec worker node scripts/enable-sources.ts x_search`). Para ligar só algumas, acrescente `--ids=x-dasairway,x-ent-papers`.

**Do post à matéria.** Um post do X não vira notícia sozinho: com o módulo `literatura` instalado, os posts das fontes editoriais do X ficam fora das listas, da seleção e das edições (a página do post continua existindo, sem indexação). A cada 30 minutos (aos 10 e aos 40), o módulo apura os posts dos últimos 7 dias que passaram na pré-triagem: procura no texto do post, no post citado e no X Article um DOI, um endereço do PubMed ou do PMC ou um "PMID"; se não acha, abre até 3 links do post que não sejam eles mesmos um identificador, uma vez cada, com o nome do robô do site, sem login e sem contornar bloqueio, e lê na página as etiquetas de citação da revista (`citation_doi`, `citation_pmid`, `dc.identifier`), os links da página quando todos levam ao mesmo artigo (doi.org, PubMed, PMC ou a página do DOI na revista), ou o título exato do artigo, procurado no PubMed. Sem identificador, o modelo lê o post (`industry/prompts/apuracao.md`) e diz do que ele trata e o que procurar: revista, primeiro autor, ensaio e termos do tema. O PubMed é buscado com isso entre os registros dos últimos 180 dias, só quando o post nomeia a revista, o autor ou o ensaio, e só vale o registro único que tem tudo o que o post diz; nunca um palpite. O artigo achado segue o caminho de qualquer artigo do módulo (texto integral se a licença permitir, senão matéria própria, a partir do texto aberto ou do resumo), com a revista como fonte e, no fim, a linha *Pauta: o artigo foi destacado por @conta no X* com o link do post. Se o texto do post ou a página de um artigo (pelas etiquetas de citação) aponta um único DOI que o PubMed ainda não tem (o post do dia em que o artigo sai), o post fica `aguardando-pubmed` com o DOI guardado e é retomado por esse DOI, sem abrir as páginas de novo, enquanto tiver menos de 7 dias; quando o PubMed tem o artigo, ele é escrito do artigo, com a referência, e um artigo que a busca do módulo já escreveu não é escrito de novo. Uma página que só linka um DOI (o comunicado de uma sociedade, por exemplo) não espera: segue para o caminho da página oficial. Passados os 7 dias sem o PubMed, o post é apurado uma última vez sem esperar (as páginas são lidas de novo, uma vez): a busca pelo assunto, a página oficial e, por fim, a página do artigo na editora, escrita como artigo (prompt de matéria, a partir do resumo que as etiquetas de citação declaram, ou do texto da página até as referências quando a própria página é a cópia aberta que o Unpaywall aponta (o endereço dela ou o do DOI no doi.org) e há mais que o resumo; com a referência pelo DOI, sem PubMed; estado `materia-editora`); sem nada disso, fica `sem-fonte`, e uma falha nessa última apuração deixa o post em `falhou` (um post que falhou na última tentativa dentro dos 7 dias ainda passa por essa última apuração; um post que já achou o artigo tem as tentativas normais antes de `falhou`, mesmo depois dos 7 dias). A página de um artigo na revista nunca vira matéria de página. Um post sobre diretriz, congresso ou evento sem artigo vira matéria a partir da página oficial que ele linka (já lida na apuração, não pedida de novo), quando o modelo (`industry/prompts/materia-fonte.md`) confirma que a página é a fonte primária (a sociedade, o órgão, o congresso) e traz o conteúdo; a matéria nomeia a organização e a página e termina com *Pauta: o assunto foi destacado por @conta no X*. Um artigo que o módulo já tinha escrito, ou uma página que o site já tem (de qualquer fonte), não é escrito de novo. Post sem fonte primária encontrada (opinião, página de terceiros, link sem conteúdo) fica de fora: nada é publicado só com o texto do post. As duas chamadas usam o modelo da etapa `MATERIA_MODEL`; com a fonte `literatura-materia` pausada ou `MODEL_CALLS_ENABLED` desligado, nenhum post é apurado e eles esperam. Cada post apurado fica na tabela `literatura_x_posts` (`sem-fonte`, `ja-coberto`, `aguardando-pubmed`, `materia-editora`, `materia-full`, `materia-abstract`, `materia-pagina`, `integral`…); os que esperam o PMC, o Unpaywall ou o modelo são retomados a partir do artigo já achado, sem abrir as páginas de novo, depois dos posts ainda não apurados, também depois dos 7 dias, até essa espera terminar.

Os perfis são lidos juntos, numa busca a cada 30 minutos; cada pesquisa é lida sozinha, num ritmo que o coletor ajusta pelo volume (de 15 a 120 minutos). Só os posts novos são cobrados, a US$ 0,0002 cada: a estimativa é de US$ 1–3 por mês. As pesquisas excluem respostas (`-filter:replies`); retuítes nunca entram.

**Instagram.** Ponha no `.env` a chave `SCRAPECREATORS_API_KEY=` e `INSTAGRAM_COLLECT_ENABLED=true` (a coleta também exige `COLLECT_ENABLED=true`) e reinicie o worker. A coleta roda a cada 6 horas, aos 40 minutos (00:40, 06:40, 12:40 e 18:40, horário de Brasília). Na primeira execução ela cria o limite `scrapecreators` em Painel → Configurações (40 por minuto, 80 por hora e 200 por dia); cada chamada passa pelos recibos e por esse limite. Cada execução faz uma chamada por hashtag e uma por perfil (até três quando o perfil publicou muito desde a última leitura), umas 24 chamadas de 1 crédito: cerca de 2.900 créditos por mês, ou uns US$ 5,50 no pacote de US$ 47 por 25 mil créditos. As hashtags e os perfis ficam em `industry/instagram.json`; cada perfil aponta para a sua fonte `external` em `industry/sources.json`, e uma fonte pausada no Painel não é lida.

Como a coleta do Instagram funciona:

- **Hashtags:** a busca da ScrapeCreators (`/v1/instagram/search/hashtag`) devolve posts do último dia (`date_posted=last-day`). É uma busca de melhor esforço, pelo índice do Google, e não o feed completo da hashtag. Todos os posts das hashtags entram pela fonte `instagram-hashtags`.
- **Perfis:** os posts do perfil (`/v2/instagram/user/posts`), do mais novo para o mais antigo.
- **Uma vez só:** cada post entra uma vez, identificado pelo código da publicação (`instagram:<shortcode>`, o mesmo em todo endereço do post); o post que aparece numa hashtag e no perfil do autor vira um material só. Cada hashtag e cada perfil guarda o post mais novo que já viu (tabela `instagram_feeds`): a leitura seguinte não aceita posts mais antigos que ele, menos as 48 horas que o motor ainda conta como novidade, e só passa à página seguinte de um perfil quando a página inteira é nova. Uma chamada repetida dentro das mesmas 6 horas reaproveita a resposta já paga.
- **O que fica de fora:** anúncios, e posts sem legenda (não há o que a pré-triagem ler).
- **Primeira leitura:** o que já estava publicado entra arquivado pela data, sem ir para "hoje", como a primeira importação de uma fonte nova.
- **O material:** a legenda é o corpo (o título é a primeira linha) e a imagem do post vai junto. O link é o do post no Instagram.

Ressalva editorial: hashtags genéricas (`#ECMO`, `#ThoracicSurgery`, `#Tracheostomy`, `#AirwayManagement`) trazem muito conteúdo de paciente, estudante e marketing. A pré-triagem descarta a maior parte, mas cada post descartado ainda passa pelo modelo.

**LinkedIn.** Nada é coletado no LinkedIn. Cada organização do diretório é acompanhada pelo site, quando ele tem uma lista de notícias que o coletor lê (veja a tabela abaixo).

### Destino de cada item do diretório de redes

"Desligada" quer dizer que a fonte está cadastrada em `industry/sources.json` com `enabled: false`. "Aguardando a chave" quer dizer que a fonte está ligada, mas a coleta do Instagram só roda com `INSTAGRAM_COLLECT_ENABLED=true` e `SCRAPECREATORS_API_KEY`. Nenhuma das duas APIs pagas foi chamada nesta configuração: os testes usam servidores locais falsos.

**Perfis do X** (a prioridade alta do diretório, mais o fabricante VisionAir):

| Perfil | Fonte | Nível | Situação |
|---|---|---|---|
| Difficult Airway Society, [@dasairway](https://x.com/dasairway) | `x-dasairway` | T1_5 (sociedade; inclui os fios da própria conta) | desligada até a chave da SocialData |
| DAS Residents, [@dasresidents](https://x.com/dasresidents) | `x-dasresidents` | T1_5 (sociedade) | desligada até a chave da SocialData |
| Journal of Bronchology & Interventional Pulmonology, [@JBronchOnline](https://x.com/JBronchOnline) | `x-jbronchonline` | T1_5 (periódico) | desligada até a chave da SocialData |
| ANZ Society of Paediatric Otorhinolaryngology, [@ANZSPO](https://x.com/ANZSPO) | `x-anzspo` | T1_5 (sociedade) | desligada até a chave da SocialData |
| Karthik Balakrishnan, [@KBalakrishnanMD](https://x.com/KBalakrishnanMD) | `x-kbalakrishnanmd` | T2 (pesquisador) | desligada até a chave da SocialData |
| Eric Levi, [@DrEricLevi](https://x.com/DrEricLevi) | `x-drericlevi` | T2 (pesquisador) | desligada até a chave da SocialData |
| Abdullah Sindi, [@3bdallahSindi](https://x.com/3bdallahSindi) | `x-3bdallahsindi` | T2 (pesquisador) | desligada até a chave da SocialData |
| Suveer Singh / Respitudoc, [@respitudoc](https://x.com/respitudoc) | `x-respitudoc` | T2 (pesquisador) | desligada até a chave da SocialData |
| Ali Abedi, [@DocAbedi](https://x.com/DocAbedi) | `x-docabedi` | T2 (pesquisador) | desligada até a chave da SocialData |
| ENT Papers, [@ENT_Papers](https://x.com/ENT_Papers) | `x-ent-papers` | T2 (curadoria) | desligada até a chave da SocialData |
| VisionAir Solutions, [@VisionAirStents](https://x.com/VisionAirStents) | `x-visionairstents` | T2, comercial | desligada até a chave da SocialData |

**Perfis das revistas de cirurgia torácica vigiadas.** Em 31/10/2026 o dono pediu que as revistas vigiadas (veja [Revistas de cirurgia torácica vigiadas](#revistas-de-cirurgia-torácica-vigiadas)) também fossem acompanhadas no X. Só entram as contas que o site da revista, da editora ou da sociedade dona da revista apresenta como conta da revista. Uma conta só da sociedade (EACTS, AATS, STS, ISHLT, IASLC) ou só da editora (AME) não conta. Os posts passam pela mesma pré-triagem e pelos mesmos limiares.

| Revista | Perfil | Fonte | Onde a conta aparece | Situação |
|---|---|---|---|---|
| The Annals of Thoracic Surgery | [@annalsthorsurg](https://x.com/annalsthorsurg) | `x-annalsthorsurg` | botão "Follow @annalsthorsurg" na página da revista no site da STS | desligada até a chave da SocialData |
| Annals of Thoracic and Cardiovascular Surgery | [@ATCS_journal](https://x.com/ATCS_journal) | `x-atcs-journal` | linha do tempo da conta no site da revista (atcs.jp) | desligada até a chave da SocialData |
| Multimedia Manual of Cardio-Thoracic Surgery | [@MMCTS_Manual](https://x.com/MMCTS_Manual) | `x-mmcts-manual` | etiqueta `twitter:site` do site da revista (mmcts.org) | desligada até a chave da SocialData |
| Innovations | [@Innovationsjour](https://x.com/Innovationsjour) | `x-innovationsjour` | "Follow INNOVATIONS on X", no site da ISMICS, a sociedade dona da revista | desligada até a chave da SocialData |
| Journal of Chest Surgery | [@Jchestsurg](https://x.com/Jchestsurg) | `x-jchestsurg` | botão do X no site da revista (jchestsurg.org) | desligada até a chave da SocialData |

As outras 39 revistas ficaram sem conta. Os sites das revistas da Elsevier (Annals, JTCVS e família, Clinics, Seminars, Operative Techniques, JTO, JHLT), da Sage e da Thieme bloqueiam a leitura automática (403 ou desafio), e não foi possível confirmar nelas uma conta própria. Uma conta que apareça depois no site da revista entra como as de cima.

As listas temáticas do diretório (Airway guidelines, Pediatric airway, Bronchoscopy / devices) não viram fontes: os mesmos perfis já entram um a um. As duas publicações de exemplo da DAS chegam pela fonte `x-dasairway`.

**Pesquisas no X** (todas T2, com `-filter:replies` acrescentado à consulta do diretório):

| Pesquisa do diretório | Fonte | Situação |
|---|---|---|
| `("airway stenosis" OR "subglottic stenosis") -crypto -fitness` | `x-busca-estenose` | desligada até a chave da SocialData |
| `("laryngotracheal reconstruction" OR "cricotracheal resection")` | `x-busca-reconstrucao-laringotraqueal` | desligada até a chave da SocialData |
| `("pediatric airway" OR "paediatric airway") (surgery OR reconstruction)` | `x-busca-via-aerea-pediatrica` | desligada até a chave da SocialData |
| `(tracheostomy OR tracheotomy) (decannulation OR guideline)` | `x-busca-traqueostomia` | desligada até a chave da SocialData |
| `(tracheobronchomalacia OR bronchomalacia) (tracheopexy OR bronchoscopy)` | `x-busca-malacia` | desligada até a chave da SocialData |
| `("central airway obstruction" OR "airway stent") bronchoscopy` | `x-busca-obstrucao-central` | desligada até a chave da SocialData |
| `("foreign body aspiration" OR "rigid bronchoscopy") pediatric` | `x-busca-corpo-estranho` | desligada até a chave da SocialData |
| `("difficult airway" OR "awake intubation") guideline` | `x-busca-via-aerea-dificil` | desligada até a chave da SocialData |
| `(airway OR tracheal) (ECMO OR extracorporeal)` | `x-busca-ecmo` | desligada até a chave da SocialData |

**Hashtags.** No Instagram, todas entram pela fonte `instagram-hashtags` (T2), aguardando a chave. No LinkedIn, nenhuma é lida: não há meio de acesso dentro dos termos.

| Hashtag | Instagram | LinkedIn |
|---|---|---|
| #AirwayManagement | `instagram-hashtags`, aguardando a chave | não coletada |
| #DifficultAirway | `instagram-hashtags`, aguardando a chave | não coletada |
| #PediatricAirway | `instagram-hashtags`, aguardando a chave | não coletada |
| #PaediatricAirway | `instagram-hashtags`, aguardando a chave | não coletada |
| #AirwayReconstruction | `instagram-hashtags`, aguardando a chave | não coletada |
| #LaryngotrachealReconstruction | `instagram-hashtags`, aguardando a chave | não coletada |
| #SubglotticStenosis | `instagram-hashtags`, aguardando a chave | não coletada |
| #TrachealStenosis | `instagram-hashtags`, aguardando a chave | não coletada |
| #Tracheostomy | `instagram-hashtags`, aguardando a chave | não coletada |
| #TracheostomyCare | `instagram-hashtags`, aguardando a chave | não coletada |
| #Decannulation | `instagram-hashtags`, aguardando a chave | não coletada |
| #Tracheomalacia | `instagram-hashtags`, aguardando a chave | não coletada |
| #Bronchomalacia | `instagram-hashtags`, aguardando a chave | não coletada |
| #InterventionalPulmonology | `instagram-hashtags`, aguardando a chave | não coletada |
| #RigidBronchoscopy | `instagram-hashtags`, aguardando a chave | não coletada |
| #AirwayStent | `instagram-hashtags`, aguardando a chave | não coletada |
| #Laryngology | `instagram-hashtags`, aguardando a chave | não coletada |
| #PediatricENT | `instagram-hashtags`, aguardando a chave | não coletada |
| #ThoracicSurgery | `instagram-hashtags`, aguardando a chave | não coletada |
| #ECMO | `instagram-hashtags`, aguardando a chave | não coletada |

**Publicações do Instagram.** O diretório traz publicações avulsas, não perfis. O autor de cada uma foi lido em 23/10/2026 nos metadados da página pública do post (`og:url`), sem chamada paga. Os autores que são perfis de via aérea viraram fontes:

| Publicação | Autor | Fonte | Situação |
|---|---|---|---|
| [DOQuGhsjuax](https://www.instagram.com/p/DOQuGhsjuax/) (estent de silicone, broncoscopia rígida) | @interventionalbronchoscopy (Bronchoscopy and Interventional Pulmonology) | `instagram-interventionalbronchoscopy` (T2, curadoria) | aguardando a chave |
| [CXJm4UkvpMi](https://www.instagram.com/p/CXJm4UkvpMi/) (reconstrução pediátrica complexa) | @stanfordohns (Stanford OHNS) | `instagram-stanfordohns` (T2, departamento; publica de toda a otorrino) | aguardando a chave |
| [DCZQZgDq3-O](https://www.instagram.com/p/DCZQZgDq3-O/) (via aérea da criança) e [DBYwzXVMVe_](https://www.instagram.com/p/DBYwzXVMVe_/) (história de paciente, reconstrução laringotraqueal) | @cincychildrens (Cincinnati Children's) | `instagram-cincychildrens` (T2, como as notícias gerais dos hospitais) | aguardando a chave |
| [DZNjhn3kRYb](https://www.instagram.com/p/DZNjhn3kRYb/) (pesquisa em via aérea pediátrica) | @aspohns (ASPO-HNS) | `instagram-aspohns` (T1_5, sociedade) | aguardando a chave |
| [C4BB-o_xWh6](https://www.instagram.com/p/C4BB-o_xWh6/) (educação em traqueostomia) | @jamanetwork (JAMA Network) | nenhuma | Perfil geral de um grupo de revistas, quase todo fora do tema; os artigos da JAMA chegam pelo PubMed. |
| [DbcuJcOO0s0](https://www.instagram.com/reel/DbcuJcOO0s0/) (reel, caso de estent de via aérea) | @drdeepak.ir (radiologista vascular e intervencionista) | nenhuma | O perfil é de radiologia vascular; o reel é um caso avulso. |
| [Ddi2nNoOp-v](https://www.instagram.com/reel/Ddi2nNoOp-v/) (reel, traqueostomia pediátrica) | @patrik_hutzel (Intensive Care Hotline / Intensive Care at Home) | nenhuma | Perfil de um serviço comercial de UTI domiciliar, de terapia intensiva em geral. |

**Organizações do LinkedIn**, acompanhadas pelos sites:

| Organização | Fonte do site | Situação |
|---|---|---|
| Global Tracheostomy Collaborative (GTC) | `rss-youtube-gtc` (canal no YouTube), do diretório de fontes (veja [diretorio-fontes.md](diretorio-fontes.md)) | O site não tem notícias, e o feed do calendário de eventos vem vazio; o canal oficial no YouTube entra no lugar. |
| National Tracheostomy Safety Project (NTSP) | `rss-trachy-talk` (podcast) e `rss-youtube-ntsp` (YouTube), do diretório de fontes (veja [diretorio-fontes.md](diretorio-fontes.md)); `web-ntsp-news` desligada | A lista de notícias mostra a data como "18/09/2026" (dd/mm/aaaa), formato que o coletor não lê. |
| Atos Medical US (comercial) | `web-atos-medical-us` | ativa. A página `https://www.atosmedical.us/blogs-and-news` traz título e link de cada texto (59 em 23/10/2026); a data vem do JSON-LD da matéria (`detail`). |
| Boston Medical Products (comercial) | `rss-gnews-boston-medical-products` (Google News pelo nome da empresa com tracheostomy, airway, stent ou Montgomery) | O site (bosmed.com) não tem notícias. A página de eventos lista as feiras em que a empresa expõe, com o link para o site de cada congresso e sem data de publicação. A pesquisa trouxe 10 itens na prévia de 23/10/2026. |
| Stening (comercial) | `rss-gnews-stening` (Google News por "Stening", entre aspas, com stent, airway, tracheal ou bronchoscopy) | O site (stening.com.ar) não tem notícias: os "Reportes de Broncología" são artigos e PDFs sem data de publicação. O endereço stening.com é outra página. O nome vai entre aspas porque, sem elas, a pesquisa traz textos sobre "stenting". A pesquisa trouxe 1 item na prévia de 23/10/2026. |
| I:Emedics (comercial) | `rss-gnews-iemedics` (Google News por "I:Emedics" ou iemedics com airway, bronchoscopy ou stent) | O site (iemedics.com) responde HTTP 403, com a página de desafio do Cloudflare, a qualquer leitura automática. Ligada, sem itens na verificação de 23/10/2026. |

O restante do diretório de redes (vídeos do YouTube, o podcast Trachy Talk e os sites de WABIP, AABIP, CHOP, Cincinnati e Boston Children's) não está nesta tabela; esses itens ficam com o diretório de fontes.

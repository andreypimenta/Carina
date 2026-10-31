# Diretórios de fontes e de redes sociais: destino de cada item

Em 23/10/2026 o dono do Fôlego mandou dois diretórios e pediu que tudo entrasse no jornal, sem exceção:
- um de fontes online sobre manejo, doenças e cirurgia de vias aéreas (adulto e pediatria);
- outro de perfis, canais, pesquisas e hashtags em redes sociais.

Este documento dá o destino de cada item: como entrou (o id da fonte em `industry/sources.json`, o da busca em `industry/literatura.json` ou o do congresso em `industry/congressos.json`), se está ativo e, quando não está, o motivo verificado.

Como foi verificado:
- **Feeds e páginas de lista:** passaram pelo caminho de pré-visualização do Painel (`previewSource`), que faz a mesma leitura e aplica os mesmos filtros da coleta, sem gravar nada.
- **Datas vindas da matéria (`detail`):** a leitura da matéria (`fetchDetail`) também foi rodada nos primeiros itens.
- **Buscas do PubMed:** rodadas com a função do próprio módulo (`searchPmids`, GET no esearch).
- **Páginas estáticas:** quando a URL do diretório é uma página estática (sobre, programa, inscrição), foi procurado o portal de notícias da instituição.

Tudo foi testado a partir do servidor do site.

Para caber o diretório inteiro, o coletor passou a ler:
- datas por extenso em português, espanhol e inglês ("30 de mayo de 2026", "23-Oct-2026");
- datas numéricas com o ano no fim ("18/09/2026"), com a ordem declarada pela fonte quando o dia e o mês podem ser trocados (`publishedAtDateOrder`, veja `docs/sources.md`);
- APIs que respondem em XML (`json_list` com `mode: "xml"`).

O jornal ganhou uma agenda de congressos (módulo `agenda`).

Os termos das tabelas:
- **Ativa:** a fonte entra ligada e trouxe itens com data na verificação.
- **Desligada:** a fonte está cadastrada com `enabled: false`. Em todos os casos, outro caminho ativo cobre a mesma fonte; ele está na mesma linha.
- **Integração das redes:** perfis, pesquisas e hashtags de X, Instagram e LinkedIn. Entram pela tarefa à parte de integração das redes sociais (X pelo SocialData, Instagram pelo ScrapeCreators, LinkedIn pelos sites das instituições), não por este PR.

## Periódicos

Os feeds de sumário e as listas do Crossref trazem todos os artigos do periódico, não só os de via aérea; a pré-triagem descarta os de outros temas. O Crossref responde 429 quando recebe muitas leituras seguidas do mesmo endereço (aconteceu na verificação, ao ler os 14 periódicos em sequência); a fonte que levar 429 é lida de novo na rodada seguinte.

Os artigos de via aérea desses periódicos também chegam pelo PubMed:
- pela busca `periodicos-sem-feed`, que procura o título do periódico em `[ta]` dentro do bloco temático do diretório;
- pelas buscas temáticas.

Por esse caminho viram matéria do Fôlego, como os outros artigos do PubMed.

| Periódico | Como entrou | Situação | Observação |
|---|---|---|---|
| Respiratory Endoscopy (J-STAGE) | `rss-jstage-respend` (WebAPI pública do J-STAGE, Atom por artigo) | ativa | O RSS de novidades do J-STAGE (`AF05S010NewRssDld`) vem vazio para esta revista. A WebAPI lista os artigos com data, mas devolve os mais antigos primeiro; por isso a fonte ordena por data e pede a partir de 2026 (`pubyearfrom=2026`, até 1000 artigos). |
| The Journal of the Japan Society for Respiratory Endoscopy (気管支学) | `rss-jstage-jjsre` (WebAPI do J-STAGE) | ativa | O RSS de novidades do J-STAGE só diz "新着記事を登載しました" e aponta todos os itens para a página da revista. Os títulos e resumos estão em japonês. |
| Acta Anaesthesiologica Scandinavica | `rss-j-acta-anaesth-scand` (RSS Wiley) | ativa | |
| Pediatric Pulmonology | `rss-j-pediatric-pulmonology` (RSS Wiley) | ativa | |
| Otolaryngologic Clinics of North America | `json-j-otolaryngol-clin` (Crossref), `periodicos-sem-feed` | ativa | O RSS do ScienceDirect não traz data no item (só o texto "Available online…" no resumo), e a página do artigo responde 403. A API pública do Crossref lista os artigos novos de cada ISSN, com a data em que o DOI foi criado. |
| American Journal of Respiratory and Critical Care Medicine (diretriz ATS) | `json-j-ajrccm` (Crossref), `periodicos-sem-feed` | ativa | O feed do atsjournals.org redireciona para academic.oup.com, que responde 403 (Cloudflare). A URL do diretório é um registro institucional (Johns Hopkins). A diretriz de traqueostomia pediátrica também chega por `traqueostomia-pediatrica` e `diretorio-diretrizes`. |
| The Journal of Thoracic and Cardiovascular Surgery | `json-j-jtcvs` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. |
| The Annals of Thoracic Surgery | `json-j-ann-thorac-surg` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. |
| European Journal of Cardio-Thoracic Surgery | `json-j-ejcts` (Crossref), `periodicos-sem-feed` | ativa | academic.oup.com responde 403. |
| The Laryngoscope | `rss-j-laryngoscope` (RSS Wiley) | ativa | |
| International Journal of Pediatric Otorhinolaryngology | `json-j-ijporl` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. |
| Journal of Bronchology & Interventional Pulmonology | `json-j-jbip` (Crossref), `periodicos-sem-feed` | ativa | journals.lww.com responde 403. |
| CHEST | `json-j-chest` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. Os comunicados da CHEST entram por `web-chest-press`. |
| European Respiratory Journal | `json-j-erj` (Crossref), `periodicos-sem-feed` | ativa | publications.ersnet.org responde 403 (Cloudflare). |
| British Journal of Anaesthesia | `json-j-bja` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. |
| Anaesthesia | `rss-j-anaesthesia` (RSS Wiley) | ativa | |
| Anesthesiology | `json-j-anesthesiology` (Crossref), `periodicos-sem-feed` | ativa | journals.lww.com responde 403. |
| Journal of Pediatric Surgery | `json-j-j-pediatr-surg` (Crossref), `periodicos-sem-feed` | ativa | ScienceDirect: item sem data e artigo com 403. |
| Critical Care | `rss-j-critical-care` (RSS de busca do Springer) | ativa | O feed antigo (ccforum.biomedcentral.com) redireciona para o Springer. |
| Pediatric Critical Care Medicine | `json-j-pccm` (Crossref), `periodicos-sem-feed` | ativa | journals.lww.com responde 403. |
| Respiratory Care | `json-j-respir-care` (Crossref, ISSN eletrônico), `periodicos-sem-feed` | ativa | A revista passou para o SAGE, que responde 403. O SAGE criou DOIs novos para o acervo antigo no ISSN impresso, então a fonte lê só o eletrônico (1943-3654), onde estão os artigos novos. |

## Sociedades e diretrizes

### Internacionais e norte-americanas

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| AAO-HNS / AAO-HNSF: Clinical Practice Guidelines | `json-aaohns` (API REST do WordPress do entnet.org) | ativa | A lista do diretório é montada por JavaScript, e o feed do site vem vazio. A API traz todos os recursos publicados (diretrizes, comunicados, consensos, avisos), com data. O título vem da página (`detail`), porque a API o entrega com entidades HTML. |
| ASPO-HNS | `rss-youtube-aspo` (canal oficial no YouTube); congresso em `aspo-2027` na agenda | ativa | O site não tem página de notícias, e o feed do calendário de eventos (JEvents) vem vazio. |
| AATS | `rss-gnews-site-aats` (Google News, `site:aats.org`); `web-aats-newsroom` | Google News ativo; newsroom desligado | A lista do newsroom não tem data, e a matéria também não (sem `article:published_time`, JSON-LD, `<time>` nem data no texto). Os artigos do JTCVS chegam por `json-j-jtcvs`. |
| AABIP | `rss-gnews-aabip` (Google News); `rss-aabip-conference`; congresso em `aabip-2026` na agenda | Google News ativo; feed desligado | O site (aabronchology.org, aabip.memberclicks.net) não tem notícias nem feed, só páginas de cursos e newsletters em PDF. O feed do site do congresso só tem os posts de demonstração do tema, de 2023. Os artigos do JBIP chegam por `json-j-jbip`. |
| WABIP | `rss-wabip`, `rss-gnews-site-wabip`; WCBIP em `wcbip-2026` na agenda | ativa | O site às vezes recusa a conexão (aconteceu em várias tentativas de 23/10/2026); a coleta tenta de novo na rodada seguinte. O site multilíngue responde em chinês ao `accept-language` do coletor, por isso a fonte troca os links `/zh/` pelos em inglês (`itemUrlPrefixRewrite`). |
| Society for Airway Management (SAM) | `rss-sam` | ativa | Publica pouco (último post em 05/06/2026). |
| Global Tracheostomy Collaborative (GTC) | `rss-youtube-gtc` (canal oficial no YouTube); ITS em `its-2026` na agenda | ativa | O site não tem notícias, e o feed do calendário de eventos (JEvents) vem vazio. |

### Europa e Oceania

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| ESTS | `web-ests-news` (já existia); congresso em `ests-2027` na agenda; `rss-ests-meeting` | ativa; feed do congresso desligado | O feed do site do congresso (estsmeeting.com) vem vazio, e a API do WordPress dele não tem posts; as notícias do congresso saem em `web-ests-news`. |
| ERS: Guidelines Development | `rss-ers-guideline` (feed de busca do WordPress, "guideline"); `rss-ers-paediatric` e `rss-ers-airway` já existiam | ativa | |
| European Laryngological Society (ELS) | `web-els-news` | ativa | Página inicial, com os 3 destaques e a data em `<time>`. |
| Difficult Airway Society (DAS): Guidelines | `rss-das`; congresso em `das-2026` na agenda | ativa | O feed da categoria de notícias traz os mesmos posts do feed geral. Último post em 31/03/2026. |
| National Tracheostomy Safety Project (NTSP) | `web-ntsp-news`, `rss-trachy-talk`, `rss-youtube-ntsp` | ativa | A lista de notícias escreve a data como "18/09/2026"; a fonte declara a ordem dia/mês/ano. |
| SFORL | `rss-sforl`, `rss-sforl-mediatheque` | ativa | O feed do sforl.org funciona, mas está quieto desde 24/01/2025. A página de produção científica é uma lista de PDFs sem data. A médiathèque (webinars, vídeos) publica com frequência. |
| ANZCA Library: Airway Management | `rss-gnews-site-anzca-airway` (Google News, `site:libguides.anzca.edu.au airway`) | ativa | É um guia LibGuides: uma coletânea de links para artigos, diretrizes e vídeos de outras fontes, sem lista datada e sem feed; por isso entra pela busca do Google News no domínio. As fontes que ele reúne (DAS, NTSP, periódicos) entram pelos seus próprios caminhos. Na pré-visualização de 23/10/2026, a busca trouxe 30 itens com data. |

### Brasil e América Latina

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| SBCT: Pró-Ligas | `json-sbct` (API REST do WordPress, categoria Notícias), `web-sbct-pro-ligas` (aulas em vídeo), `rss-gnews-site-sbct`; `web-sbct` (já existia) e `rss-youtube-sbct` | ativa; a lista antiga e o YouTube desligados | A API traz as notícias com data, e o título vem da `<title>` da página do post, que termina em " – SBCT". As aulas do Pró-Ligas abrem em lightbox e não têm página própria. Cada uma entra com o endereço do lightbox (a página com o vídeo no fragmento) e a data do título ("Vídeo 41 - 08/08/2026"). A página de notícias, lida pela `web-sbct`, não tem data, e o feed do canal da SBCT no YouTube não lista nenhum vídeo. |
| SBPT | `rss-sbpt` (já existia); congresso em `cbpt-2026` na agenda | ativa | |
| ABORL-CCF | `rss-aborl` (já existia) | ativa | |
| ALAT | `web-alat-news`; congressos em `alat-2026` e `alat-2027` na agenda | ativa | A data vem do JSON-LD da matéria (`detail`). |
| SAESP: via aérea | `web-saesp-news` | ativa | O feed do WordPress está desligado (redireciona para a página inicial). A data vem da matéria (`detail`). |

### Ásia

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| Japan Society for Respiratory Endoscopy (JSRE) | `web-jsre-news` | ativa | Lista de avisos "学会から", com a data "2026年8月31日", fuso `+09:00`. |
| Indian Association for Bronchology (IAB) | `rss-gnews-site-iab` (Google News, `site:iabronchology.org`); BRONCOCON em `broncocon-2026` na agenda | ativa | O site só tem páginas de eventos, sem data na lista e sem feed; por isso entra pela busca do Google News no domínio. Na pré-visualização de 23/10/2026, a busca trouxe 6 itens com data. |
| APIPA | `json-apipa-programs` (API REST do WordPress, os PDFs dos programas de reuniões); `rss-apipa` | ativa; feed desligado | O feed está abandonado: só um post "testing", de 2019. O site publica cada reunião como um PDF de programa, e a API de mídia do WordPress lista esses PDFs com data. |

### Sociedades que o diretório ainda não tinha validado

| Fonte | Como entrou | Situação |
|---|---|---|
| ATS (catálogo de diretrizes) | `web-ats-press` (já existia), `json-j-ajrccm`; as diretrizes também chegam pelas buscas do PubMed (`diretorio-diretrizes`) | ativa |
| STS | `web-sts-press` (já existia), `json-j-ann-thorac-surg` | ativa |
| ESPO | `rss-gnews-site-espo` (Google News, `site:espo.eu.com OR "European Society of Pediatric Otorhinolaryngology"`) | ativa | Não tem feed (veja `docs/fontes.md`); entra pela busca do Google News. Na pré-visualização de 23/10/2026, a busca trouxe 25 itens com data. |
| Outras sociedades nacionais | o diretório não nomeia nenhuma | |

## Centros de referência

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| Cincinnati Children's: Airway Reconstruction Research e Research Horizons | `cincinnati-research-horizons`, `cincinnati-releases` (pistas) | ativa | A página do programa é estática. O blog e os comunicados eram as fontes `rss-cincinnati-research-horizons` e `web-cincinnati-releases`. A busca do Google News `rss-gnews-site-cincinnati` saiu em 31/10/2026, porque os links dos itens do Google News redirecionam por JavaScript e não levam ao artigo. Desde 31/10/2026 é lida só como pista para o artigo original (`industry/pistas.json`; veja [fontes.md](fontes.md#pistas-notícias-dos-centros-pediátricos)). |
| Boston Children's: Esophageal and Airway Treatment Center e Answers | `boston-childrens-answers` (pista) | ativa | A página do centro é estática. O blog era a fonte `rss-boston-childrens-answers`. A busca do Google News `rss-gnews-site-boston-answers` saiu em 31/10/2026, porque os links dos itens do Google News redirecionam por JavaScript e não levam ao artigo. Desde 31/10/2026 é lida só como pista para o artigo original (`industry/pistas.json`; veja [fontes.md](fontes.md#pistas-notícias-dos-centros-pediátricos)). |
| CHOP: Neonatal Airway Program | `chop-news` (pista) | ativa | A página do programa é estática. As notícias eram a fonte `web-chop-news`. A busca do Google News `rss-gnews-site-chop` saiu em 31/10/2026, porque os links dos itens do Google News redirecionam por JavaScript e não levam ao artigo. Desde 31/10/2026 é lida só como pista para o artigo original (`industry/pistas.json`; veja [fontes.md](fontes.md#pistas-notícias-dos-centros-pediátricos)). |
| SickKids: DREAMS e pesquisa de via aérea | `sickkids-news` (pista) | ativa | A página da clínica é estática; a notícia citada está no newsroom, que era a fonte `web-sickkids-news`. Desde 31/10/2026 é lida só como pista para o artigo original (`industry/pistas.json`; veja [fontes.md](fontes.md#pistas-notícias-dos-centros-pediátricos)). |
| Children's Hospital Colorado: Advances & Answers | `childrens-colorado` (pista) | ativa | A data aparece como "10/21/2026"; a página declara a ordem mês/dia/ano. Era a fonte `web-childrens-colorado`. Desde 31/10/2026 é lida só como pista para o artigo original (`industry/pistas.json`; veja [fontes.md](fontes.md#pistas-notícias-dos-centros-pediátricos)). |
| Instituto Nacional del Tórax: Broncoscopía (Chile) | `rss-torax-cl` (feed de notícias do instituto) | ativa | A página de broncoscopia é operacional; o feed do site traz as notícias do instituto. |
| Great Ormond Street | `web-gosh-news` (já existia) | ativa | |
| Mass General | `rss-gnews-site-mgb` (Google News, `site:massgeneralbrigham.org` com termos de via aérea) | ativa | O site de notícias (news.massgeneralbrigham.org) é montado por JavaScript, sem feed (`/feed/` e `query-index.json` respondem 404); só o sitemap é público, e o coletor não lê sitemaps. |
| Mayo Clinic | `rss-mayo-news-network` (já existia), `rss-youtube-mayo-clinic` | ativa | |
| Centros europeus e latino-americanos adicionais | o diretório não nomeia nenhum; são coletados Sant Joan de Déu, Pequeno Príncipe, HCPA, o Instituto Nacional del Tórax e, pelo YouTube, Cambridge University Hospitals e Narayana Health | | |

## Notícias e agregadores

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| Healio: Pulmonology | `rss-healio-pulmonology` | ativa | Traz também matérias de outras seções marcadas com pneumologia. |
| EurekAlert! | `web-eurekalert` | ativa | Os feeds RSS antigos (`/rss/*.xml`) respondem 404, e o filtro de assunto da lista é ignorado. Por isso a fonte lê a lista de todos os comunicados, de todas as áreas, de hora em hora; a pré-triagem descarta os de outros temas. A data vem como "23-Oct-2026". |
| Medscape | `rss-medscape-pulmonary` (`/cx/rssfeeds/2694.xml`, "Medscape Pulmonary Medicine") | ativa | Depois de muitas leituras seguidas, o Medscape respondeu 429 por algum tempo; na leitura espaçada da coleta, o feed responde. |
| ENTtoday | `rss-enttoday` (já existia) | ativa | |
| MDedge | `rss-gnews-site-mdedge` (Google News, `site:mdedge.com airway OR tracheostomy OR bronchoscopy OR intubation`) | ativa | Não tem feed, e a página de pneumologia não mostra matéria posterior a 25/11/2025; a busca do Google News no domínio traz o que o MDedge publicar sobre via aérea. Na pré-visualização de 23/10/2026, a busca trouxe 53 itens com data. |
| Outros agregadores | o diretório não nomeia nenhum | | |

## Pacientes e familiares

| Fonte | Como entrou | Situação |
|---|---|---|
| Global Tracheostomy Collaborative: People with a Tracheostomy / Membership | `rss-youtube-gtc` (veja Sociedades) | ativa |
| National Tracheostomy Safety Project | `web-ntsp-news`, `rss-trachy-talk`, `rss-youtube-ntsp` (veja Sociedades) | ativa |

## Podcasts, vídeos e redes

Episódios de podcast e vídeos entram como itens de notícia, com o título e a descrição do feed.

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| Trachy Talk (NTSP) | `rss-trachy-talk` (feed Buzzsprout, achado pela API pública de lookup do iTunes) | ativa | Alguns episódios não têm página; o link é o arquivo de áudio. |
| ERS Respiratory Channel: Guidelines in Focus | `web-ers-guidelines-in-focus` (a página do canal 38); `rss-ers-channel` | ativa; RSS desligado | O RSS do canal tem títulos genéricos ("Replay", "Guidelines in Focus"), e seus links respondem 404 fora do login. A página do canal lista cada episódio com título, link e data ("15.07.2026", dia/mês/ano declarado). |
| SBCT Pró-Ligas: aulas em vídeo | `web-sbct-pro-ligas` | ativa | Veja SBCT acima. |
| La médiathèque de la SFORL | `rss-sforl-mediatheque` | ativa | |
| ANZCA Library: Apps, Podcasts & Online Lectures | `rss-gnews-site-anzca-media` (Google News, `site:libguides.anzca.edu.au podcast OR lecture OR app`) | ativa | Guia LibGuides, sem lista datada e sem feed; entra pela busca do Google News no domínio. Na pré-visualização de 23/10/2026, a busca trouxe 25 itens com data. |
| Global Tracheostomy Collaborative no LinkedIn | integração das redes (veja Redes sociais) | | O LinkedIn exige login; entra pelos sites, na tarefa à parte de integração das redes. O canal da GTC no YouTube já entra. |

## Registros e preprints

Os preprints entram com o nome da fonte dizendo "sem revisão por pares". As regras de redação já proíbem chamar preprint de publicado ou revisado (`industry/prompts/rules-anti-hallucination.md`).

| Fonte | Como entrou | Situação | Observação |
|---|---|---|---|
| ClinicalTrials.gov | as 10 buscas que já existiam e 10 novas: `rss-ctgov-tracheostomy-adult`, `rss-ctgov-difficult-airway`, `rss-ctgov-airway-management`, `rss-ctgov-central-airway`, `rss-ctgov-foreign-body`, `rss-ctgov-tbm-edac`, `rss-ctgov-vocal-cord-paralysis`, `rss-ctgov-decannulation`, `rss-ctgov-airway-trauma`, `rss-ctgov-ecmo-airway` | ativa | Só estudos novos (`dateField=StudyFirstPostDate`). Em 12 meses, as buscas novas somam cerca de 4 estudos por semana. |
| arXiv | `rss-arxiv-airway` (API pública do arXiv, Atom, por data de envio) | ativa | Engenharia, imagem e acústica; não é evidência clínica. |
| medRxiv | `json-medrxiv-airway` (API REST do Europe PMC, preprints do medRxiv com termos de via aérea) | ativa | |
| bioRxiv | `json-biorxiv-airway` (Europe PMC, preprints do bioRxiv) | ativa | |
| CTIS (UE) | `json-ctis-airway`, `json-ctis-tracheostomy` (API pública de busca do CTIS, POST) | ativa | A busca lê várias palavras como uma expressão só, então há uma fonte por termo. As datas vêm como "31/08/2026" (dia/mês/ano declarado). O link abre a página do estudo no portal do CTIS. |
| ISRCTN | `xml-isrctn-airway` (API de busca do ISRCTN, em XML) | ativa | O site pede cookies e JavaScript; a API devolve um XML próprio, agora lido pelo `json_list` com `mode: "xml"`, já do mais novo para o mais antigo. |
| WHO ICTRP | `web-who-ictrp` (https://trialsearch.who.int/) | desligada | O portal de busca (trialsearch.who.int) respondeu 502 em todos os endereços em 23/10/2026, inclusive no de um estudo, e o ICTRP não tem API pública. Os registros primários que ele agrega e que o diretório cita (ClinicalTrials.gov, ISRCTN, CTIS, ReBEC) entram direto. |
| ReBEC | `web-rebec` (a lista de ensaios novos da página inicial) | ativa | Sem feed (`/api/` responde 403, e a busca responde 404). A página inicial lista os ensaios registrados mais recentes, de todos os temas, com a data em mm/dd/aaaa declarada na própria página; a pré-triagem descarta os de outros temas. |

## Congressos e encontros

Os congressos estão em `industry/congressos.json` e aparecem na página `/agenda` do site (módulo `agenda`). A edição semanal ganha um bloco "Agenda" com os congressos em andamento ou que começam nos 30 dias seguintes a ela. As notícias de cada congresso continuam chegando pelas fontes das sociedades.

| Congresso | Data | Na agenda | Notícias |
|---|---|---|---|
| AATS Annual Meeting | 2 a 5/05/2026 | `aats-2026` | `rss-gnews-site-aats` |
| ESTS Annual Meeting | 30/05 a 1/06/2027, Zurique (o diretório citava o portal de 2027; a data é a do site do congresso) | `ests-2027` | `web-ests-news` |
| ASPO-HNS Annual Meeting | 9/04/2027, no COSM (início, como o calendário da ASPO publica) | `aspo-2027` | `rss-youtube-aspo` |
| DAS Annual Scientific Meeting | 11 a 13/11/2026, País de Gales | `das-2026` | `rss-das` |
| AABIP Annual Conference | 20 a 22/08/2026 | `aabip-2026` | `rss-gnews-aabip` |
| WCBIP | 3 a 6/12/2026, Melbourne | `wcbip-2026` | `rss-wabip`, `rss-gnews-site-wabip` |
| International Tracheostomy Symposium (ITS) | 10ª edição, 1/10/2026 | `its-2026` | `rss-youtube-gtc` |
| Congresso Brasileiro de Pneumologia e Tisiologia / Endoscopia Respiratória | 13 a 17/10/2026, Natal | `cbpt-2026` | `rss-sbpt` |
| BRONCOCON (Índia) | 26 a 28/06/2026, Pune | `broncocon-2026` | |
| Congreso ALAT | 19º, aberto em 7/07/2026, Cartagena; o 20º, de 7 a 10/07/2027, na Costa Rica | `alat-2026`, `alat-2027` | `web-alat-news` |

## As quinze fontes essenciais

| # | Fonte | Destino |
|---|---|---|
| 1 | PubMed (buscas temáticas salvas) | as 25 buscas que já existiam e as 25 novas, abaixo |
| 2 | AATS | `rss-gnews-site-aats`, `json-j-jtcvs`, `aats-2026` na agenda |
| 3 | ESTS | `web-ests-news`, `ests-2027` na agenda |
| 4 | SBCT | `json-sbct`, `web-sbct-pro-ligas`, `rss-gnews-site-sbct` |
| 5 | WABIP | `rss-wabip`, `rss-gnews-site-wabip`, `wcbip-2026` na agenda |
| 6 | AABIP | `rss-gnews-aabip`, `json-j-jbip`, `aabip-2026` na agenda |
| 7 | ASPO-HNS | `rss-youtube-aspo`, `aspo-2027` na agenda |
| 8 | ELS | `web-els-news` |
| 9 | ERS | `rss-ers-guideline`, `rss-ers-paediatric`, `rss-ers-airway`, `web-ers-guidelines-in-focus`, `json-j-erj` |
| 10 | DAS | `rss-das`, `das-2026` na agenda |
| 11 | Global Tracheostomy Collaborative | `rss-youtube-gtc`, `its-2026` na agenda |
| 12 | NTSP / Trachy Talk | `web-ntsp-news`, `rss-trachy-talk`, `rss-youtube-ntsp` |
| 13 | Cincinnati Children's | `cincinnati-research-horizons` e `cincinnati-releases` (pistas) |
| 14 | Boston Children's EAT Center | `boston-childrens-answers` (pista) |
| 15 | CHOP Airway Programs | `chop-news` (pista) |

## Buscas do PubMed

As quatro buscas prontas do diretório entraram exatamente como estavam, só passadas para uma linha. Os ajustes recomendados entram como buscas próprias. Todas estão ativas em `industry/literatura.json`, com uma mudança de 31/10/2026: o jornal passou a cobrir só a criança, e a busca de adultos (`diretorio-adulto`) saiu, assim como a consulta do Scholar sobre estenose em adultos (`scholar-estenose-adulto`). A busca pediátrica ganhou os termos de tema que só a de adultos tinha (estenose, reconstrução e próteses de traqueia e brônquio, colapso dinâmico excessivo, lesão traqueobrônquica e laríngea, tumor de traqueia, eletrocautério com termo de via aérea), e os alertas de traqueostomia e decanulação e de cirurgia estrutural ganharam o bloco de idade da busca pediátrica. Medido nos 42 dias até 31/10/2026, nada se perdeu: a busca pediátrica trouxe os mesmos 147 artigos, e os artigos que a busca de adultos e os dois alertas sem idade traziam já vinham das buscas amplas sem bloco de idade (`diretorio-tematica-sem-idade` e as outras).

| Item do diretório | Busca | Artigos por semana | Fora das buscas que já existiam |
|---|---|---|---|
| Via aérea em adultos | saiu em 31/10/2026 (era `diretorio-adulto`) | 35,5 | 26,7 |
| Via aérea pediátrica (com os termos de tema da de adultos desde 31/10/2026) | `diretorio-pediatrica` | 20,3 | 4,2 |
| Alerta de traqueostomia e decanulação (também o ajuste "concentrar em decanulação"; só crianças desde 31/10/2026) | `diretorio-traqueostomia-decanulacao` | 8,3 | 4,3 |
| Alerta de cirurgia estrutural (só crianças desde 31/10/2026) | `diretorio-cirurgia-estrutural` | 3,7 | 0,2 |
| Ajuste: bloco temático sem o bloco de idade (a união dos blocos temáticos das buscas de adulto e pediátrica) | `diretorio-tematica-sem-idade` | 88,2 | 53,5 |
| Ajuste: só reconstrução (estenose, reconstrução laringotraqueal, traqueoplastia e ressecção) | `diretorio-reconstrucao` | 6,7 | 0 |
| Ajuste: manejo anestésico, separado (MeSH de manejo e intubação, via aérea e intubação difíceis, videolaringoscopia, dispositivo supraglótico, extubação, acesso cervical) | `diretorio-manejo-anestesico` | 67,2 | 50,3 |
| Ajuste: doença e cirurgia estrutural, separada (o bloco temático sem os quatro termos de manejo anestésico) | `diretorio-doenca-estrutural` | 59,2 | 31,5 |
| Ajuste: diretrizes por termos livres e tipos de publicação (bloco temático com guideline, consensus, recommendation, position statement, expert panel, Delphi e os tipos Guideline, Practice Guideline e Consensus Development Conference) | `diretorio-diretrizes` | 10,2 | 6,7 |
| Periódicos do diretório nos temas de via aérea (veja Periódicos) | `periodicos-sem-feed` | 2,7 | 1,0 |

Medição (anterior à mudança de 31/10/2026): esearch por data de entrada no PubMed (EDAT) em seis janelas de 7 dias, de 10/09 a 21/10/2026, com o filtro de idioma do módulo. As colunas não somam, porque as buscas se sobrepõem muito: a temática sem idade contém quase todas as outras. Juntas, as 25 buscas novas trazem 78,5 artigos por semana que as 25 antigas não traziam.

## Google Scholar

O Google Scholar não tem feed nem API pública. Cada consulta entrou como a busca equivalente mais próxima no PubMed, com os mesmos termos ligados por AND e as frases entre aspas. A diferença é que o PubMed procura em todos os campos do registro, e não no texto completo, como o Scholar.

Foi escolhido o PubMed, e não o Europe PMC, para que os artigos sigam o mesmo caminho dos outros: viram matéria do Fôlego, sem duplicar o artigo que outra busca já trouxe. Os preprints, que o Scholar também cobre, chegam por `json-medrxiv-airway` e `json-biorxiv-airway`.

| Tema | Consulta no Scholar | Busca no PubMed |
|---|---|---|
| Estenose em adultos | "subglottic stenosis" adult treatment | saiu em 31/10/2026 (era `scholar-estenose-adulto`): o jornal cobre só a criança |
| Ressecção cricotraqueal | "cricotracheal resection" outcomes | `scholar-ressecao-cricotraqueal` |
| Ressecção traqueal | "tracheal resection" reconstruction outcomes | `scholar-ressecao-traqueal` |
| Reconstrução pediátrica | "laryngotracheal reconstruction" children | `scholar-reconstrucao-pediatrica` |
| Traqueoplastia congênita | "slide tracheoplasty" "complete tracheal rings" | `scholar-traqueoplastia-congenita` |
| Criança traqueostomizada | "pediatric tracheostomy" guideline | `scholar-crianca-traqueostomizada` |
| Decanulação | tracheostomy decannulation children bronchoscopy | `scholar-decanulacao` |
| Malácia | tracheobronchomalacia tracheopexy outcomes | `scholar-malacia` |
| Próteses | "airway stent" benign stenosis | `scholar-proteses` |
| Broncoscopia terapêutica | "therapeutic bronchoscopy" "central airway obstruction" | `scholar-broncoscopia-terapeutica` |
| Fenda laríngea | "laryngeal cleft" endoscopic repair | `scholar-fenda-laringea` |
| Paralisia bilateral | "bilateral vocal fold paralysis" airway surgery | `scholar-paralisia-bilateral` |
| Corpo estranho | "foreign body aspiration" children bronchoscopy | `scholar-corpo-estranho` |
| Trauma | "tracheobronchial injury" surgical management | `scholar-trauma` |
| ECMO | ECMO "airway surgery" | `scholar-ecmo` |

Todas estão ativas. Cada uma traz de 0 a 0,5 artigo por semana, e nenhum desses artigos ficava fora das buscas que já existiam.

## Google Alerts

Cada consulta entrou como uma busca do Google News em RSS, como as fontes `rss-gnews-*` que já existiam, inclusive as com `site:`. Todas estão ativas, com nível T2. O Google News devolve os resultados por relevância, e muitos são antigos; a coleta só publica o que aparecer depois de a fonte ser importada.

| Finalidade | Consulta | Fonte |
|---|---|---|
| Estenose laringotraqueal | "laryngotracheal stenosis" | `rss-gnews-laryngotracheal-stenosis` |
| Reconstrução | "laryngotracheal reconstruction" | `rss-gnews-laryngotracheal-reconstruction` |
| Ressecção | "cricotracheal resection" | `rss-gnews-cricotracheal-resection` |
| Traqueostomia pediátrica | "pediatric tracheostomy" guideline | `rss-gnews-pediatric-tracheostomy-guideline` |
| Grafia britânica | "paediatric tracheostomy" guideline | `rss-gnews-paediatric-tracheostomy-guideline` (edição do Reino Unido) |
| Decanulação | tracheostomy decannulation guideline | `rss-gnews-decannulation-guideline` |
| Malácia | tracheobronchomalacia tracheopexy | `rss-gnews-tracheobronchomalacia` |
| Broncoscopia | "central airway obstruction" bronchoscopy | `rss-gnews-central-airway-obstruction` |
| Próteses | "airway stent" guideline | `rss-gnews-airway-stent` |
| Via aérea difícil | "difficult airway" guideline | `rss-gnews-difficult-airway` |
| Fendas | "laryngeal cleft" surgery | `rss-gnews-laryngeal-cleft` |
| Corpo estranho | "foreign body aspiration" bronchoscopy | `rss-gnews-foreign-body-aspiration` |
| Tumores traqueais | "tracheal tumor" surgery | `rss-gnews-tracheal-tumor` |
| ECMO e via aérea | ECMO "airway surgery" | `rss-gnews-ecmo-airway-surgery` |
| Brasil: estenose | "estenose de traqueia" | `rss-gnews-estenose-traqueia` |
| Brasil: pediatria | "traqueostomia pediátrica" | `rss-gnews-traqueostomia-pediatrica` |
| América Latina | "estenosis traqueal" cirugía | `rss-gnews-estenosis-traqueal` (edição latino-americana) |
| Cincinnati Children's | site:cincinnatichildrens.org "airway" | saiu em 31/10/2026 (era `rss-gnews-site-cincinnati`): o link do item redireciona por JavaScript e não leva ao artigo |
| Boston Children's | site:answers.childrenshospital.org tracheomalacia | saiu em 31/10/2026 (era `rss-gnews-site-boston-answers`): o link do item redireciona por JavaScript e não leva ao artigo |
| CHOP | site:chop.edu "airway" reconstruction | saiu em 31/10/2026 (era `rss-gnews-site-chop`): o link do item redireciona por JavaScript e não leva ao artigo |
| WABIP | site:wabip.com guideline airway | `rss-gnews-site-wabip` |
| SBCT | site:sbct.com.br traqueia | `rss-gnews-site-sbct` |

## Pendências apontadas pelo próprio diretório

| Pendência | Destino |
|---|---|
| URLs sem teste HTTP individual | todas foram lidas do servidor nesta verificação; o resultado está nas tabelas acima |
| Datas editoriais por fonte | a data de cada item vem do feed, da lista ou da matéria; o coletor passou a ler as datas por extenso e numéricas que essas fontes usam |
| Páginas e alertas dos periódicos essenciais | seção Periódicos |
| Inspeção de RSS reais | cada feed cadastrado foi lido pela pré-visualização |
| Organizações independentes de pacientes | o diretório não nomeia nenhuma além da GTC e do NTSP; `rss-unidos-pela-vida` já existia |
| Redes sociais | os canais do YouTube entraram; os perfis de X, Instagram e LinkedIn entram pela integração das redes, tarefa à parte (seção Redes sociais) |
| Centros europeus, latino-americanos, asiáticos e australianos | os que já eram coletados, mais o Instituto Nacional del Tórax e, pelo YouTube, Cambridge University Hospitals e Narayana Health |
| Corpo estranho, trauma laringotraqueal e ECMO com cirurgia de via aérea | buscas do PubMed que já existiam (`corpo-estranho`, `trauma-laringotraqueal`, `ecmo-via-aerea`), as do Scholar, os alertas do Google News e as buscas novas do ClinicalTrials.gov |
| WHO ICTRP, CTIS, ReBEC, ISRCTN, medRxiv e bioRxiv | seção Registros e preprints |

## Redes sociais

Segundo diretório do dono: perfis, canais, pesquisas e hashtags para garimpar notícias, artigos, cursos, casos e congressos de via aérea.

Os vídeos do YouTube e o podcast entram já, pelo RSS do canal de cada vídeo listado e pelo feed do podcast. Os perfis de X, Instagram e LinkedIn e as pesquisas e hashtags ficam registrados aqui como "integração das redes": as três redes exigem login ou uma API paga para ler, e entram pela tarefa à parte de integração das redes sociais (X pelo SocialData, Instagram pelo ScrapeCreators, LinkedIn pelos sites das instituições), não por este PR. Os perfis comerciais servem só para descobrir tecnologia, nunca como fonte primária de eficácia.

### YouTube e podcast

O diretório lista vídeos avulsos, de 2014 a 2023. Entrou o canal de cada um, confirmado pelo oEmbed do YouTube, com o título do canal no próprio feed.

| Vídeo do diretório | Canal | Fonte | Situação |
|---|---|---|---|
| https://www.youtube.com/watch?v=3Oxe2Q6DZ_Y (corpo estranho pediátrico, broncoscopia rígida) | Mayo Clinic | `rss-youtube-mayo-clinic` | ativa |
| https://www.youtube.com/watch?v=nHKze9KkeTU (corpo estranho pediátrico e anestesia) | AirwayOnDemand from Dr. Will Rosenblatt | `rss-youtube-airway-on-demand` | ativa |
| https://www.youtube.com/watch?v=u0cBIFHwAAc (broncoscopia pediátrica e neonatal) | Cambridge University Hospitals NHS (CUHNHS) | `rss-youtube-cuh-nhs` | ativa |
| https://www.youtube.com/watch?v=0wJrjaj5_0s (broncoscopia de emergência, corpo estranho) | Chesterfield Royal Hospital | `rss-youtube-chesterfield-royal` | ativa |
| https://www.youtube.com/watch?v=ubFqPe8OluY (reconstrução pediátrica, traqueomalácia, estenose) | Narayana Health | `rss-youtube-narayana-health` | ativa |
| https://www.youtube.com/watch?v=yhGcuTHSnXk (via aérea pediátrica normal) | Romaine Johnson | `rss-youtube-romaine-johnson` | ativa (último vídeo em 21/07/2025) |
| NTSP — Trachy Talk (podcast) | | `rss-trachy-talk` | ativa |

Os canais dos hospitais são gerais (Mayo Clinic, CUH, Chesterfield e Narayana publicam de tudo), por isso nível T2; a pré-triagem descarta os vídeos de outros temas.

### Sites citados no diretório de redes

| Site | Destino |
|---|---|
| WABIP (https://www.wabip.com/) | `rss-wabip` |
| AABIP (https://www.aabronchology.org/) | sem feed nem notícias; `rss-gnews-aabip` |
| CHOP, Cincinnati Children's, Boston Children's | as fontes desses centros (seção Centros de referência) |

### Perfis no X

| Perfil | Foco | Situação |
|---|---|---|
| Difficult Airway Society, https://x.com/dasairway (publicações de exemplo: https://x.com/dasairway/status/2074120130640900458 e https://x.com/dasairway/status/1993238096993763446) | via aérea difícil, intubação, diretrizes, webinars | integração das redes (a DAS já entra por `rss-das`) |
| Difficult Airway Society Residents, https://x.com/dasresidents | educação, congressos, pesquisa | integração das redes |
| Journal of Bronchology & Interventional Pulmonology, https://x.com/JBronchOnline | broncoscopia intervencionista, próteses, obstrução central | integração das redes (os artigos já entram por `json-j-jbip`) |
| Karthik Balakrishnan, MD, https://x.com/KBalakrishnanMD | reconstrução de laringe, traqueia e via aérea pediátrica | integração das redes |
| Eric Levi, MD, https://x.com/DrEricLevi | ORL pediátrica, traqueostomia | integração das redes |
| Abdullah Sindi, https://x.com/3bdallahSindi | estenose subglótica, dilatação, reconstrução | integração das redes |
| ENT Papers, https://x.com/ENT_Papers | curadoria de artigos de ORL e via aérea | integração das redes |
| Suveer Singh / Respitudoc, https://x.com/respitudoc | broncoscopia, pneumologia intervencionista | integração das redes |
| Ali Abedi, MD, https://x.com/DocAbedi | pneumologia intervencionista, próteses, traqueostomia | integração das redes |
| ANZ Society of Paediatric Otorhinolaryngology, https://x.com/ANZSPO | ORL pediátrica, broncoscopia, congressos | integração das redes |
| VisionAir Solutions (comercial), https://x.com/VisionAirStents | próteses de silicone personalizadas | integração das redes; só para descobrir tecnologia |

Listas temáticas do diretório, que entram junto com os perfis:
- **Airway guidelines:** @dasairway, @dasresidents, @ENT_Papers, @JBronchOnline;
- **Pediatric airway:** @KBalakrishnanMD, @DrEricLevi, @3bdallahSindi, @ANZSPO;
- **Bronchoscopy / devices:** @respitudoc, @DocAbedi, @VisionAirStents, @JBronchOnline.

### Perfis no LinkedIn

| Perfil | Foco | Situação |
|---|---|---|
| Global Tracheostomy Collaborative, https://www.linkedin.com/company/the-global-tracheostomy-collaborative | segurança, qualidade, desfechos | integração das redes (a GTC já entra por `rss-youtube-gtc`) |
| National Tracheostomy Safety Project, https://www.linkedin.com/company/national-tracheostomy-safety-project | emergências, algoritmos, treinamento | integração das redes (o NTSP já entra por `web-ntsp-news`, `rss-trachy-talk`, `rss-youtube-ntsp`) |
| Atos Medical US (comercial), https://www.linkedin.com/company/atos-medical-us | laringectomia, estoma, dispositivos | integração das redes; só para descobrir tecnologia |
| Boston Medical Products (comercial), https://www.linkedin.com/company/boston-medical-products-inc- | produtos e educação em traqueostomia | integração das redes; só para descobrir tecnologia |
| Stening (comercial), https://www.linkedin.com/company/stening | próteses traqueobrônquicas, tubos em T | integração das redes; só para descobrir tecnologia |
| I:Emedics (comercial), https://www.linkedin.com/company/i-emedics-pte-ltd | broncoscopia e via aérea, Ásia | integração das redes; só para descobrir tecnologia |

### Publicações no Instagram

O diretório lista publicações avulsas, com o autor a conferir. Cada uma fica aqui até a integração do Instagram (ScrapeCreators, tarefa à parte), que permita também confirmar a conta de origem.

| Publicação | Tema | Situação |
|---|---|---|
| https://www.instagram.com/p/DOQuGhsjuax/ | Bronchoscopy and Interventional Pulmonology: prótese de silicone, broncoscopia rígida | integração das redes |
| https://www.instagram.com/p/CXJm4UkvpMi/ | equipe de Stanford: reconstrução pediátrica complexa | integração das redes |
| https://www.instagram.com/p/DCZQZgDq3-O/ | children's airway / complex airway | integração das redes |
| https://www.instagram.com/p/DZNjhn3kRYb/ | pediatric airway research | integração das redes |
| https://www.instagram.com/p/C4BB-o_xWh6/ | tracheostomy education | integração das redes |
| https://www.instagram.com/reel/DbcuJcOO0s0/ | airway stent case (reel) | integração das redes |
| https://www.instagram.com/reel/Ddi2nNoOp-v/ | pediatric tracheostomy education (reel) | integração das redes |
| https://www.instagram.com/p/DBYwzXVMVe_/ | laryngotracheal reconstruction patient story | integração das redes |

### Pesquisas no X

Todas entram pela integração do X (SocialData, tarefa à parte).

| Pesquisa |
|---|
| ("airway stenosis" OR "subglottic stenosis") -crypto -fitness |
| ("laryngotracheal reconstruction" OR "cricotracheal resection") |
| ("pediatric airway" OR "paediatric airway") (surgery OR reconstruction) |
| (tracheostomy OR tracheotomy) (decannulation OR guideline) |
| (tracheobronchomalacia OR bronchomalacia) (tracheopexy OR bronchoscopy) |
| ("central airway obstruction" OR "airway stent") bronchoscopy |
| ("foreign body aspiration" OR "rigid bronchoscopy") pediatric |
| ("difficult airway" OR "awake intubation") guideline |
| (airway OR tracheal) (ECMO OR extracorporeal) |

### Hashtags no Instagram e no LinkedIn

Entram pela integração das redes (Instagram pelo ScrapeCreators, LinkedIn pelos sites; tarefa à parte): #AirwayManagement, #DifficultAirway, #PediatricAirway, #PaediatricAirway, #AirwayReconstruction, #LaryngotrachealReconstruction, #SubglotticStenosis, #TrachealStenosis, #Tracheostomy, #TracheostomyCare, #Decannulation, #Tracheomalacia, #Bronchomalacia, #InterventionalPulmonology, #RigidBronchoscopy, #AirwayStent, #Laryngology, #PediatricENT, #ThoracicSurgery, #ECMO.

### Filtro de ruído e ordem sugeridos pelo diretório

O checklist do diretório para separar ruído:
1. Há DOI, PMID, diretriz ou link para congresso?
2. O perfil é de sociedade, periódico, hospital, pesquisador ou fabricante?
3. A publicação informa data, população, técnica e desfecho?
4. Há conflito comercial explícito?
5. É adulto, pediátrico ou misto?
6. É demonstração técnica ou recomendação clínica?
7. Está dentro dos últimos 12 meses?
8. O artigo original está indexado no PubMed ou num periódico com avaliação editorial verificável?

Esses critérios já são os da pré-triagem e das notas (`industry/prompts/`). Valem para as redes quando a integração das redes entrar.

A ordem de prioridade do diretório:
1. DAS;
2. ENT Papers e JBronchOnline;
3. KBalakrishnanMD, DrEricLevi e 3bdallahSindi;
4. WABIP, AABIP e Respitudoc;
5. GTC e NTSP;
6. CHOP, Cincinnati, Boston e SickKids;
7. fabricantes, só para detectar tecnologia.

Fica registrada para quando os perfis puderem ser lidos.

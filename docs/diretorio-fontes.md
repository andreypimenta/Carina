# Diretório de fontes de via aérea: destino de cada item

Em 23/10/2026 o dono do Fôlego enviou um diretório curado de fontes online sobre manejo, doenças e cirurgia de vias aéreas (adulto e pediatria) e pediu que tudo entrasse no jornal, sem exceção. Este documento dá o destino de cada item do diretório: como entrou (o id da fonte em `industry/sources.json` ou o da busca em `industry/literatura.json`), se está ativo e, quando não está, o motivo verificado.

Como foi verificado: cada feed e cada página de lista passou pelo caminho de pré-visualização do Painel (`previewSource`: a mesma leitura e os mesmos filtros da coleta, sem gravar nada). Quando a data vem da página da matéria (`detail`), a leitura da matéria (`fetchDetail`) também foi rodada nos primeiros itens. As buscas do PubMed foram rodadas com a função do próprio módulo (`searchPmids`, GET no esearch). Tudo foi testado a partir do servidor do site. Quando a URL do diretório é uma página estática (sobre, programa, inscrição), foi procurado o portal de notícias da instituição.

"Ativa" quer dizer que a fonte entra ligada e trouxe itens com data. "Desligada" quer dizer que ela está cadastrada em `industry/sources.json` com `enabled: false`; pode ser ligada no Painel → Fontes quando o motivo deixar de valer. "Só aqui" quer dizer que não há o que cadastrar (nenhum feed, lista ou API utilizável), e o item fica registrado só nesta tabela.

## Periódicos

Quando a editora publica um feed de sumário com data por artigo, ele entra como fonte de notícias (nível T1). Quando não publica, ou o feed não serve, os artigos de via aérea do periódico vêm pela busca `periodicos-sem-feed` do PubMed (o título do periódico em `[ta]` e o bloco temático do diretório), e viram matéria do Fôlego como os outros artigos do PubMed.

| Periódico | Como entrou | Situação | Motivo |
|---|---|---|---|
| Respiratory Endoscopy (J-STAGE) | `rss-jstage-respend` (WebAPI pública do J-STAGE, Atom por artigo) | ativa | O RSS de novidades do J-STAGE (`AF05S010NewRssDld`) vem vazio para esta revista; a WebAPI lista os artigos com data. Ela devolve os mais antigos primeiro, por isso a fonte ordena por data e pede a partir de 2026 (`pubyearfrom=2026`, até 1000 artigos). |
| The Journal of the Japan Society for Respiratory Endoscopy (気管支学) | `rss-jstage-jjsre` (WebAPI do J-STAGE) | ativa | O RSS de novidades do J-STAGE só diz "新着記事を登載しました" e aponta todos os itens para a página da revista. Os títulos e resumos estão em japonês. |
| Acta Anaesthesiologica Scandinavica | `rss-j-acta-anaesth-scand` (RSS Wiley) | ativa | |
| Pediatric Pulmonology | `rss-j-pediatric-pulmonology` (RSS Wiley) | ativa | |
| Otolaryngologic Clinics of North America | `periodicos-sem-feed` (PubMed); `rss-j-otolaryngol-clin` | busca ativa; feed desligado | O RSS do ScienceDirect não traz data no item (só o texto "Available online…" no resumo), e a página do artigo responde 403. Item sem data não é publicado. |
| American Journal of Respiratory and Critical Care Medicine (diretriz ATS) | `periodicos-sem-feed`; `rss-j-ajrccm` | busca ativa; feed desligado | O feed do atsjournals.org redireciona para academic.oup.com, que responde 403 (página de desafio do Cloudflare). A URL do diretório é um registro institucional (Johns Hopkins), não uma lista; a diretriz de traqueostomia pediátrica também chega por `traqueostomia-pediatrica` e `diretorio-diretrizes`. |
| The Journal of Thoracic and Cardiovascular Surgery | `periodicos-sem-feed`; `rss-j-jtcvs` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. |
| The Annals of Thoracic Surgery | `periodicos-sem-feed`; `rss-j-ann-thorac-surg` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. |
| European Journal of Cardio-Thoracic Surgery | `periodicos-sem-feed` | busca ativa; feed só aqui | academic.oup.com responde 403 à página da revista, e o endereço do feed não pôde ser lido. |
| The Laryngoscope | `rss-j-laryngoscope` (RSS Wiley) | ativa | |
| International Journal of Pediatric Otorhinolaryngology | `periodicos-sem-feed`; `rss-j-ijporl` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. |
| Journal of Bronchology & Interventional Pulmonology | `periodicos-sem-feed`; `rss-j-jbip` | busca ativa; feed desligado | O feed do journals.lww.com responde 403. |
| CHEST | `periodicos-sem-feed`; `rss-j-chest` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. Os comunicados da CHEST já entram por `web-chest-press`. |
| European Respiratory Journal | `periodicos-sem-feed`; `rss-j-erj` | busca ativa; feed desligado | O feed do publications.ersnet.org responde 403 (Cloudflare). |
| British Journal of Anaesthesia | `periodicos-sem-feed`; `rss-j-bja` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. |
| Anaesthesia | `rss-j-anaesthesia` (RSS Wiley) | ativa | |
| Anesthesiology | `periodicos-sem-feed`; `rss-j-anesthesiology` | busca ativa; feed desligado | A revista está no journals.lww.com, que responde 403 à página e ao feed. |
| Journal of Pediatric Surgery | `periodicos-sem-feed`; `rss-j-j-pediatr-surg` | busca ativa; feed desligado | ScienceDirect: item sem data e artigo com 403. |
| Critical Care | `rss-j-critical-care` (RSS de busca do Springer) | ativa | O feed antigo (ccforum.biomedcentral.com) redireciona para o Springer; o RSS de busca do Springer por periódico traz os artigos com data. |
| Pediatric Critical Care Medicine | `periodicos-sem-feed`; `rss-j-pccm` | busca ativa; feed desligado | O feed do journals.lww.com responde 403. |
| Respiratory Care | `periodicos-sem-feed` | busca ativa; feed só aqui | A revista passou para o SAGE: o feed antigo (rc.rcjournal.com) redireciona para a página da revista no journals.sagepub.com, que responde 403, e o feed da Liebert responde 404. |

Os feeds de sumário trazem todos os artigos do periódico, não só os de via aérea. A pré-triagem descarta os de outros temas.

## Sociedades e diretrizes

### Internacionais e norte-americanas

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| AAO-HNS / AAO-HNSF: Clinical Practice Guidelines | `json-aaohns` (API REST do WordPress do entnet.org, tipo `resource`) | ativa | A lista de diretrizes do diretório é montada por JavaScript, e o feed do site vem vazio. A API traz todos os recursos publicados (diretrizes, comunicados, consensos, avisos), com data; o título vem da página (`detail`), porque a API o entrega com entidades HTML (`&#8211;`). A página inicial respondeu 403 numa das tentativas. |
| ASPO-HNS | `rss-youtube-aspo` (canal oficial no YouTube) | ativa | O site não tem página de notícias, e o feed do calendário de eventos (JEvents) vem vazio. A página do congresso anual é estática. |
| AATS | `web-aats-newsroom` | desligada | A lista do newsroom não tem data, e a matéria também não (sem `article:published_time`, JSON-LD ou `<time>`). Os artigos do JTCVS chegam por `periodicos-sem-feed`. |
| AABIP | `rss-aabip-conference` | desligada; resto só aqui | O site (aabip.memberclicks.net) não tem notícias, só páginas de cursos e newsletters em PDF. O feed do site do congresso (aabipconference.com) só tem os posts de demonstração do tema, de 2023. Os artigos do JBIP chegam por `periodicos-sem-feed`. |
| WABIP | `rss-wabip`, `rss-gnews-site-wabip` | ativa | O site às vezes recusa a conexão (aconteceu em várias tentativas de 23/10/2026); a coleta tenta de novo na rodada seguinte. O site multilíngue responde em chinês ao `accept-language` do coletor, por isso a fonte troca os links `/zh/` pelos em inglês (`itemUrlPrefixRewrite`). |
| Society for Airway Management (SAM) | `rss-sam` | ativa | Publica pouco (último post em 05/06/2026). |
| Global Tracheostomy Collaborative (GTC) | `rss-youtube-gtc` (canal oficial no YouTube) | ativa | O site não tem notícias, e o feed do calendário de eventos (JEvents) vem vazio. |

### Europa e Oceania

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| ESTS | `web-ests-news` (já existia) | ativa | |
| ERS: Guidelines Development | `rss-ers-guideline` (feed de busca do WordPress, "guideline"); `rss-ers-paediatric` e `rss-ers-airway` já existiam | ativa | |
| European Laryngological Society (ELS) | `web-els-news` | ativa | Página inicial, com os 3 destaques e a data em `<time>`. |
| Difficult Airway Society (DAS): Guidelines | `rss-das` | ativa | O feed da categoria de notícias traz os mesmos posts do feed geral. Último post em 31/03/2026. |
| National Tracheostomy Safety Project (NTSP) | `rss-trachy-talk`, `rss-youtube-ntsp`; `web-ntsp-news` | podcast e YouTube ativos; notícias desligadas | A lista de notícias mostra a data como "18/09/2026" (dd/mm/aaaa), formato que o coletor não lê, e a matéria não tem data legível. |
| SFORL | `rss-sforl-mediatheque`; `rss-sforl` | médiathèque ativa; feed do site desligado | O feed do sforl.org está parado desde 24/01/2025, e a página de produção científica é uma lista de PDFs sem data. A médiathèque (webinars, vídeos) tem feed com data. |
| ANZCA Library: Airway Management | só aqui | | É um guia LibGuides: uma coletânea de links sem lista datada e sem feed. |

### Brasil e América Latina

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| SBCT: Pró-Ligas | `json-sbct` (API REST do WordPress, categoria Notícias), `rss-gnews-site-sbct`; `web-sbct` (já existia) e `rss-youtube-sbct` | notícias e Google News ativas; lista e YouTube desligados | A API traz as notícias com data; o título vem da página (`detail`, a tag `<title>`, que termina em " – SBCT"). A página de notícias, lida pela `web-sbct`, não tem data. As aulas do Pró-Ligas abrem em lightbox, sem link próprio, e a data só aparece no título ("Vídeo 41 - 08/08/2026"). O feed do canal da SBCT no YouTube não lista nenhum vídeo (as aulas não são públicas no canal). |
| SBPT | `rss-sbpt` (já existia) | ativa | |
| ABORL-CCF | `rss-aborl` (já existia) | ativa | |
| ALAT | `web-alat-news` | ativa | A data da lista está em espanhol ("30 de mayo de 2026"), que o coletor não lê; ela vem do JSON-LD da matéria (`detail`). |
| SAESP: via aérea | `web-saesp-news` | ativa | O feed do WordPress está desligado (redireciona para a página inicial), e a data da lista vem como "24/09/26". A data vem da matéria (`detail`). |

### Ásia

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| Japan Society for Respiratory Endoscopy (JSRE) | `web-jsre-news` | ativa | Lista de avisos "学会から", com a data "2026年8月31日", fuso `+09:00`. |
| Indian Association for Bronchology (IAB) | só aqui | | O site só tem páginas de eventos, sem data na lista e sem feed. |
| APIPA | `rss-apipa` | desligada | O feed está abandonado: só um post "testing", de 2019. A página de reuniões é uma lista de PDFs sem data. |

### Sociedades que o diretório ainda não tinha validado

| Fonte | Como entrou | Situação |
|---|---|---|
| ATS (catálogo de diretrizes) | `web-ats-press` (já existia); as diretrizes saem no AJRCCM e no *Annals ATS* e chegam pelas buscas do PubMed (`diretorio-diretrizes`, `periodicos-sem-feed`) | ativa |
| STS | `web-sts-press` (já existia) | ativa |
| ESPO | só aqui: já tinha sido avaliada e deixada de fora por não ter feed (veja `docs/fontes.md`) | |
| Outras sociedades nacionais | o diretório não nomeia nenhuma | |

## Centros de referência

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| Cincinnati Children's: Airway Reconstruction Research e Research Horizons | `rss-cincinnati-research-horizons`, `web-cincinnati-releases` (já existiam); `rss-gnews-site-cincinnati` | ativa | A página do programa é estática; o blog e os comunicados já eram coletados. |
| Boston Children's: Esophageal and Airway Treatment Center e Answers | `rss-boston-childrens-answers` (já existia); `rss-gnews-site-boston-answers` | ativa | A página do centro é estática. |
| CHOP: Neonatal Airway Program | `web-chop-news` (já existia); `rss-gnews-site-chop` | ativa | A página do programa é estática. |
| SickKids: DREAMS e pesquisa de via aérea | `web-sickkids-news` (já existia) | ativa | A página da clínica é estática; a notícia citada está no newsroom. |
| Children's Hospital Colorado: Advances & Answers | `web-childrens-colorado` | desligada | A data só aparece como "10/21/2026" (mm/dd/aaaa), na lista e na matéria, formato que o coletor não lê. |
| Instituto Nacional del Tórax: Broncoscopía (Chile) | `rss-torax-cl` (feed de notícias do instituto) | ativa | A página de broncoscopia é operacional; o feed do site traz as notícias do instituto (último item em 07/08/2026). |
| Great Ormond Street | `web-gosh-news` (já existia) | ativa | |
| Mass General | só aqui | | O endereço de notícias leva a news.massgeneralbrigham.org, montado por JavaScript (a página chega sem as matérias) e sem feed (`/feed/` responde 404). |
| Mayo Clinic | `rss-mayo-news-network` (já existia) | ativa | |
| Centros europeus e latino-americanos adicionais | o diretório não nomeia nenhum; já são coletados Sant Joan de Déu, Pequeno Príncipe, HCPA e agora o Instituto Nacional del Tórax | | |

## Notícias e agregadores

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| Healio: Pulmonology | `rss-healio-pulmonology` | ativa | O feed da seção (`/sws/feed/news/pulmonology`) voltou a publicar; traz também matérias de outras seções marcadas com pneumologia. |
| EurekAlert! | `web-eurekalert` | desligada | Os feeds RSS antigos (`/rss/*.xml`) respondem 404. Na lista e no comunicado a data vem como "23-Oct-2026", formato que o coletor não lê, e o `<time datetime>` do comunicado vem preenchido com "TODO". |
| Medscape | `rss-medscape-pulmonary` | desligada | Os feeds por especialidade existem (`/cx/rssfeeds/<n>.xml`; os de notícias e de terapia intensiva responderam com RSS), mas o Medscape passou a responder 429 com a página de desafio do Cloudflare a este servidor, e não deu para confirmar o número do feed de pneumologia. Confira o título do feed antes de ligar. |
| ENTtoday | `rss-enttoday` (já existia) | ativa | |
| MDedge | só aqui | | Não tem feed, e a página de pneumologia não mostra matéria posterior a 25/11/2025. |
| Outros agregadores | o diretório não nomeia nenhum | | |

## Pacientes e familiares

| Fonte | Como entrou | Situação |
|---|---|---|
| Global Tracheostomy Collaborative: People with a Tracheostomy / Membership | `rss-youtube-gtc` (veja Sociedades) | ativa |
| National Tracheostomy Safety Project | `rss-trachy-talk`, `rss-youtube-ntsp` (veja Sociedades) | ativa |

## Podcasts, vídeos e redes

Episódios de podcast e vídeos entram como itens de notícia, com o título e a descrição do feed.

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| Trachy Talk (NTSP) | `rss-trachy-talk` (feed Buzzsprout, achado pela API pública de lookup do iTunes) | ativa | Alguns episódios não têm página; o link é o arquivo de áudio. |
| ERS Respiratory Channel: Guidelines in Focus | `rss-ers-channel` | desligada | O RSS do canal tem títulos genéricos ("Replay", "Guidelines in Focus") e os links dos vídeos respondem 404 fora do login. A página do canal 38 mostra a data como "10.08.2026" (dd.mm.aaaa), que o coletor não lê. As diretrizes da ERS chegam por `rss-ers-guideline`. |
| SBCT Pró-Ligas: aulas em vídeo | `rss-youtube-sbct` | desligada | Veja SBCT acima. |
| La médiathèque de la SFORL | `rss-sforl-mediatheque` | ativa | |
| ANZCA Library: Apps, Podcasts & Online Lectures | só aqui | | Guia LibGuides, sem lista datada e sem feed. |
| Global Tracheostomy Collaborative no LinkedIn | só aqui | | O LinkedIn exige login para ler a página da empresa. O canal da GTC no YouTube entra no lugar. |

## Registros e preprints

Os preprints entram com o nome da fonte dizendo "sem revisão por pares", e as regras de redação já proíbem chamar preprint de publicado ou revisado (`industry/prompts/rules-anti-hallucination.md`).

| Fonte | Como entrou | Situação | Motivo |
|---|---|---|---|
| ClinicalTrials.gov | as 10 buscas que já existiam e 10 novas: `rss-ctgov-tracheostomy-adult`, `-difficult-airway`, `-airway-management`, `-central-airway`, `-foreign-body`, `-tbm-edac`, `-vocal-cord-paralysis`, `-decannulation`, `-airway-trauma`, `-ecmo-airway` | ativa | Só estudos novos (`dateField=StudyFirstPostDate`). Em 12 meses, as novas somam cerca de 4 estudos por semana, quase todos de traqueostomia em adultos, via aérea difícil e manejo da via aérea. |
| arXiv | `rss-arxiv-airway` (API pública do arXiv, Atom, por data de envio) | ativa | Engenharia, imagem e acústica; não é evidência clínica. |
| medRxiv | `json-medrxiv-airway` (API REST do Europe PMC, preprints do medRxiv com termos de via aérea) | ativa | |
| bioRxiv | `json-biorxiv-airway` (Europe PMC, preprints do bioRxiv) | ativa | |
| CTIS (UE) | `json-ctis-airway` (API pública de busca do CTIS, POST) | desligada | A API responde, mas todas as datas vêm como "31/08/2026" (dd/mm/aaaa), e a página do estudo é montada por JavaScript. |
| ISRCTN | só aqui | | O site pede cookies e JavaScript, e a API (`/api/query/format/default`) devolve um XML próprio, que não é RSS, Atom nem JSON. |
| WHO ICTRP | só aqui | | trialsearch.who.int respondeu 502, e o ICTRP não tem API pública de busca. |
| ReBEC | só aqui | | Sem feed; `/api/` responde 403 e a busca (`/rg/?q=`) responde 404. Veja também `docs/fontes.md`. |

## Congressos e encontros

O jornal não tem uma agenda de eventos. As notícias dos congressos chegam pelas fontes das sociedades; as datas anunciadas no diretório ficam registradas aqui.

| Congresso | Data anunciada | Como entrou | Situação |
|---|---|---|---|
| AATS Annual Meeting | 2 a 5/05/2026 | página do congresso estática; `web-aats-newsroom` desligada (veja AATS) | só aqui |
| ESTS Annual Meeting | portal de 2027 | `web-ests-news`; `rss-ests-meeting` desligada (o feed do estsmeeting.com vem vazio) | ativa pela ESTS |
| ASPO-HNS Annual Meeting | anual | `rss-youtube-aspo` | ativa |
| DAS Annual Scientific Meeting | 11 a 13/11/2026 | `rss-das` (a categoria de notícias citada no diretório) | ativa |
| AABIP Annual Conference | 20 a 22/08/2026 | `rss-aabip-conference` | desligada (veja AABIP) |
| WCBIP | 3 a 6/12/2026, Melbourne | `rss-wabip`, `rss-gnews-site-wabip` | ativa |
| International Tracheostomy Symposium (ITS) | 10ª edição, 1/10/2026 | `rss-youtube-gtc`; a página de congressos anteriores é estática | ativa pela GTC |
| Congresso Brasileiro de Pneumologia e Tisiologia / Endoscopia Respiratória | 13 a 17/10/2026 | `rss-sbpt` (as notícias do congresso saem no feed da SBPT) | ativa |
| BRONCOCON (Índia) | 26 a 28/06/2026 | só aqui: site do evento estático, e a IAB não tem feed | |
| Congreso ALAT | 2026 | `web-alat-news` (as notícias do congresso saem nas novidades da ALAT) | ativa |

## As quinze fontes essenciais

| # | Fonte | Destino |
|---|---|---|
| 1 | PubMed (buscas temáticas salvas) | as 25 buscas que já existiam e as 25 novas, abaixo |
| 2 | AATS | `web-aats-newsroom` (desligada) e JTCVS por `periodicos-sem-feed` |
| 3 | ESTS | `web-ests-news` |
| 4 | SBCT | `json-sbct`, `rss-gnews-site-sbct`; `web-sbct` e `rss-youtube-sbct` desligadas |
| 5 | WABIP | `rss-wabip`, `rss-gnews-site-wabip` |
| 6 | AABIP | `rss-aabip-conference` (desligada) e JBIP por `periodicos-sem-feed` |
| 7 | ASPO-HNS | `rss-youtube-aspo` |
| 8 | ELS | `web-els-news` |
| 9 | ERS | `rss-ers-guideline`, `rss-ers-paediatric`, `rss-ers-airway` |
| 10 | DAS | `rss-das` |
| 11 | Global Tracheostomy Collaborative | `rss-youtube-gtc` |
| 12 | NTSP / Trachy Talk | `rss-trachy-talk`, `rss-youtube-ntsp` |
| 13 | Cincinnati Children's | `rss-cincinnati-research-horizons`, `web-cincinnati-releases`, `rss-gnews-site-cincinnati` |
| 14 | Boston Children's EAT Center | `rss-boston-childrens-answers`, `rss-gnews-site-boston-answers` |
| 15 | CHOP Airway Programs | `web-chop-news`, `rss-gnews-site-chop` |

## Buscas do PubMed

As quatro buscas prontas do diretório entram exatamente como estão, só passadas para uma linha. Os ajustes recomendados entram como buscas próprias. Todas estão ativas em `industry/literatura.json`.

| Item do diretório | Busca | Artigos por semana | Fora das buscas que já existiam |
|---|---|---|---|
| Via aérea em adultos | `diretorio-adulto` | 35,5 | 26,7 |
| Via aérea pediátrica | `diretorio-pediatrica` | 20,3 | 4,2 |
| Alerta de traqueostomia e decanulação (também o ajuste "concentrar em decanulação") | `diretorio-traqueostomia-decanulacao` | 8,3 | 4,3 |
| Alerta de cirurgia estrutural | `diretorio-cirurgia-estrutural` | 3,7 | 0,2 |
| Ajuste: bloco temático sem o bloco de idade (a união dos blocos temáticos das buscas de adulto e pediátrica) | `diretorio-tematica-sem-idade` | 88,2 | 53,5 |
| Ajuste: só reconstrução (estenose, reconstrução laringotraqueal, traqueoplastia e ressecção) | `diretorio-reconstrucao` | 6,7 | 0 |
| Ajuste: manejo anestésico, separado (MeSH de manejo e intubação, via aérea e intubação difíceis, videolaringoscopia, dispositivo supraglótico, extubação, acesso cervical) | `diretorio-manejo-anestesico` | 67,2 | 50,3 |
| Ajuste: doença e cirurgia estrutural, separada (o bloco temático sem os quatro termos de manejo anestésico) | `diretorio-doenca-estrutural` | 59,2 | 31,5 |
| Ajuste: diretrizes por termos livres e tipos de publicação (bloco temático com guideline, consensus, recommendation, position statement, expert panel, Delphi e os tipos Guideline, Practice Guideline e Consensus Development Conference) | `diretorio-diretrizes` | 10,2 | 6,7 |
| Periódicos sem feed utilizável (veja Periódicos) | `periodicos-sem-feed` | 2,7 | 1,0 |

Medição: esearch por data de entrada no PubMed (EDAT) em seis janelas de 7 dias, de 10/09 a 21/10/2026, com o filtro de idioma do módulo. As colunas não somam: as buscas se sobrepõem muito (a temática sem idade contém quase todas as outras). Juntas, as 25 buscas novas trazem 78,5 artigos por semana que as 25 antigas não traziam.

## Google Scholar

O Google Scholar não tem feed nem API pública. Cada consulta entrou como a busca equivalente mais próxima no PubMed, com os mesmos termos ligados por AND e as frases entre aspas (o PubMed procura em todos os campos do registro, e não no texto completo como o Scholar). Foi escolhido o PubMed, e não o Europe PMC, para que os artigos sigam o mesmo caminho dos outros (matéria do Fôlego, sem duplicar o artigo que outra busca já trouxe). Os preprints, que o Scholar também cobre, chegam por `json-medrxiv-airway` e `json-biorxiv-airway`.

| Tema | Consulta no Scholar | Busca no PubMed |
|---|---|---|
| Estenose em adultos | "subglottic stenosis" adult treatment | `scholar-estenose-adulto` |
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
| Cincinnati Children's | site:cincinnatichildrens.org "airway" | `rss-gnews-site-cincinnati` |
| Boston Children's | site:answers.childrenshospital.org tracheomalacia | `rss-gnews-site-boston-answers` |
| CHOP | site:chop.edu "airway" reconstruction | `rss-gnews-site-chop` |
| WABIP | site:wabip.com guideline airway | `rss-gnews-site-wabip` |
| SBCT | site:sbct.com.br traqueia | `rss-gnews-site-sbct` |

## Pendências apontadas pelo próprio diretório

| Pendência | Destino |
|---|---|
| URLs sem teste HTTP individual | todas foram lidas do servidor nesta verificação; o resultado está nas tabelas acima |
| Datas editoriais por fonte | a data de cada item vem do feed, da lista ou da matéria; as fontes sem data legível estão desligadas, com o motivo |
| Páginas e alertas dos periódicos essenciais | seção Periódicos |
| Inspeção de RSS reais | cada feed cadastrado foi lido pela pré-visualização |
| Organizações independentes de pacientes | o diretório não nomeia nenhuma além da GTC e do NTSP; `rss-unidos-pela-vida` já existia |
| Redes sociais | LinkedIn da GTC só aqui (exige login); os canais oficiais no YouTube entraram |
| Centros europeus, latino-americanos, asiáticos e australianos | os que já eram coletados, mais o Instituto Nacional del Tórax |
| Corpo estranho, trauma laringotraqueal e ECMO com cirurgia de via aérea | buscas do PubMed que já existiam (`corpo-estranho`, `trauma-laringotraqueal`, `ecmo-via-aerea`), as do Scholar, os alertas do Google News e as buscas novas do ClinicalTrials.gov |
| WHO ICTRP, CTIS, ReBEC, ISRCTN, medRxiv e bioRxiv | seção Registros e preprints |

# Fontes do Fôlego

O Fôlego tem dois tipos de fonte: os **artigos científicos**, que vêm do módulo `literatura` (buscas salvas no PubMed), e as **notícias**, que vêm de feeds RSS e páginas de lista de sociedades, reguladores, registros de ensaios, centros de referência e imprensa (`industry/sources.json`).

## Artigos científicos (módulo literatura)

A cada 6 horas, o módulo roda as buscas de `industry/literatura.json` no PubMed, sobre os registros que entraram nos últimos 7 dias. Cada artigo novo é tratado uma única vez:

1. **Procura uma cópia gratuita e legal**: o Unpaywall diz onde o artigo pode ser lido de graça (editora, PubMed Central, repositório) e com que licença; o Europe PMC entrega o texto completo quando o artigo está no PubMed Central.
2. **Se a licença permite republicar uma tradução** (CC BY, CC BY-SA, CC0, domínio público; CC BY-NC só com `LITERATURA_ALLOW_NC=true`), o artigo entra pela fonte **PubMed · texto integral em acesso aberto** com o texto completo, figuras e tabelas, e o crédito aos autores e à licença. Quando é selecionado, o motor traduz o texto inteiro para o português.
3. **Nos outros casos**, o modelo escreve uma **matéria própria** do Fôlego (contexto, como foi feito, o que encontraram, limitações, uma parte para o pediatra e outra para o especialista) e o artigo entra pela fonte **PubMed · matérias do Fôlego**. A matéria é escrita a partir do texto completo quando há uma cópia aberta legível, ou a partir do resumo; o rodapé diz qual foi a base, traz a referência, o DOI, o link para o texto gratuito quando existe e, quando o artigo é pago, sugere pedir a cópia ao autor.

Licenças CC BY-ND e CC BY-NC-ND nunca são republicadas, porque uma tradução é obra derivada. Sites como Sci-Hub e Anna's Archive não são usados.

Depois disso, os artigos seguem o mesmo caminho de qualquer material: pré-triagem, duas notas, seleção, agrupamento e entrada na edição semanal.

### Configuração

- `LITERATURA_EMAIL`: e-mail de contato exigido pelo Unpaywall e recomendado pelo NCBI. Sem ele, só o PubMed Central é consultado.
- `NCBI_API_KEY` (opcional, gratuita): libera 10 requisições por segundo no PubMed.
- `MATERIA_MODEL` (opcional): modelo da etapa que escreve as matérias; por padrão, o mesmo `LLM_MODEL`. Também pode ser trocado no Painel → Modelos.
- `industry/literatura.json`: as buscas (`queries`, na sintaxe do PubMed), quantos dias para trás (`days`), quantos artigos novos por execução (`perRun`) e os idiomas aceitos (`languages`). Para testar uma busca, cole o `term` em pubmed.ncbi.nlm.nih.gov.

Cada artigo tratado fica registrado na tabela `literatura_papers` (PMID, destino e artigo criado), e por isso não é escrito duas vezes. Se um serviço falha (PubMed, Unpaywall, Europe PMC ou o modelo), o artigo não é escrito com menos informação: ele é tentado de novo nas execuções seguintes, até 3 vezes, e depois fica marcado como `falhou`.

A republicação vale pela URL de licença que o próprio artigo declara no PMC, nunca só pela frase de licença. Figuras cuja legenda indica material de terceiros ("reprinted with permission", "©") são omitidas, e o crédito avisa. Quando o Unpaywall diz que o artigo é aberto com licença que permite republicar mas o PMC ainda não tem o texto (o PMC costuma chegar dias depois do PubMed), o artigo espera até 36 horas; passado isso, vira matéria. O limite existe porque o motor arquiva, sem levar à edição, o que é encontrado mais de 48 horas depois da data do material.

### Custo

Cada matéria é uma chamada ao modelo, com algo entre 3 mil e 15 mil tokens de entrada e até 4 mil de saída. As 25 buscas temáticas (via aérea da criança ao adulto, incluindo as anomalias congênitas da laringe e da traqueia e os anéis vasculares, cirurgia torácica pediátrica e, na interface com a via aérea, transplante pulmonar e ECMO) trazem cerca de 93 artigos novos por semana. As 25 buscas do diretório de fontes do dono (as quatro buscas prontas, os ajustes recomendados, as consultas do Google Scholar e os periódicos sem feed; veja [diretorio-fontes.md](diretorio-fontes.md)) acrescentam cerca de 78 por semana, e o total fica em cerca de 171 (de 139 a 201 nas seis semanas medidas). Quase todo o acréscimo vem das buscas amplas do diretório (bloco temático sem idade, manejo anestésico, doença estrutural e a busca de adultos), e numa amostra dos títulos só cerca de 1 em 5 era de via aérea: o resto era ventilação mecânica e UTI, apneia do sono e câncer de laringe, porque os MeSH "Intubation, Intratracheal", "Airway Obstruction" e "Laryngeal Neoplasms" casam com esses artigos. As buscas de traqueostomia no adulto e de via aérea na anestesia pediátrica exigem o termo no título ou como assunto principal (MeSH `[majr]`), porque com o termo em qualquer ponto do resumo traziam muito artigo de UTI, ventilação e anestesia que só cita a via aérea de passagem. Os textos integrais não passam por essa etapa; a tradução deles só acontece quando são selecionados.

### Buscas avaliadas e deixadas de fora

Em 22/10/2026, uma lista de temas de via aérea pediátrica foi medida no PubMed (registros por data de entrada, seis semanas de 10/09 a 21/10/2026, contando só o que as buscas já existentes não traziam e julgando os títulos). Entraram três mudanças: `estenose-via-aerea` passou a aceitar "airway stenosis", "laryngeal stenosis" e "glottic stenosis" no resumo (+1,2 artigo por semana, ~70% no tema); `malacias-laringe` ganhou hemangioma subglótico, membranas e atresia laríngeas, agenesia traqueal, fenda laringotraqueoesofágica, anéis traqueais completos, split cricoide posterior e alteração de mobilidade das pregas vocais (+0,7 por semana, ~75% no tema); e a busca nova `aneis-vasculares` (anéis vasculares, duplo arco aórtico, sling da artéria pulmonar, compressão pela artéria inominada, com termo de via aérea), com 1,5 por semana, metade nova, ~60% no tema. Os termos de estenose entram com `[tiab]` também porque o MeSH "Laryngostenosis" só casa depois da indexação, dias depois de o registro entrar no PubMed.

Ficaram de fora:

- **Lacunas de tratamento** (mitomicina C e triancinolona; corticoide e antibiótico tópicos, incluindo ciprofloxacino-dexametasona; antibiótico, MRSA e Pseudomonas na reconstrução laringotraqueal; dexmedetomidina, extubação planejada e tempo de stent; inibidor de bomba de prótons; critério de falha da dilatação): entre 0 e 0,3 artigo novo por semana. Esses artigos citam estenose subglótica ou reconstrução laringotraqueal e já chegam por `estenose-via-aerea`. O que sobrava era ruído (lesão elétrica da laringe, estenose de nasofaringe).
- **"airway reconstruction"** e **"airway surgery"**: o que traziam de novo era sobretudo reconstrução 3D de imagem e cirurgia do sono.
- **22q11 com via aérea**, **esofagite eosinofílica e refluxo com via aérea**, **Cochrane** (revisões com termos de via aérea, tórax e intubação) e **disfagia com termo de via aérea na criança**: nada novo, ou menos de 0,5 por semana. As revisões Cochrane estão no PubMed e as de via aérea já entram pelas buscas por tema.
- **Disfagia pediátrica em geral** (FEES, videofluoroscopia, penetração laríngea): 1,3 por semana nova, só ~25% no tema (doenças neuromusculares, síndrome de Down, custos).
- **Aerodigestivo / endoscopia tripla**: menos de 0,2 por semana, fora do tema.
- **Consensos e diretrizes** (consenso, diretriz, Delphi, IPOG com termo de via aérea na criança): 0,5 por semana nova, nenhum no tema (óxido nítrico exalado, tosse crônica, provocação nasal). Os consensos do IPOG saem no *International Journal of Pediatric Otorhinolaryngology*, com cerca de 3 por ano, e os de via aérea já são pegos pelas buscas por tema.
- **Afiliação dos centros de referência** (HCPA, Unicamp, UFMG, Cincinnati, CHUV, Great Ormond Street, Lurie) com termo de via aérea: 4,5 por semana nova, ~10% no tema (asma, apneia do sono, oncologia). Com termos estritos de via aérea e criança, não sobrou nada que as buscas por tema não trouxessem.

## Notícias (feeds e páginas de lista)

| Grupo | Fontes | Observação |
|---|---|---|
| Sociedades | SBP (buscas "pneumologia" e "traqueostomia"), ABORL-CCF, ERS (buscas "paediatric" e "airway") | Os feeds de busca do WordPress (`/feed/?s=termo`) dão um feed temático. |
| Sociedades (outras) | SBPT e CIPE (feeds), SBCT (API do WordPress), ATS, CHEST e STS (comunicados), ESTS (notícias) | A SBCT entra pela API do WordPress (`json-sbct`); a página de lista (`web-sbct`, em `https://www.sbct.com.br/noticias/`) continua cadastrada e desligada, e o motivo está logo abaixo da tabela. ATS, CHEST, STS e ESTS são páginas de lista (`web_list`); a CHEST não traz data na lista, e cada comunicado é aberto (`detail`) para lê-la. Não há filtro por tema: a pré-triagem descarta o que é de adultos e não trata da via aérea. |
| Reguladores | FDA MedWatch | Alertas de segurança e recalls; a pré-triagem deixa passar só os de via aérea, traqueostomia e ventilação. |
| Ensaios registrados | ClinicalTrials.gov: estenose subglótica, estenose traqueal, pectus, malformações pulmonares, hérnia diafragmática, traqueomalácia, traqueostomia pediátrica, laringomalácia, fenda laríngea, paralisia de pregas vocais em crianças; e, desde 23/10/2026, traqueostomia em adultos, via aérea difícil, manejo da via aérea, obstrução central e próteses, corpo estranho, traqueobroncomalácia, paralisia de pregas vocais em todas as idades, decanulação, trauma de via aérea e ECMO com via aérea | Só estudos novos (`dateField=StudyFirstPostDate`). Entram como "Ensaio registrado". A fenda laríngea vai entre aspas (`cond=%22laryngeal+cleft%22`): sem elas, a busca traz estudos de fenda labiopalatina. |
| Centros de referência | Cincinnati Children's (Research Horizons), Nationwide Children's (Pediatrics Nationwide), Boston Children's (Answers), Mayo Clinic News Network | Nenhum desses centros tem feed só de via aérea ou cirurgia torácica: são feeds gerais, e a pré-triagem descarta o que é de outras áreas. |
| Centros de referência (notícias) | CHOP, Nationwide Children's (comunicados), Cincinnati Children's (comunicados), Great Ormond Street, SickKids, Lurie Children's, Beijing Children's Hospital (páginas de lista); Sant Joan de Déu, Hospital Pequeno Príncipe e Hospital de Clínicas de Porto Alegre (feeds) | Notícias gerais dos hospitais (prêmios, eventos, campanhas), por isso nível T2. Veja "Páginas de lista" abaixo. |
| Pacientes e imprensa | Unidos pela Vida (fibrose cística), Respiratory Therapy | Nível T2: só entram com nota alta. |
| Imprensa | ENTtoday | Nível T2. |
| Google News | buscas "traqueostomia", "cirurgia torácica" criança, "hérnia diafragmática", "fibrose cística" (pt-BR) e "pediatric airway" OR "subglottic stenosis" OR "tracheal stenosis" (en), e as 22 consultas de Google Alerts do diretório | Nível T2. O link do item é o redirecionamento do Google, então em geral só entram título e resumo. |
| Diretório de fontes (23/10/2026) | sociedades de via aérea (AAO-HNS, SAM, DAS, ELS, JSRE, ALAT, SAESP e outras), feeds de sumário de periódicos, podcast e canais no YouTube, preprints (medRxiv, bioRxiv, arXiv), Healio e o Instituto Nacional del Tórax | O destino de cada item do diretório, inclusive os que ficaram desligados e o motivo, está em [diretorio-fontes.md](diretorio-fontes.md). |

Fontes avaliadas e deixadas de fora por estarem paradas ou sem feed: Healio (pediatria), AARC, APSA, AABIP, ESPO. O feed de pneumologia do Healio voltou a publicar e entrou em 23/10/2026. A ANVISA não tem feed de alertas de tecnovigilância.

Também foram testados e deixados de fora: STAT News, porque o feed devolve HTTP 403 ao servidor; OMS (notícias), porque o feed está quase parado (1 item em 28 dias); e FDA (comunicados), Jornal da USP (ciências da saúde), Agência Brasil (saúde) e Medicina S/A, porque nenhum dos itens amostrados passou na pré-triagem (0 de 8 em cada) e juntos somavam cerca de 85 itens por semana sem nada do tema. Para pegar o item raro desses veículos, uma busca do Google News com termo específico rende mais.

Em 22/10/2026 também foram avaliados consensos, revistas, órgãos e centros de referência brasileiros e estrangeiros de via aérea pediátrica, e estes ficaram de fora:

- **Cochrane:** os feeds da Cochrane Library devolvem HTTP 403, e a página de notícias da Cochrane é geral (cannabis para insônia, coletes lombares). As revisões chegam pelo PubMed.
- **IPOG, ASPO, SENTAC e ESPGHAN:** não têm página de notícias com data nem feed. O IPOG só lista seus consensos, que chegam pelo PubMed (veja "Buscas avaliadas" acima).
- **ABOPe:** o feed está parado desde outubro de 2025 e só traz editais e eleições.
- **AAP:** a lista de comunicados é montada por JavaScript, e o feed da AAP News pede login. As declarações de política da AAP saem na *Pediatrics*, que está no PubMed.
- **NASPGHAN:** o feed funciona, mas trata de gastroenterologia geral e podcasts. Nas buscas "eosinophilic" e "guideline", não houve nada de via aérea em um ano.
- **BJORL e Jornal de Pediatria (SciELO):** os feeds Atom funcionam (`https://www.scielo.br/journal/bjorl/feed/`), mas trazem o sumário do número inteiro de uma vez, com atraso (o último número da BJORL no SciELO é de março de 2026). Dos 99 artigos da BJORL, 2 eram de via aérea pediátrica, e o resto era otologia, rinologia e câncer de laringe. As duas revistas estão no PubMed, e os artigos de via aérea já entram pelas buscas.
- **CONITEC:** a página de notícias no gov.br não traz os itens no HTML e não tem RSS. Uma busca do Google News por "Conitec incorporação SUS" trouxe só temas de fora (canetas emagrecedoras, PrEP, mieloma). As incorporações de via aérea chegam pela SBPT, como a da criobiópsia no rol da ANS.
- **Jornal da Unicamp:** é um feed geral da universidade, com cerca de 20 itens por semana, como o Jornal da USP. Os feeds de busca respondem HTTP 404 e trouxeram um item do tema desde 2025.
- **HC-UFMG (HU Brasil/Ebserh):** a lista mostra a data como "21/10/2026", formato que o coletor não lê, e as matérias respondem HTTP 500 ao coletor. Sem data, o coletor segura os itens.
- **CHUV (Lausanne):** a lista de comunicados mostra a data como "23.04.2026" (e "04.23.2026" na versão em inglês), e o comunicado a escreve em francês ("3 septembre 2026"). O coletor não lê nenhum desses formatos. Além disso, são cerca de 11 comunicados em 10 meses, e gerais.
- **Iowa (UI Health Care, Stead Family Children's):** a lista de notícias é montada por JavaScript (Algolia), e o feed de `medicine.uiowa.edu` é da faculdade (alunos, prêmios).
- **ReBEC:** não tem feed. A lista de ensaios novos não filtra por tema (a busca é ignorada) e usa datas no formato americano (mm/dd/aaaa), que o coletor não lê.
- **ClinicalTrials.gov, hemangioma infantil:** nos últimos 12 meses foram 10 estudos, todos de pele (laser, propranolol tópico). Nenhum estudo registrado cita hemangioma de via aérea.

### Páginas de lista

Testadas em 22/10/2026 com a pré-visualização e uma coleta completa (`scripts/collect.ts`), com título, link e data conferidos com a página:

| Fonte | Página | Como é lida |
|---|---|---|
| ATS | https://site.thoracic.org/press-releases | Data na lista, fuso `-05:00` |
| CHEST | https://www.chestnet.org/newsroom/press-releases | A lista não tem data: ela vem da linha de data do comunicado (`detail`), fuso `-06:00` |
| STS | https://www.sts.org/press-releases | Data na lista, fuso `-06:00` |
| ESTS | https://www.ests.org/news | Data na lista, fuso `+01:00` |
| CHOP | https://www.chop.edu/newsroom/search | Data e hora na lista |
| Nationwide Children's (comunicados) | https://www.nationwidechildrens.org/newsroom/news-releases | Data na lista, fuso `-05:00` |
| Cincinnati Children's (comunicados) | https://www.cincinnatichildrens.org/news/release | Data na lista, fuso `-05:00`; só os 5 mais recentes aparecem |
| Great Ormond Street | https://www.gosh.nhs.uk/news/ | Dia lido por expressão regular ("21 Oct 2026, 3:58 p.m." não é lido inteiro), fuso `+00:00` |
| SickKids | https://www.sickkids.ca/en/news/newsroom/ | Data na lista, fuso `-05:00` |
| Lurie Children's | https://www.luriechildrens.org/en/news-stories/ | A lista não tem data: ela vem da matéria (`.news-page__date`, `detail`), fuso `-06:00`. Testada só com a pré-visualização. |
| Beijing Children's Hospital (北京儿童医院) | https://www.bch.com.cn/Html/News/Columns/5/Index.html | Na lista, o dia e um título cortado ("…"); o título inteiro e a hora vêm da matéria (`detail`), fuso `+08:00` |

Sant Joan de Déu e Pequeno Príncipe têm feed, mais simples que a página de lista: `https://www.sjdhospitalbarcelona.org/es/rss.xml` (só os links em `/es/noticias/`, sem as versões em catalão) e `https://pequenoprincipe.org.br/noticia/feed/`. O Hospital de Clínicas de Porto Alegre tem o feed do Joomla na página inicial (`https://www.hcpa.edu.br/?format=feed&type=rss`), com notícias gerais do hospital, cerca de 3 por semana. O endereço antigo do Beijing Children's (`Columns/1`) é a página da direção do hospital, e não a de notícias (`Columns/5`). A CDN do Beijing Children's às vezes responde com uma página de erro curta; quando isso acontece na lista, a coleta falha e é repetida na rodada seguinte, e quando acontece na matéria, a notícia fica com o título cortado da lista.

O endereço antigo da SBCT (`sbct.org.br`) tem certificado autoassinado e responde 403, por isso a fonte `rss-sbct` saiu desta lista. No site novo, sbct.com.br, o feed foi desligado. A página de notícias dá títulos e links limpos, mas não tem data nem na lista nem nas matérias (sem `article:published_time`, sem JSON-LD, sem `<time>`), e o coletor segura itens sem data; por isso a fonte `web-sbct` fica desligada. Desde 23/10/2026, as notícias da SBCT entram pela fonte `json-sbct`, que lê a API do WordPress (`/wp-json/wp/v2/posts`, categoria Notícias) com a data de cada post. A API entrega os títulos com entidades HTML (`&#8211;`) que o `json_list` não decodifica, então o título vem da `<title>` da página do post (`detail`). Em um site que já está no ar, a importação só acrescenta fontes novas: as fontes de ATS, CHEST, STS, ESTS e dos centros entram na próxima atualização, mas SBPT e CIPE continuam desligadas até alguém ligá-las no Painel → Fontes (ou com `node --env-file=.env scripts/enable-sources.ts rss --ids=rss-sbpt,rss-cipe`); a antiga `rss-sbct` continua cadastrada e desligada.

Não foi possível verificar Royal Children's Melbourne, Necker, Stanford, Sabará, ICr-HCFMUSP, Calvo Mackenna, Shanghai Children's Medical Center, Fudan, Chongqing e as revistas chinesas (中华小儿外科杂志, 中华耳鼻咽喉头颈外科杂志), que não têm RSS encontrado. Vale testá-los do próprio servidor.

### China

A produção chinesa relevante chega principalmente pelo PubMed: as buscas aceitam artigos em chinês (`chi` em `languages`), e a matéria é escrita a partir do resumo em inglês que o PubMed traz. Os portais de notícias médicas chineses (dxy.cn, medlive.cn) publicam sobretudo por WeChat e não têm seção de cirurgia torácica pediátrica.

As fontes desta lista são importadas na primeira vez que o site sobe. Depois disso, mexa nelas no Painel → Fontes.

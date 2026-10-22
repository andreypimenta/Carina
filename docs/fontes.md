# Fontes do Fôlego

O Fôlego tem dois tipos de fonte: os **artigos científicos**, que vêm do módulo `literatura` (buscas salvas no PubMed), e as **notícias**, que vêm de feeds RSS de sociedades, reguladores, registros de ensaios e imprensa (`industry/sources.json`).

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

Cada matéria é uma chamada ao modelo, com algo entre 3 mil e 15 mil tokens de entrada e até 4 mil de saída. Com as 24 buscas atuais (via aérea da criança ao adulto, cirurgia torácica pediátrica e, na interface com a via aérea, transplante pulmonar e ECMO), são cerca de 120 artigos novos por semana. Os textos integrais não passam por essa etapa; a tradução deles só acontece quando são selecionados.

## Notícias (feeds)

| Grupo | Fontes | Observação |
|---|---|---|
| Sociedades | SBP (buscas "pneumologia" e "traqueostomia"), ABORL-CCF, ERS (buscas "paediatric" e "airway") | Os feeds de busca do WordPress (`/feed/?s=termo`) dão um feed temático. |
| Sociedades a conferir | SBCT, SBPT, CIPE | Começam **desligadas**: os feeds não puderam ser verificados. No Painel → Fontes, use "Pré-visualizar" e ligue as que funcionarem. |
| Reguladores | FDA MedWatch | Alertas de segurança e recalls; a pré-triagem deixa passar só os de via aérea, traqueostomia e ventilação. |
| Ensaios registrados | ClinicalTrials.gov: estenose subglótica, estenose traqueal, pectus, malformações pulmonares, hérnia diafragmática, traqueomalácia, traqueostomia pediátrica | Só estudos novos (`dateField=StudyFirstPostDate`). Entram como "Ensaio registrado". |
| Centros de referência | Cincinnati Children's (Research Horizons), Nationwide Children's (Pediatrics Nationwide), Boston Children's (Answers), Mayo Clinic News Network | Nenhum desses centros tem feed só de via aérea ou cirurgia torácica: são feeds gerais, e a pré-triagem descarta o que é de outras áreas. |
| Pacientes e imprensa | Unidos pela Vida (fibrose cística), Respiratory Therapy | Nível T2: só entram com nota alta. |
| Saúde pública | FDA (comunicados), OMS (notícias) | Feeds gerais; a pré-triagem descarta o que não é do tema. |
| Imprensa e universidades | ENTtoday, STAT News, Jornal da USP (ciências da saúde), Agência Brasil (saúde), Medicina S/A | Jornal da USP em T1_5; os demais em T2. |
| Google News | buscas "traqueostomia", "cirurgia torácica" criança, "hérnia diafragmática", "fibrose cística" (pt-BR) e "pediatric airway" OR "subglottic stenosis" OR "tracheal stenosis" (en) | Nível T2. O link do item é o redirecionamento do Google, então em geral só entram título e resumo. |

Fontes avaliadas e deixadas de fora por estarem paradas ou sem feed: Healio (pneumologia e pediatria), AARC, APSA, AABIP, ESPO. ATS, CHEST, STS e ESTS têm página de notícias mas não têm RSS; podem entrar como `web_list` (veja `docs/sources.md`). A ANVISA não tem feed de alertas de tecnovigilância.

### Candidatas a página de lista (`web_list`)

Estes centros não têm RSS, mas têm páginas de notícias com lista de links. Para incluí-los, crie a fonte no Painel → Fontes com o tipo "página de lista", ajuste os seletores olhando a página (`docs/sources.md`) e confira com "Pré-visualizar":

| Centro | Página | Padrão dos links |
|---|---|---|
| CHOP | https://www.chop.edu/newsroom/search | `/news/<slug>` |
| Nationwide Children's (comunicados) | https://www.nationwidechildrens.org/newsroom/news-releases | `/newsroom/news-releases/AAAA/MM/<slug>` |
| Cincinnati Children's (comunicados) | https://www.cincinnatichildrens.org/news/release | `/news/release/AAAA/<slug>` |
| Great Ormond Street | https://www.gosh.nhs.uk/news/ | `/news/<slug>/` |
| SickKids | https://www.sickkids.ca/en/news/newsroom/ | `/en/news/archive/AAAA/<slug>/` |
| Sant Joan de Déu | https://www.sjdhospitalbarcelona.org/es/noticias | `/es/noticias/<slug>`; fuso `+01:00` |
| Hospital Pequeno Príncipe | https://pequenoprincipe.org.br/novidades/noticias/ | `/noticia/<slug>/`; fuso `-03:00` |
| Beijing Children's Hospital (北京儿童医院) | https://www.bch.com.cn/Html/News/Columns/1/Index.html | `/Html/News/Articles/<id>.html`; data só na matéria (use `detail`); fuso `+08:00` |

Não foi possível verificar Royal Children's Melbourne, Necker, Stanford, Lurie (lista sem datas), Mass General, Sabará, ICr-HCFMUSP, Calvo Mackenna, Shanghai Children's Medical Center, Fudan, Chongqing e as revistas chinesas (中华小儿外科杂志, 中华耳鼻咽喉头颈外科杂志), que não têm RSS encontrado. Vale testá-los do próprio servidor.

### China

A produção chinesa relevante chega principalmente pelo PubMed: as buscas aceitam artigos em chinês (`chi` em `languages`), e a matéria é escrita a partir do resumo em inglês que o PubMed traz. Os portais de notícias médicas chineses (dxy.cn, medlive.cn) publicam sobretudo por WeChat e não têm seção de cirurgia torácica pediátrica.

As fontes desta lista são importadas na primeira vez que o site sobe. Depois disso, mexa nelas no Painel → Fontes.

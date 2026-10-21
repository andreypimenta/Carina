# Fontes do Carina

O Carina tem dois tipos de fonte: os **artigos científicos**, que vêm do módulo `literatura` (buscas salvas no PubMed), e as **notícias**, que vêm de feeds RSS de sociedades, reguladores, registros de ensaios e imprensa (`industry/sources.json`).

## Artigos científicos (módulo literatura)

A cada 6 horas, o módulo roda as buscas de `industry/literatura.json` no PubMed, sobre os registros que entraram nos últimos 7 dias. Cada artigo novo é tratado uma única vez:

1. **Procura uma cópia gratuita e legal**: o Unpaywall diz onde o artigo pode ser lido de graça (editora, PubMed Central, repositório) e com que licença; o Europe PMC entrega o texto completo quando o artigo está no PubMed Central.
2. **Se a licença permite republicar uma tradução** (CC BY, CC BY-SA, CC0, domínio público; CC BY-NC só com `LITERATURA_ALLOW_NC=true`), o artigo entra pela fonte **PubMed · texto integral em acesso aberto** com o texto completo, figuras e tabelas, e o crédito aos autores e à licença. Quando é selecionado, o motor traduz o texto inteiro para o português.
3. **Nos outros casos**, o modelo escreve uma **matéria própria** do Carina (contexto, como foi feito, o que encontraram, limitações, uma parte para o pediatra e outra para o especialista) e o artigo entra pela fonte **PubMed · matérias do Carina**. A matéria é escrita a partir do texto completo quando há uma cópia aberta legível, ou a partir do resumo; o rodapé diz qual foi a base, traz a referência, o DOI, o link para o texto gratuito quando existe e, quando o artigo é pago, sugere pedir a cópia ao autor.

Licenças CC BY-ND e CC BY-NC-ND nunca são republicadas, porque uma tradução é obra derivada. Sites como Sci-Hub e Anna's Archive não são usados.

Depois disso, os artigos seguem o mesmo caminho de qualquer material: pré-triagem, duas notas, seleção, agrupamento e entrada na edição semanal.

### Configuração

- `LITERATURA_EMAIL`: e-mail de contato exigido pelo Unpaywall e recomendado pelo NCBI. Sem ele, só o PubMed Central é consultado.
- `NCBI_API_KEY` (opcional, gratuita): libera 10 requisições por segundo no PubMed.
- `MATERIA_MODEL` (opcional): modelo da etapa que escreve as matérias; por padrão, o mesmo `LLM_MODEL`. Também pode ser trocado no Painel → Modelos.
- `industry/literatura.json`: as buscas (`queries`, na sintaxe do PubMed), quantos dias para trás (`days`), quantos artigos novos por execução (`perRun`) e os idiomas aceitos (`languages`). Para testar uma busca, cole o `term` em pubmed.ncbi.nlm.nih.gov.

Cada artigo tratado fica registrado na tabela `literatura_papers` (PMID, destino e artigo criado), e por isso não é escrito duas vezes.

### Custo

Cada matéria é uma chamada ao modelo, com algo entre 3 mil e 15 mil tokens de entrada e até 4 mil de saída. Com as buscas atuais, a estimativa é de algumas dezenas de artigos por semana. Os textos integrais não passam por essa etapa; a tradução deles só acontece quando são selecionados.

## Notícias (feeds)

| Grupo | Fontes | Observação |
|---|---|---|
| Sociedades | SBP (buscas "pneumologia" e "traqueostomia"), ABORL-CCF, ERS (buscas "paediatric" e "airway") | Os feeds de busca do WordPress (`/feed/?s=termo`) dão um feed temático. |
| Sociedades a conferir | SBCT, SBPT, CIPE | Começam **desligadas**: os feeds não puderam ser verificados. No Painel → Fontes, use "Pré-visualizar" e ligue as que funcionarem. |
| Reguladores | FDA MedWatch | Alertas de segurança e recalls; a pré-triagem deixa passar só os de via aérea, traqueostomia e ventilação. |
| Ensaios registrados | ClinicalTrials.gov: estenose subglótica, estenose traqueal, pectus, malformações pulmonares, hérnia diafragmática, traqueomalácia, traqueostomia pediátrica | Só estudos novos (`dateField=StudyFirstPostDate`). Entram como "Ensaio registrado". |
| Pacientes, imprensa e hospitais | Unidos pela Vida (fibrose cística), Respiratory Therapy, Boston Children's Answers | Nível T2: só entram com nota alta. |

Fontes avaliadas e deixadas de fora por estarem paradas ou sem feed: Healio (pneumologia e pediatria), AARC, APSA, AABIP, ESPO. ATS, CHEST, STS e ESTS têm página de notícias mas não têm RSS; podem entrar como `web_list` (veja `docs/sources.md`). A ANVISA não tem feed de alertas de tecnovigilância.

As fontes desta lista são importadas na primeira vez que o site sobe. Depois disso, mexa nelas no Painel → Fontes.

# Fontes do MedIA Briefing

As fontes iniciais estão em `industry/sources.json` e são importadas na primeira vez que o site sobe (`scripts/seed.ts`). Depois disso, o lugar de mexer é o Painel → Fontes: lá dá para pré-visualizar, pausar, mudar o intervalo e criar fontes novas.

São 130 fontes. As gratuitas já começam ligadas; as que dependem de serviço pago ou que precisam ser conferidas começam desligadas.

| Grupo | Fontes | Ligadas no início | Observação |
|---|---:|---:|---|
| Periódicos, reguladores, empresas e imprensa | 41 | 40 | RSS, páginas web e APIs públicas: npj Digital Medicine, Nature Medicine, JMIR, FDA, EMA, Ministério da Saúde, ANVISA, CFM, ANS, STAT, AuntMinnie, Futuro da Saúde… A versão da newsroom do Epic via Jina fica desligada (precisa de `JINA_API_KEY`). |
| Newsletters e Substack | 11 | 11 | Ground Truths, Second Opinion, Out-of-Pocket, Hospitalogy, Imaging Wire… |
| Podcasts | 3 | 3 | NEJM AI Grand Rounds, JAMA AI Conversations, Faces of Digital Health. |
| Bluesky | 7 | 7 | Perfis de pesquisadores e do NEJM AI. Só contam como repercussão ("Em alta"). |
| Hacker News | 1 | 1 | Só repercussão; cada autor conta uma vez. |
| Reddit | 5 | 0 | r/medicine, r/Radiology, r/Residency, r/HealthIT, r/MachineLearning (buscas por IA). Só repercussão; cada autor conta uma vez. Começam desligadas porque o Reddit às vezes bloqueia robôs: confira no Painel com "Pré-visualizar" antes de ligar. |
| X (Twitter) | 55 | 0 | 50 contas (periódicos, FDA, OMS, CFM, empresas, pesquisadores) e 5 buscas de posts virais sobre IA em medicina. Precisa de `SOCIALDATA_API_KEY` (pago por requisição; cerca de 250–350 requisições por dia com esta lista). |
| China | 6 | 6 | NMPA (site em inglês), Leiphone 医疗AI, QbitAI (três tags de saúde), Yidu Tech. O texto chinês é traduzido para português automaticamente. |
| WeChat (China) | 1 | 0 | 动脉网 (VCBeat). Precisa de `DAJIALA_KEY` (pago). |

## Ligar as fontes pagas

1. Coloque a chave no `.env` (`SOCIALDATA_API_KEY` para o X, `DAJIALA_KEY` para o WeChat, `JINA_API_KEY` para páginas via Jina).
2. Reinicie o site.
3. No Painel → Configurações, confira o limite de gasto do serviço.
4. Ligue todas de uma vez:

```bash
node --env-file=.env scripts/enable-sources.ts x_search            # todas as contas e buscas do X
node --env-file=.env scripts/enable-sources.ts mp_account          # contas do WeChat
node --env-file=.env scripts/enable-sources.ts rss --ids=rss-reddit-medicine,rss-reddit-radiology   # só algumas
```

Com Docker: `docker compose exec api node scripts/enable-sources.ts x_search`.

Também dá para ligar uma por uma no Painel → Fontes.

## Editorial ou repercussão

- **Editorial**: o item pode entrar na Seleção e no briefing.
- **Repercussão** (`hot_signal`): o item não aparece sozinho; ele só aumenta o "calor" de um assunto que outras fontes já noticiaram. É assim que X amplo, Reddit, Hacker News e Bluesky funcionam: mostram o que médicos e pesquisadores estão discutindo, sem encher o jornal de posts.

## Sugestões para acrescentar

- **Buscas salvas do PubMed**: no PubMed, faça a busca que quiser (por exemplo, sua especialidade + "artificial intelligence"), clique em "Create RSS" e cole o link no Painel como fonte RSS.
- **Revistas que bloqueiam robôs** (NEJM AI, Lancet Digital Health, JAMA, Radiology: AI): os perfis delas no X já estão na lista; os artigos também chegam pela imprensa especializada e pelos alertas do PubMed.
- **Instagram e LinkedIn**: não há forma pública e estável de coletar; ficaram de fora.

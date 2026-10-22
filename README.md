# Fôlego

Jornal semanal em português sobre **cirurgia torácica pediátrica, via aérea (adulto e pediátrica) e pneumologia pediátrica**, para especialistas e pediatras.

O Fôlego acompanha a literatura (buscas salvas no PubMed) e as notícias de sociedades, reguladores e registros de ensaios clínicos; avalia cada estudo pelo desenho e pelo impacto na conduta; e publica matérias completas em português, com uma parte para o pediatra e outra para o especialista. Artigos com licença aberta (CC BY) são traduzidos e republicados na íntegra, com crédito; para os demais, o Fôlego escreve uma matéria própria e indica onde ler o texto gratuito legal, quando existe. A edição sai toda segunda-feira às 07:00 (horário de Brasília).

## Como funciona

- **Artigos científicos**: módulo `modules/literatura`, configurado em `industry/literatura.json`. Detalhes em [docs/fontes.md](docs/fontes.md).
- **Critério editorial**: prompts em `industry/prompts/` (pré-triagem, nota, matéria, estrutura), taxonomia em `industry/taxonomy.ts` e tópicos em `industry/topics.json`.
- **Identidade e textos do site**: `site/site.ts`.

## Rodar

Precisa de Docker, Node.js 24 e uma chave de API de modelo compatível com OpenAI.

```bash
node scripts/init-env.ts --llm-key <sua chave>
# no .env: LITERATURA_EMAIL=<seu e-mail> (e, em produção, SITE_URL e SITE_DOMAIN)
docker compose up -d --build
```

Deploy com domínio e HTTPS: [docs/deploy.md](docs/deploy.md).

## Base

Feito sobre o framework open source [AIHOT](https://github.com/KKKKhazix/AIHOT) (licença MIT), a partir da adaptação em português do MedIA Briefing. O README original do framework está em [README.aihot.md](README.aihot.md) e [README.en.md](README.en.md).

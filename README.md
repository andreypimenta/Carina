# Fôlego

Jornal semanal em português sobre **cirurgia torácica pediátrica, via aérea (adulto e pediátrica) e pneumologia pediátrica**, para especialistas e pediatras.

O Fôlego acompanha a literatura (buscas salvas no PubMed) e as notícias de sociedades, reguladores e registros de ensaios clínicos; avalia cada estudo pelo desenho e pelo impacto na conduta; e publica matérias completas em português, com uma parte para o pediatra e outra para o especialista. Artigos com licença aberta (CC BY) são traduzidos e republicados na íntegra, com crédito; para os demais, o Fôlego escreve uma matéria própria e indica onde ler o texto gratuito legal, quando existe. A edição sai toda segunda-feira às 07:00 (horário de Brasília).

## Como funciona

- **Artigos científicos**: módulo `modules/literatura`, configurado em `industry/literatura.json` (buscas no PubMed) e `industry/revistas.json` (revistas de cirurgia torácica vigiadas, pelo PubMed e pelo sumário aberto de cada uma). Detalhes em [docs/fontes.md](docs/fontes.md).
- **Especiais**: textos do jornal escritos a partir de estudos do PubMed (o primeiro formato é a Linha do tempo), que ficam como rascunho no painel e só vão ao ar depois de aprovados e publicados pelo editor. Detalhes em [docs/especiais.md](docs/especiais.md).
- **Caso da semana**: um caso clínico curto que o editor escreve no painel para cada edição semanal, com imagem opcional e uma pergunta ao leitor (“Qual a sua conduta?”, com ou sem alternativas); a resposta e a discussão saem na edição seguinte. No módulo `modules/caso`, sem chamada a modelo. Detalhes em [docs/caso.md](docs/caso.md).
- **Agenda**: os congressos de `industry/congressos.json` na página `/agenda` e, quando um congresso está em andamento ou começa nos 30 dias seguintes, num bloco da edição semanal, no módulo `modules/agenda`.
- **Critério editorial**: prompts em `industry/prompts/` (pré-triagem, nota, matéria, estrutura), taxonomia em `industry/taxonomy.ts` e tópicos em `industry/topics.json`.
- **Redes sociais**: perfis e pesquisas do X (fontes `x_search`, pela SocialData) e hashtags e perfis do Instagram (módulo `modules/instagram`, pela ScrapeCreators, configurado em `industry/instagram.json`); o LinkedIn é acompanhado pelos sites das organizações. Detalhes em [docs/fontes.md](docs/fontes.md#redes-sociais-x-instagram-e-linkedin).
- **Assinatura**: a página `/assine` (só a edição e o formulário, para mandar em grupos) e o envio da edição por e-mail (Resend) e WhatsApp (Evolution API), no módulo `modules/assinatura`. Detalhes em [docs/assinatura.md](docs/assinatura.md).
- **Expediente**: a página `/expediente` (quem edita o jornal e como as matérias são escolhidas e escritas), no módulo `modules/expediente`; o texto fica em `site/pages/expediente.md` e os dados do editor em `EXPEDIENTE`, em `site/site.ts`.
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

# Assinatura da edição semanal

O módulo `modules/assinatura` deixa o leitor receber a edição semanal por **e-mail** (API do Resend) ou por **WhatsApp** (uma instância da Evolution API), ou pelos dois. O site nunca escreve primeiro para um número de WhatsApp: é o leitor que manda uma mensagem ao número do jornal.

## A página `/assine`

É o link para mandar em grupos de WhatsApp. Mostra só a edição semanal mais recente, com os mesmos componentes da página `/weekly`, sem o menu lateral, a barra inferior e o resto do site, e o formulário de inscrição no fim da edição. Quando ainda não há edição, mostra uma apresentação curta do jornal e o formulário. A prévia do link (Open Graph) usa a imagem `/og/pages/assine.png` (texto em `CARDS.assine`, `site/site.ts`) e cita a manchete da edição.

`/assine/2026-W43` mostra uma edição em particular: é o link que cada envio leva, para que uma mensagem encaminhada abra a mesma edição.

Uma matéria tocada nessas páginas abre em `/assine/2026-W43/<id>`, tão enxuta quanto a edição: o texto, o link para o original e o formulário de inscrição no fim. O único caminho de volta é **Voltar à edição**, para a mesma `/assine/2026-W43`; nada leva ao resto do site, além das páginas de privacidade e termos. A prévia do link usa a imagem e o resumo da matéria, e a página não é indexada (a da matéria no site, `/items/<id>`, é a que vai para os buscadores). O **Original ↗** de cada matéria na edição continua indo direto para a fonte.

Cada matéria também pode ir sozinha para um grupo. No fim da matéria no site (`/items/<id>`), na página enxuta (`/assine/2026-W43/<id>`) e ao lado do **Original ↗** de cada matéria da edição semanal (no site e na `/assine`), o botão **Mandar no WhatsApp** abre o WhatsApp (`wa.me`) com o título e o link da página enxuta prontos, para o leitor escolher a conversa; nada passa pelo servidor nem pela Evolution. Ao lado, **Copiar link** copia o mesmo endereço (com o campo para selecionar à mão se o navegador não deixar). A semana do link é a da edição semanal mais recente que traz a matéria; uma matéria que nenhuma edição traz vai na semana da edição mais recente, e antes da primeira edição o botão manda a página da matéria no site. As edições diárias e mensais não têm o botão.

A prévia desse link é o cartão da matéria (`/og/items/<id>.png`): marca do jornal, categoria, título, resumo e, quando há, o número-chave num círculo à direita. O número-chave é o resultado de uma mudança (“de 44,1% para 70,8%” mostra 70,8%) no título ou no resumo, ou o primeiro percentual do título; intervalos (“de 63% a 98%”), “IC 95%” e os outros percentuais do resumo ficam de fora, e sem nenhum o cartão sai sem o círculo. Tudo vem do que já está guardado: abrir o cartão não chama modelo.

Para pegar o link, abra a edição semanal no site (`/weekly` ou `/weekly/2026-W43`): embaixo do cabeçalho, o botão **Copiar link para grupos** copia o endereço completo da `/assine` daquela semana (`https://ofolego.com/assine/2026-W43`). Se o navegador não deixar copiar, o endereço aparece num campo para selecionar e copiar à mão.

O resto do site leva a `/assine`, para quem chega pelo jornal compartilhado: **Assine grátis** no menu lateral, **Assine** na barra inferior do celular e uma linha na página **Meu**; uma faixa “Receba a edição semanal toda segunda-feira às 07:00, de graça” (dia e hora de `EDITION_WHEN.weekly`, em `site/site.ts`) embaixo do cabeçalho de cada edição (semanal, mensal e nota diária) e no pé de todas as páginas; e um quadro **Quero receber** no fim de cada edição e de cada matéria. Nada abre por cima da leitura. Esses textos não citam canal: quem escolhe e-mail ou WhatsApp é a página `/assine`, que só mostra os canais ligados.

A inscrição só mostra os canais que estão ligados (abaixo): o formulário de e-mail e o botão **Receber pelo WhatsApp**. Com os dois desligados, a página diz que as inscrições abrem em breve.

## Inscrição, confirmação e saída

- **E-mail**: o formulário pede o e-mail e a caixa de consentimento (texto em `modules/assinatura/copy.ts`, guardado com cada endereço). A resposta é a mesma para um endereço novo, pendente ou já confirmado, para ninguém descobrir quem está na lista.
- **Confirmação dupla do e-mail**: o endereço recebe na hora um link de confirmação e não recebe nenhuma edição antes de confirmar. Um pedido repetido reenvia a confirmação no máximo a cada 10 minutos, até 5 tentativas; depois disso, por 24 horas, a resposta diz para procurar na caixa de spam e tentar de novo mais tarde, sem enviar nada. Passado um dia da última tentativa, um novo pedido recomeça as tentativas.
- **WhatsApp**: o botão **Receber pelo WhatsApp** abre o WhatsApp (`wa.me`) com a mensagem **QUERO O FÔLEGO** pronta para o número do jornal (`NEWSLETTER_WHATSAPP_NUMBER`), com a frase de consentimento ao lado. Quando a mensagem chega (maiúsculas, acentos e pontuação à parte: “quero o folego”, “Quero o Fôlego!”), o número entra na lista já confirmado, com o consentimento e a mensagem guardados, e recebe uma única mensagem de boas-vindas que diz como sair. Um número que já está na lista não recebe outra.
- **Os links não mudam nada sozinhos**: os links `/assine/confirmar?t=…` e `/assine/sair?t=…` só abrem uma página curta (`/assine/confirmacao` ou `/assine/saida`), com o nome do jornal, uma frase e um botão: **Confirmar inscrição** ou **Não quero mais receber**. Sem o endereço, sem formulário de inscrição, sem a edição e sem o resto do site. Assim, um antivírus de e-mail ou a prévia de link que abre o endereço não confirma nem tira ninguém da lista. Depois de sair, a página oferece “Voltar a receber”. Um link que não vale mais (endereço apagado pela limpeza, link cortado) diz isso depois do clique, ou logo ao abrir quando chega sem o token, e aponta para a inscrição. As mensagens do WhatsApp que levam esses links saem sem prévia de link.
- **Saída**: todo envio leva o link de saída. O e-mail traz também os cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post` (RFC 8058), que os clientes de e-mail mostram como botão e que tiram o endereço da lista com um clique. No WhatsApp, responder **SAIR** ou **PARAR** tira o número da lista.
- **Abuso**: campo-armadilha invisível, no máximo 5 inscrições por aparelho a cada 10 minutos (identificador irreversível de IP e navegador, como no feedback).
- **Prazo dos dados**: e-mails não confirmados em 30 dias e endereços que saíram há 30 dias são apagados pela limpeza diária.

## Envio da edição

O worker roda `assinatura.send` a cada minuto (só existe com algum canal ligado). Quando sai uma edição semanal nova, ela é planejada uma vez por canal para os endereços confirmados naquele momento; quem confirmar depois recebe a próxima. Uma edição só é planejada até 3 dias depois do domingo que fecha a semana, para que ligar um canal no meio do mês não mande edições velhas.

- Cada envio é uma linha de `assinatura_sends` (um por endereço e edição), e por isso nada é mandado duas vezes.
- Falha que pode passar (Resend fora do ar ou limitando, Evolution com a chave ou instância erradas) é tentada até 3 vezes no total, com 10 e 20 minutos de espera. O e-mail leva uma chave de idempotência, então uma nova tentativa nunca gera segunda cópia.
- No WhatsApp, um tempo esgotado ou um erro 5xx da Evolution pode ter entregado a mensagem: o envio fica como **sem confirmação de entrega** e não é repetido sozinho. No Painel → **Inscritos**, “Enviar de novo” devolve esses envios (e os que falharam) para a fila, depois de você conferir na instância.
- Ritmo no WhatsApp: uma mensagem a cada 12 a 18 segundos (cerca de 4 por minuto). Antes de cada rodada o worker confere se a instância está conectada; se não estiver, não manda nada e tenta no minuto seguinte.
- O e-mail é a edição em HTML próprio para e-mail (manchete, destaques, as partes dos módulos que têm forma de e-mail, como o caso da semana, seções, link de cada matéria para o site e para o original), com o link da página e o de saída. A mensagem de WhatsApp traz a manchete, os destaques, o link da edição e como sair.

O Painel → **Inscritos** mostra a contagem por canal e status, as edições enviadas com o resultado de cada uma, a lista (os 500 mais recentes) e o botão **Exportar CSV** com a lista inteira.

## Configuração

No `.env` (todos os interruptores só ligam com `true`):

```bash
# E-mail
NEWSLETTER_EMAIL_ENABLED=true
RESEND_API_KEY=re_...
NEWSLETTER_FROM=O Fôlego <edicao@ofolego.com>   # domínio verificado no Resend

# WhatsApp
NEWSLETTER_WHATSAPP_ENABLED=true
NEWSLETTER_WHATSAPP_NUMBER=5511987654321      # o número da instância, para onde o leitor escreve: só dígitos, com o código do país
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=...            # a chave global ou a da instância
EVOLUTION_INSTANCE=folego        # nome da instância conectada ao número
EVOLUTION_WEBHOOK_SECRET=...     # uma sequência aleatória (openssl rand -hex 24)
```

Depois de mudar, reinicie a api e o worker (`docker compose up -d`). O Painel → Inscritos mostra se cada canal está ligado. Um `NEWSLETTER_WHATSAPP_NUMBER` fora do formato (só dígitos, 8 a 15, com o código do país) deixa o WhatsApp fechado, e o Painel → Inscritos mostra o motivo. Sem o webhook (abaixo), ninguém consegue se inscrever pelo WhatsApp.

### Apontar a Evolution para o webhook

O webhook recebe as mensagens que chegam ao número: `QUERO O FÔLEGO` inscreve o número (só com o canal ligado), `SAIR` e `PARAR` descadastram, e o resto é registrado no log da api e ignorado (fica para quem mais atende o número). Mensagens de grupos e as enviadas pela própria instância são ignoradas. Ele só aceita chamadas com o segredo `EVOLUTION_WEBHOOK_SECRET`, na URL (`?token=`) ou no cabeçalho `Authorization: Bearer`.

Na Evolution API v2, configure o webhook da instância com o evento `MESSAGES_UPSERT`:

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
  -H "apikey: $EVOLUTION_API_KEY" -H "content-type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://ofolego.com/api/assinatura/evolution?token=SEU_SEGREDO","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT"]}}'
```

(No Evolution Manager, o mesmo fica em Instância → Eventos → Webhook.) Um agente conectado ao número por uma integração da própria Evolution (EvolutionBot, Typebot, OpenAI, Dify, n8n) funciona ao lado do webhook; se o agente também precisar do webhook, a instância tem um só, e então ele deve repassar as mensagens a este endereço.

## Tabelas

`assinatura_subscribers` (um endereço por canal, com status, consentimento e token), `assinatura_editions` (cada edição planejada por canal) e `assinatura_sends` (cada envio). Nenhum teste nem o desenvolvimento local manda e-mail ou WhatsApp de verdade: os testes usam servidores locais no lugar do Resend e da Evolution.

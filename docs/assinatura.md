# Assinatura da edição semanal

O módulo `modules/assinatura` deixa o leitor receber a edição semanal por **e-mail** (API do Resend) ou por **WhatsApp** (uma instância da Evolution API), ou pelos dois. O site nunca escreve primeiro para um número de WhatsApp: é o leitor que manda uma mensagem ao número do jornal.

## A página `/assine`

É o link para mandar em grupos de WhatsApp. Mostra só a edição semanal mais recente, com os mesmos componentes da página `/weekly`, sem o menu lateral, a barra inferior e o resto do site, e o formulário de inscrição no fim da edição. Quando ainda não há edição, mostra uma apresentação curta do jornal e o formulário. A prévia do link (Open Graph) usa a imagem `/og/pages/assine.png` (texto em `CARDS.assine`, `site/site.ts`) e cita a manchete da edição.

`/assine/2026-W43` mostra uma edição em particular: é o link que cada envio leva, para que uma mensagem encaminhada abra a mesma edição.

Uma matéria tocada nessas páginas abre em `/assine/2026-W43/<id>`, tão enxuta quanto a edição: o texto, o link para o original e o formulário de inscrição no fim. O único caminho de volta é **Voltar à edição**, para a mesma `/assine/2026-W43`; nada leva ao resto do site, além das páginas de privacidade e termos. A prévia do link usa a imagem e o resumo da matéria, e a página não é indexada (a da matéria no site, `/items/<id>`, é a que vai para os buscadores). O **Original ↗** de cada matéria na edição continua indo direto para a fonte.

Cada matéria também pode ir sozinha para um grupo. No fim da matéria no site (`/items/<id>`), na página enxuta (`/assine/2026-W43/<id>`) e ao lado do **Original ↗** de cada matéria da edição semanal (no site e na `/assine`), o botão **Mandar no WhatsApp** abre o WhatsApp (`wa.me`) com o título e o link da página enxuta prontos, para o leitor escolher a conversa; nada passa pelo servidor nem pela Evolution. Ao lado, **Copiar link** copia o mesmo endereço (com o campo para selecionar à mão se o navegador não deixar). A semana do link é a da edição semanal mais recente que traz a matéria; uma matéria que nenhuma edição traz vai na semana da edição mais recente, e antes da primeira edição o botão manda a página da matéria no site. As edições diárias e mensais não têm o botão.

A prévia desse link é o cartão da matéria (`/og/items/<id>.png`): marca do jornal, categoria, título, resumo e, quando há, o número-chave num círculo à direita. O número-chave é o resultado de uma mudança (“de 44,1% para 70,8%” mostra 70,8%) no título ou no resumo, ou o primeiro percentual do título; intervalos (“de 63% a 98%”), “IC 95%” e os outros percentuais do resumo ficam de fora, e sem nenhum o cartão sai sem o círculo. Tudo vem do que já está guardado: abrir o cartão não chama modelo.

Para pegar o link, abra a edição semanal no site (`/weekly` ou `/weekly/2026-W43`): no computador embaixo do cabeçalho e no celular no fim da edição, abaixo do quadro **Quero receber**, o botão **Copiar link para grupos** copia o endereço completo da `/assine` daquela semana (`https://ofolego.com/assine/2026-W43`). Se o navegador não deixar copiar, o endereço aparece num campo para selecionar e copiar à mão.

Depois da edição e do formulário vêm o quadro **Indique a um colega** (abaixo) e, no rodapé, o link para o **Expediente** (`/expediente`, módulo `modules/expediente`: quem edita o jornal e como as matérias são escolhidas e escritas).

## Link por grupo

Para saber qual grupo de WhatsApp trouxe cada inscrito, mande a cada grupo o link com a marcação dele: `https://ofolego.com/assine?g=residentes-sp` (vale também em `/assine/2026-W43?g=…`, e a marcação continua quando o leitor abre uma matéria dessa página e volta à edição). No Painel → **Inscritos**, o quadro **Por grupo** monta esse link a partir do nome que você digitar e mostra, para cada marcação, quantos estão confirmados, aguardando confirmação e quantos saíram. A marcação vira letras minúsculas, números e hífens, com até 40 caracteres (“Residentes SP 2026” vira `residentes-sp-2026`).

A inscrição por e-mail guarda a marcação do link em que o leitor estava. Um endereço fica com a marcação que o trouxe primeiro; se ele não tinha nenhuma, fica com a da nova inscrição. A marcação nomeia um grupo, nunca uma pessoa: aparece só no painel, na lista e no CSV, e não em páginas públicas. Inscrições pelo WhatsApp não têm marcação.

## Indique a um colega

No fim de cada edição no site (depois de **Quero receber**), na página `/assine` e no fim do e-mail da edição há um **Indique a um colega** com o link de inscrição marcado `?g=indique`, para que o painel conte quantos vieram por indicação. No site, o botão abre o compartilhamento do celular ou, no computador, copia o link; se o navegador não deixar copiar, o link aparece num campo para selecionar à mão. No e-mail, o link vem escrito e um botão **Indicar por e-mail** abre um e-mail novo com ele; o texto não sugere encaminhar a edição, porque ela leva o link de saída de quem a recebeu. O site não manda nada a ninguém.

O resto do site leva a `/assine`, para quem chega pelo jornal compartilhado: **Assine grátis** no menu lateral, **Assine** na barra inferior do celular e uma linha na página **Meu**; uma faixa “Receba a edição semanal toda segunda-feira às 07:00, de graça” (dia e hora de `EDITION_WHEN.weekly`, em `site/site.ts`) embaixo do cabeçalho de cada edição (semanal, mensal e nota diária; só no computador, porque no celular a edição começa pela manchete) e no pé de todas as páginas; e um quadro **Quero receber** no fim de cada edição e de cada matéria. Nada abre por cima da leitura. Esses textos não citam canal: quem escolhe e-mail ou WhatsApp é a página `/assine`, que só mostra os canais ligados.

A inscrição só mostra os canais que estão ligados (abaixo): o formulário de e-mail e o botão **Receber pelo WhatsApp**. Com os dois desligados, a página diz que as inscrições abrem em breve.

## Inscrição, confirmação e saída

- **E-mail**: o formulário pede o e-mail, as seções que vêm primeiro (opcional, abaixo) e a caixa de consentimento (texto em `modules/assinatura/copy.ts`, guardado com cada endereço). A resposta é a mesma para um endereço novo, pendente ou já confirmado, para ninguém descobrir quem está na lista.
- **Confirmação dupla do e-mail**: o endereço recebe na hora um link de confirmação e não recebe nenhuma edição antes de confirmar. Um pedido repetido reenvia a confirmação no máximo a cada 10 minutos, até 5 tentativas; depois disso, por 24 horas, a resposta diz para procurar na caixa de spam e tentar de novo mais tarde, sem enviar nada. Passado um dia da última tentativa, um novo pedido recomeça as tentativas.
- **WhatsApp**: o botão **Receber pelo WhatsApp** abre o WhatsApp (`wa.me`) com a mensagem **QUERO O FÔLEGO** pronta para o número do jornal (`NEWSLETTER_WHATSAPP_NUMBER`), com a frase de consentimento ao lado. Quando a mensagem chega (maiúsculas, acentos e pontuação à parte: “quero o folego”, “Quero o Fôlego!”), o número entra na lista já confirmado, com o consentimento e a mensagem guardados, e recebe uma única mensagem de boas-vindas que diz como sair. Um número que já está na lista não recebe outra.
- **Os links não mudam nada sozinhos**: os links `/assine/confirmar?t=…` e `/assine/sair?t=…` só abrem uma página curta (`/assine/confirmacao` ou `/assine/saida`), com o nome do jornal, uma frase e um botão: **Confirmar inscrição** ou **Não quero mais receber**. Sem o endereço, sem formulário de inscrição, sem a edição e sem o resto do site. Assim, um antivírus de e-mail ou a prévia de link que abre o endereço não confirma nem tira ninguém da lista. Depois de sair, a página oferece “Voltar a receber”. Um link que não vale mais (endereço apagado pela limpeza, link cortado) diz isso depois do clique, ou logo ao abrir quando chega sem o token, e aponta para a inscrição. As mensagens do WhatsApp que levam esses links saem sem prévia de link.
- **Saída**: todo envio leva o link de saída. O e-mail traz também os cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post` (RFC 8058), que os clientes de e-mail mostram como botão e que tiram o endereço da lista com um clique. No WhatsApp, responder **SAIR** ou **PARAR** tira o número da lista.
- **Abuso**: campo-armadilha invisível, no máximo 5 inscrições por aparelho a cada 10 minutos (identificador irreversível de IP e navegador, como no feedback).
- **Prazo dos dados**: e-mails não confirmados em 30 dias e endereços que saíram há 30 dias são apagados pela limpeza diária.

## Seções que vêm primeiro

O jornal tem quatro seções (`AREAS` em `industry/taxonomy.ts`): **Cirurgia torácica pediátrica**, **Via aérea pediátrica**, **Pneumologia pediátrica** e **Otorrinolaringologia pediátrica**. O formulário de e-mail pergunta “Quais seções vêm primeiro no seu e-mail?”, com **Todas** (o padrão, a ordem do jornal) ou uma ou mais seções. O e-mail da edição põe as seções escolhidas antes das outras, cada grupo na ordem do jornal; escolher todas é o mesmo que **Todas**. Todas as seções continuam chegando: a escolha só muda a ordem. A escolha fica em `assinatura_subscribers.interest` como as keys das seções, na ordem do jornal, separadas por vírgula (`cirurgia,via-aerea`). Até 31/10/2026 havia duas seções; quem escolheu a antiga **Cirurgia torácica pediátrica e via aérea** passa a ter Cirurgia torácica e Via aérea primeiro (`scripts/abas-dividir.ts`, em [deploy.md](deploy.md)).

O rodapé de cada e-mail traz **Escolher as seções que vêm primeiro**, que abre `/assine/preferencias?t=…`: a escolha atual e um botão **Salvar**. A página de saída (`/assine/saida`) oferece o mesmo antes do botão de sair. Uma nova inscrição de um endereço já confirmado não muda a escolha (só o link do próprio leitor muda). Inscrições pelo WhatsApp não têm escolha (a mensagem não tem seções). A escolha aparece na lista do painel, no CSV e no quadro **Interesse por seção**.

## Medir a leitura

Aberturas não servem: o Apple Mail e outros clientes baixam as imagens de todo e-mail sozinhos, e o e-mail não leva pixel de abertura. O painel conta **cliques**, sem serviço de terceiros:

- Cada link do HTML do e-mail da edição passa pelo próprio site: `/assine/l?s=<envio>&k=<tipo>&u=<destino>&h=<assinatura>`. A assinatura (HMAC com `SESSION_SECRET`) prende o envio, o tipo e o destino, então o endereço não redireciona para nenhum outro lugar; um link alterado responde 404. O site conta o clique e manda o leitor ao destino. O link de saída e o de preferências não passam por aí, nem o texto puro do e-mail.
- Tipos de link: comum, **resposta ao caso da semana** (cada alternativa do caso, no e-mail, é um link para a edição em `/assine/<semana>?resposta=B#caso`, que marca a escolha e diz quando sai a resposta) e **Indique a um colega**.
- **Filtro de robôs** (`modules/assinatura/backend/reads.ts`). Antivírus e filtros de e-mail corporativos abrem os links sozinhos. Não contam como leitor: pedidos `HEAD`; pedidos de pré-carregamento (cabeçalho `Purpose`/`Sec-Purpose`); navegador vazio ou de robô, script ou filtro conhecido (bot, crawler, preview, scan, python, curl, Barracuda, Proofpoint, Mimecast, Safe Links…); faixas de IP publicadas de filtros de e-mail (Microsoft Exchange Online Protection, Proofpoint, Mimecast, Barracuda); cliques nos primeiros 30 segundos depois do envio; e 5 ou mais cliques em 10 segundos no mesmo e-mail (um robô que segue todos os links): nesse caso os cliques dessa rajada, e a resposta ao caso ou o Indique que ela fez, passam para os robôs. Esses cliques são contados à parte (“só robôs”). O redirecionamento acontece sempre.
- **O que fica guardado** (`assinatura_reads`, uma linha por envio clicado): o número de cliques de pessoa e de robô, a hora do primeiro clique, a hora da resposta ao caso e do clique no Indique, e, quando houver, a devolução, a reclamação e a saída depois daquela edição. Nada de IP, navegador ou qual link foi clicado.
- **Saídas** contam para a última edição enviada ao endereço; voltar à lista pelo botão “Voltar a receber” desfaz a contagem.
- **Devoluções e reclamações** vêm do webhook do Resend (abaixo). Uma reclamação (“marcar como spam”) também tira o endereço da lista (`left_by = complaint`). O “entregue” é o envio aceito pelo Resend e não devolvido.
- **Botões de compartilhar do site** (**Mandar no WhatsApp**, **Copiar link**, **Enviar o link** do Indique): cada clique manda um aviso ao site (`/api/assinatura/botao`), que soma por dia (`assinatura_buttons`), sem nada do leitor. É clique no botão, não encaminhamento confirmado: o site não sabe se a mensagem foi enviada.
- **Quando o endereço é apagado** pela limpeza dos 30 dias, as somas das edições que ele recebeu vão para `assinatura_erased`, e quem tinha confirmado fica em `assinatura_departed` só com o canal, a marcação do grupo e as datas de confirmação e saída; assim as taxas de uma edição antiga e a retenção não mudam quando os endereços somem.

No Painel → **Inscritos**, o quadro **Leitura do e-mail** mostra, para as últimas 12 edições por e-mail: entregues; leitores com ao menos um clique de pessoa (taxa sobre os entregues); e-mails clicados só por robôs; respostas ao caso da semana sobre os expostos (os entregues da edição que trazia o caso); cliques no Indique do e-mail; saídas e reclamações sobre os entregues. Acima dela: **leitores recorrentes** (confirmados que clicaram em pelo menos 2 das últimas 4 edições, sobre os que receberam pelo menos 2 delas) e os cliques nos botões de compartilhar nos últimos 30 dias. **Interesse por seção** conta os leitores de e-mail confirmados por escolha e quantos deles clicaram nas últimas 4 edições. No quadro **Por grupo**, **Retidos em 8 semanas**: dos que confirmaram há 8 semanas ou mais, quantos continuavam na lista 8 semanas depois de confirmar.

## Envio da edição

O worker roda `assinatura.send` a cada minuto (só existe com algum canal ligado). Quando sai uma edição semanal nova, ela é planejada uma vez por canal para os endereços confirmados naquele momento; quem confirmar depois recebe a próxima. Uma edição só é planejada até 3 dias depois do domingo que fecha a semana, para que ligar um canal no meio do mês não mande edições velhas.

- Cada envio é uma linha de `assinatura_sends` (um por endereço e edição), e por isso nada é mandado duas vezes.
- Falha que pode passar (Resend fora do ar ou limitando, Evolution com a chave ou instância erradas) é tentada até 3 vezes no total, com 10 e 20 minutos de espera. O e-mail leva uma chave de idempotência, então uma nova tentativa nunca gera segunda cópia.
- No WhatsApp, um tempo esgotado ou um erro 5xx da Evolution pode ter entregado a mensagem: o envio fica como **sem confirmação de entrega** e não é repetido sozinho. No Painel → **Inscritos**, “Enviar de novo” devolve esses envios (e os que falharam) para a fila, depois de você conferir na instância.
- Ritmo no WhatsApp: uma mensagem a cada 12 a 18 segundos (cerca de 4 por minuto). Antes de cada rodada o worker confere se a instância está conectada; se não estiver, não manda nada e tenta no minuto seguinte.
- O e-mail é a edição em HTML próprio para e-mail (manchete, destaques, as partes dos módulos que têm forma de e-mail, como o caso da semana, seções na ordem que o leitor escolheu, link de cada matéria para o site e para o original, todos passando pelo site para contar os cliques), com o link da página, o de preferências e o de saída. A mensagem de WhatsApp traz a manchete, os destaques, o link da edição e como sair.

O Painel → **Inscritos** mostra a contagem por canal e status, a contagem por grupo (acima), a leitura do e-mail (acima), as edições enviadas com o resultado de cada uma, a lista (os 500 mais recentes) e o botão **Exportar CSV** com a lista inteira.

## Configuração

No `.env` (todos os interruptores só ligam com `true`):

```bash
# E-mail
NEWSLETTER_EMAIL_ENABLED=true
RESEND_API_KEY=re_...
NEWSLETTER_FROM=O Fôlego <edicao@ofolego.com>   # domínio verificado no Resend
RESEND_WEBHOOK_SECRET=whsec_...                 # devoluções e reclamações (abaixo)

# WhatsApp
NEWSLETTER_WHATSAPP_ENABLED=true
NEWSLETTER_WHATSAPP_NUMBER=5511987654321      # o número da instância, para onde o leitor escreve: só dígitos, com o código do país
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=...            # a chave global ou a da instância
EVOLUTION_INSTANCE=folego        # nome da instância conectada ao número
EVOLUTION_WEBHOOK_SECRET=...     # uma sequência aleatória (openssl rand -hex 24)
```

Depois de mudar, reinicie a api e o worker (`docker compose up -d`). O Painel → Inscritos mostra se cada canal está ligado. Um `NEWSLETTER_WHATSAPP_NUMBER` fora do formato (só dígitos, 8 a 15, com o código do país) deixa o WhatsApp fechado, e o Painel → Inscritos mostra o motivo. Sem o webhook (abaixo), ninguém consegue se inscrever pelo WhatsApp.

### Apontar o Resend para o webhook

No painel do Resend, em **Webhooks**, crie um endpoint `https://ofolego.com/api/assinatura/resend` com os eventos `email.bounced` e `email.complained`, e copie o segredo dele (`whsec_…`) para `RESEND_WEBHOOK_SECRET`. O site só aceita chamadas com a assinatura desse segredo (Svix) feitas nos últimos 5 minutos. Sem ele, o painel avisa que devoluções e reclamações não são contadas.

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

`assinatura_subscribers` (um endereço por canal, com status, consentimento, token, a marcação do grupo e as seções que vêm primeiro), `assinatura_editions` (cada edição planejada por canal, e se o e-mail trazia o caso da semana), `assinatura_sends` (cada envio), `assinatura_reads` (o que o leitor fez com cada envio, só contagens e horas), `assinatura_erased` e `assinatura_departed` (as somas que ficam de endereços apagados) e `assinatura_buttons` (cliques por dia nos botões de compartilhar). Nenhum teste nem o desenvolvimento local manda e-mail ou WhatsApp de verdade: os testes usam servidores locais no lugar do Resend e da Evolution.

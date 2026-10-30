# Caso da semana

Cada edição semanal pode trazer um **caso da semana**: um caso clínico curto, com imagem opcional e uma pergunta ao leitor ("Qual a sua conduta?", aberta ou com alternativas). A resposta e a discussão saem na edição seguinte. A ideia é dar assunto aos grupos durante a semana e um motivo para abrir a próxima edição. O leitor responde nos grupos; o site não recebe votos nem respostas.

O código fica no módulo `modules/caso`: `caso.ts` (tipos e as semanas de cada edição), `backend/casos.ts` (regras, imagem e a parte da edição), `backend/mail.ts` (a parte do e-mail), `api/casos.ts` (rotas), `web/` (painel e bloco da edição) e a tabela `caso_semana`. Nada aqui chama um modelo.

## No painel

**Painel → Caso da semana** lista os casos e tem o formulário de um caso novo:

- **Edição**: a próxima edição a sair e as 7 seguintes que ainda não têm caso (uma edição tem no máximo um). Numa segunda antes das 07:00 (`EDITION_TIMES.weekly`), a próxima edição ainda é a da semana que acabou.
- **Título** e **Caso**: o texto curto, em parágrafos separados por linha em branco.
- **Imagem** (opcional; PNG, JPG ou WebP, até 5 MB) e uma **legenda**, que também serve de texto alternativo.
- **Pergunta**: em branco, fica "Qual a sua conduta?". **Alternativas** são opcionais (de 2 a 5); a marcada como certa aparece destacada só na resposta.
- **Resposta e discussão**: pode ficar para depois. Enquanto estiver em branco, a edição seguinte sai sem a resposta.

O caso nasce como **rascunho**. **Publicar** o põe na sua edição; um caso publicado continua editável, e o que for salvo aparece nas edições em um ou dois minutos (as páginas públicas ficam um minuto em cache; no site, em `/assine/<semana>` e nos e-mails enviados depois), por isso a resposta pode ser escrita durante a semana. **Retirar do ar** volta a rascunho e tira o caso da sua edição e a resposta da seguinte. Só um rascunho pode ser **apagado**, com a imagem. **Ver como sai na edição** mostra a prévia. Cada passo fica no registro de auditoria. O menu do painel mostra quantas coisas faltam para a próxima edição: o caso dela publicado e a resposta do caso da edição anterior.

## A imagem e a privacidade do paciente

O formulário lembra o editor de tirar do texto e da imagem tudo o que identifique o paciente (nome, iniciais, prontuário, datas, cidade, hospital, rosto, tatuagens, o que estiver escrito na imagem) e de usar só casos com o consentimento que a instituição exige. Isso é do editor: o sistema não vê o que a imagem mostra.

O que o sistema faz: a imagem é recodificada ao chegar (JPEG de até 1600 px no lado maior, girada como a câmera a segurou), sem os metadados do arquivo (EXIF, XMP, IPTC: local, data, aparelho, nomes). Fica em `uploads/caso/` na pasta de dados, que entra no backup de arquivos, com um nome tirado do conteúdo. O site só a entrega (`/caso/imagens/<arquivo>`) enquanto o caso estiver publicado (caches no caminho podem guardá-la por até 10 minutos depois de o caso sair do ar); o painel a vê por `/api/admin/caso/imagens/<arquivo>`. Uma imagem trocada ou tirada, ou de um caso apagado, é apagada do disco.

## Na edição

A edição semanal da semana N mostra, num bloco depois da primeira página, a **resposta do caso da semana passada** (a do caso da semana N−1, se publicado e respondido) e o **caso da semana** N com a pergunta e o dia em que sai a resposta. Uma edição sem nenhum dos dois fica como antes. Diárias e mensais não trazem caso. O bloco aparece igual em `/weekly/<semana>` e em `/assine/<semana>`.

O e-mail da edição (módulo assinatura) traz o mesmo bloco, depois dos destaques, em HTML com estilos no próprio elemento e em texto simples; a imagem é um link para a cópia do site. O módulo oferece essa parte pelo gancho `reports.mail` de `ServerModule` (`packages/backend/src/modules.ts`), que qualquer módulo com parte na edição pode usar. A mensagem de WhatsApp não traz o caso.

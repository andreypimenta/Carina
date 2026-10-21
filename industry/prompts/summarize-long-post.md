Você é um editor sênior de IA em medicina. Este é um post (tweet); faça as tarefas abaixo, escrevendo em português do Brasil:

1. Dê ao post um título em português de 30 a 70 caracteres (resumindo o conteúdo central)
2. Resuma os pontos do post em português, em 200 a 400 caracteres e no máximo 3 frases (não é tradução integral; se o original tem poucos pontos, prefira ser curto)

Requisitos do resumo:
- **Priorize manter** números concretos como nome e versão do modelo ou produto, tamanho da amostra (n), sensibilidade, especificidade, AUC, intervalos de confiança, desfecho, status regulatório, preço e disponibilidade (são o núcleo de posts sobre IA em medicina; não os corte como detalhe para encurtar)
- Não use fórmulas editoriais como "o texto apresenta" ou "segundo reportagem"
- Se houver post citado e ele trouxer o contexto-chave do que o post principal quer dizer, integre suas informações-chave ao resumo
- Integre só os pontos-chave do post citado; não repita frase a frase nem copie o texto inteiro

{{> rules-answer-first-summary}}

{{> rules-self-contained-title}}

{{> rules-domain}}

{{> rules-anti-hallucination}}

Formato de saída (siga à risca; os rótulos title_zh e summary_zh ficam assim, o conteúdo é em português):
title_zh: <título em português de 30 a 70 caracteres>
summary_zh: <resumo em português de 200 a 400 caracteres, no máximo 3 frases>

Fonte: {{sourceName}}
{{identity}}
Conteúdo do post principal:
{{post}}

【Regras de terminologia de IA em medicina — 100% do conteúdo desta plataforma é IA aplicada à saúde; siga à risca】

1. Escreva em português do Brasil, claro e sem jargão desnecessário, com os termos técnicos médicos corretos. Em caso de ambiguidade, **sempre use o sentido de IA/medicina**:
   - LLM = modelo de linguagem de grande escala (LLM) na primeira menção; depois só LLM (nunca "mestrado em Direito")
   - Large language model = modelo de linguagem de grande escala (LLM); foundation model = modelo fundacional
   - Token / tokens = token (mantenha em inglês; nunca "ficha" ou "moeda")
   - Agent / Agentic = agente de IA / agêntico (não "representante" ou "corretor")
   - Inference = inferência (geração pelo modelo); Reasoning = raciocínio; reasoning model = modelo de raciocínio
   - Fine-tuning = ajuste fino; Pretraining = pré-treinamento; Embedding = embedding (ou vetor de representação)
   - Hallucination = alucinação (do modelo); Prompt = prompt; Context window = janela de contexto
   - Machine learning = aprendizado de máquina; deep learning = aprendizado profundo; computer vision = visão computacional
   - Sensitivity / specificity = sensibilidade / especificidade; PPV / NPV = valor preditivo positivo / negativo (VPP / VPN)
   - Accuracy = acurácia; recall = sensibilidade (em contexto clínico); precision = precisão (ou VPP em contexto clínico)
   - Randomized controlled trial (RCT) = ensaio clínico randomizado; prospective / retrospective study = estudo prospectivo / retrospectivo
   - External validation = validação externa; cohort = coorte; endpoint / outcome = desfecho; primary endpoint = desfecho primário
   - Systematic review / meta-analysis = revisão sistemática / metanálise; preprint = preprint; peer-reviewed = revisado por pares
   - Confidence interval = intervalo de confiança (IC); odds ratio = razão de chances (OR); hazard ratio = razão de riscos (HR)
   - FDA clearance / 510(k) clearance = liberação da FDA / liberação 510(k); De Novo authorization = autorização De Novo; approval / PMA = aprovação / PMA; Breakthrough Device designation = designação de dispositivo inovador (Breakthrough)
   - Software as a Medical Device (SaMD) = software como dispositivo médico (SaMD); CE marking = marcação CE
   - Clinical decision support = apoio à decisão clínica; ambient scribe / AI scribe = escriba ambiental / escriba com IA
   - EHR / EMR = prontuário eletrônico (PEP; mantenha EHR se o original citar o termo como nome de sistema)
   - Health system = sistema de saúde / rede hospitalar; payer = operadora / pagador; reimbursement = reembolso
   - Primary care = atenção primária; emergency department = pronto-socorro / departamento de emergência; ICU = UTI
   - Use o nome brasileiro consagrado de doenças, exames e especialidades (stroke = AVC; chest X-ray = radiografia de tórax; CT = tomografia computadorizada (TC); MRI = ressonância magnética (RM); sepsis = sepse)

2. **Mantenha no original**, sem traduzir nem acrescentar explicação entre parênteses:
   - Siglas consagradas: FDA / ANVISA / EMA / OMS (WHO → OMS) / CFM / SUS / NHS / CMS / AUC / ROC / IC / LLM / RAG / API / SDK / GPU / HIPAA / LGPD / DICOM / FHIR / HL7
     **Regra**: siglas de órgãos, normas e métricas consagradas ficam como estão; na primeira menção de uma sigla pouco conhecida, pode-se dar o nome por extenso em português
   - Nomes de empresas, instituições, produtos e modelos **nunca se traduzem**: OpenAI / Anthropic / Google DeepMind / Microsoft / Nuance / NVIDIA / Epic / Abridge / Aidoc / Viz.ai / Tempus / Paige / PathAI / Philips / Siemens Healthineers / GE HealthCare; ChatGPT / Claude / Gemini / Med-Gemini / AMIE / MedLM / Llama / DAX Copilot / Dragon Copilot
   - Versões de modelo e produto ficam idênticas (GPT-5 / Claude Sonnet 4.6 / Gemini 3 / 405B / V4); não reescreva "405B" como "405 bilhões" nem "V4" como "quarta geração"
   - Nomes de benchmarks e conjuntos de dados: MedQA / MedMCQA / PubMedQA / USMLE / HealthBench / MIMIC-IV / CheXpert / Revalida
   - Nomes de revistas: NEJM / NEJM AI / The Lancet / Lancet Digital Health / JAMA / JAMA Network Open / Nature Medicine / npj Digital Medicine / Radiology / BMJ
   - Nomes de estudos e ensaios (por exemplo, o acrônimo de um ensaio) ficam como estão

3. Instituições brasileiras usam o nome oficial em português (Ministério da Saúde, Agência Nacional de Vigilância Sanitária (ANVISA), Conselho Federal de Medicina (CFM), Agência Nacional de Saúde Suplementar (ANS)); instituições estrangeiras ficam no nome original, podendo indicar o país na primeira menção quando ajudar (por exemplo, "a FDA, agência reguladora dos EUA").

4. Código, comandos, URLs, números e unidades:
   - Código entre crases `code`, comandos e URLs ficam idênticos
   - Números no padrão brasileiro: vírgula decimal e ponto de milhar (AUC de 0,92; sensibilidade de 94,3%; 12.500 pacientes; IC 95%: 0,88–0,95); não altere o valor
   - Valores, tamanhos de amostra, proporções, intervalos e valores de p mantêm os algarismos e as unidades do original; não troque "$10B" por "dezenas de bilhões de dólares": escreva "US$ 10 bilhões"
   - Moedas: US$ / € / R$ antes do número; unidades médicas no padrão SI (mg, mL, mmHg)

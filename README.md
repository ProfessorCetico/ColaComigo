# Cola comigo

Agenda de estudos web responsiva para estudantes. O site funciona em navegadores de celular, tablet e computador, pode ser instalado como PWA e pode ser incorporado em uma página do Google Sites.

> A configuração Firebase e o domínio de hospedagem ainda precisam ser fornecidos pelo proprietário. Sem essas configurações, o site mostra a página pública, mas não permite criar contas nem salvar dados.

## Stack

- React, TypeScript strict e Vite;
- Tailwind CSS 4 e CSS responsivo;
- React Router, React Hook Form, Zod, date-fns e Recharts;
- Firebase Authentication, Cloud Firestore, Cloud Functions e Hosting;
- Firebase Emulator Suite para desenvolvimento e testes;
- Vitest, Testing Library e testes das regras do Firestore.

## Requisitos

- Node.js 22 ou superior e npm;
- JDK compatível com os emuladores Firebase;
- Projeto Firebase próprio para autenticação, Firestore, Functions e Hosting.

## Executar localmente

```powershell
cd web
npm.cmd install
Copy-Item .env.example .env.local
```

Preencha `.env.local` com os dados do aplicativo web no Firebase Console. Não envie arquivos `.env` ao GitHub.

Para usar os emuladores locais, defina `VITE_USE_FIREBASE_EMULATORS=true` em `.env.local` e execute, em terminais separados:

```powershell
# Na pasta ColaComigo
firebase --config firebase.json emulators:start --project cola-comigo-local --only auth,firestore,functions

# Na pasta ColaComigo/web
npm.cmd run dev
```

O site local ficará disponível no endereço informado pelo Vite, normalmente `http://localhost:5173`.

## Comandos

Na pasta `web`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:rules
npm.cmd run build
npm.cmd run preview
```

`test:rules` inicia o emulador do Firestore e exige Java. As funções ficam em `functions/`; `npm install` e `npm run build` nessa pasta preparam seu código TypeScript.

## Configuração do Firebase

1. Crie um projeto Firebase controlado pelo proprietário.
2. Cadastre um aplicativo Web e copie os valores públicos de configuração para `web/.env.local`.
3. Em Authentication, habilite e-mail e senha, configure os e-mails de verificação e recuperação e revise os domínios autorizados.
4. Inicialize Firestore em modo de produção. As regras deste repositório negam acesso por padrão e limitam cada estudante ao seu próprio caminho `users/{uid}`.
5. Configure Firebase CLI (`firebase login` e `firebase use --add`) na pasta do projeto. O arquivo `.firebaserc` é local e não deve ser compartilhado.
6. Publique as regras, índices, funções e o site com `npm.cmd run deploy` na pasta `web`.
7. Para habilitar App Check, configure uma chave reCAPTCHA v3 no Firebase e informe `VITE_FIREBASE_APPCHECK_SITE_KEY`. A proteção precisa ser configurada e validada no Console antes de ser exigida em produção.

As funções de exportação e exclusão usam Admin SDK no servidor. A implantação de Cloud Functions pode exigir o plano de faturamento Blaze do Firebase/Google Cloud.

## Incorporar no Google Sites

1. Publique o site em Firebase Hosting e, quando estiver pronto, configure um domínio próprio para ele.
2. No Google Sites, use **Inserir > Incorporar > URL** e informe a URL do site publicado, por exemplo `https://SEU_PROJETO.web.app/embed`.
3. Ajuste a altura do bloco incorporado no Google Sites. O layout se adapta a larguras pequenas e oferece o link **Abrir em nova guia** como alternativa para navegadores que bloqueiem autenticação no iframe.
4. A política CSP do Hosting permite enquadramento apenas pelo domínio `mapasemitos.com.br`, `www.mapasemitos.com.br` e `sites.google.com`. Se o Google Sites usar outro domínio personalizado, altere `frame-ancestors` em `firebase.json` para incluir somente a origem exata.
5. Nunca remova as regras de autenticação ou as regras do Firestore para contornar limitações de cookies ou iframe.

## Contas, notas e planejamento

- O Firebase Authentication gerencia senhas; elas nunca são gravadas no Firestore.
- Perfis e dados acadêmicos ficam em subcoleções individuais por UID; as regras bloqueiam leitura entre contas.
- A agenda calcula sugestões de forma determinística usando avaliações, sessões existentes, compromissos pontuais e recorrentes, viagens, fuso horário e preferências. O estudante confirma antes de substituir sessões geradas.
- Notas fora do intervalo permitido são recusadas. A aplicação só indica que uma meta foi alcançada quando a regra é conhecida e foi informada.
- Médias e sugestões não substituem o resultado oficial da instituição de ensino.

## Privacidade e revisão pré-lançamento

O produto pode armazenar informações de menores. Os textos de termos e privacidade são provisórios; a validação jurídica da LGPD, das políticas para menores e do consentimento de responsáveis deve ser feita por profissional qualificado antes do lançamento público. A versão atual ainda não implementa verificação do consentimento do responsável, exportação/exclusão operacional completas, políticas de retenção nem fluxo de revisão de solicitações.

Não colete endereço residencial, localização em tempo real, dados para publicidade ou dados pessoais em URLs. Não adicione segredos ao repositório.

## Limitações conhecidas do MVP

- Firebase e domínio ainda não foram configurados; não há contas reais até essa etapa ser concluída.
- O planejador considera compromissos recorrentes, viagens e fuso IANA; cenários extremos de fuso/horário de verão e prévia detalhada das mudanças ainda precisam de validação.
- A agenda mostra sessões como lista semanal; edição manual completa, feedback de dificuldade e visualização diária ainda não estão prontos.
- A exclusão e exportação dependem de implantação e validação das Cloud Functions.
- Regras de aprovação e gráficos são uma base inicial; projeções, histórico de alterações e todos os tipos de recuperação escolar ainda precisam de cobertura adicional.
- O fluxo para menores precisa de revisão e implementação antes do lançamento público.
- Ainda não há testes de ponta a ponta em navegador ou revisão jurídica.
- A licença do projeto ainda deve ser definida pelo proprietário.

## Solução de problemas

- **A tela informa que o Firebase não está configurado:** confira os valores de `web/.env.local` e reinicie o Vite após alterá-los.
- **O iframe não permite entrar:** use **Abrir em nova guia**; não reduza a segurança do Firebase.
- **Regras negam uma gravação:** confira se a operação usa o caminho `users/{uid}`, `ownerId` igual ao usuário autenticado e `serverTimestamp()` nos campos de auditoria.
- **Emulador não inicia:** confira a instalação do JDK e execute o comando a partir da pasta que contém `firebase.json`.

## Licença

Não definida. O proprietário deve escolher e registrar uma licença antes de distribuir o código publicamente.

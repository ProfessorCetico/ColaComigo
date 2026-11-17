# Etapas do MVP

- [x] Inspecionar o projeto existente e preservar a base MAUI.
- [x] Criar a aplicação web React/TypeScript responsiva com PWA.
- [x] Criar autenticação Firebase, onboarding e telas acadêmicas iniciais.
- [x] Implementar cálculos de notas e planejador determinístico com testes unitários.
- [x] Preparar Firestore Rules, emuladores, funções de exportação/exclusão e documentação.
- [x] Corrigir e executar lint, typecheck, testes unitários, testes das regras e build.
- [x] Integrar o commit inicial remoto e publicar a aplicação web no GitHub.
- [ ] Configurar Firebase e domínio do proprietário, publicar e validar incorporação no Google Sites.
- [ ] Revisar consentimento de menores, privacidade e textos legais com profissional qualificado.

## Limitações para a próxima etapa

O MVP ainda não implementa consentimento verificável de responsável, edição completa de sessões ou histórico de auditoria, nem foi publicado no Firebase. O suporte a fusos e horário de verão requer validação adicional. A auditoria atual encontrou avisos em dependências de desenvolvimento do site e 8 vulnerabilidades moderadas no backend opcional; esse backend não é implantado pelo fluxo Spark. Nenhuma credencial Firebase foi fornecida ou gravada neste repositório.

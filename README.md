# OPS — Gestão Operacional de Ginásio

Aplicação React + Vite + Tailwind CSS com Firebase Authentication, Firestore e Cloud Storage. Interface em português, mobile-first.

## Funcionalidades implementadas
- Login Firebase e controlo de interface por função (`admin`, `limpeza`, `rececao`).
- Ponto digital com início/fim de turno e histórico.
- Checklist diária/semanal com fotografia obrigatória enviada para Firebase Storage.
- Pedidos separados por setor, quantidades, item livre em equipamentos, aprovação/rejeição e prazo mensal configurável.
- Catálogo de produtos personalizado.
- Contagem semanal de toalhas, cálculo de discrepância e resumo mensal.
- Painel administrativo e histórico operacional.

## 1. Configurar Firebase
1. Crie um projeto em https://console.firebase.google.com/.
2. Ative **Authentication > Sign-in method > Email/Password**.
3. Crie a base **Firestore Database** e ative **Storage**.
4. Copie `.env.example` para `.env` e preencha os valores da configuração Web do Firebase.
5. Instale dependências e inicie:
   ```bash
   npm install
   npm run dev
   ```
6. Para validar a compilação: `npm run build`.

## 2. Criar o primeiro administrador
Crie uma conta em Firebase Authentication (Add user) e copie o UID. Em Firestore, crie `users/{UID}` com este documento:
```json
{
  "name": "Administrador",
  "email": "admin@empresa.pt",
  "role": "admin",
  "createdAt": "timestamp"
}
```
Use um valor Timestamp real no campo `createdAt`, não a string `"timestamp"`.

Para os restantes colaboradores, crie contas no Firebase Authentication e documentos `users/{UID}` com função `limpeza` ou `rececao`. O botão de criação de utilizador na interface é um placeholder intencional: a criação segura deve usar Cloud Function + Firebase Admin SDK, não criar contas no cliente e interromper a sessão atual.

## 3. Regras Firestore e Storage
Antes de publicar, substitua as regras de teste pelas regras incluídas em `firebase/firestore.rules` e `firebase/storage.rules`. Essas regras limitam leitura/escrita por autenticação e função. Reveja-as com os fluxos reais da organização antes de produção.

## 4. Limitações que devem ser tratadas antes de produção
- O email/Google Sheets não está ligado por padrão. Use Cloud Functions (trigger em `purchaseRequests`) para enviar e-mail ou acrescentar uma linha no Google Sheets. Não coloque chaves de API no frontend.
- Os horários do ponto incluem timestamps do servidor e ISO local de referência. Para controlo laboral formal, use validação administrativa, política de correções, exportação e trilho de auditoria. Não use este MVP como sistema legal de salários sem validação.
- O cálculo mensal de reposição é uma sugestão simples baseada nas discrepâncias registadas; deve ser ajustado à política de stock real.
- Configure Firebase App Check, políticas de retenção, limites de upload de fotos e cópias de segurança.
- A interface usa permissões para navegação, mas a segurança efetiva depende das regras Firebase. Teste acessos de cada perfil antes de colocar em produção.

## 5. Estrutura
- `src/App.jsx`: módulos e interface.
- `src/firebase.js`: inicialização Firebase.
- `firebase/firestore.rules`: regras Firestore.
- `firebase/storage.rules`: regras Storage.

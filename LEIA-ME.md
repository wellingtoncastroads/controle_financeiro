<<<<<<< HEAD
# Fôlego V2.1 — livro-caixa pessoal

Aplicação financeira autoral feita com HTML, CSS, JavaScript, Vite e Supabase. Cada conta possui dados privados protegidos por RLS, sincronização entre aparelhos, backups e relatórios.

## Atualização de uma V2 já em uso — leia primeiro

Se você já possui movimentações cadastradas, **não execute novamente `supabase/schema.sql`**. Use somente a migração aditiva da V2.1:

1. Entre no Fôlego atual e baixe um backup em **Conta → Exportar backup**.
2. No Supabase, abra **SQL Editor → New query**.
3. Copie todo o conteúdo de [`supabase/migrations/v2_1_additive.sql`](supabase/migrations/v2_1_additive.sql).
4. Execute uma única vez e confirme a mensagem de sucesso.
5. Publique o código da V2.1 na Vercel.
6. Entre na mesma conta e confira saldo, movimentações, metas e a nova tela **Raio-X**.

A migração não apaga perfis, movimentações ou metas. Registros anteriores recebem `other`, exibido como **Não informado**, na nova coluna de forma de pagamento.

## O que existe na V2.1

- Forma de pagamento para saídas e forma de recebimento para entradas.
- Movimentações únicas, recorrentes e compras parceladas.
- Parcelas divididas em centavos sem alterar o valor total.
- Agenda de pendências vencidas, de hoje e dos próximos 14 dias.
- Projeção de saldo em 30, 60 e 90 dias.
- Indicador **Dias de Fôlego**, calculado pela média de despesas dos últimos 90 dias.
- Raio-X diário, semanal e mensal.
- Rankings por categoria, compra e meio de pagamento.
- Relatório PDF editorial com resumo, rankings e extrato do período.
- Limites mensais por categoria com alertas em 80% e ao ultrapassar.
- Aportes em metas com histórico e atualização atômica do progresso.
- Backup JSON V3 com movimentações, metas, limites e aportes.
- CSV protegido contra fórmulas, agora incluindo forma e série.
- Aplicativo instalável (PWA) em aparelhos compatíveis.
- Exclusão da conta e de todos os dados com confirmação digitada.
- Ícones lineares próprios e interface responsiva no estilo Fôlego.

Também permanecem disponíveis login, cadastro, confirmação de e-mail, recuperação de senha, tema sincronizado, migração explícita da V1, conta nova vazia e políticas RLS por usuário.

## Instalação nova do Supabase

Em um projeto sem as tabelas do Fôlego:

1. Execute [`supabase/schema.sql`](supabase/schema.sql).
2. Em seguida, execute [`supabase/migrations/v2_1_additive.sql`](supabase/migrations/v2_1_additive.sql).
3. Abra **Settings → API Keys** e copie a Project URL e uma chave Publishable.

Use somente a chave Publishable (`sb_publishable_...`) no navegador. Nunca coloque uma chave Secret ou `service_role` no projeto; elas ignoram RLS.

## Configurar no computador
=======
# Fôlego V2 — livro-caixa sincronizado

Aplicação financeira autoral feita com HTML, CSS, JavaScript, Vite e Supabase. A V2 possui conta por usuário, autenticação, recuperação de senha, banco PostgreSQL protegido por RLS, backups em JSON e configuração pronta para a Vercel.

## O que mudou na V2

- Login, cadastro, confirmação de e-mail, recuperação de senha e encerramento de sessão.
- Movimentações, metas e tema sincronizados pelo Supabase.
- Políticas RLS: cada conta lê e altera somente os próprios registros.
- Conta nova começa vazia; não existem mais valores fictícios misturados ao saldo.
- Migração explícita da antiga chave `nexo-financas-v1`, com cópia preservada.
- Validação de cada registro antes de exibir ou importar.
- Exportação e restauração de backup completo em JSON.
- CSV neutralizado contra fórmulas de planilha.
- Saldo de hoje separado da projeção que inclui lançamentos confirmados futuros.
- Receitas e despesas pendentes exibidas separadamente.
- Zero real nos gráficos e resumo textual para leitores de tela.
- Extrato móvel com categoria, data e situação visíveis e ações de 44 × 44 px.
- Navegação com `aria-current`, foco de teclado e respeito à redução de movimento.
- Testes automatizados das regras críticas.

## 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. Abra **SQL Editor** e crie uma nova consulta.
3. Copie todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql), execute e confirme que não houve erro.
4. Abra o diálogo **Connect** do projeto ou **Settings → API Keys**.
5. Copie a **Project URL** e uma chave **Publishable** (`sb_publishable_...`).

Use apenas a chave Publishable no navegador. Nunca coloque uma chave Secret ou `service_role` neste projeto: elas ignoram as políticas RLS.

O schema cria:

- `profiles`;
- `transactions`;
- `goals`;
- índices por usuário e data;
- gatilhos de perfil e data de atualização;
- políticas de leitura, criação, edição e exclusão por proprietário;
- migração local e restauração de backup em transações atômicas.

## 2. Configurar e testar no computador
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3

Na pasta do projeto:

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

<<<<<<< HEAD
Depois:
=======
Depois execute:
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3

```bash
npm run dev
```

<<<<<<< HEAD
No Supabase, adicione `http://localhost:5173/**` em **Authentication → URL Configuration → Redirect URLs**.

## Publicar na Vercel

1. Importe o repositório na Vercel.
2. Confirme o framework **Vite**, comando `npm run build` e saída `dist`.
3. Em **Settings → Environment Variables**, cadastre em Production e Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Faça o deploy.
5. No Supabase, defina a URL oficial em **Authentication → URL Configuration → Site URL** e adicione a mesma URL em Redirect URLs.

Depois de publicar, não envie `.env.local` ao GitHub. Ele já está ignorado pelo `.gitignore`.

## Regras financeiras adotadas

- **Saldo de hoje:** movimentações confirmadas com data até hoje.
- **Resumo mensal:** movimentações confirmadas dentro do mês escolhido.
- **Projeções:** saldo de hoje mais lançamentos confirmados futuros e todas as pendências cadastradas até o horizonte.
- **Dias de Fôlego:** saldo de hoje dividido pela média diária de despesas confirmadas dos últimos 90 dias. É um indicador, não uma garantia.
- **Rankings e PDF:** somente movimentações confirmadas no período escolhido.
- **Semana:** segunda-feira a domingo.
- **Recorrência:** o valor informado vale para cada ocorrência; a primeira respeita o status escolhido e as futuras começam pendentes.
- **Parcelamento:** o valor informado é o total; as parcelas futuras começam pendentes.
- **Limites:** apenas alertam, não bloqueiam registros.
- **Aportes:** atualizam a meta, mas não criam uma despesa automaticamente.
- **Últimos registros:** ordem de cadastro, não a data financeira.
- **Pontuação:** `100 − percentual da receita gasto no mês`, limitada entre 0 e 100.

O Fôlego não movimenta dinheiro, não acessa banco e não processa pagamentos. Ele organiza registros informados pelo usuário.

## Verificação antes de publicar

```bash
npm run check
```

Checklist manual recomendado:

1. Entrar com uma conta que já possui dados e conferir o saldo.
2. Criar uma entrada com forma de recebimento.
3. Criar uma despesa parcelada e conferir a soma das parcelas.
4. Criar uma recorrência e conferir as datas futuras pendentes.
5. Abrir agenda e projeções.
6. Alternar Raio-X entre dia, semana e mês.
7. Baixar e abrir o PDF.
8. Criar, editar e excluir um limite.
9. Registrar um aporte em uma meta.
10. Exportar o backup V3 e testar a restauração em uma conta de teste.
11. Conferir telas de 320 px, 360 px e computador.
12. Revisar o Security Advisor do Supabase.

## Arquivos principais

- `index.html`: interface, login, dashboard, Raio-X e diálogos.
- `style.css`: identidade visual comentada e responsividade.
- `script.js`: autenticação, renderização e eventos.
- `src/domain.js`: validação, séries, rankings, projeções e backup.
- `src/data-service.js`: consultas e funções do Supabase.
- `src/report-pdf.js`: geração do relatório PDF.
- `src/domain.test.js`: testes das regras críticas.
- `supabase/schema.sql`: base da V2 para instalações novas.
- `supabase/migrations/v2_1_additive.sql`: atualização segura de bases existentes.
- `public/manifest.webmanifest` e `public/sw.js`: instalação como aplicativo.
- `vercel.json`: build, rotas e cabeçalhos de segurança.

## Segurança e privacidade

- A chave Publishable é pública por definição; a proteção real dos dados vem das políticas RLS.
- Senhas ficam no Supabase Auth, não nas tabelas do Fôlego.
- A exclusão da conta remove o usuário do Auth e os dados relacionados por `on delete cascade`.
- A restauração V3 é atômica: qualquer falha desfaz toda a operação.
- Mantenha backups JSON periódicos mesmo com sincronização na nuvem.

=======
O endereço padrão do Vite será `http://localhost:5173`.

No Supabase, abra **Authentication → URL Configuration** e adicione temporariamente:

```text
http://localhost:5173/**
```

Isso permite que confirmação de e-mail e recuperação de senha retornem para o projeto local.

## 3. Publicar na Vercel

### Pelo painel

1. Coloque a pasta em um repositório GitHub, GitLab ou Bitbucket.
2. Na Vercel, escolha **Add New → Project** e importe o repositório.
3. Se o repositório possuir outras pastas, selecione `folego-financas` como **Root Directory**.
4. A Vercel deve detectar **Vite** automaticamente.
5. Confirme o comando de build `npm run build` e a pasta de saída `dist`.
6. Em **Settings → Environment Variables**, adicione para Production e Preview:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
7. Faça o deploy.

### Depois do primeiro deploy

No Supabase, volte a **Authentication → URL Configuration**:

- defina **Site URL** como a URL oficial da Vercel, por exemplo `https://folego.vercel.app`;
- adicione a URL oficial exata aos redirects;
- para previews, adicione `https://*-SEU-USUARIO-OU-TIME.vercel.app/**`.

Use URL exata em produção. O curinga deve ficar restrito aos previews da sua conta ou equipe.

## 4. Verificações antes de divulgar

```bash
npm test
npm run build
```

Checklist manual:

1. Criar uma conta nova.
2. Confirmar o e-mail recebido.
3. Entrar e verificar que o saldo começa em zero.
4. Criar, editar e excluir uma movimentação.
5. Criar e atualizar um plano.
6. Sair, entrar novamente e conferir os registros.
7. Abrir a mesma conta em outro dispositivo.
8. Solicitar recuperação de senha e concluir pelo link.
9. Exportar backup JSON e CSV.
10. Conferir o projeto no Security Advisor do Supabase.

## Regras financeiras adotadas

- **Saldo de hoje:** somente movimentações confirmadas com data até hoje.
- **Projeção total:** todas as movimentações confirmadas, inclusive futuras.
- **Resumo mensal:** valores confirmados no mês escolhido.
- **Pendências:** receitas a receber e despesas a pagar aparecem separadas.
- **Últimos registros:** ordem de cadastro (`created_at`), não a data financeira.
- **Pontuação:** `100 − percentual da receita gasto no mês`, limitada entre 0 e 100.
- **Planos:** o valor guardado é informado manualmente e não altera o saldo.

## Arquivos principais

- `index.html`: interface, login, dashboard e diálogos.
- `style.css`: identidade visual e comentários sobre cada seção.
- `script.js`: autenticação, renderização e eventos.
- `src/domain.js`: validação, backups e regras financeiras puras.
- `src/data-service.js`: consultas do Supabase.
- `src/supabase-client.js`: criação segura do cliente público.
- `src/domain.test.js`: testes das regras críticas.
- `supabase/schema.sql`: banco, RLS, índices, gatilhos e funções atômicas.
- `vercel.json`: configuração da aplicação Vite na Vercel.

## Observações de segurança

- A chave Publishable é pública por definição; a segurança dos registros depende das políticas RLS incluídas no schema.
- Não existe chave Secret ou `service_role` no navegador.
- Senhas são administradas pelo Supabase Auth e não ficam nas tabelas do Fôlego.
- A aplicação não pede nem guarda dados bancários.
- Mantenha um backup JSON periódico mesmo com sincronização na nuvem.
>>>>>>> 0198491fb4050be7c72f487434fe5edd4b5fe8e3

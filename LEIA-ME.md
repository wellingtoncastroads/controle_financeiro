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

Depois execute:

```bash
npm run dev
```

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

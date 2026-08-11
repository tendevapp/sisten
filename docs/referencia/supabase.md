# Plano de Estruturação de Backend com Supabase (Sisten)

Este documento apresenta o plano arquitetural completo para migrar a base de dados em memória (`localDb.ts`) do aplicativo **Sisten** para um backend persistente e relacional utilizando o **Supabase (PostgreSQL)**.

---

## 🗄️ 1. Esquema do Banco de Dados (Database Schema)

O banco de dados PostgreSQL será estruturado com as tabelas descritas a seguir. Todas as chaves primárias (`id`) utilizarão o tipo `uuid` auto-gerado por padrão.

### 👥 Tabela: `profiles`
Armazena as informações dos usuários integrados ao Supabase Auth.
```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  cargo TEXT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  roles TEXT[] DEFAULT '{solicitante}'::TEXT[], -- admin, visualizador, solicitante, gestor, comprador, coordenador_suprimentos, atendente
  status TEXT DEFAULT 'ativo'::TEXT, -- ativo, inativo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 🏢 Tabela: `sectors`
Setores da organização com seus respectivos gestores e limites orçamentários.
```sql
CREATE TABLE public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  monthly_budget NUMERIC(15, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 📦 Tabela: `materials`
Catálogo padronizado de materiais e suprimentos.
```sql
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_code TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'un',
  specification TEXT,
  stock_qty NUMERIC(12, 2) DEFAULT 0.00,
  unit_price NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 🛒 Tabela: `requests`
Tabela unificada que engloba as RMs (Requisições de Materiais/Compras) e os Chamados de Helpdesk.
```sql
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number SERIAL UNIQUE, -- Gerador automático do número sequencial de 7 dígitos fictício
  type TEXT NOT NULL, -- 'compra' ou 'chamado'
  status TEXT NOT NULL, -- 'pendente', 'aprovado_gestor', 'aprovado_coord', 'recusado', 'processando', 'concluido', 'em_atendimento', 'resolvido', 'fechado'
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'media'::TEXT, -- 'baixa', 'media', 'alta', 'critica'
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Técnico ou comprador designado
  justification TEXT,
  
  -- Campos para Helpdesk
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  rating_comment TEXT,
  
  -- Campos adicionais de controle
  sap_rm_number TEXT, -- Se integrado ao SAP posteriormente
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 📋 Tabela: `request_items`
Itens vinculados às solicitações de compras (RMs).
```sql
CREATE TABLE public.request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL, -- Cópia para histórico caso o material original seja deletado
  quantity NUMERIC(12, 2) NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 💬 Tabela: `request_comments`
Linha de diálogo/mensagens internas e públicas trocadas em chamados ou processos de compras.
```sql
CREATE TABLE public.request_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  content TEXT NOT NULL,
  visibility TEXT DEFAULT 'public'::TEXT, -- 'public' ou 'internal' (técnico/compras)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 📜 Tabela: `request_history`
Trilha histórica das mudanças de status de cada solicitação.
```sql
CREATE TABLE public.request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 🔔 Tabela: `notifications`
Alertas internos disparados em tempo real para os usuários.
```sql
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT DEFAULT 'info'::TEXT, -- 'info', 'success', 'critical'
  request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 🛡️ Tabela: `activity_logs`
Histórico de auditoria administrativa para conformidade e segurança.
```sql
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔒 2. Políticas de Segurança (Row Level Security - RLS)

O Supabase garante segurança diretamente no banco de dados através de RLS. Todas as tabelas terão o RLS habilitado.

### Exemplos de Políticas Críticas:

#### Tabela `profiles`
- **Leitura:** Qualquer usuário autenticado pode ler perfis.
- **Escrita:** Somente usuários com o papel `'admin'` ou o próprio usuário (`auth.uid() = id`) podem editar.
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated reads on profiles" 
  ON public.profiles FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow personal updates or admin edit" 
  ON public.profiles FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND 'admin' = ANY(roles)
  ));
```

#### Tabela `requests`
- **Leitura:** 
  - Solicitantes comuns: Apenas as próprias solicitações criadas por eles (`requester_id = auth.uid()`).
  - Gestores: Suas próprias solicitações + solicitações de pessoas do mesmo setor (`sector_id = perfil_atual.sector_id`).
  - Compradores/Técnicos: Acesso irrestrito de leitura a chamados/compras para atendimento.
- **Escrita:**
  - Criação: Permitida a qualquer usuário autenticado.
  - Edição de Status (Aprovação): Restrito a quem possui permissões funcionais correspondentes (Gestor, Coordenador, Comprador ou Técnico).

```sql
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select requests policy based on roles"
  ON public.requests FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid() OR
    assigned_to = auth.uid() OR
    -- Verificação de cargo hierárquico
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND (
        'admin' = ANY(roles) OR
        'comprador' = ANY(roles) OR
        'atendente' = ANY(roles) OR
        'coordenador_suprimentos' = ANY(roles) OR
        ('gestor' = ANY(roles) AND sector_id = requests.sector_id)
      )
    )
  );
```

---

## ⚡ 3. Automações, Triggers e Procedures (PL/pgSQL)

Para evitar duplicidade de código no cliente e garantir consistência transacional, utilizaremos Triggers no PostgreSQL.

### A. Criação Automática de Perfil após Registro no Auth
Garante que quando um usuário criar uma conta no Supabase Auth, o registro correspondente seja criado em `public.profiles`.
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, roles, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Novo Usuário'),
    NEW.email,
    ARRAY['solicitante']::TEXT[],
    'ativo'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### B. Trigger para Histórico de Mudança de Status
Registra automaticamente uma nova linha em `request_history` sempre que o status de uma solicitação for modificado na tabela `requests`.
```sql
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.request_history (request_id, status, notes)
    VALUES (NEW.id, NEW.status, 'Alteração automática de status via sistema.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_request_status_changed
  AFTER UPDATE OF status ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.log_request_status_change();
```

---

## 🛠️ 4. Cronograma de Implementação

1. **Fase 1: Configuração do Projeto Supabase**
   - Criação da organização e projeto no Supabase Console.
   - Aplicação dos scripts DDL e criação das tabelas no editor SQL.
   - Habilitação das extensões essenciais (`uuid-ossp` para geração de IDs, etc.).

2. **Fase 2: Políticas de Segurança e Triggers**
   - Implementação das políticas RLS para proteção dos dados confidenciais por perfil.
   - Criação dos gatilhos (`Triggers`) de automação corporativa.

3. **Fase 3: Integração do SDK Frontend**
   - Instalação do pacote `@supabase/supabase-js`.
   - Criação de `/src/lib/supabaseClient.ts` inicializando o cliente com as credenciais ambientais do arquivo `.env`.

4. **Fase 4: Substituição dos Métodos de Armazenamento**
   - Substituição gradativa das leituras de `localStorage` para requisições assíncronas assinaladas pelo `supabase.from()`.
   - Configuração de escuta em tempo real (`realtime`) do Supabase para atualização dinâmica das notificações e chat do Helpdesk sem necessidade de polling intervalado.

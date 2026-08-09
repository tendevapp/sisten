-- Migration: Adiciona a coluna tours_seen na tabela profiles para persistir os tours vistos pelo usuário
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tours_seen jsonb NOT NULL DEFAULT '{}'::jsonb;

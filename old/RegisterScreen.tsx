'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowLeft, CheckCircle2, AlertCircle, MapPin, User, Mail, Briefcase, Lock, Eye, EyeOff } from 'lucide-react'

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const refreshUser = useAppStore((s) => s.refreshUser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargo, setCargo] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/setores')
      .then((r) => r.json())
      .then((d) => setSectors(d.setores || []))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name || !email || !password || !cargo || !sectorId) {
      setError('Preencha todos os campos.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, cargo, sectorId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao cadastrar.')
        return
      }
      setDone(true)
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      await refreshUser()
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen relative w-full overflow-hidden bg-slate-100 flex items-center justify-center p-6">
        {/* Imagem de fundo sem degradê */}
        <div className="absolute inset-0 z-0">
          <img src="/bg-app.png" alt="" className="h-full w-full object-cover" />
        </div>
        <Card className="relative z-10 max-w-md w-full bg-white border-0 shadow-2xl rounded-3xl">
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Cadastro realizado!</h2>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              Sua solicitação foi enviada. Aguarde a autorização do administrador para acessar a plataforma.
            </p>
            <Button className="mt-6 w-full h-11 bg-[#0056c6] hover:bg-[#004bb0] text-white font-bold rounded-xl transition-colors" onClick={onBack}>Voltar ao login</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative w-full overflow-hidden bg-slate-100 flex flex-col justify-between">
      {/* Imagem de fundo sem degradê */}
      <div className="absolute inset-0 z-0">
        <img src="/bg-app.png" alt="" className="h-full w-full object-cover" />
      </div>

      {/* Conteúdo */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-10 lg:px-16 py-12">
        <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
          
          {/* Lado esquerdo — institucional (desktop) */}
          <div className="hidden lg:flex flex-col max-w-md text-left">
            <img src="/logo-ten.png" alt="TEN" className="h-28 w-auto object-contain mb-8 mr-auto" />
            
            <div className="flex items-center gap-2 bg-slate-100/90 border border-slate-200/50 px-3.5 py-1.5 rounded-full w-fit mb-6 shadow-2xs">
              <MapPin className="h-4 w-4 text-[#0056c6]" />
              <span className="text-xs font-semibold text-[#0056c6]">Torres Eólicas do Nordeste — Jacobina/BA</span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
              Solicite seu <br />
              <span className="text-[#0056c6]">cadastro</span>.
            </h1>
            <p className="mt-4 text-base text-slate-600 max-w-md leading-relaxed">
              Preencha seus dados corporativos. Após validação, o administrador autorizará seu acesso à plataforma TEN.
            </p>
          </div>

          {/* Lado direito — janela de cadastro sobreposta */}
          <div className="w-full max-w-md ml-auto z-20">
            {/* Logo no mobile */}
            <div className="lg:hidden flex justify-center mb-6">
              <img src="/logo-ten.png" alt="TEN" className="h-20 w-auto object-contain" />
            </div>

            <Card className="bg-white border-0 shadow-2xl rounded-3xl w-full">
              <div className="p-8 sm:p-10">
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-[#0056c6] hover:text-[#004bb0] mb-6 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Voltar ao login
                </button>

                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Solicitar cadastro</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">Preencha seus dados. O admin autorizará o acesso.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold text-slate-700">Nome completo *</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="João da Silva"
                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus-visible:border-[#0056c6] focus-visible:ring-[#0056c6]/20 rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-slate-700">E-mail corporativo *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="joao@ten.com.br"
                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus-visible:border-[#0056c6] focus-visible:ring-[#0056c6]/20 rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="cargo" className="text-sm font-semibold text-slate-700">Cargo *</Label>
                      <div className="relative">
                        <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                          id="cargo"
                          value={cargo}
                          onChange={(e) => setCargo(e.target.value)}
                          placeholder="Analista"
                          className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus-visible:border-[#0056c6] focus-visible:ring-[#0056c6]/20 rounded-xl"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sector" className="text-sm font-semibold text-slate-700">Setor *</Label>
                      <Select value={sectorId} onValueChange={setSectorId}>
                        <SelectTrigger id="sector" className="h-12 bg-slate-50/50 border-slate-200 focus:border-[#0056c6] focus:ring-[#0056c6]/20 rounded-xl">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {sectors.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Senha *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="pl-11 pr-11 h-12 bg-slate-50/50 border-slate-200 focus-visible:border-[#0056c6] focus-visible:ring-[#0056c6]/20 rounded-xl"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-1.5 font-medium">
                      <AlertCircle className="h-4 w-4" /> {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full h-12 bg-[#0056c6] hover:bg-[#004bb0] text-white font-bold rounded-xl transition-colors text-base shadow-sm mt-4" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                    Solicitar cadastro
                  </Button>
                </form>
              </div>
            </Card>

            <p className="text-center text-xs text-slate-500 mt-6 font-medium">
              © {new Date().getFullYear()} Torres Eólicas do Nordeste S.A. — Uso interno.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

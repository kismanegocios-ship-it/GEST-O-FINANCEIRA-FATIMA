'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, getStatusLabel, googleCalendarLink } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TableWrapper, CardList, MobileCard } from '@/components/ui/table-mobile'
import { CurrencyInput } from '@/components/ui/currency-input'
import { toast } from 'sonner'
import {
  Plus, Search, Calendar, CheckCircle, XCircle, Trash2,
  Pencil, Filter, RefreshCw, DollarSign, ChevronRight,
  Paperclip, Eye, X, Loader2, Copy, RotateCcw, FileDown
} from 'lucide-react'
import type { Despesa, CentroCusto, Categoria, ContaBancaria } from '@/lib/types'
import { format, addMonths, addDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns'
import { fetchAllRows } from '@/lib/fetch-all'

// Quantos meses a frente as contas recorrentes sao provisionadas
const HORIZONTE_MESES = 12

// Proxima data de uma serie recorrente conforme a frequencia
function proximaDataRecorrencia(dateStr: string, freq: string): Date {
  const d = new Date(dateStr + 'T12:00:00')
  switch (freq) {
    case 'semanal': return addDays(d, 7)
    case 'quinzenal': return addDays(d, 15)
    case 'anual': return addMonths(d, 12)
    case 'mensal':
    default: return addMonths(d, 1)
  }
}

const STATUS_OPTIONS = ['todos', 'pendente', 'pago', 'vencido', 'cancelado']

const statusVariant: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pendente: 'warning', pago: 'success', vencido: 'danger', cancelado: 'neutral',
}

interface FormData {
  descricao: string; valor: string; data_vencimento: string; status: string
  centro_custo_id: string; categoria_id: string; recorrente: boolean; frequencia: string; observacoes: string
  parcelado: boolean; num_parcelas: string; solicitante: string; conta_bancaria_id: string; forma_pagamento: string
}

const emptyForm: FormData = {
  descricao: '', valor: '', data_vencimento: '', status: 'pendente',
  centro_custo_id: '', categoria_id: '', recorrente: false, frequencia: 'mensal', observacoes: '',
  parcelado: false, num_parcelas: '2', solicitante: '', conta_bancaria_id: '', forma_pagamento: 'pix',
}

// Monta a lista padrao de parcelas: mesmo valor, vencimentos mensais
function gerarParcelas(n: number, valorBase: string, dataBase: string) {
  const base = dataBase ? new Date(dataBase + 'T12:00:00') : null
  return Array.from({ length: n }, (_, i) => ({
    valor: valorBase,
    data: base ? format(addMonths(base, i), 'yyyy-MM-dd') : '',
  }))
}

// Caminho unico do anexo no Storage (fora do componente: usa Date.now/nao-puro)
function buildAnexoPath(despesaId: string, fileName: string): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop() : ''
  const safe = fileName.replace(/[^\w.\-]/g, '_').slice(0, 60)
  const sufixoExt = ext && !safe.includes('.') ? '.' + ext : ''
  return `${despesaId}/${Date.now()}-${safe}${sufixoExt}`
}

export default function DespesasPage() {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Despesa | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  // Periodo por vencimento ('' = sem limite = todos)
  const [perIni, setPerIni] = useState('')
  const [perFim, setPerFim] = useState('')
  const [modalPagar, setModalPagar] = useState<Despesa | null>(null)
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [pagContaId, setPagContaId] = useState('')
  const [pagForma, setPagForma] = useState('pix')
  const [pagDesconto, setPagDesconto] = useState('')
  const [pagJuros, setPagJuros] = useState('')
  const [anexoTarget, setAnexoTarget] = useState<Despesa | null>(null)
  const [anexoBusyId, setAnexoBusyId] = useState<string | null>(null)
  const anexoInputRef = useRef<HTMLInputElement>(null)
  const [modalAnexoFile, setModalAnexoFile] = useState<File | null>(null)
  const modalAnexoInputRef = useRef<HTMLInputElement>(null)
  // null = todas as parcelas com o mesmo valor; lista = valores/datas personalizados
  const [parcelasCustom, setParcelasCustom] = useState<{ valor: string; data: string }[] | null>(null)

  const MAX_ANEXO = 2 * 1024 * 1024 // 2 MB

  // Envia um arquivo pro Storage e grava o caminho na despesa. Retorna sucesso.
  const subirAnexoParaDespesa = async (despesaId: string, oldPath: string | null | undefined, file: File): Promise<boolean> => {
    if (file.size > MAX_ANEXO) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximo 2 MB.`)
      return false
    }
    const path = buildAnexoPath(despesaId, file.name)
    if (oldPath) await supabase.storage.from('comprovantes').remove([oldPath])
    const { error: upErr } = await supabase.storage.from('comprovantes').upload(path, file, { upsert: false })
    if (upErr) { toast.error('Erro ao enviar anexo: ' + upErr.message); return false }
    const { error: dbErr } = await supabase.from('despesas')
      .update({ anexo_path: path, anexo_nome: file.name }).eq('id', despesaId)
    if (dbErr) { toast.error('Anexo enviado mas nao salvo: ' + dbErr.message); return false }
    return true
  }

  const pedirAnexo = (d: Despesa) => {
    setAnexoTarget(d)
    // reseta pra permitir escolher o mesmo arquivo de novo
    if (anexoInputRef.current) anexoInputRef.current.value = ''
    anexoInputRef.current?.click()
  }

  const abrirAnexo = (d: Despesa) => {
    if (!d.anexo_path) return
    const { data } = supabase.storage.from('comprovantes').getPublicUrl(d.anexo_path)
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer')
  }

  const handleAnexoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const alvo = anexoTarget
    e.target.value = ''
    if (!file || !alvo) return
    setAnexoBusyId(alvo.id)
    const ok = await subirAnexoParaDespesa(alvo.id, alvo.anexo_path, file)
    setAnexoBusyId(null)
    if (ok) { toast.success('Comprovante anexado! 📎'); load() }
  }

  // ── Parcelas personalizadas ──
  const togglePersonalizarParcelas = () => {
    if (parcelasCustom) { setParcelasCustom(null); return }
    const n = Math.max(2, Math.min(120, parseInt(form.num_parcelas) || 2))
    setParcelasCustom(gerarParcelas(n, form.valor, form.data_vencimento))
  }

  // Mantem a lista personalizada em sincronia quando muda a quantidade
  const mudarNumParcelas = (novoValor: string) => {
    setForm(f => ({ ...f, num_parcelas: novoValor }))
    if (!parcelasCustom) return
    const n = Math.max(1, Math.min(120, parseInt(novoValor) || 1))
    const atual = parcelasCustom
    if (n <= atual.length) { setParcelasCustom(atual.slice(0, n)); return }
    const base = form.data_vencimento ? new Date(form.data_vencimento + 'T12:00:00') : null
    const extras = Array.from({ length: n - atual.length }, (_, i) => ({
      valor: form.valor,
      data: base ? format(addMonths(base, atual.length + i), 'yyyy-MM-dd') : '',
    }))
    setParcelasCustom([...atual, ...extras])
  }

  const alterarParcela = (idx: number, campo: 'valor' | 'data', valor: string) => {
    setParcelasCustom(prev => prev?.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)) ?? null)
  }

  // Recria a lista a partir do Valor e do Vencimento informados acima
  const redistribuirParcelas = () => {
    const n = parcelasCustom?.length ?? Math.max(2, parseInt(form.num_parcelas) || 2)
    setParcelasCustom(gerarParcelas(n, form.valor, form.data_vencimento))
    toast.success('Parcelas recalculadas com o valor e vencimento informados')
  }

  // Divide o valor do campo "Valor" como TOTAL entre as parcelas (ajusta centavos na ultima)
  const dividirTotalEntreParcelas = () => {
    const total = parseFloat(form.valor)
    const n = parcelasCustom?.length ?? 0
    if (!total || n === 0) { toast.error('Informe o valor total primeiro'); return }
    const base = Math.floor((total / n) * 100) / 100
    const resto = Math.round((total - base * n) * 100) / 100
    setParcelasCustom(prev => prev?.map((p, i) => ({
      ...p,
      valor: String(i === n - 1 ? Math.round((base + resto) * 100) / 100 : base),
    })) ?? null)
    toast.success(`${formatCurrency(total)} dividido em ${n} parcelas`)
  }

  const totalParcelas = (parcelasCustom ?? []).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)

  // Escolha de arquivo dentro do modal de cadastro/edicao (sobe ao salvar)
  const handleModalAnexoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_ANEXO) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximo 2 MB.`)
      return
    }
    setModalAnexoFile(file)
  }

  const removerAnexo = async (d: Despesa) => {
    if (!d.anexo_path) return
    if (!confirm('Remover o comprovante desta despesa? O arquivo sera apagado.')) return
    setAnexoBusyId(d.id)
    await supabase.storage.from('comprovantes').remove([d.anexo_path])
    const { error } = await supabase.from('despesas')
      .update({ anexo_path: null, anexo_nome: null }).eq('id', d.id)
    setAnexoBusyId(null)
    if (error) { toast.error('Erro ao remover'); return }
    toast.success('Comprovante removido')
    load()
  }

  // Provisiona as proximas ocorrencias das contas recorrentes ate o horizonte.
  // Cada "modelo" (recorrente = true) gera contas comuns (recorrente = false)
  // com a MESMA descricao nas datas seguintes. Dedup por descricao + data
  // (nao depende de coluna extra no banco), e so estende pra frente.
  const provisionarRecorrencias = async () => {
    const { data: templates, error } = await supabase
      .from('despesas').select('*').eq('recorrente', true).neq('status', 'cancelado')
    if (error || !templates || templates.length === 0) return

    // Mapa descricao -> conjunto de datas ja existentes (qualquer despesa).
    // Paginado: se truncasse em 1000, a dedup falharia e recriaria duplicatas.
    const todas = await fetchAllRows<{ descricao: string; data_vencimento: string }>(() =>
      supabase.from('despesas').select('descricao, data_vencimento'))
    const porDesc = new Map<string, Set<string>>()
    for (const r of todas) {
      const set = porDesc.get(r.descricao) ?? new Set<string>()
      set.add(r.data_vencimento)
      porDesc.set(r.descricao, set)
    }

    const hojeD = new Date()
    const inicioMes = startOfMonth(hojeD)
    const horizonte = endOfMonth(addMonths(hojeD, HORIZONTE_MESES))
    const novos: Record<string, unknown>[] = []

    for (const t of templates as Despesa[]) {
      const freq = t.frequencia || 'mensal'
      const existentes = porDesc.get(t.descricao) ?? new Set<string>([t.data_vencimento])
      let ultima = t.data_vencimento
      for (const dd of existentes) if (dd > ultima) ultima = dd

      let cursor = proximaDataRecorrencia(ultima, freq)
      let guard = 0
      while (cursor <= horizonte && guard < 2000) {
        guard++
        const key = format(cursor, 'yyyy-MM-dd')
        // So provisiona a partir do mes atual (nao recria meses ja passados)
        if (!existentes.has(key) && cursor >= inicioMes) {
          existentes.add(key)
          novos.push({
            descricao: t.descricao,
            valor: t.valor,
            data_vencimento: key,
            status: 'pendente',
            centro_custo_id: t.centro_custo_id ?? null,
            categoria_id: t.categoria_id ?? null,
            recorrente: false,
            frequencia: null,
            observacoes: t.observacoes ?? null,
            solicitante: t.solicitante ?? null,
          })
        }
        cursor = proximaDataRecorrencia(key, freq)
      }
      porDesc.set(t.descricao, existentes)
    }

    if (novos.length > 0) {
      await supabase.from('despesas').insert(novos)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)

    // Auto-vencimento: pendentes com data anterior a hoje → vencido
    const hoje = format(new Date(), 'yyyy-MM-dd')
    await supabase
      .from('despesas')
      .update({ status: 'vencido' })
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje)

    // Gera as ocorrencias futuras das contas recorrentes (idempotente)
    await provisionarRecorrencias()

    const [d, cc, cat, cb] = await Promise.all([
      fetchAllRows<Despesa>(() => supabase.from('despesas').select('*, centros_custo(*), categorias(*)').order('data_vencimento')),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').eq('tipo', 'saida').order('nome'),
      supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome'),
    ])
    setDespesas(d)
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setContas((cb.data ?? []) as ContaBancaria[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const setPeriodo = (ini: Date, fim: Date) => {
    setPerIni(format(ini, 'yyyy-MM-dd'))
    setPerFim(format(fim, 'yyyy-MM-dd'))
  }
  const hojeRef = new Date()
  const presetsPeriodo = [
    { label: 'Este mes', on: () => setPeriodo(startOfMonth(hojeRef), endOfMonth(hojeRef)) },
    { label: 'Mes passado', on: () => { const m = subMonths(hojeRef, 1); setPeriodo(startOfMonth(m), endOfMonth(m)) } },
    { label: 'Proximos 3 meses', on: () => setPeriodo(startOfMonth(hojeRef), endOfMonth(addMonths(hojeRef, 2))) },
    { label: 'Este ano', on: () => setPeriodo(startOfYear(hojeRef), endOfYear(hojeRef)) },
  ]

  const abrirNovo = () => { setEditando(null); setForm(emptyForm); setModalAnexoFile(null); setParcelasCustom(null); setModalOpen(true) }
  const abrirEditar = (d: Despesa) => {
    setEditando(d)
    setModalAnexoFile(null)
    setParcelasCustom(null)
    setForm({
      descricao: d.descricao, valor: String(d.valor), data_vencimento: d.data_vencimento,
      status: d.status, centro_custo_id: d.centro_custo_id ?? '', categoria_id: d.categoria_id ?? '',
      recorrente: d.recorrente, frequencia: d.frequencia ?? 'mensal', observacoes: d.observacoes ?? '',
      parcelado: false, num_parcelas: '2', solicitante: d.solicitante ?? '', conta_bancaria_id: '', forma_pagamento: 'pix',
    })
    setModalOpen(true)
  }

  // Duplicar: abre o modal como NOVA despesa ja preenchida com os dados da
  // original (status volta a pendente, sem anexo), pra so ajustar e salvar.
  const duplicar = (d: Despesa) => {
    setEditando(null)
    setModalAnexoFile(null)
    setParcelasCustom(null)
    setForm({
      descricao: d.descricao, valor: String(d.valor), data_vencimento: d.data_vencimento,
      status: 'pendente', centro_custo_id: d.centro_custo_id ?? '', categoria_id: d.categoria_id ?? '',
      recorrente: d.recorrente, frequencia: d.frequencia ?? 'mensal', observacoes: d.observacoes ?? '',
      parcelado: false, num_parcelas: '2', solicitante: d.solicitante ?? '', conta_bancaria_id: '', forma_pagamento: 'pix',
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    // Com parcelas personalizadas o valor/vencimento vem de cada parcela,
    // entao os campos do topo deixam de ser obrigatorios
    const usandoParcelasCustom = !!parcelasCustom && form.parcelado && !editando
    const faltaBase = usandoParcelasCustom
      ? !form.descricao
      : (!form.descricao || !form.valor || !form.data_vencimento)
    if (faltaBase) { toast.error('Preencha os campos obrigatorios'); return }
    setSaving(true)

    // ── Modo parcelas: cria N despesas (valores/datas iguais ou personalizados) ──
    if (form.parcelado && !editando) {
      const n = Math.max(2, Math.min(120, parseInt(form.num_parcelas) || 2))
      const lista = parcelasCustom ?? gerarParcelas(n, form.valor, form.data_vencimento)

      // Valida cada parcela antes de criar (evita parcela sem valor ou sem data)
      const invalida = lista.findIndex(p => !(parseFloat(p.valor) > 0) || !p.data)
      if (invalida !== -1) {
        setSaving(false)
        toast.error(`Parcela ${invalida + 1}: informe valor maior que zero e vencimento`)
        return
      }

      const total = lista.length
      const registros = lista.map((p, i) => ({
        descricao: `${form.descricao} (${i + 1}/${total})`,
        valor: parseFloat(p.valor),
        data_vencimento: p.data,
        status: 'pendente',
        centro_custo_id: form.centro_custo_id || null,
        categoria_id: form.categoria_id || null,
        recorrente: false,
        frequencia: null,
        observacoes: form.observacoes || null,
        solicitante: form.solicitante || null,
      }))
      const { error } = await supabase.from('despesas').insert(registros)
      setSaving(false)
      if (error) { console.error('Erro parcelas:', error); toast.error('Erro ao criar parcelas: ' + error.message); return }
      const soma = lista.reduce((s, p) => s + parseFloat(p.valor), 0)
      toast.success(`${total} parcelas criadas! Total ${formatCurrency(soma)}`)
      setModalOpen(false); setForm(emptyForm); setParcelasCustom(null); load()
      return
    }

    // ── Modo normal: cria/edita 1 despesa ──
    const hoje = format(new Date(), 'yyyy-MM-dd')
    // Nova despesa SEMPRE entra como pendente — status só muda após criação
    const statusFinal = editando ? form.status : 'pendente'
    const payload = {
      descricao: form.descricao, valor: parseFloat(form.valor), data_vencimento: form.data_vencimento,
      status: statusFinal, centro_custo_id: form.centro_custo_id || null, categoria_id: form.categoria_id || null,
      recorrente: form.recorrente, frequencia: form.recorrente ? form.frequencia : null, observacoes: form.observacoes || null,
      solicitante: form.solicitante || null,
      data_pagamento: statusFinal === 'pago' ? hoje : null,
    }
    // So precisamos do id de volta quando ha anexo pra enviar. No caso comum,
    // insert/update simples (evita falha do .select().single() apos o insert).
    let despesaId = editando?.id ?? ''
    if (editando) {
      const { error } = await supabase.from('despesas').update(payload).eq('id', editando.id)
      if (error) { setSaving(false); console.error('Erro salvar despesa:', error); toast.error('Erro ao salvar: ' + error.message); return }
    } else if (modalAnexoFile) {
      const { data: saved, error } = await supabase.from('despesas').insert(payload).select('id').single()
      if (error || !saved) { setSaving(false); console.error('Erro salvar despesa:', error); toast.error('Erro ao salvar: ' + (error?.message ?? 'sem retorno do banco')); return }
      despesaId = (saved as { id: string }).id
    } else {
      const { error } = await supabase.from('despesas').insert(payload)
      if (error) { setSaving(false); console.error('Erro salvar despesa:', error); toast.error('Erro ao salvar: ' + error.message); return }
    }

    // ── Anexo escolhido no modal → envia pro Storage ──
    if (modalAnexoFile && despesaId) {
      await subirAnexoParaDespesa(despesaId, editando?.anexo_path, modalAnexoFile)
      setModalAnexoFile(null)
    }

    // ── Se marcou como PAGO e antes era pendente/vencido → cria lançamento de saída ──
    const eraDevedora = editando && ['pendente', 'vencido'].includes(editando.status)
    const viroupago = statusFinal === 'pago'
    if (eraDevedora && viroupago) {
      // Verifica se já existe lancamento para essa despesa (evita duplicata)
      const { data: lancExist } = await supabase
        .from('lancamentos').select('id').eq('despesa_id', editando!.id).maybeSingle()
      if (!lancExist) {
        await supabase.from('lancamentos').insert({
          descricao: `Pagamento: ${form.descricao}`,
          valor: parseFloat(form.valor),
          tipo: 'saida',
          data: hoje,
          despesa_id: editando!.id,
          centro_custo_id: form.centro_custo_id || null,
          categoria_id: form.categoria_id || null,
          forma_pagamento: form.forma_pagamento || 'pix',
          conta_bancaria_id: form.conta_bancaria_id || null,
          conciliado: !!form.conta_bancaria_id,
        })
        toast.success(form.conta_bancaria_id ? 'Despesa paga e ja conciliada no fluxo de caixa! 💸' : 'Despesa marcada como paga e saída registrada no fluxo de caixa! 💸')
        setSaving(false); setModalOpen(false); load()
        return
      }
    }

    setSaving(false)
    toast.success(editando ? 'Despesa atualizada!' : 'Despesa cadastrada!')
    setModalOpen(false); load()
  }

  const registrarPagamento = async () => {
    if (!modalPagar) return
    setSaving(true)
    const desconto = parseFloat(pagDesconto) || 0
    const juros = parseFloat(pagJuros) || 0
    const valorFinal = Math.max(0, Number(modalPagar.valor) - desconto + juros)
    const { error } = await supabase.from('despesas').update({ status: 'pago', data_pagamento: dataPagamento }).eq('id', modalPagar.id)
    if (!error) {
      const obs = [
        desconto > 0 ? `Desconto: ${formatCurrency(desconto)}` : '',
        juros > 0 ? `Juros/Multa: ${formatCurrency(juros)}` : '',
      ].filter(Boolean).join(' | ') || null
      await supabase.from('lancamentos').insert({
        descricao: `Pagamento: ${modalPagar.descricao}`,
        valor: valorFinal,
        tipo: 'saida',
        data: dataPagamento,
        despesa_id: modalPagar.id,
        centro_custo_id: modalPagar.centro_custo_id ?? null,
        categoria_id: modalPagar.categoria_id ?? null,
        forma_pagamento: pagForma,
        conta_bancaria_id: pagContaId || null,
        observacoes: obs,
        conciliado: !!pagContaId,
      })
      toast.success(pagContaId ? 'Pagamento registrado e ja conciliado no caixa!' : 'Pagamento registrado! Saida lancada no caixa.')
    } else { toast.error('Erro ao registrar') }
    setSaving(false)
    setModalPagar(null)
    setPagContaId('')
    setPagForma('pix')
    setPagDesconto('')
    setPagJuros('')
    load()
  }

  const cancelar = async (id: string) => { await supabase.from('despesas').update({ status: 'cancelado' }).eq('id', id); toast.success('Cancelada'); load() }
  const excluir = async (id: string) => { await supabase.from('despesas').delete().eq('id', id); toast.success('Excluida'); load() }

  // Estorna o pagamento: apaga o lancamento no caixa e volta a conta para
  // pendente/vencida, pra poder corrigir e pagar de novo.
  const estornarPagamento = async (d: Despesa) => {
    if (d.status !== 'pago') return
    if (!confirm(`Estornar o pagamento de "${d.descricao}"?\n\nA conta volta para pendente e o lancamento no caixa (Lancamentos) sera removido.`)) return
    // Remove o(s) lancamento(s) de caixa gerados por essa despesa
    const { error: lErr } = await supabase.from('lancamentos').delete().eq('despesa_id', d.id)
    if (lErr) { toast.error('Erro ao remover o lancamento: ' + lErr.message); return }
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const novoStatus = d.data_vencimento < hoje ? 'vencido' : 'pendente'
    const { error } = await supabase.from('despesas')
      .update({ status: novoStatus, data_pagamento: null }).eq('id', d.id)
    if (error) { toast.error('Erro ao estornar: ' + error.message); return }
    toast.success(`Pagamento estornado. Conta voltou para ${novoStatus === 'vencido' ? 'vencida' : 'pendente'} e saiu do caixa.`)
    load()
  }

  const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

  // PDF das contas exibidas (respeita mes, status e busca)
  const exportarPDF = () => {
    const lista = [...filtradas].sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1))
    if (lista.length === 0) { toast.error('Nenhuma conta para exportar com os filtros atuais'); return }

    const statusPdf: Record<string, string> = { pendente: '#ca8a04', vencido: '#dc2626', pago: '#16a34a', cancelado: '#64748b' }
    const escopo = [
      (perIni || perFim) && `Vencimento: ${perIni ? formatDate(perIni) : '...'} a ${perFim ? formatDate(perFim) : '...'}`,
      filtroStatus !== 'todos' && `Status: ${getStatusLabel(filtroStatus)}`,
      busca && `Busca: "${busca}"`,
    ].filter(Boolean).map(t => escHtml(t as string)).join(' &nbsp;|&nbsp; ') || 'Todas as contas'

    const totalGeral = lista.reduce((s, d) => s + Number(d.valor), 0)
    const porStatus = {
      pendente: lista.filter(d => d.status === 'pendente').reduce((s, d) => s + Number(d.valor), 0),
      vencido: lista.filter(d => d.status === 'vencido').reduce((s, d) => s + Number(d.valor), 0),
      pago: lista.filter(d => d.status === 'pago').reduce((s, d) => s + Number(d.valor), 0),
    }

    const linhas = lista.map(d => `
      <tr>
        <td>${escHtml(d.descricao)}${d.solicitante ? `<br><span style="color:#94a3b8;font-size:9px">Solicitado por: ${escHtml(d.solicitante)}</span>` : ''}</td>
        <td>${formatDate(d.data_vencimento)}</td>
        <td>${escHtml((d as any).centros_custo?.nome ?? '—')}</td>
        <td>${escHtml((d as any).categorias?.nome ?? '—')}</td>
        <td style="color:${statusPdf[d.status] ?? '#334155'};font-weight:600">${getStatusLabel(d.status)}</td>
        <td style="text-align:right;font-weight:600">${formatCurrency(Number(d.valor))}</td>
      </tr>`).join('')

    const html = `
      <!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Contas a Pagar</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #64748b; font-size: 11px; margin-bottom: 4px; }
        .escopo { color: #475569; font-size: 10px; margin-bottom: 14px; }
        .resumo { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .resumo div { padding: 8px 16px; border-radius: 6px; }
        .r1 { background: #fefce8; color: #ca8a04; font-weight: 600; }
        .r2 { background: #fef2f2; color: #dc2626; font-weight: 600; }
        .r3 { background: #f0fdf4; color: #16a34a; font-weight: 600; }
        .r4 { background: #eef2ff; color: #4f46e5; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8fafc; text-align: left; padding: 6px 8px; font-size: 10px;
             text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
        td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; }
      </style></head><body>
      <h1>Contas a Pagar</h1>
      <p class="sub">Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <p class="escopo">${escopo}</p>
      <div class="resumo">
        <div class="r1">A pagar: ${formatCurrency(porStatus.pendente)}</div>
        <div class="r2">Vencidas: ${formatCurrency(porStatus.vencido)}</div>
        <div class="r3">Pagas: ${formatCurrency(porStatus.pago)}</div>
        <div class="r4">Total: ${formatCurrency(totalGeral)}</div>
      </div>
      <table>
        <thead><tr>
          <th>Descricao</th><th>Vencimento</th><th>Centro</th><th>Categoria</th><th>Status</th>
          <th style="text-align:right">Valor</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="footer">Total: ${lista.length} conta(s)</p>
      </body></html>`

    const win = window.open('', '_blank')
    if (!win) { toast.error('Permita popups para exportar PDF'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const filtradas = despesas.filter(d => {
    const mb = d.descricao.toLowerCase().includes(busca.toLowerCase())
    const ms = filtroStatus === 'todos' || d.status === filtroStatus
    const dv = d.data_vencimento ?? ''
    const mm = (perIni === '' || dv >= perIni) && (perFim === '' || dv <= perFim)
    return mb && ms && mm
  })

  // Totais acompanham o que esta filtrado na tela (busca + status)
  const totais = {
    pendente: filtradas.filter(d => d.status === 'pendente').reduce((s, d) => s + Number(d.valor), 0),
    vencido: filtradas.filter(d => d.status === 'vencido').reduce((s, d) => s + Number(d.valor), 0),
    pago: filtradas.filter(d => d.status === 'pago').reduce((s, d) => s + Number(d.valor), 0),
  }

  return (
    <div className="space-y-4">
      {/* Inputs escondidos para anexos (comprovantes) */}
      <input
        ref={anexoInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleAnexoFile}
      />
      <input
        ref={modalAnexoInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleModalAnexoPick}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Contas a Pagar</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">Cadastro e controle das contas a pagar</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportarPDF} size="sm" title="Imprimir/PDF das contas exibidas">
            <FileDown size={15} /> <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button onClick={abrirNovo} size="sm">
            <Plus size={15} /> <span className="hidden sm:inline">Nova</span> Conta
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-yellow-400">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">A Pagar</p>
            <p className="text-base md:text-xl font-bold text-yellow-600">{formatCurrency(totais.pendente)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">Vencidas</p>
            <p className="text-base md:text-xl font-bold text-red-600">{formatCurrency(totais.vencido)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">Pagas</p>
            <p className="text-base md:text-xl font-bold text-green-600">{formatCurrency(totais.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Total do que esta filtrado na tela */}
      {(filtroStatus !== 'todos' || busca || perIni || perFim) && (
        <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
          <span className="text-xs text-indigo-700 font-medium">
            {filtradas.length} conta(s) exibida(s)
            {(perIni || perFim) && ` · venc. ${perIni ? formatDate(perIni) : '...'} a ${perFim ? formatDate(perFim) : '...'}`}
            {filtroStatus !== 'todos' && ` · ${getStatusLabel(filtroStatus)}`}
            {busca && ` · busca "${busca}"`}
          </span>
          <span className="text-sm font-bold text-indigo-700">
            Total: {formatCurrency(filtradas.reduce((s, d) => s + Number(d.valor), 0))}
          </span>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${filtroStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s === 'todos' ? 'Todos' : getStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
          {/* Filtro por periodo de vencimento (De/Ate) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">Vencimento:</span>
            <input
              type="date"
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={perIni}
              onChange={e => setPerIni(e.target.value)}
            />
            <span className="text-slate-400 text-xs">ate</span>
            <input
              type="date"
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={perFim}
              onChange={e => setPerFim(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {presetsPeriodo.map(p => (
                <button key={p.label} onClick={p.on}
                  className="px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => { setPerIni(''); setPerFim('') }}
                className={`px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${!perIni && !perFim ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Todos
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop: tabela */}
      <Card>
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vencimento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Centro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Nenhuma despesa</td></tr>
              ) : filtradas.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-800">{d.descricao}</p>
                    {d.recorrente && <span className="text-xs text-indigo-500">Recorrente · {d.frequencia}</span>}
                    {d.solicitante && <p className="text-xs text-slate-400 mt-0.5">Solicitado por: {d.solicitante}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{formatDate(d.data_vencimento)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(Number(d.valor))}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[d.status]}>{getStatusLabel(d.status)}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{(d as any).centros_custo?.nome ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(d.status === 'pendente' || d.status === 'vencido') && <>
                        <button onClick={() => { setModalPagar(d); setDataPagamento(format(new Date(), 'yyyy-MM-dd')); setPagContaId(''); setPagForma('pix'); setPagDesconto(''); setPagJuros('') }} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Pagar"><CheckCircle size={14} /></button>
                        <a href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors" title="Google Agenda"><Calendar size={14} /></a>
                      </>}
                      {d.status === 'pago' && (
                        <button onClick={() => estornarPagamento(d)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 hover:text-amber-600 transition-colors" title="Estornar pagamento (volta para pendente e sai do caixa)"><RotateCcw size={14} /></button>
                      )}
                      {anexoBusyId === d.id ? (
                        <span className="p-1.5 text-slate-400"><Loader2 size={14} className="animate-spin" /></span>
                      ) : d.anexo_path ? (
                        <>
                          <button onClick={() => abrirAnexo(d)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors" title={`Ver comprovante: ${d.anexo_nome ?? ''}`}><Eye size={14} /></button>
                          <button onClick={() => removerAnexo(d)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 transition-colors" title="Remover comprovante"><X size={14} /></button>
                        </>
                      ) : (
                        <button onClick={() => pedirAnexo(d)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Anexar comprovante (max 2MB)"><Paperclip size={14} /></button>
                      )}
                      <button onClick={() => abrirEditar(d)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => duplicar(d)} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-500 transition-colors" title="Duplicar"><Copy size={14} /></button>
                      <button onClick={() => excluir(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Excluir"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>

        {/* Mobile: cards */}
        <CardList>
          {loading ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Carregando...</p></MobileCard>
          ) : filtradas.length === 0 ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Nenhuma despesa encontrada</p></MobileCard>
          ) : filtradas.map(d => {
            const cc = (d as any).centros_custo?.nome
            const isVencido = d.status === 'vencido'
            const isPendente = d.status === 'pendente'
            return (
              <MobileCard key={d.id} className="py-4">
                {/* Linha 1: descrição + badge status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{d.descricao}</p>
                    {d.recorrente && (
                      <span className="text-[10px] text-indigo-500 font-medium">↻ Recorrente · {d.frequencia}</span>
                    )}
                  </div>
                  <Badge variant={statusVariant[d.status]}>{getStatusLabel(d.status)}</Badge>
                </div>

                {/* Linha 2: valor em destaque + vencimento */}
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xl font-bold ${isVencido ? 'text-red-600' : isPendente ? 'text-slate-800' : 'text-green-600'}`}>
                    {formatCurrency(Number(d.valor))}
                  </p>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Vencimento</p>
                    <p className={`text-xs font-semibold ${isVencido ? 'text-red-500' : 'text-slate-700'}`}>
                      {formatDate(d.data_vencimento)}
                    </p>
                  </div>
                </div>

                {/* Linha 3: centro de custo + solicitante */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {cc && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-medium">
                      🏢 {cc}
                    </span>
                  )}
                  {d.solicitante && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[11px]">
                      👤 {d.solicitante}
                    </span>
                  )}
                </div>

                {/* Linha 4: ações */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                  {(isPendente || isVencido) && (
                    <button
                      onClick={() => { setModalPagar(d); setDataPagamento(format(new Date(), 'yyyy-MM-dd')); setPagContaId(''); setPagForma('pix'); setPagDesconto(''); setPagJuros('') }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors"
                    >
                      <CheckCircle size={13} /> Marcar Pago
                    </button>
                  )}
                  {d.status === 'pago' && (
                    <button
                      onClick={() => estornarPagamento(d)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-semibold hover:bg-amber-200 transition-colors"
                    >
                      <RotateCcw size={13} /> Estornar
                    </button>
                  )}
                  <button
                    onClick={() => abrirEditar(d)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    onClick={() => duplicar(d)}
                    className="flex items-center justify-center p-2 bg-violet-50 text-violet-500 rounded-xl hover:bg-violet-100 transition-colors"
                    title="Duplicar"
                  >
                    <Copy size={14} />
                  </button>
                  {anexoBusyId === d.id ? (
                    <span className="flex items-center justify-center p-2 text-slate-400"><Loader2 size={16} className="animate-spin" /></span>
                  ) : d.anexo_path ? (
                    <>
                      <button
                        onClick={() => abrirAnexo(d)}
                        className="flex items-center justify-center p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                        title="Ver comprovante"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => removerAnexo(d)}
                        className="flex items-center justify-center p-2 bg-amber-50 text-amber-500 rounded-xl hover:bg-amber-100 transition-colors"
                        title="Remover comprovante"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => pedirAnexo(d)}
                      className="flex items-center justify-center p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"
                      title="Anexar comprovante"
                    >
                      <Paperclip size={14} />
                    </button>
                  )}
                  {isPendente && (
                    <a
                      href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100 transition-colors"
                      title="Google Agenda"
                    >
                      <Calendar size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => excluir(d.id)}
                    className="flex items-center justify-center p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </MobileCard>
            )
          })}
        </CardList>
      </Card>

      {/* Modal Despesa */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Despesa' : 'Nova Despesa'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Descricao — linha inteira */}
          <div className="col-span-1 sm:col-span-2">
            <Input label="Descricao *" placeholder="Ex: Conta de luz, Aluguel, Fornecedor..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>

          {/* Valor + Vencimento */}
          <CurrencyInput label="Valor *" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          <Input label="Vencimento *" type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />

          {/* Status só aparece ao EDITAR — nova despesa sempre entra como Pendente */}
          {editando && (
            <>
              <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </Select>
              <div /> {/* espaço para manter grid de 2 colunas */}
              {/* Se marcando como pago via edição, pede forma e conta */}
              {form.status === 'pago' && editando.status !== 'pago' && (
                <>
                  <Select label="Forma de Pagamento" value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}>
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="boleto">Boleto</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartao Debito</option>
                    <option value="cartao_credito">Cartao Credito</option>
                  </Select>
                  {contas.length > 0 ? (
                    <Select label="Conta Bancaria" value={form.conta_bancaria_id} onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}>
                      <option value="">Sem conta especifica</option>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Select>
                  ) : <div />}
                </>
              )}
            </>
          )}

          {/* Centro de Custo + Categoria — linha inteira cada */}
          <div className="col-span-1 sm:col-span-2">
            <Select label="Centro de Custo" value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
              <option value="">Sem centro de custo</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <Select label="Categoria" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          {/* Parcelado / Recorrente — mutuamente exclusivos */}
          {!editando && (
            <div className="col-span-1 sm:col-span-2 space-y-3">
              {/* Toggle Parcelado */}
              <div className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${form.parcelado ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                onClick={() => {
                  if (form.parcelado) setParcelasCustom(null)
                  setForm(f => ({ ...f, parcelado: !f.parcelado, recorrente: false }))
                }}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.parcelado ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                    {form.parcelado && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Parcelado</p>
                    <p className="text-xs text-slate-400">Cria uma entrada para cada parcela automaticamente</p>
                  </div>
                </div>
                {form.parcelado && (
                  <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Numero de parcelas</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => mudarNumParcelas(String(Math.max(2, parseInt(form.num_parcelas) - 1)))}
                            className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">−</button>
                          <input type="number" min={2} max={120}
                            className="w-16 text-center px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            value={form.num_parcelas}
                            onChange={e => mudarNumParcelas(e.target.value)} />
                          <button type="button" onClick={() => mudarNumParcelas(String(Math.min(120, parseInt(form.num_parcelas) + 1)))}
                            className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">+</button>
                          <span className="text-xs text-slate-500">parcelas mensais</span>
                        </div>
                      </div>
                      {!parcelasCustom && (
                        <div className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-center">
                          <p className="text-xs text-slate-400">Valor por parcela</p>
                          <p className="text-sm font-bold text-indigo-600">
                            {form.valor ? formatCurrency(parseFloat(form.valor)) : 'R$ —'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Total: {form.valor ? formatCurrency(parseFloat(form.valor) * (parseInt(form.num_parcelas) || 0)) : '—'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Toggle: valores iguais x personalizados */}
                    <button
                      type="button"
                      onClick={togglePersonalizarParcelas}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        parcelasCustom ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${parcelasCustom ? 'bg-white border-white' : 'border-slate-300'}`}>
                        {parcelasCustom && <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      Personalizar valor e vencimento de cada parcela
                    </button>

                    {/* Lista editavel de parcelas */}
                    {parcelasCustom && (
                      <div className="bg-white border border-indigo-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button type="button" onClick={dividirTotalEntreParcelas}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-semibold hover:bg-indigo-100 transition-colors">
                            Dividir o Valor como total
                          </button>
                          <button type="button" onClick={redistribuirParcelas}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200 transition-colors">
                            Repetir Valor em todas
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
                          {parcelasCustom.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-10 flex-shrink-0 text-[11px] font-bold text-slate-400 text-center">
                                {i + 1}/{parcelasCustom.length}
                              </span>
                              <div className="flex-1 min-w-0">
                                <CurrencyInput
                                  value={p.valor}
                                  onChange={e => alterarParcela(i, 'valor', e.target.value)}
                                  placeholder="0,00"
                                />
                              </div>
                              <input
                                type="date"
                                className="w-36 flex-shrink-0 px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                value={p.data}
                                onChange={e => alterarParcela(i, 'data', e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500">{parcelasCustom.length} parcelas</span>
                          <span className="text-sm font-bold text-indigo-700">
                            Total: {formatCurrency(totalParcelas)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Toggle Recorrente */}
              <div className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${form.recorrente ? 'border-purple-400 bg-purple-50' : 'border-slate-100 bg-slate-50'}`}
                onClick={() => setForm(f => ({ ...f, recorrente: !f.recorrente, parcelado: false }))}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.recorrente ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                    {form.recorrente && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Recorrente</p>
                    <p className="text-xs text-slate-400">Gera as proximas contas automaticamente ({HORIZONTE_MESES} meses a frente). Pare quando quiser desmarcando o recorrente.</p>
                  </div>
                </div>
                {form.recorrente && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <Select value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))} className="w-44">
                      <option value="mensal">Mensal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="semanal">Semanal</option>
                      <option value="anual">Anual</option>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ao editar, mantém o toggle recorrente simples */}
          {editando && (
            <div className="col-span-1 sm:col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm text-slate-600">Recorrente</span>
              </label>
              {form.recorrente && (
                <Select value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))} className="w-36">
                  <option value="mensal">Mensal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="semanal">Semanal</option>
                  <option value="anual">Anual</option>
                </Select>
              )}
            </div>
          )}
          <div>
            <Input
              label="Quem solicitou"
              placeholder="Ex: Fulano, Depto. Comercial..."
              value={form.solicitante}
              onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))}
            />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Observacoes</label>
            <textarea className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>

          {/* Comprovante (anexo) — some quando esta criando parcelas */}
          {!(form.parcelado && !editando) && (
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Comprovante (opcional, max 2MB)</label>
              {modalAnexoFile ? (
                <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-indigo-700 min-w-0">
                    <Paperclip size={14} className="flex-shrink-0" />
                    <span className="truncate">{modalAnexoFile.name}</span>
                    <span className="text-xs text-indigo-400 flex-shrink-0">({(modalAnexoFile.size / 1024).toFixed(0)} KB)</span>
                  </span>
                  <button type="button" onClick={() => setModalAnexoFile(null)} className="p-1 rounded-lg hover:bg-indigo-100 text-indigo-500 flex-shrink-0"><X size={14} /></button>
                </div>
              ) : editando?.anexo_path ? (
                <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                    <Paperclip size={14} className="flex-shrink-0 text-indigo-500" />
                    <span className="truncate">{editando.anexo_nome ?? 'Comprovante anexado'}</span>
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => abrirAnexo(editando)} className="px-2 py-1 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50">Ver</button>
                    <button type="button" onClick={() => modalAnexoInputRef.current?.click()} className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">Trocar</button>
                    <button type="button" onClick={() => { removerAnexo(editando); setModalOpen(false) }} className="px-2 py-1 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50">Remover</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => modalAnexoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all"
                >
                  <Paperclip size={15} /> Anexar comprovante (imagem ou PDF)
                </button>
              )}
              {!editando && (
                <p className="text-[11px] text-slate-400 mt-1">O comprovante sera enviado ao salvar a conta.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editando ? 'Salvar alteracoes' : form.parcelado ? `Criar ${parcelasCustom ? parcelasCustom.length : (form.num_parcelas || '?')} parcelas` : 'Cadastrar Conta'}
          </Button>
        </div>
      </Modal>

      {/* Modal Pagar */}
      <Modal open={!!modalPagar} onClose={() => setModalPagar(null)} title="Registrar Pagamento" size="sm">
        {modalPagar && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{modalPagar.descricao}</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(Number(modalPagar.valor))}</p>
            </div>
            <Input label="Data do Pagamento *" type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Forma de Pagamento *" value={pagForma} onChange={e => setPagForma(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferencia</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartao Debito</option>
                <option value="cartao_credito">Cartao Credito</option>
              </Select>
              <Select label="Conta Bancaria" value={pagContaId} onChange={e => setPagContaId(e.target.value)}>
                <option value="">{contas.length === 0 ? 'Nenhum banco cadastrado' : 'Selecione o banco...'}</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </div>
            {contas.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Cadastre bancos em <a href="/contas" className="font-semibold underline">Contas Bancarias</a> para vincular o pagamento.
              </p>
            )}
            {/* Desconto / Juros */}
            <div className="border border-slate-100 rounded-xl p-3 space-y-2.5 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ajuste do valor (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <CurrencyInput
                  label="Desconto (abater)"
                  value={pagDesconto}
                  onChange={e => setPagDesconto(e.target.value)}
                  placeholder="0,00"
                />
                <CurrencyInput
                  label="Juros / Multa (acrescer)"
                  value={pagJuros}
                  onChange={e => setPagJuros(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              {/* Valor final calculado */}
              {(parseFloat(pagDesconto) > 0 || parseFloat(pagJuros) > 0) && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-xs text-slate-500">Valor que sera debitado:</span>
                  <span className="text-base font-bold text-indigo-700">
                    {formatCurrency(Math.max(0, Number(modalPagar!.valor) - (parseFloat(pagDesconto) || 0) + (parseFloat(pagJuros) || 0)))}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Um lancamento de saida sera criado automaticamente no fluxo de caixa{pagContaId ? ' e ja conciliado, pois o banco foi informado' : ''}.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalPagar(null)}>Cancelar</Button>
              <Button variant="success" onClick={registrarPagamento} disabled={saving}><DollarSign size={14} /> Confirmar Pagamento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

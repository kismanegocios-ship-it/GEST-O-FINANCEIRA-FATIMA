'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TableWrapper, CardList, MobileCard } from '@/components/ui/table-mobile'
import { CurrencyInput } from '@/components/ui/currency-input'
import { toast } from 'sonner'
import { Select } from '@/components/ui/select'
import {
  Plus, Link2, CheckCircle, Trash2, AlertCircle,
  Upload, FileText, X, RefreshCw, FileSpreadsheet, Building2
} from 'lucide-react'
import type { ExtratoManual, Lancamento, ContaBancaria } from '@/lib/types'
import { format } from 'date-fns'
import Papa from 'papaparse'

interface ExtratoImportado {
  descricao: string
  valor: number
  data: string
  tipo: 'credito' | 'debito'
}

interface FormExtrato {
  descricao: string
  valor: string
  data: string
  tipo: 'credito' | 'debito'
  conta_bancaria_id: string
}

const emptyForm: FormExtrato = {
  descricao: '', valor: '', data: format(new Date(), 'yyyy-MM-dd'), tipo: 'debito', conta_bancaria_id: '',
}

export default function ConciliacaoPage() {
  const [extratos, setExtratos] = useState<ExtratoManual[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [filtroConta, setFiltroConta] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalManual, setModalManual] = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [modalConciliar, setModalConciliar] = useState<ExtratoManual | null>(null)
  const [form, setForm] = useState<FormExtrato>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [lancamentoSelecionado, setLancamentoSelecionado] = useState('')
  const [importados, setImportados] = useState<ExtratoImportado[]>([])
  const [parsendo, setParsendo] = useState(false)
  const [salvandoImport, setSalvandoImport] = useState(false)
  const [importContaId, setImportContaId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [ext, lanc, cb] = await Promise.all([
      supabase.from('extrato_manual').select('*, lancamentos(*), contas_bancarias(*)').order('data', { ascending: false }),
      supabase.from('lancamentos').select('*').eq('conciliado', false).order('data', { ascending: false }),
      supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome'),
    ])
    setExtratos((ext.data ?? []) as ExtratoManual[])
    setLancamentos((lanc.data ?? []) as Lancamento[])
    setContas((cb.data ?? []) as ContaBancaria[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const parseCSV = (file: File) => {
    setParsendo(true)

    // Lê o arquivo primeiro para detectar separador e encoding
    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target?.result as string ?? ''

      // Detecta separador: ponto-e-virgula é o mais comum nos bancos BR
      const semicolons = (raw.match(/;/g) ?? []).length
      const commas = (raw.match(/,/g) ?? []).length
      const delimiter = semicolons > commas ? ';' : ','

      Papa.parse(raw, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        complete: (result) => {
          const rows = result.data as Record<string, string>[]
          const itens: ExtratoImportado[] = []

          // Normaliza nome de coluna para comparação
          const norm = (s: string) => s.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
            .replace(/[^a-z0-9 ]/g, '').trim()

          // Mapeamentos de colunas ampliados para todos os bancos BR
          const DESC_KEYS = ['descricao', 'historico', 'lancamento', 'lançamento',
            'historico', 'memo', 'description', 'title', 'detalhe', 'complemento',
            'identificacao', 'nome', 'estabelecimento']
          const DATA_KEYS = ['data', 'date', 'dt', 'dt lancamento', 'data lancamento',
            'data mov', 'data movimento', 'data transacao', 'posted date', 'datamovimento']
          const VALOR_KEYS = ['valor', 'value', 'amount', 'vlr', 'quantia',
            'montante', 'total']
          const CREDITO_KEYS = ['credito', 'entrada', 'credit', 'credito r$', 'entrada r$']
          const DEBITO_KEYS = ['debito', 'saida', 'debit', 'debito r$', 'saida r$', 'pagamento r$']

          const findKey = (keys: string[], cols: string[]) =>
            cols.find(c => keys.includes(norm(c)))

          if (rows.length === 0) {
            setImportados([])
            setParsendo(false)
            toast.error('Arquivo vazio ou sem dados validos.')
            return
          }

          const cols = Object.keys(rows[0])
          const descKey  = findKey(DESC_KEYS, cols)
          const dataKey  = findKey(DATA_KEYS, cols)
          const valorKey = findKey(VALOR_KEYS, cols)
          const creditoKey = findKey(CREDITO_KEYS, cols)
          const debitoKey  = findKey(DEBITO_KEYS, cols)

          // Sem coluna de data: não dá pra importar
          if (!dataKey) {
            setImportados([])
            setParsendo(false)
            toast.error(`Coluna de data nao encontrada. Colunas do arquivo: ${cols.join(', ')}`)
            return
          }

          const parseValorBR = (s?: string): number => {
            if (!s) return NaN
            const limpo = s.replace(/\s/g, '')
              .replace(/R\$\s*/gi, '')
            // Detecta formato BR (ponto milhar, vírgula decimal) vs EN
            if (/\d\.\d{3},\d{2}/.test(limpo)) {
              return parseFloat(limpo.replace(/\./g, '').replace(',', '.'))
            }
            // Só virgula decimal (sem ponto milhar): 1234,56
            if (/^\-?\d+,\d+$/.test(limpo)) {
              return parseFloat(limpo.replace(',', '.'))
            }
            return parseFloat(limpo.replace(/[^0-9.\-]/g, ''))
          }

          const parseDataBR = (s: string): string => {
            const d = s.trim()
            // dd/mm/yyyy
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
              const [dd, mm, yyyy] = d.split('/')
              return `${yyyy}-${mm}-${dd}`
            }
            // dd/mm/yy
            if (/^\d{2}\/\d{2}\/\d{2}$/.test(d)) {
              const [dd, mm, yy] = d.split('/')
              const yyyy = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`
              return `${yyyy}-${mm}-${dd}`
            }
            // dd-mm-yyyy
            if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
              const [dd, mm, yyyy] = d.split('-')
              return `${yyyy}-${mm}-${dd}`
            }
            // yyyy-mm-dd (ISO)
            if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
            // dd/mm (sem ano)
            if (/^\d{2}\/\d{2}$/.test(d)) {
              const [dd, mm] = d.split('/')
              return `${new Date().getFullYear()}-${mm}-${dd}`
            }
            return ''
          }

          for (const row of rows) {
            const dataRaw = dataKey ? row[dataKey]?.trim() : ''
            if (!dataRaw) continue
            const data = parseDataBR(dataRaw)
            if (!data) continue

            let valor = 0
            let tipo: 'credito' | 'debito' = 'debito'

            if (creditoKey || debitoKey) {
              // Bancos com colunas separadas (Itaú, BB, Bradesco Desktop)
              const vCredito = parseValorBR(creditoKey ? row[creditoKey] : '')
              const vDebito  = parseValorBR(debitoKey  ? row[debitoKey]  : '')
              if (!isNaN(vCredito) && vCredito > 0) { valor = vCredito; tipo = 'credito' }
              else if (!isNaN(vDebito) && vDebito > 0) { valor = vDebito; tipo = 'debito' }
              else continue
            } else if (valorKey) {
              const v = parseValorBR(row[valorKey])
              if (isNaN(v) || v === 0) continue
              valor = Math.abs(v)
              tipo = v < 0 ? 'debito' : 'credito'
            } else {
              continue
            }

            // Descrição: usa coluna ou concatena todas as colunas não-usadas
            let descricao = descKey ? row[descKey]?.trim() : ''
            if (!descricao) {
              descricao = cols
                .filter(c => c !== dataKey && c !== valorKey && c !== creditoKey && c !== debitoKey)
                .map(c => row[c]?.trim()).filter(Boolean).join(' ').slice(0, 80)
            }
            if (!descricao) descricao = 'Lancamento'

            itens.push({ descricao: descricao.slice(0, 80), valor, data, tipo })
          }

          setImportados(itens)
          setParsendo(false)
          if (itens.length === 0) {
            toast.error(
              `Nenhuma transacao encontrada. Colunas detectadas: ${cols.join(', ')}. ` +
              'Tente exportar como OFX pelo seu banco.'
            )
          } else {
            toast.success(`${itens.length} lancamentos encontrados!`)
          }
        },
        error: () => {
          setParsendo(false)
          toast.error('Erro ao ler o arquivo CSV')
        },
      })
    }
    reader.onerror = () => { setParsendo(false); toast.error('Erro ao ler arquivo') }
    reader.readAsText(file, 'UTF-8')
  }

  const parsePDF = async (file: File) => {
    setParsendo(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      // Extrai texto preservando posição (linhas separadas por \n)
      let textoCompleto = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        // Agrupa por linha usando posição Y
        const itemsPorY: Record<number, string[]> = {}
        for (const item of content.items as any[]) {
          const y = Math.round(item.transform?.[5] ?? 0)
          if (!itemsPorY[y]) itemsPorY[y] = []
          itemsPorY[y].push(item.str)
        }
        const linhasOrdenadas = Object.keys(itemsPorY)
          .map(Number)
          .sort((a, b) => b - a)
          .map(y => itemsPorY[y].join(' '))
        textoCompleto += linhasOrdenadas.join('\n') + '\n'
      }

      const linhas = textoCompleto.split('\n').map(l => l.trim()).filter(Boolean)
      const itens: ExtratoImportado[] = []
      const anoAtual = new Date().getFullYear()

      // Padrões de data suportados
      const regexData = [
        /(\d{2})\/(\d{2})\/(\d{4})/,   // dd/mm/yyyy
        /(\d{2})\/(\d{2})\/(\d{2})\b/, // dd/mm/yy
        /(\d{2})\/(\d{2})\b/,           // dd/mm (sem ano)
        /(\d{2})-(\d{2})-(\d{4})/,     // dd-mm-yyyy
        /(\d{4})-(\d{2})-(\d{2})/,     // yyyy-mm-dd
      ]

      // Padrões de valor: suporta positivo, negativo, sinal no final
      const regexValor = [
        /([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*[DCdc]?\b/, // 1.234,56 ou 1.234,56 D
        /\b(\d{1,3}(?:\.\d{3})*,\d{2})\s*[-]/, // 1.234,56-
        /R\$\s*([+-]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/, // R$ 1.234,56
      ]

      const parseValorStr = (s: string): number => {
        return parseFloat(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
      }

      const parseData = (linha: string): { data: string; raw: string } | null => {
        for (const rx of regexData) {
          const m = linha.match(rx)
          if (!m) continue
          // yyyy-mm-dd
          if (rx.source.startsWith('(\\d{4})')) {
            return { data: `${m[1]}-${m[2]}-${m[3]}`, raw: m[0] }
          }
          // dd/mm/yyyy ou dd-mm-yyyy
          if (m[3] && m[3].length === 4) {
            return { data: `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`, raw: m[0] }
          }
          // dd/mm/yy
          if (m[3] && m[3].length === 2) {
            const ano = parseInt(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`
            return { data: `${ano}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`, raw: m[0] }
          }
          // dd/mm sem ano
          if (m[1] && m[2] && !m[3]) {
            return { data: `${anoAtual}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`, raw: m[0] }
          }
        }
        return null
      }

      for (const linha of linhas) {
        const dataResult = parseData(linha)
        if (!dataResult) continue

        let valorRaw = ''
        let valorNum = 0
        let isNegativo = false

        for (const rx of regexValor) {
          const m = linha.match(rx)
          if (!m) continue
          valorRaw = m[1] ?? m[0]
          valorNum = Math.abs(parseValorStr(valorRaw))
          // Detecta débito: sinal -, sufixo D, ou palavra Debito/Saida na linha
          isNegativo = /[-]/.test(valorRaw.trim().slice(-1)) ||
            /\b[Dd]\b/.test(linha) ||
            /[Dd][ée][Bb][Ii][Tt]|[Ss][Aa][Íí][Dd][Aa]/.test(linha) ||
            valorRaw.trim().startsWith('-')
          break
        }

        if (!valorRaw || valorNum === 0 || isNaN(valorNum)) continue

        const descricao = linha
          .replace(dataResult.raw, '')
          .replace(valorRaw, '')
          .replace(/R\$|[DCdc]\b|\s{2,}/g, ' ')
          .replace(/[^\w\s\-\/áéíóúâêîôûãõàçÁÉÍÓÚÂÊÎÔÛÃÕÀÇ.,]/g, ' ')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 80)

        if (!descricao || descricao.length < 2) continue

        itens.push({
          descricao,
          valor: valorNum,
          data: dataResult.data,
          tipo: isNegativo ? 'debito' : 'credito',
        })
      }

      // Remove duplicatas exatas
      const unicos = itens.filter((item, idx, arr) =>
        arr.findIndex(x => x.descricao === item.descricao && x.valor === item.valor && x.data === item.data) === idx
      )

      setImportados(unicos)
      setParsendo(false)
      if (unicos.length === 0) {
        toast.warning(
          `Nao encontramos lancamentos neste PDF (${linhas.length} linhas lidas). ` +
          'O PDF pode usar imagens ou ter formato diferente. Exporte como CSV pelo app do banco.'
        )
      } else {
        toast.success(`${unicos.length} lancamentos encontrados no PDF!`)
      }
    } catch (err) {
      setParsendo(false)
      toast.error('Erro ao processar PDF. Tente usar CSV.')
      console.error('PDF parse error:', err)
    }
  }

  const parseOFX = async (file: File) => {
    setParsendo(true)
    try {
      const text = await file.text()
      const itens: ExtratoImportado[] = []

      // Normaliza OFX SGML legado (sem XML header) ou XML moderno
      const normalize = (s: string) => s.replace(/>\s*</g, '><').replace(/\r/g, '')

      // Extrai tag: pega conteúdo entre <TAG> e </TAG> ou valor SGML <TAG>valor\n
      const getTag = (src: string, tag: string): string => {
        const xmlMatch = src.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'))
        if (xmlMatch) return xmlMatch[1].trim()
        const sgmlMatch = src.match(new RegExp(`<${tag}>([^\n<]+)`, 'i'))
        return sgmlMatch ? sgmlMatch[1].trim() : ''
      }

      // Encontra todos os blocos STMTTRN
      const blocos = normalize(text).match(/<STMTTRN[\s\S]*?<\/STMTTRN>/gi) ?? []

      // Fallback SGML: separa por <STMTTRN> sem closing tag
      const blocosLegado = text.split(/<STMTTRN>/i).slice(1).map(b => {
        const fim = b.indexOf('<STMTTRN')
        return fim > 0 ? b.slice(0, fim) : b.slice(0, 800)
      })

      const fonte = blocos.length > 0 ? blocos : blocosLegado

      for (const bloco of fonte) {
        const dtRaw = getTag(bloco, 'DTPOSTED') || getTag(bloco, 'DTUSER')
        const amtRaw = getTag(bloco, 'TRNAMT')
        const memo = getTag(bloco, 'MEMO') || getTag(bloco, 'NAME') || getTag(bloco, 'FITID')
        const trntype = getTag(bloco, 'TRNTYPE').toUpperCase()

        if (!dtRaw || !amtRaw) continue

        // Data OFX: YYYYMMDDHHMMSS ou YYYYMMDD
        const anoStr = dtRaw.slice(0, 4)
        const mesStr = dtRaw.slice(4, 6)
        const diaStr = dtRaw.slice(6, 8)
        const data = `${anoStr}-${mesStr}-${diaStr}`

        const valorNum = parseFloat(amtRaw.replace(',', '.'))
        if (isNaN(valorNum) || valorNum === 0) continue

        const valor = Math.abs(valorNum)
        // CREDIT / DEP / INT / DIV → crédito; resto → débito
        const tipo: 'credito' | 'debito' =
          ['CREDIT', 'DEP', 'INT', 'DIV', 'DIRECTDEP'].includes(trntype) || valorNum > 0
            ? 'credito'
            : 'debito'

        itens.push({ descricao: memo || 'Lancamento', valor, data, tipo })
      }

      setImportados(itens)
      setParsendo(false)
      if (itens.length === 0) {
        toast.warning('Nao encontramos transacoes no arquivo OFX. Verifique se e um extrato valido.')
      } else {
        toast.success(`${itens.length} lancamentos encontrados no OFX!`)
      }
    } catch (err) {
      setParsendo(false)
      toast.error('Erro ao processar OFX.')
      console.error(err)
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportados([])

    const nome = file.name.toLowerCase()
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
      parseCSV(file)
    } else if (nome.endsWith('.pdf')) {
      parsePDF(file)
    } else if (nome.endsWith('.ofx') || nome.endsWith('.qfx')) {
      parseOFX(file)
    } else {
      toast.error('Formato nao suportado. Use CSV, OFX, QFX ou PDF.')
    }
    e.target.value = ''
  }

  const removerImportado = (idx: number) => {
    setImportados(prev => prev.filter((_, i) => i !== idx))
  }

  const salvarImportados = async () => {
    if (importados.length === 0) return
    setSalvandoImport(true)
    const { error } = await supabase.from('extrato_manual').insert(
      importados.map(i => ({
        descricao: i.descricao,
        valor: i.valor,
        data: i.data,
        tipo: i.tipo,
        conciliado: false,
        conta_bancaria_id: importContaId || null,
      }))
    )
    setSalvandoImport(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success(`${importados.length} lancamentos importados!`)
    setImportados([])
    setModalImport(false)
    load()
  }

  const salvarManual = async () => {
    if (!form.descricao || !form.valor || !form.data) { toast.error('Preencha os campos'); return }
    setSaving(true)
    const { error } = await supabase.from('extrato_manual').insert({
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      data: form.data,
      tipo: form.tipo,
      conciliado: false,
      conta_bancaria_id: form.conta_bancaria_id || null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success('Lancamento adicionado!')
    setModalManual(false)
    setForm(emptyForm)
    load()
  }

  const conciliar = async () => {
    if (!modalConciliar || !lancamentoSelecionado) { toast.error('Selecione um lancamento'); return }
    setSaving(true)
    await Promise.all([
      supabase.from('extrato_manual').update({ conciliado: true, lancamento_id: lancamentoSelecionado }).eq('id', modalConciliar.id),
      supabase.from('lancamentos').update({ conciliado: true }).eq('id', lancamentoSelecionado),
    ])
    setSaving(false)
    toast.success('Conciliado!')
    setModalConciliar(null)
    setLancamentoSelecionado('')
    load()
  }

  const excluir = async (id: string) => {
    await supabase.from('extrato_manual').delete().eq('id', id)
    toast.success('Removido')
    load()
  }

  const extratosFiltrados = filtroConta
    ? extratos.filter(e => e.conta_bancaria_id === filtroConta)
    : extratos
  const pendentes = extratosFiltrados.filter(e => !e.conciliado)
  const conciliados = extratosFiltrados.filter(e => e.conciliado)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Conciliacao Bancaria</h1>
          <p className="text-sm text-slate-500 mt-0.5">Importe seu extrato e concilie com os lancamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCw size={14} /></Button>
          <Button variant="secondary" onClick={() => setModalManual(true)}>
            <Plus size={16} /> <span className="hidden sm:inline">Manual</span>
          </Button>
          <Button onClick={() => { setImportados([]); setImportContaId(''); setModalImport(true) }}>
            <Upload size={16} /> <span className="hidden sm:inline">Importar Extrato</span><span className="sm:hidden">Importar</span>
          </Button>
        </div>
      </div>

      {/* Filtro por banco */}
      {contas.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Building2 size={16} className="text-slate-400 flex-shrink-0" />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFiltroConta('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filtroConta === '' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos os bancos
            </button>
            {contas.map(c => (
              <button
                key={c.id}
                onClick={() => setFiltroConta(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  filtroConta === c.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Pendentes</p>
            <p className="text-xl font-bold text-orange-600">{pendentes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Conciliados</p>
            <p className="text-xl font-bold text-green-600">{conciliados.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Sem conciliar</p>
            <p className="text-xl font-bold text-blue-600">{lancamentos.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pendentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <CardTitle>Pendentes de Conciliacao</CardTitle>
          </div>
        </CardHeader>

        {/* Desktop */}
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Carregando...</td></tr>
              ) : pendentes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Tudo conciliado!</p>
                  </td>
                </tr>
              ) : pendentes.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-800">{e.descricao}</p>
                    {(e as any).contas_bancarias?.nome && (
                      <p className="text-xs text-indigo-500 mt-0.5">{(e as any).contas_bancarias.nome}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.data)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                      {e.tipo === 'credito' ? 'Credito' : 'Debito'}
                    </Badge>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Number(e.valor))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setModalConciliar(e); setLancamentoSelecionado('') }}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                        title="Conciliar"
                      >
                        <Link2 size={15} />
                      </button>
                      <button
                        onClick={() => excluir(e.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>

        {/* Mobile */}
        <CardList>
          {loading ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Carregando...</p></MobileCard>
          ) : pendentes.length === 0 ? (
            <MobileCard>
              <div className="text-center py-6">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Tudo conciliado!</p>
              </div>
            </MobileCard>
          ) : pendentes.map(e => (
            <MobileCard key={e.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{e.descricao}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(e.data)}</p>
                  {(e as any).contas_bancarias?.nome && (
                    <p className="text-xs text-indigo-500">{(e as any).contas_bancarias.nome}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <p className={`text-sm font-bold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Number(e.valor))}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                  {e.tipo === 'credito' ? 'Credito' : 'Debito'}
                </Badge>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setModalConciliar(e); setLancamentoSelecionado('') }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium"
                  >
                    <Link2 size={12} /> Conciliar
                  </button>
                  <button
                    onClick={() => excluir(e.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </MobileCard>
          ))}
        </CardList>
      </Card>

      {/* Conciliados */}
      {conciliados.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <CardTitle>Conciliados</CardTitle>
            </div>
          </CardHeader>

          {/* Desktop */}
          <TableWrapper>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Lancamento vinculado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {conciliados.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{e.descricao}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(e.data)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                        {e.tipo === 'credito' ? 'Credito' : 'Debito'}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(e.valor))}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {(e as any).lancamentos?.descricao ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>

          {/* Mobile */}
          <CardList>
            {conciliados.map(e => (
              <MobileCard key={e.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 text-sm truncate">{e.descricao}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(e.data)}</p>
                    {(e as any).lancamentos?.descricao && (
                      <p className="text-xs text-indigo-500 mt-0.5">Vinculado: {(e as any).lancamentos.descricao}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className={`text-sm font-bold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(e.valor))}
                    </p>
                    <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                      {e.tipo === 'credito' ? 'Credito' : 'Debito'}
                    </Badge>
                  </div>
                </div>
              </MobileCard>
            ))}
          </CardList>
        </Card>
      )}

      {/* Modal Importar */}
      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Importar Extrato Bancario" size="lg">
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-indigo-200 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all"
          >
            <input ref={fileRef} type="file" accept=".csv,.pdf,.txt,.ofx,.qfx" className="hidden" onChange={handleFile} />
            <Upload className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Clique para selecionar o arquivo</p>
            <p className="text-sm text-slate-400 mt-1">Suporta <strong>OFX</strong>, <strong>QFX</strong>, <strong>CSV</strong> e <strong>PDF</strong></p>
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg font-medium">
                <FileSpreadsheet size={12} /> OFX / QFX ✓ melhor
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                <FileSpreadsheet size={12} /> CSV
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                <FileText size={12} /> PDF
              </span>
            </div>
          </div>

          {parsendo && (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-600">Lendo arquivo...</span>
            </div>
          )}

          {importados.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">{importados.length} lancamentos encontrados</p>
                <button onClick={() => setImportados([])} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Limpar</button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Descricao</th>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Data</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Valor</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importados.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700 max-w-36 truncate">{item.descricao}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(item.data)}</td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${item.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(item.valor)}
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => removerImportado(idx)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {contas.length > 0 && (
                <div className="mt-3">
                  <Select label="Vincular todos a conta bancaria" value={importContaId} onChange={e => setImportContaId(e.target.value)}>
                    <option value="">Sem conta especifica</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setModalImport(false)}>Cancelar</Button>
                <Button onClick={salvarImportados} disabled={salvandoImport}>
                  {salvandoImport ? 'Salvando...' : `Importar ${importados.length}`}
                </Button>
              </div>
            </div>
          )}

          {!parsendo && importados.length === 0 && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">Como exportar o extrato do seu banco:</p>
              <ul className="text-xs text-blue-600 space-y-1">
                <li>• <strong>Bradesco:</strong> Internet Banking &gt; Extrato &gt; Exportar OFX</li>
                <li>• <strong>Itau:</strong> Internet Banking &gt; Extrato &gt; Salvar como OFX</li>
                <li>• <strong>Santander:</strong> Internet Banking &gt; Extrato &gt; Exportar &gt; OFX</li>
                <li>• <strong>BB:</strong> Internet Banking &gt; Extrato &gt; Exportar OFX/CSV</li>
                <li>• <strong>Nubank:</strong> App &gt; Perfil &gt; Exportar extratos (CSV)</li>
                <li>• <strong>Caixa:</strong> Internet Banking &gt; Extrato &gt; Exportar OFX</li>
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Manual */}
      <Modal open={modalManual} onClose={() => setModalManual(false)} title="Lancamento Manual no Extrato" size="sm">
        <div className="space-y-4">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setForm(f => ({ ...f, tipo: 'credito' }))} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.tipo === 'credito' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600'}`}>Credito</button>
            <button onClick={() => setForm(f => ({ ...f, tipo: 'debito' }))} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.tipo === 'debito' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600'}`}>Debito</button>
          </div>
          <Input label="Descricao *" placeholder="Descricao do extrato..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <CurrencyInput label="Valor *" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          {contas.length > 0 && (
            <Select label="Conta Bancaria" value={form.conta_bancaria_id} onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}>
              <option value="">Sem conta especifica</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalManual(false)}>Cancelar</Button>
          <Button onClick={salvarManual} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar'}</Button>
        </div>
      </Modal>

      {/* Modal Conciliar */}
      <Modal open={!!modalConciliar} onClose={() => setModalConciliar(null)} title="Conciliar Lancamento" size="md">
        {modalConciliar && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Extrato bancario</p>
              <p className="font-semibold text-slate-800">{modalConciliar.descricao}</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(Number(modalConciliar.valor))} &middot; {formatDate(modalConciliar.data)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Vincular ao lancamento do sistema</label>
              <select
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={lancamentoSelecionado}
                onChange={e => setLancamentoSelecionado(e.target.value)}
              >
                <option value="">Selecione um lancamento...</option>
                {lancamentos.map(l => (
                  <option key={l.id} value={l.id}>
                    {formatDate(l.data)} &middot; {l.descricao} &middot; {formatCurrency(Number(l.valor))}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalConciliar(null)}>Cancelar</Button>
              <Button onClick={conciliar} disabled={saving || !lancamentoSelecionado}>
                <Link2 size={14} /> Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

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
  Upload, FileText, X, RefreshCw, FileSpreadsheet, Building2, RotateCcw
} from 'lucide-react'
import type { ExtratoManual, Lancamento, ContaBancaria, Categoria, CentroCusto } from '@/lib/types'
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
  const [importados, setImportados] = useState<ExtratoImportado[]>([])
  const [parsendo, setParsendo] = useState(false)
  const [salvandoImport, setSalvandoImport] = useState(false)
  const [importContaId, setImportContaId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [modoConciliar, setModoConciliar] = useState<'criar' | 'vincular'>('criar')
  const [formConciliar, setFormConciliar] = useState({
    lancamentoId: '', descricao: '', categoria_id: '',
    centro_custo_id: '', conta_bancaria_id: '', forma_pagamento: '', observacoes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [ext, lanc, cb, cats, ccs] = await Promise.all([
      supabase.from('extrato_manual').select('*, lancamentos(*), contas_bancarias(*)').order('data', { ascending: false }),
      supabase.from('lancamentos').select('*').eq('conciliado', false).order('data', { ascending: false }),
      supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').order('nome'),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
    ])
    setExtratos((ext.data ?? []) as ExtratoManual[])
    setLancamentos((lanc.data ?? []) as Lancamento[])
    setContas((cb.data ?? []) as ContaBancaria[])
    setCategorias((cats.data ?? []) as Categoria[])
    setCentros((ccs.data ?? []) as CentroCusto[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const parseCSV = (file: File) => {
    setParsendo(true)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target?.result as string ?? ''

      // ── Helpers ────────────────────────────────────────────────────────────
      const norm = (s: string) => s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

      const parseValorBR = (s?: string): number => {
        if (!s) return NaN
        const v = s.replace(/\s/g, '').replace(/R\$\s*/gi, '').replace(/^"+|"+$/g, '')
        if (/\d\.\d{3},\d{2}/.test(v)) return parseFloat(v.replace(/\./g, '').replace(',', '.'))
        if (/^-?\d+,\d+$/.test(v)) return parseFloat(v.replace(',', '.'))
        if (/^-?\d+\.\d{2}$/.test(v)) return parseFloat(v)
        const n = parseFloat(v.replace(/[^0-9.\-]/g, ''))
        return isNaN(n) ? NaN : n
      }

      const parseDataBR = (s: string): string => {
        const d = s.trim().replace(/^"+|"+$/g, '')
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd,mm,yyyy]=d.split('/'); return `${yyyy}-${mm}-${dd}` }
        if (/^\d{2}\/\d{2}\/\d{2}$/.test(d))  { const [dd,mm,yy]=d.split('/'); const y=+yy>50?`19${yy}`:`20${yy}`; return `${y}-${mm}-${dd}` }
        if (/^\d{2}-\d{2}-\d{4}$/.test(d))    { const [dd,mm,yyyy]=d.split('-'); return `${yyyy}-${mm}-${dd}` }
        if (/^\d{4}-\d{2}-\d{2}/.test(d))     return d.slice(0, 10)
        if (/^\d{2}\/\d{2}$/.test(d))          { const [dd,mm]=d.split('/'); return `${new Date().getFullYear()}-${mm}-${dd}` }
        return ''
      }

      // Campo que é uma data isolada (ex: 02/01/26 ou 05/01/2026) — sem espaços e tamanho curto
      const isRowDate = (s?: string) => {
        if (!s) return false
        const t = s.trim().replace(/^"+|"+$/g, '')
        return t.length <= 10 && !t.includes(' ') && /^\d{2}[\/\-]\d{2}([\/\-]\d{2,4})?$/.test(t)
      }

      // ── Detecta separador ──────────────────────────────────────────────────
      const semis  = (raw.match(/;/g) ?? []).length
      const commas = (raw.match(/,/g) ?? []).length
      const pipes  = (raw.match(/\|/g) ?? []).length
      const delimiter = semis >= commas && semis >= pipes ? ';' : pipes > commas ? '|' : ','

      // ── Detecta se é formato "flat" (tudo em poucas linhas longas) ─────────
      // Bradesco e outros exportam tudo em 1 linha sem \n entre registros
      const allLines = raw.split(/\r?\n/).filter(l => l.trim())
      const longestLine = Math.max(...allLines.map(l => l.length))
      const isFlat = longestLine > 500   // linha > 500 chars = formato flat

      const itens: ExtratoImportado[] = []

      const finalize = () => {
        setImportados(itens)
        setParsendo(false)
        if (itens.length === 0) {
          toast.error('Nenhuma transação encontrada no CSV. Tente exportar como OFX/QFX pelo app do banco.')
        } else {
          toast.success(`${itens.length} lancamentos encontrados!`)
        }
      }

      if (isFlat) {
        // ── Formato flat: reconstrói registros pela posição de campos ─────────
        // Usa PapaParse para tratar aspas corretamente
        Papa.parse(raw, {
          header: false,
          delimiter,
          complete: (result) => {
            // Tudo vira um array plano de campos
            const allFields = (result.data as string[][]).flat()
              .map(s => (s ?? '').trim().replace(/^"+|"+$/g, ''))

            // Encontra o primeiro campo que é uma data de transação
            const firstDateIdx = allFields.findIndex(f => isRowDate(f))
            if (firstDateIdx === -1) {
              setImportados([]); setParsendo(false)
              toast.error('Nenhuma data encontrada no arquivo. Tente OFX/QFX.')
              return
            }

            // Campos antes da 1ª data = cabeçalho/metadados
            const headerFields = allFields.slice(0, firstDateIdx)
            const hNormsAll = headerFields.map(norm)

            // Bancos costumam colocar linhas de metadados (agencia, conta, periodo)
            // ANTES da linha de cabecalho real. Isso empurra os indices das colunas
            // pra frente dentro de `headerFields`, mas o array `row` de cada
            // transacao sempre comeca do zero em row[0] = valor da data. Ancorar
            // tudo na posicao da coluna "Data" corrige esse deslocamento — sem
            // isso, credito/debito/saldo saem lidos da coluna errada.
            const dataHeaderIdx = hNormsAll.findIndex(n => /^(data|date|dt)\b/.test(n))
            const headerRel = dataHeaderIdx >= 0 ? headerFields.slice(dataHeaderIdx) : headerFields
            const hNorms = headerRel.map(norm)

            // Detecta posições relativas pelo nome da coluna (com fallback por posição)
            const findH = (keys: string[]) =>
              hNorms.findIndex(n => keys.some(k => n.includes(k)))

            let descRel    = findH(['hist','descr','lancam','memo','desc'])
            let creditoRel = findH(['credito','entrada','credit'])
            let debitoRel  = findH(['debito','saida','debit'])
            let valorRel   = findH(['valor r','amount','quantia','total'])
            const rowLen   = headerRel.length

            // Fallback por posição para bancos com encoding problemático (Bradesco)
            if (creditoRel === -1 && debitoRel === -1 && valorRel === -1 && rowLen >= 5) {
              // Convenção mais comum BR: Data(0) Hist(1) Docto(2) Crédito(3) Débito(4) Saldo(5)
              descRel = 1; creditoRel = 3; debitoRel = 4
            }
            if (descRel === -1) descRel = 1

            // Percorre campos detectando início de cada registro pela data
            let i = firstDateIdx
            while (i < allFields.length) {
              if (!isRowDate(allFields[i])) { i++; continue }

              const dateRaw = allFields[i]
              const data = parseDataBR(dateRaw)
              if (!data) { i++; continue }

              i++
              const row: string[] = [dateRaw]
              while (i < allFields.length && !isRowDate(allFields[i])) {
                row.push(allFields[i]); i++
              }

              // Ignora saldo anterior e totalizadores
              const descRaw = row[descRel]?.trim() ?? ''
              if (/saldo anterior|^total\b/i.test(descRaw)) continue

              let valor = 0, tipo: 'credito' | 'debito' = 'debito'

              if (creditoRel !== -1 || debitoRel !== -1) {
                const vc = parseValorBR(creditoRel >= 0 ? row[creditoRel] : '')
                const vd = parseValorBR(debitoRel  >= 0 ? row[debitoRel]  : '')
                if (!isNaN(vc) && vc > 0)  { valor = vc; tipo = 'credito' }
                else if (!isNaN(vd) && vd !== 0) { valor = Math.abs(vd); tipo = 'debito' }
                else continue
              } else if (valorRel >= 0) {
                const v = parseValorBR(row[valorRel])
                if (isNaN(v) || v === 0) continue
                valor = Math.abs(v); tipo = v < 0 ? 'debito' : 'credito'
              } else continue

              // Descrição: campo principal + complemento (campos além do rowLen)
              const complement = row.slice(rowLen).filter(Boolean).join(' ').slice(0, 40)
              const descricao = [descRaw, complement].filter(Boolean).join(' - ').slice(0, 80) || 'Lancamento'

              itens.push({ descricao, valor, data, tipo })
            }

            finalize()
          },
          error: () => { setParsendo(false); toast.error('Erro ao ler o arquivo CSV') },
        })

      } else {
        // ── Formato com newlines (padrão) ─────────────────────────────────────
        const headerWords = ['data','date','historico','descricao','lancamento',
          'valor','credito','debito','movimento','amount','description','detalhe','saldo']
        const isHeaderRow = (l: string) =>
          headerWords.filter(w => norm(l).includes(w)).length >= 2
        const isDataRow   = (l: string) => isRowDate(l.split(delimiter)[0])

        const headerIdx    = allLines.findIndex(l => isHeaderRow(l))
        const firstDataIdx = allLines.findIndex(l => isDataRow(l))

        if (firstDataIdx === -1) {
          setImportados([]); setParsendo(false)
          toast.error('Nenhuma data encontrada no arquivo. Tente OFX/QFX.')
          return
        }

        const hasHeader  = headerIdx !== -1 && headerIdx < firstDataIdx
        const csvToParse = hasHeader
          ? allLines.slice(headerIdx).join('\n')
          : allLines.slice(firstDataIdx).join('\n')

        Papa.parse(csvToParse, {
          header: hasHeader,
          skipEmptyLines: true,
          delimiter,
          complete: (result) => {
            if (hasHeader) {
              const rows = result.data as Record<string, string>[]
              if (!rows.length) { setImportados([]); setParsendo(false); toast.error('Arquivo vazio.'); return }

              const cols = Object.keys(rows[0])
              const DESC_KEYS    = ['descricao','historico','hist','lancamento','memo','description','detalhe']
              const DATA_KEYS    = ['data','date','dt lancamento','data lancamento','data mov','datamovimento','data do lancamento']
              const VALOR_KEYS   = ['valor','amount','vlr','quantia','montante']
              const CREDITO_KEYS = ['credito','entrada','credit']
              const DEBITO_KEYS  = ['debito','saida','debit','pagamento']
              const findKey = (keys: string[], cs: string[]) =>
                cs.find(c => keys.some(k => norm(c).includes(k)))

              const dataKey    = findKey(DATA_KEYS, cols)
              const valorKey   = findKey(VALOR_KEYS, cols)
              const creditoKey = findKey(CREDITO_KEYS, cols)
              const debitoKey  = findKey(DEBITO_KEYS, cols)
              const descKey    = findKey(DESC_KEYS, cols)

              if (!dataKey) {
                setImportados([]); setParsendo(false)
                toast.error(`Coluna de data não encontrada. Colunas: ${cols.slice(0,5).join(', ')}`)
                return
              }

              for (const row of rows) {
                const dataRaw = row[dataKey]?.trim()
                if (!dataRaw) continue
                const data = parseDataBR(dataRaw)
                if (!data) continue

                let valor = 0, tipo: 'credito' | 'debito' = 'debito'
                if (creditoKey || debitoKey) {
                  const vc = parseValorBR(creditoKey ? row[creditoKey] : '')
                  const vd = parseValorBR(debitoKey  ? row[debitoKey]  : '')
                  if (!isNaN(vc) && vc > 0) { valor = vc; tipo = 'credito' }
                  else if (!isNaN(vd) && vd !== 0) { valor = Math.abs(vd); tipo = 'debito' }
                  else continue
                } else if (valorKey) {
                  const v = parseValorBR(row[valorKey])
                  if (isNaN(v) || v === 0) continue
                  valor = Math.abs(v); tipo = v < 0 ? 'debito' : 'credito'
                } else continue

                let descricao = descKey ? row[descKey]?.trim() : ''
                if (!descricao) descricao = cols
                  .filter(c => c !== dataKey && c !== valorKey && c !== creditoKey && c !== debitoKey)
                  .map(c => row[c]?.trim()).filter(Boolean).join(' ').slice(0, 80)
                itens.push({ descricao: (descricao || 'Lancamento').slice(0, 80), valor, data, tipo })
              }
            } else {
              // Sem cabeçalho: detecção por posição
              const rows = result.data as string[][]
              if (!rows.length) { setImportados([]); setParsendo(false); toast.error('Arquivo vazio.'); return }

              const numCols = Math.max(...rows.map(r => r.length))
              const dateColIdx = Array.from({length: numCols}, (_, i) => i)
                .find(ci => rows.filter(r => isRowDate(r[ci])).length > rows.length * 0.5) ?? 0
              const isNum = (s?: string) => !!s && s.trim() !== '' && !isNaN(parseValorBR(s)) && parseValorBR(s) !== 0
              const outrasCols = Array.from({length: numCols}, (_, i) => i).filter(ci => ci !== dateColIdx)

              // ── Tenta achar o par Credito/Debito: duas colunas numericas mutuamente
              // exclusivas (cada linha preenche no maximo uma das duas). A coluna de
              // Saldo fica preenchida em TODA linha, entao nunca "sobra" pra formar
              // esse par — assim ela nunca é confundida com o valor do lancamento.
              const acharParCreditoDebito = (): [number, number] | null => {
                for (let a = 0; a < outrasCols.length; a++) {
                  for (let b = a + 1; b < outrasCols.length; b++) {
                    const ca = outrasCols[a], cb = outrasCols[b]
                    let ambos = 0, algum = 0
                    for (const row of rows) {
                      const fa = isNum(row[ca]), fb = isNum(row[cb])
                      if (fa && fb) ambos++
                      if (fa || fb) algum++
                    }
                    if (algum > rows.length * 0.5 && ambos < algum * 0.1) return [ca, cb]
                  }
                }
                return null
              }
              const par = acharParCreditoDebito()

              if (par) {
                // Convencao BR: a coluna de Credito vem antes da de Debito
                const [creditoColIdx, debitoColIdx] = par
                const descCols = outrasCols.filter(ci => ci !== creditoColIdx && ci !== debitoColIdx)
                for (const row of rows) {
                  const dataRaw = row[dateColIdx]?.trim()
                  if (!dataRaw) continue
                  const data = parseDataBR(dataRaw)
                  if (!data) continue
                  const vc = parseValorBR(row[creditoColIdx])
                  const vd = parseValorBR(row[debitoColIdx])
                  let valor = 0, tipo: 'credito' | 'debito' | null = null
                  if (!isNaN(vc) && vc !== 0) { valor = Math.abs(vc); tipo = 'credito' }
                  else if (!isNaN(vd) && vd !== 0) { valor = Math.abs(vd); tipo = 'debito' }
                  if (!tipo) continue
                  const descricao = descCols.map(ci => row[ci]?.trim()).filter(Boolean).join(' ').slice(0, 80) || 'Lancamento'
                  itens.push({ descricao, valor, data, tipo })
                }
              } else {
                // Sem par Credito/Debito: assume coluna unica de Valor (com sinal).
                // Descarta a ultima coluna numerica quando ha mais de uma — por
                // convencao é o Saldo (extrato corrido), nunca o valor do lancamento.
                const numericCols = outrasCols.filter(ci => rows.filter(r => isNum(r[ci])).length > rows.length * 0.4)
                const candidatas = numericCols.length > 1 ? numericCols.slice(0, -1) : numericCols
                const hasNeg = (ci: number) => rows.some(r => (r[ci] ?? '').trim().startsWith('-'))
                const valueColIdx = candidatas.find(ci => hasNeg(ci)) ?? candidatas[0] ?? -1
                if (valueColIdx === -1) {
                  setImportados([]); setParsendo(false)
                  toast.error('Coluna de valor não detectada. Tente OFX/QFX.'); return
                }
                const descCols = outrasCols.filter(ci => !numericCols.includes(ci))
                for (const row of rows) {
                  const dataRaw = row[dateColIdx]?.trim()
                  if (!dataRaw) continue
                  const data = parseDataBR(dataRaw)
                  if (!data) continue
                  const v = parseValorBR(row[valueColIdx])
                  if (isNaN(v) || v === 0) continue
                  const valor = Math.abs(v)
                  const tipo: 'credito' | 'debito' = v < 0 ? 'debito' : 'credito'
                  const descricao = descCols.map(ci => row[ci]?.trim()).filter(Boolean).join(' ').slice(0, 80) || 'Lancamento'
                  itens.push({ descricao, valor, data, tipo })
                }
              }
            }
            finalize()
          },
          error: () => { setParsendo(false); toast.error('Erro ao ler o arquivo CSV') },
        })
      }
    }
    reader.onerror = () => { setParsendo(false); toast.error('Erro ao ler arquivo') }
    // ISO-8859-1 cobre Windows-1252, encoding mais comum nos bancos BR
    reader.readAsText(file, 'ISO-8859-1')
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
      let totalItens = 0
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        totalItens += content.items.length
        // Agrupa por linha usando posição Y
        const itemsPorY: Record<number, string[]> = {}
        for (const item of content.items as any[]) {
          if (!item.str?.trim()) continue
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

      // PDF escaneado: nenhum item de texto encontrado
      if (totalItens === 0) {
        setParsendo(false)
        toast.error(
          'Este PDF usa imagens (escaneado). Não é possível ler o texto automaticamente. ' +
          'Use OFX/QFX ou CSV exportado pelo app do banco.'
        )
        return
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
          `PDF tem texto (${linhas.length} linhas), mas não reconhecemos o formato do extrato. ` +
          'Tente exportar como OFX/QFX ou CSV pelo app do banco.'
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
    if (!modalConciliar) return
    setSaving(true)

    if (modoConciliar === 'vincular') {
      if (!formConciliar.lancamentoId) { setSaving(false); toast.error('Selecione um lancamento'); return }
      await Promise.all([
        supabase.from('extrato_manual').update({ conciliado: true, lancamento_id: formConciliar.lancamentoId }).eq('id', modalConciliar.id),
        supabase.from('lancamentos').update({ conciliado: true }).eq('id', formConciliar.lancamentoId),
      ])
    } else {
      // Cria novo lancamento com os dados do extrato + form
      const tipo: 'entrada' | 'saida' = modalConciliar.tipo === 'credito' ? 'entrada' : 'saida'
      const { data: novoLanc, error } = await supabase.from('lancamentos').insert({
        descricao: formConciliar.descricao.trim() || modalConciliar.descricao,
        valor: Number(modalConciliar.valor),
        tipo,
        data: modalConciliar.data,
        categoria_id:    formConciliar.categoria_id    || null,
        centro_custo_id: formConciliar.centro_custo_id || null,
        conta_bancaria_id: formConciliar.conta_bancaria_id || (modalConciliar as any).conta_bancaria_id || null,
        forma_pagamento: formConciliar.forma_pagamento || '',
        observacoes:     formConciliar.observacoes     || null,
        conciliado: true,
      }).select().single()

      if (error || !novoLanc) {
        setSaving(false)
        toast.error('Erro ao criar lancamento: ' + (error?.message ?? 'desconhecido'))
        return
      }
      await supabase.from('extrato_manual').update({ conciliado: true, lancamento_id: novoLanc.id }).eq('id', modalConciliar.id)
    }

    setSaving(false)
    toast.success('Conciliado com sucesso!')
    setModalConciliar(null)
    load()
  }

  const excluirSelecionados = async () => {
    if (selecionados.size === 0) return
    if (!confirm(`Excluir ${selecionados.size} lancamento(s) do extrato?`)) return
    await supabase.from('extrato_manual').delete().in('id', Array.from(selecionados))
    toast.success(`${selecionados.size} lancamento(s) removidos`)
    setSelecionados(new Set())
    load()
  }

  const excluirTodosPendentes = async (lista: ExtratoManual[]) => {
    if (lista.length === 0) return
    if (!confirm(`Apagar TODOS os ${lista.length} lancamentos pendentes? Isso nao pode ser desfeito.`)) return
    const ids = lista.map(e => e.id)
    await supabase.from('extrato_manual').delete().in('id', ids)
    toast.success(`${ids.length} lancamentos removidos`)
    setSelecionados(new Set())
    load()
  }

  const toggleSelecao = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleTodos = (lista: ExtratoManual[]) => {
    const todosIds = lista.map(e => e.id)
    const todosSelecionados = todosIds.every(id => selecionados.has(id))
    setSelecionados(todosSelecionados ? new Set() : new Set(todosIds))
  }

  const abrirConciliar = (e: ExtratoManual) => {
    setModalConciliar(e)
    setModoConciliar('criar')
    setFormConciliar({
      lancamentoId: '',
      descricao: e.descricao,
      categoria_id: '',
      centro_custo_id: '',
      conta_bancaria_id: (e as any).conta_bancaria_id ?? '',
      forma_pagamento: '',
      observacoes: '',
    })
  }

  const excluir = async (id: string) => {
    await supabase.from('extrato_manual').delete().eq('id', id)
    toast.success('Removido')
    load()
  }

  const estornar = async (e: ExtratoManual) => {
    if (!confirm('Estornar esta conciliacao? O extrato voltara para pendente e o lancamento vinculado voltara para nao conciliado.')) return
    await supabase.from('extrato_manual').update({ conciliado: false, lancamento_id: null }).eq('id', e.id)
    const lancId = (e as any).lancamentos?.id
    if (lancId) {
      await supabase.from('lancamentos').update({ conciliado: false }).eq('id', lancId)
    }
    toast.success('Conciliacao estornada com sucesso')
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <CardTitle>Pendentes de Conciliacao</CardTitle>
              {pendentes.length > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendentes.length}</span>
              )}
            </div>
            {pendentes.length > 0 && (
              <button
                onClick={() => excluirTodosPendentes(pendentes)}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={12} /> Apagar todos pendentes
              </button>
            )}
          </div>
          {selecionados.size > 0 && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm font-medium text-red-700">{selecionados.size} selecionado(s)</p>
              <button
                onClick={excluirSelecionados}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
              >
                <Trash2 size={12} /> Excluir selecionados
              </button>
            </div>
          )}
        </CardHeader>

        {/* Desktop */}
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 w-10">
                  {pendentes.length > 0 && (
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      checked={pendentes.length > 0 && pendentes.every(e => selecionados.has(e.id))}
                      onChange={() => toggleTodos(pendentes)}
                    />
                  )}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Carregando...</td></tr>
              ) : pendentes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Tudo conciliado!</p>
                  </td>
                </tr>
              ) : pendentes.map(e => (
                <tr key={e.id} className={`hover:bg-slate-50 transition-colors ${selecionados.has(e.id) ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      checked={selecionados.has(e.id)}
                      onChange={() => toggleSelecao(e.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
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
                        onClick={() => abrirConciliar(e)}
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
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600 cursor-pointer mt-1 flex-shrink-0"
                  checked={selecionados.has(e.id)}
                  onChange={() => toggleSelecao(e.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{e.descricao}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(e.data)}</p>
                      {(e as any).contas_bancarias?.nome && (
                        <p className="text-xs text-indigo-500">{(e as any).contas_bancarias.nome}</p>
                      )}
                    </div>
                    <p className={`text-sm font-bold flex-shrink-0 ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(e.valor))}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                      {e.tipo === 'credito' ? 'Credito' : 'Debito'}
                    </Badge>
                    <div className="flex gap-1">
                      <button
                        onClick={() => abrirConciliar(e)}
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
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Estorno</th>
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
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => estornar(e)}
                        title="Estornar conciliacao"
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-400 hover:text-amber-600 transition-colors"
                      >
                        <RotateCcw size={14} />
                      </button>
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
                    <button
                      onClick={() => estornar(e)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors mt-1"
                    >
                      <RotateCcw size={11} /> Estornar
                    </button>
                  </div>
                </div>
              </MobileCard>
            ))}
          </CardList>
        </Card>
      )}

      {/* Lançamentos do sistema sem correspondência no extrato */}
      {lancamentos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                <CardTitle>Lancamentos sem extrato bancario</CardTitle>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{lancamentos.length}</span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Registros do sistema ainda nao conciliados com o banco</p>
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
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Forma</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Conta</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lancamentos.map(l => (
                  <tr key={l.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-800">{l.descricao}</p>
                      {l.observacoes && <p className="text-xs text-slate-400 italic mt-0.5">{l.observacoes}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(l.data)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
                        {l.tipo === 'entrada' ? '↑ Entrada' : '↓ Saida'}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 font-bold text-right whitespace-nowrap ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{l.forma_pagamento ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{(l as any).contas_bancarias?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={async () => {
                          await supabase.from('lancamentos').update({ conciliado: true }).eq('id', l.id)
                          toast.success('Marcado como conciliado')
                          load()
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors flex items-center gap-1 mx-auto"
                        title="Marcar como conciliado manualmente"
                      >
                        <CheckCircle size={12} /> Conciliar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>

          {/* Mobile */}
          <CardList>
            {lancamentos.map(l => (
              <MobileCard key={l.id}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{l.descricao}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(l.data)}</p>
                    {(l as any).contas_bancarias?.nome && (
                      <p className="text-xs text-indigo-500">{(l as any).contas_bancarias.nome}</p>
                    )}
                  </div>
                  <p className={`text-base font-bold flex-shrink-0 ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
                    {l.tipo === 'entrada' ? '↑ Entrada' : '↓ Saida'}
                  </Badge>
                  <button
                    onClick={async () => {
                      await supabase.from('lancamentos').update({ conciliado: true }).eq('id', l.id)
                      toast.success('Marcado como conciliado')
                      load()
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium"
                  >
                    <CheckCircle size={12} /> Conciliar
                  </button>
                </div>
              </MobileCard>
            ))}
          </CardList>

          <div className="px-6 py-3 bg-blue-50/50 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Estes lancamentos estao no sistema mas nao foram encontrados no extrato importado.
              Importe o extrato do periodo ou marque como conciliado manualmente.
            </p>
          </div>
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
      <Modal open={!!modalConciliar} onClose={() => setModalConciliar(null)} title="Conciliar Lancamento" size="lg">
        {modalConciliar && (
          <div className="space-y-4">
            {/* Info do extrato */}
            <div className={`rounded-xl p-4 border ${modalConciliar.tipo === 'credito' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Extrato bancario</p>
                  <p className="font-semibold text-slate-800">{modalConciliar.descricao}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(modalConciliar.data)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-xl font-bold ${modalConciliar.tipo === 'credito' ? 'text-green-700' : 'text-red-700'}`}>
                    {modalConciliar.tipo === 'credito' ? '+' : '-'}{formatCurrency(Number(modalConciliar.valor))}
                  </p>
                  <Badge variant={modalConciliar.tipo === 'credito' ? 'success' : 'danger'}>
                    {modalConciliar.tipo === 'credito' ? 'Credito' : 'Debito'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setModoConciliar('criar')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modoConciliar === 'criar' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
              >
                Criar Lancamento
              </button>
              <button
                onClick={() => setModoConciliar('vincular')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modoConciliar === 'vincular' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
              >
                Vincular Existente
              </button>
            </div>

            {modoConciliar === 'criar' ? (
              <div className="space-y-3">
                <Input
                  label="Descricao"
                  value={formConciliar.descricao}
                  onChange={e => setFormConciliar(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descricao do lancamento..."
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Categoria</label>
                    <select
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      value={formConciliar.categoria_id}
                      onChange={e => setFormConciliar(f => ({ ...f, categoria_id: e.target.value }))}
                    >
                      <option value="">Sem categoria</option>
                      {categorias
                        .filter(c => c.tipo === (modalConciliar.tipo === 'credito' ? 'entrada' : 'saida'))
                        .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Centro de Custo</label>
                    <select
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      value={formConciliar.centro_custo_id}
                      onChange={e => setFormConciliar(f => ({ ...f, centro_custo_id: e.target.value }))}
                    >
                      <option value="">Sem centro de custo</option>
                      {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Conta Bancaria</label>
                    <select
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      value={formConciliar.conta_bancaria_id}
                      onChange={e => setFormConciliar(f => ({ ...f, conta_bancaria_id: e.target.value }))}
                    >
                      <option value="">Sem conta especifica</option>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Forma de Pagamento</label>
                    <select
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      value={formConciliar.forma_pagamento}
                      onChange={e => setFormConciliar(f => ({ ...f, forma_pagamento: e.target.value }))}
                    >
                      <option value="">Selecione...</option>
                      <option value="PIX">PIX</option>
                      <option value="TED">TED</option>
                      <option value="DOC">DOC</option>
                      <option value="Boleto">Boleto</option>
                      <option value="Cartao de Credito">Cartao de Credito</option>
                      <option value="Cartao de Debito">Cartao de Debito</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Debito Automatico">Debito Automatico</option>
                      <option value="Transferencia">Transferencia</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Observacoes</label>
                  <textarea
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                    placeholder="Observacoes sobre este lancamento..."
                    value={formConciliar.observacoes}
                    onChange={e => setFormConciliar(f => ({ ...f, observacoes: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Vincular ao lancamento do sistema</label>
                {lancamentos.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-amber-700 font-medium">Nenhum lancamento pendente no sistema</p>
                    <p className="text-xs text-amber-600 mt-1">Use a aba "Criar Lancamento" para registrar este item</p>
                  </div>
                ) : (
                  <select
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    value={formConciliar.lancamentoId}
                    onChange={e => setFormConciliar(f => ({ ...f, lancamentoId: e.target.value }))}
                  >
                    <option value="">Selecione um lancamento...</option>
                    {lancamentos.map(l => (
                      <option key={l.id} value={l.id}>
                        {formatDate(l.data)} · {l.descricao} · {formatCurrency(Number(l.valor))}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setModalConciliar(null)}>Cancelar</Button>
              <Button
                onClick={conciliar}
                disabled={saving || (modoConciliar === 'vincular' && !formConciliar.lancamentoId)}
              >
                {saving ? 'Salvando...' : <><CheckCircle size={14} /> Conciliar</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

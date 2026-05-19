import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function formatCurrencySimple(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export async function GET() {
  // Usa service_role para bypassar RLS (endpoint server-side, seguro)
  // Fallback para anon se service_role nao estiver configurado
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const hoje = new Date()
  const tresM = new Date(hoje)
  tresM.setMonth(tresM.getMonth() + 3)

  const { data: despesas } = await supabase
    .from('despesas')
    .select('*, categorias(nome), centros_custo(nome)')
    .in('status', ['pendente', 'vencido'])
    .gte('data_vencimento', hoje.toISOString().slice(0, 10))
    .lte('data_vencimento', tresM.toISOString().slice(0, 10))
    .order('data_vencimento')

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sistema Fatima//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Vencimentos Fatima',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'X-WR-CALDESC:Despesas a vencer - Sistema Financeiro Fatima',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const d of despesas ?? []) {
    const data = (d.data_vencimento as string).replace(/-/g, '')
    const uid = `${d.id}@sistema-fatima`
    const valor = formatCurrencySimple(Number(d.valor))
    const summary = `💸 ${d.descricao} - ${valor}`
    const cat = (d as any).categorias?.nome ?? ''
    const cc = (d as any).centros_custo?.nome ?? ''
    const desc = [
      `Valor: ${valor}`,
      cat ? `Categoria: ${cat}` : '',
      cc ? `Centro de Custo: ${cc}` : '',
      `Status: ${d.status}`,
      `Vencimento: ${new Date(d.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}`,
    ].filter(Boolean).join('\\n')

    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'

    linhas.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${data}`,
      `DTEND;VALUE=DATE:${data}`,
      `DTSTAMP:${now}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      d.status === 'vencido' ? 'PRIORITY:1' : 'PRIORITY:5',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Lembrete: ${d.descricao} vence amanha - ${valor}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT3H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Hoje vence: ${d.descricao} - ${valor}`,
      'END:VALARM',
      'END:VEVENT'
    )
  }

  linhas.push('END:VCALENDAR')
  const ics = linhas.join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': 'inline; filename="vencimentos-fatima.ics"',
    },
  })
}

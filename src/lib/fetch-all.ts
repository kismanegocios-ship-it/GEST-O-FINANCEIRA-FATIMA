/**
 * Busca TODAS as linhas de uma consulta Supabase, contornando o limite
 * padrao de 1000 linhas do PostgREST (que trunca silenciosamente e corrompe
 * calculos de saldo com muitos lancamentos). Pagina em blocos ate acabar.
 *
 * Uso: passe uma FUNCAO que cria a query do zero a cada chamada (o builder
 * nao pode ser reutilizado depois de aplicar .range()).
 *
 *   const linhas = await fetchAllRows(() =>
 *     supabase.from('lancamentos').select('valor, tipo').lt('data', ini))
 */
export async function fetchAllRows<T = unknown>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<T[]> {
  const PAGE = 1000
  let from = 0
  const todas: T[] = []
  for (;;) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error || !data) break
    todas.push(...data)
    if (data.length < PAGE) break
    from += PAGE
    if (from > 500000) break // trava de seguranca contra loop infinito
  }
  return todas
}

import { number, queryJson, QueryError, type Transport } from '../network.ts'
export async function deepseekBalance(key: string, transport?: Transport, signal?: AbortSignal): Promise<number> {
  const data = await queryJson('https://api.deepseek.com/user/balance', { Authorization: `Bearer ${key}` }, transport, signal)
  const balance = Array.isArray(data?.balance_infos) ? data.balance_infos.find((b: any) => b?.currency === 'CNY') : null
  const result = number(balance?.total_balance)
  if (result === null) throw new QueryError('余额响应缺少人民币 total_balance')
  return result
}

import { number, queryJson, QueryError, type Transport } from '../network.ts'
export async function moonshotBalance(key: string, transport?: Transport, signal?: AbortSignal): Promise<number> {
  const data = await queryJson('https://api.moonshot.cn/v1/users/me/balance', { Authorization: `Bearer ${key}` }, transport, signal)
  const result = number(data?.data?.available_balance)
  if (data?.code !== undefined && data.code !== 0 || result === null) throw new QueryError('余额响应格式不兼容')
  return result
}

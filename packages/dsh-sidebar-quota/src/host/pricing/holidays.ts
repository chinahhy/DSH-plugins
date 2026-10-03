/** Government published holidays, versioned data; weekend make-up work stays weekend under DeepSeek's explicit Monday-Friday rule. */
export const HOLIDAY_SOURCE = 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'
const ranges: Record<number, string[][]> = {
  2026: [['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']],
}
export function chinaDate(at: number): { day: string; weekday: number; minute: number; year: number } {
  const d = new Date(at + 8 * 3600_000)
  return { day: d.toISOString().slice(0,10), weekday: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes(), year: d.getUTCFullYear() }
}
export function holiday(at: number): boolean | null {
  const { day, year } = chinaDate(at); if (!ranges[year]) return null
  return ranges[year].some(([start,end]) => day >= `${year}-${start}` && day <= `${year}-${end}`)
}

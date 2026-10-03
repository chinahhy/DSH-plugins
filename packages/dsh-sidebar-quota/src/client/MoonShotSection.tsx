import type { SidebarQuotaState } from '../shared/types.ts'
import { ProviderSection,ValueRow,money,ESTIMATE,lastUpdated } from './ProviderSection.tsx'
export function MoonShotSection({state}:{state:SidebarQuotaState['moonshot']|undefined}) {
  return <ProviderSection name="MoonShot">
    <ValueRow label="今日消费" value={money(state?.todaySpend)+(state?.incompletePricing?' *':'')} title={[ESTIMATE,state?.usageWarning].filter(Boolean).join('；')} stale={!!state?.usageWarning}/>
    <ValueRow label="余额" value={money(state?.balance)} title={[state?.error,lastUpdated(state?.updatedAt)].filter(Boolean).join('；')} stale={state?.stale}/>
  </ProviderSection>
}

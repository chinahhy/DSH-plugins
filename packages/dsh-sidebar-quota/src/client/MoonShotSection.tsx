import type { SidebarQuotaState } from '../shared/types.ts'
import { ProviderSection,ValueRow,money,ESTIMATE,lastUpdated,type ProviderControls } from './ProviderSection.tsx'
export function MoonShotSection({state,controls}:{state:SidebarQuotaState['moonshot']|undefined;controls:ProviderControls}) {
  return <ProviderSection name="MoonShot" controls={controls} updatedAt={state?.updatedAt}>
    <ValueRow label="今日消费" value={money(state?.todaySpend)+(state?.incompletePricing?' *':'')} title={[ESTIMATE,state?.usageWarning].filter(Boolean).join('；')} stale={!!state?.usageWarning}/>
    <ValueRow label="余额" value={money(state?.balance)} title={[state?.error,lastUpdated(state?.updatedAt)].filter(Boolean).join('；')} stale={state?.stale}/>
  </ProviderSection>
}

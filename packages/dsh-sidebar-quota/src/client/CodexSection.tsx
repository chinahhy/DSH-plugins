import type { SidebarQuotaState } from '../shared/types.ts'
import { ProviderSection } from './ProviderSection.tsx'
import { QuotaBar } from './QuotaBar.tsx'
export function CodexSection({state}:{state:SidebarQuotaState['codex']|undefined}) {
  return <ProviderSection name="ChatGPT / Codex">
    <QuotaBar label="5h" value={state?.fiveHourRemaining??null} resetAt={state?.fiveHourResetAt} error={state?.error}/>
    <QuotaBar label="Weekly" value={state?.weeklyRemaining??null} resetAt={state?.weeklyResetAt} error={state?.error}/>
  </ProviderSection>
}

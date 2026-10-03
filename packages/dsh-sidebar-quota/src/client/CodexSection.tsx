import type { SidebarQuotaState } from '../shared/types.ts'
import { ProviderSection,type ProviderControls } from './ProviderSection.tsx'
import { QuotaBar } from './QuotaBar.tsx'
export function CodexSection({state,controls}:{state:SidebarQuotaState['codex']|undefined;controls:ProviderControls}) {
  return <ProviderSection name="ChatGPT / Codex" controls={controls} updatedAt={state?.updatedAt}>
    <QuotaBar label="5h" value={state?.fiveHourRemaining??null} resetAt={state?.fiveHourResetAt} error={state?.error}/>
    <QuotaBar label="Weekly" value={state?.weeklyRemaining??null} resetAt={state?.weeklyResetAt} error={state?.error}/>
  </ProviderSection>
}

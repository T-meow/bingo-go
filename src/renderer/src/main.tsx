import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppV2 from './AppV2'
import { AppearanceProvider } from './theme/AppearanceProvider'
import { UserProfileProvider } from './profile/UserProfileProvider'
import './styles.css'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/conversations.css'
import './styles/workspace.css'
import './styles/settings.css'
import './styles/overlays.css'

const root = document.getElementById('root')

if (!root) throw new Error('Renderer root element is missing')
const rendererRoot = createRoot(root)

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-fixture')) {
    const { installUiFixture } = await import('./dev/installUiFixture')
    installUiFixture()
  }

  rendererRoot.render(
    <StrictMode>
      <AppearanceProvider>
        <UserProfileProvider>
          <AppV2 />
        </UserProfileProvider>
      </AppearanceProvider>
    </StrictMode>
  )
}

void bootstrap()

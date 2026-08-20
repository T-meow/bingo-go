import { StrictMode } from 'react'
import { App as AntApp } from 'antd'
import { createRoot } from 'react-dom/client'
import AppV2 from './AppV2'
import { AppearanceProvider } from './theme/AppearanceProvider'
import { UserProfileProvider } from './profile/UserProfileProvider'
import './styles.css'

const root = document.getElementById('root')

if (!root) throw new Error('Renderer root element is missing')

createRoot(root).render(
  <StrictMode>
    <AntApp>
      <AppearanceProvider>
      <UserProfileProvider>
        <AppV2 />
      </UserProfileProvider>
      </AppearanceProvider>
    </AntApp>
  </StrictMode>
)

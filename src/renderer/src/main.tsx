import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppearanceProvider } from './theme/AppearanceProvider'
import { UserProfileProvider } from './profile/UserProfileProvider'
import './styles.css'

const root = document.getElementById('root')

if (!root) throw new Error('Renderer root element is missing')

createRoot(root).render(
  <StrictMode>
    <AppearanceProvider>
      <UserProfileProvider>
        <App />
      </UserProfileProvider>
    </AppearanceProvider>
  </StrictMode>
)

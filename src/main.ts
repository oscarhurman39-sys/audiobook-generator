import './app.css'
import App from './App.svelte'
import { mount } from 'svelte'
import logger from './lib/utils/logger'

// A phone has no devtools. Record uncaught errors and rejected promises in the
// logger's buffer so the Diagnostics screen can hand them over.
window.addEventListener('error', (event) => {
  logger.error('[Uncaught]', event.message, event.error instanceof Error ? event.error.stack : '')
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  logger.error(
    '[UnhandledRejection]',
    reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  )
})

const target = document.getElementById('app')
if (!target) throw new Error('App element not found')

const app = mount(App, { target })

export default app

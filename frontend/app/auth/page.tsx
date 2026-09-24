'use client'

import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'
import { useEffect } from 'react'

/**
 * Entra redirect URI (register http://<origin>/auth as a "Single-page application" URI).
 * MSAL v5 requires this bridge page: it hands the auth response back to the page that started
 * the login (redirect) or to the opener/iframe (popup, silent renewal). Deliberately outside
 * any MsalProvider so nothing else consumes the response first.
 */
const AuthRedirectPage = () => {
  useEffect(() => {
    void broadcastResponseToMainFrame()
  }, [])

  return null
}

export default AuthRedirectPage

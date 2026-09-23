'use client'

/* eslint-disable i18next/no-literal-string -- auth test page, no i18n setup yet */
import {
  type AccountInfo,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser'
import {
  AuthenticatedTemplate,
  MsalProvider,
  UnauthenticatedTemplate,
  useMsal,
} from '@azure/msal-react'
import { useCallback, useEffect, useState } from 'react'

// ponytail: public identifiers of the mpp.bratislava.sk app registration, shared by every
// cluster; move to .env.build.* if a cluster ever gets its own registration.
const ENTRA_TENANT_ID = 'fe69e74e-1e66-4fcb-99c5-58e4a2d2a063'
const ENTRA_CLIENT_ID = 'd6588604-0ef7-46ae-8601-5e5c8ca49493'
const API_SCOPES = [`api://${ENTRA_CLIENT_ID}/access_as_user`]

const msal = new PublicClientApplication({
  auth: {
    clientId: ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`,
    // Relative: resolved against the current origin, so it works in every cluster.
    redirectUri: '/auth',
    postLogoutRedirectUri: '/',
  },
  cache: { cacheLocation: 'sessionStorage' },
})

const MOCK_ENDPOINTS = ['any', 'roles', 'admin'] as const
type MockEndpoint = (typeof MOCK_ENDPOINTS)[number]

const ENDPOINT_LABELS: Record<MockEndpoint, string> = {
  any: 'Any signed-in user',
  roles: 'admin or process-partner',
  admin: 'admin only',
}

/** Decodes a JWT payload for display only; the backend is what verifies it. */
const decodeJwt = (token: string): Record<string, unknown> => {
  const base64 = (token.split('.')[1] ?? '').replaceAll('-', '+').replaceAll('_', '/')
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

const LoginScreen = () => {
  const { instance } = useMsal()

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-semibold">mpp.bratislava.sk</h1>
      <button
        type="button"
        className="rounded-sm bg-black px-6 py-3 text-white hover:bg-gray-800"
        onClick={() => void instance.loginRedirect({ scopes: API_SCOPES })}
      >
        Prihlásiť sa cez Microsoft
      </button>
    </div>
  )
}

const TokenPage = ({ account }: { account: AccountInfo }) => {
  const { instance } = useMsal()
  const [token, setToken] = useState<string>()
  const [tokenError, setTokenError] = useState<string>()
  const [results, setResults] = useState<Partial<Record<MockEndpoint, string>>>({})

  // Cached until close to expiry; MSAL refreshes it silently, else we re-run the redirect.
  const getToken = useCallback(async () => {
    try {
      const { accessToken } = await instance.acquireTokenSilent({ scopes: API_SCOPES, account })
      setToken(accessToken)
      setTokenError(undefined)

      return accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({ scopes: API_SCOPES, account })
      }
      setTokenError(String(error))
      throw error
    }
  }, [instance, account])

  useEffect(() => {
    // Failure is surfaced via tokenError.
    getToken().catch(() => {})
  }, [getToken])

  const call = async (endpoint: MockEndpoint) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mock/${endpoint}`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      })
      const body = await response.text()
      setResults((previous) => ({ ...previous, [endpoint]: `${response.status}\n${body}` }))
    } catch (error) {
      setResults((previous) => ({ ...previous, [endpoint]: String(error) }))
    }
  }

  const claims = token ? decodeJwt(token) : undefined

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{account.name ?? account.username}</h1>
        <button
          type="button"
          className="rounded-sm border px-4 py-2 hover:bg-gray-100"
          onClick={() => void instance.logoutRedirect({ account })}
        >
          Odhlásiť sa
        </button>
      </div>

      <label className="flex flex-col gap-2">
        <span className="font-semibold">Access token (paste into Swagger → Authorize)</span>
        <textarea
          readOnly
          rows={8}
          value={token ?? ''}
          className="rounded-sm border p-2 font-mono text-xs"
        />
      </label>
      {tokenError && <p className="text-red-700">Token error: {tokenError}</p>}
      <button
        type="button"
        className="self-start rounded-sm border px-4 py-2 hover:bg-gray-100"
        disabled={!token}
        onClick={() => void navigator.clipboard.writeText(token ?? '')}
      >
        Kopírovať token
      </button>

      {claims && (
        <pre className="overflow-x-auto rounded-sm bg-gray-100 p-2 text-xs">
          {JSON.stringify(
            {
              name: claims.name,
              roles: claims.roles ?? [],
              scp: claims.scp,
              aud: claims.aud,
              exp: claims.exp,
            },
            null,
            2,
          )}
        </pre>
      )}

      <div className="flex flex-col gap-3">
        {MOCK_ENDPOINTS.map((endpoint) => (
          <div key={endpoint} className="flex flex-col gap-2">
            <button
              type="button"
              className="self-start rounded-sm bg-black px-4 py-2 text-white hover:bg-gray-800"
              onClick={() => void call(endpoint)}
            >
              GET /mock/{endpoint} ({ENDPOINT_LABELS[endpoint]})
            </button>
            {results[endpoint] && (
              <pre className="overflow-x-auto rounded-sm bg-gray-100 p-2 text-xs">
                {results[endpoint]}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ponytail: first cached account; add an account picker if multi-account sign-in is ever needed.
const SignedIn = () => {
  const { accounts } = useMsal()

  return accounts[0] ? <TokenPage account={accounts[0]} /> : null
}

const HomePage = () => {
  return (
    <MsalProvider instance={msal}>
      <main className="flex min-h-screen items-center justify-center p-8">
        <UnauthenticatedTemplate>
          <LoginScreen />
        </UnauthenticatedTemplate>
        <AuthenticatedTemplate>
          <SignedIn />
        </AuthenticatedTemplate>
      </main>
    </MsalProvider>
  )
}

export default HomePage

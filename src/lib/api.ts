export type ApiErrorShape = { error?: string; offer?: Offer }

export type Offer = {
  regularPriceMxn: number
  launchPriceMxn: number
  currency: 'MXN'
  message: string
  paymentMethods: string[]
  recurring: boolean
}

export type BackendPhoto = { id: string; position: number; url: string }

export type BackendUser = {
  id: string
  email: string
  role: string
  profileIdentity?: 'woman' | 'man' | 'prefer-not-to-say' | null
  name: string
  age: number
  country?: string
  city: string
  bio: string
  occupation?: string | null
  salary?: string | null
  economicActivity?: string | null
  status: string
  paid?: boolean
  plan?: string | null
  photos?: BackendPhoto[]
  createdAt?: string | null
  paidAt?: string | null
}

export class ApiError extends Error {
  status: number
  payload: ApiErrorShape

  constructor(status: number, payload: ApiErrorShape) {
    super(payload.error || 'No se pudo completar la solicitud.')
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as T & ApiErrorShape
  if (!response.ok) throw new ApiError(response.status, payload)
  return payload as T
}

export function photoFor(user: BackendUser): string {
  return user.photos?.[0]?.url || '/sugar-daddy-lockup-clean.png'
}

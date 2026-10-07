export type AppSession = 'onboarding' | 'auth' | 'setup' | 'app'
export type AppTab = 'discover' | 'matches' | 'chats' | 'profile'
export type UserRole = 'sugar-daddy' | 'sugar-baby'

export interface UserProfile {
  name: string
  age: number
  city: string
  role: UserRole
  bio: string
  interests: string[]
  image: string
  email: string
}

export interface Candidate {
  id: string
  name: string
  age: number
  city: string
  image: string
  verified?: boolean
  online?: boolean
  distance: string
  intro: string
  interests: string[]
  mutualLike?: boolean
  roleLabel: string
}

export interface Match {
  id: string
  candidateId: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  sender: 'me' | 'them'
  text: string
  createdAt: string
}

export interface AppState {
  version: 1
  session: AppSession
  activeTab: AppTab
  user: UserProfile | null
  likedIds: string[]
  passedIds: string[]
  matches: Match[]
  messages: Record<string, ChatMessage[]>
}

export const STORAGE_KEY = 'sugar-daddy-state:v1'

export const candidates: Candidate[] = [
  {
    id: 'camila',
    name: 'Camila',
    age: 27,
    city: 'Ciudad de México',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=88',
    verified: true,
    online: true,
    distance: 'A 4 km de ti',
    intro: 'Me gustan las conversaciones que se sienten fáciles, viajar y descubrir lugares nuevos.',
    interests: ['Viajes', 'Arte', 'Café'],
    mutualLike: true,
    roleLabel: 'Busca una conexión real',
  },
  {
    id: 'mariana',
    name: 'Mariana',
    age: 30,
    city: 'Monterrey',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=88',
    verified: true,
    distance: 'A 12 km de ti',
    intro: 'Diseño, buena comida y escapadas de fin de semana. Aquí para conocer a alguien auténtico.',
    interests: ['Diseño', 'Restaurantes', 'Yoga'],
    roleLabel: 'Abierta a conocer',
  },
  {
    id: 'sofia',
    name: 'Sofía',
    age: 25,
    city: 'Guadalajara',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=88',
    online: true,
    distance: 'A 18 km de ti',
    intro: 'Siempre tengo una playlist para el momento. Me encanta reírme y los planes espontáneos.',
    interests: ['Música', 'Cine', 'Viajes'],
    roleLabel: 'Le gusta conversar',
  },
  {
    id: 'valentina',
    name: 'Valentina',
    age: 29,
    city: 'Puebla',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=88',
    verified: true,
    distance: 'A 25 km de ti',
    intro: 'Un brunch, una galería y una charla larga siempre son un buen plan.',
    interests: ['Brunch', 'Moda', 'Lectura'],
    roleLabel: 'Busca algo especial',
  },
  {
    id: 'nicolas',
    name: 'Nicolás',
    age: 32,
    city: 'Querétaro',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=88',
    online: true,
    distance: 'A 31 km de ti',
    intro: 'Emprendedor, cocinero aficionado y fan de los viajes con buena compañía.',
    interests: ['Cocina', 'Negocios', 'Montaña'],
    roleLabel: 'Busca una conexión real',
  },
  {
    id: 'daniel',
    name: 'Daniel',
    age: 35,
    city: 'Ciudad de México',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=88',
    verified: true,
    distance: 'A 7 km de ti',
    intro: 'Valoro la honestidad, las metas claras y disfrutar los pequeños detalles.',
    interests: ['Golf', 'Viajes', 'Vino'],
    roleLabel: 'Quiere conocerte',
  },
]

const initialState: AppState = {
  version: 1,
  session: 'onboarding',
  activeTab: 'discover',
  user: null,
  likedIds: [],
  passedIds: [],
  matches: [],
  messages: {},
}

export function createInitialState(): AppState {
  return {
    ...initialState,
    likedIds: [],
    passedIds: [],
    matches: [],
    messages: {},
  }
}

export function loadState(): AppState {
  if (typeof window === 'undefined') return createInitialState()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (parsed.version !== 1) return createInitialState()
    return {
      ...createInitialState(),
      ...parsed,
      likedIds: Array.isArray(parsed.likedIds) ? parsed.likedIds : [],
      passedIds: Array.isArray(parsed.passedIds) ? parsed.passedIds : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
    }
  } catch {
    return createInitialState()
  }
}

export function saveState(state: AppState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function getCandidate(candidateId: string) {
  return candidates.find((candidate) => candidate.id === candidateId)
}

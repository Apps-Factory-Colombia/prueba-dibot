import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronRight, Compass, CreditCard, Flower2, Gem, Gift, Heart, ImagePlus, LogOut, MapPin, MessageCircle, MessageSquare, Pencil, Plane, Search, Send, ShieldCheck, Shirt, ShoppingBag, Sparkles, UserRound, WalletCards, X } from 'lucide-react'
import { ApiError, apiRequest, photoFor, type BackendUser, type Offer } from './lib/api'

type AppTab = 'discover' | 'matches' | 'chats' | 'gifts' | 'profile'
type AuthCredentials = { email: string; password: string }
type ProfileIdentity = 'woman' | 'man' | 'prefer-not-to-say'
type Match = { id: string; createdAt: string | null; user: BackendUser }
type ChatMessage = { id: string; matchId: string; senderId: string; body: string; createdAt: string }
type SupportMessage = { id: string; userId: string; senderRole: 'admin' | 'user'; body: string; createdAt: string }
const imageFileNamePattern = /\.(apng|avif|bmp|gif|heic|heif|jpe?g|jfif|png|svgz?|tiff?|webp)$/i

function fallbackImageToPng(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget
  if (image.dataset.fallback === 'png') return
  image.dataset.fallback = 'png'
  image.src = image.src.replace(/\.webp(?=([?#]|$))/i, '.png')
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'brand brand--compact' : 'brand'}><img src="/sugar-daddy-lockup-transparent.png" alt="Sugar Daddy" fetchPriority="high" decoding="async" /></div>
}

function Welcome({ onStart }: { onStart: () => void }) {
  return <main className="public-screen public-screen--welcome"><section className="welcome-card"><div className="welcome-photo"><img src="/sugar-daddy-hero-couple.webp" alt="Pareja adulta sonriendo" loading="eager" fetchPriority="high" decoding="async" onError={fallbackImageToPng} /><div className="welcome-photo__shade" /><div className="welcome-head"><Brand /><span className="age-pill"><ShieldCheck size={13} /> +18</span></div></div><div className="welcome-content"><h1>Busca, Conecta y haz acuerdos económicos</h1><div className="welcome-phrases"><span><i className="phrase-emoji" aria-hidden="true">💎</i> ¿Y tú ya tienes un novio millonario?</span><span><i className="phrase-emoji" aria-hidden="true">🎁</i> Recibe regalos y canjéalos por dinero en efectivo</span><span><i className="phrase-emoji" aria-hidden="true">✈️</i> Viaja por el mundo con tu sugar daddy</span><span><i className="phrase-emoji" aria-hidden="true">💬</i> Chatea, diviértete y haz dinero</span></div><button className="button button--primary button--wide" onClick={onStart}>Crear mi perfil <ArrowRight size={18} /></button><small className="privacy-line"><ShieldCheck size={14} /> Comunidad para mayores de 18 años.</small></div></section></main>
}

function Auth({ onRegister, onLogin }: { onRegister: (credentials: AuthCredentials) => void; onLogin: (credentials: AuthCredentials) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checkingEmail, setCheckingEmail] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) return setError('Escribe un correo válido.')
    if (password.length < 8) return setError('Usa al menos 8 caracteres.')
    const credentials = { email: normalizedEmail, password }
    if (mode === 'login') return onLogin(credentials)
    setCheckingEmail(true)
    try {
      const response = await apiRequest<{ data: { available: boolean } }>('/api/auth/check-email', { method: 'POST', body: JSON.stringify({ email: normalizedEmail }) })
      if (!response.data.available) return setError('Este correo ya está registrado. Inicia sesión para continuar.')
      onRegister(credentials)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo validar el correo.')
    } finally {
      setCheckingEmail(false)
    }
  }
  return (
    <main className="form-screen">
      <section className="auth-hero">
        <img src="/sugar-daddy-auth-daddy.webp" alt="Sugar daddy adulto sonriendo" loading="eager" fetchPriority="high" decoding="async" onError={fallbackImageToPng} />
        <div className="auth-hero__shade" />
        <header className="simple-header"><Brand compact /><span className="age-pill"><ShieldCheck size={13} /> +18</span></header>
      </section>
      <section className="form-card">
        <div className="segmented">
          <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setError('') }}>Crear cuenta</button>
          <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError('') }}>Iniciar sesión</button>
        </div>
        <div className="form-heading"><h2>{mode === 'register' ? 'Comienza con tu correo y crea una nueva contraseña' : 'Qué gusto verte'}</h2></div>
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">Correo electrónico<input className="text-input" type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError('') }} placeholder="tu@correo.com" /></label>
          <label className="field-label">Contraseña<input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button button--primary button--wide" type="submit" disabled={checkingEmail}>{checkingEmail ? 'Validando correo…' : mode === 'register' ? 'Continuar' : 'Entrar'} {!checkingEmail && <ArrowRight size={18} />}</button>
        </form>
        <div className="auth-footnote"><ShieldCheck size={15} /><span>Tus datos se mantienen privados y seguros.</span></div>
      </section>
    </main>
  )
}

function Setup({ credentials, onComplete }: { credentials: AuthCredentials; onComplete: (user: BackendUser, offer?: Offer) => void }) {
  const totalSteps = 4
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<'sugar-daddy' | 'sugar-baby'>('sugar-baby')
  const [profileIdentity, setProfileIdentity] = useState<ProfileIdentity | ''>('')
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [occupation, setOccupation] = useState('')
  const [salary, setSalary] = useState('')
  const [economicActivity, setEconomicActivity] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registration, setRegistration] = useState<{ user: BackendUser; offer?: Offer } | null>(null)
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])
  const chooseProfileIdentity = (identity: ProfileIdentity) => {
    setProfileIdentity(identity)
    setRole(identity === 'man' ? 'sugar-daddy' : 'sugar-baby')
  }
  const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? [])
    if (!selected.length) return
    if (selected.some((file) => !file.type.toLowerCase().startsWith('image/') && !imageFileNamePattern.test(file.name))) {
      setError('Solo puedes seleccionar imágenes.')
      event.currentTarget.value = ''
      return
    }
    if (files.length + selected.length > 3) {
      setError(`Solo necesitas 3 fotos. Te faltan ${3 - files.length}.`)
      event.currentTarget.value = ''
      return
    }
    setFiles((current) => [...current, ...selected])
    setError('')
    event.currentTarget.value = ''
  }
  const validateStep = () => {
    const numericAge = Number(age)
    if (step === 0 && !profileIdentity) return 'Elige el perfil que mejor te represente.'
    if (step === 1 && (!age.trim() || !Number.isInteger(numericAge) || numericAge < 18 || numericAge > 99 || !name.trim() || !country.trim() || !city.trim())) return 'Completa tu nombre o apodo, edad, país y ciudad. La edad debe estar entre 18 y 99 años.'
    if (step === 2 && files.length !== 3) return 'Sube exactamente 3 fotos para continuar.'
    if (step === 3 && role === 'sugar-daddy' && (!occupation.trim() || !salary.trim() || !economicActivity.trim())) return 'Completa ocupación, salario y actividad económica.'
    return ''
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const stepError = validateStep()
    if (step < totalSteps - 1) { if (stepError) return setError(stepError); return setStep((value) => value + 1) }
    if (stepError) return setError(stepError)
    setBusy(true)
    try {
      const response = registration ?? (await apiRequest<{ data: { user: BackendUser; offer?: Offer } }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, role, profileIdentity, name, age: Number(age), country, city, bio, occupation, salary, economicActivity }) })).data
      if (!registration) setRegistration(response)
      const form = new FormData(); files.forEach((file) => form.append('photos', file))
      await apiRequest('/api/profile/photos', { method: 'POST', body: form })
      const me = await apiRequest<{ data: { user: BackendUser } }>('/api/auth/me')
      onComplete(me.data.user, response.offer)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo completar el registro.') } finally { setBusy(false) }
  }
  const goBack = () => { if (busy) return; setError(''); setStep((value) => Math.max(0, value - 1)) }
  return <main className="form-screen setup-screen"><header className="setup-header"><button type="button" className={step === 0 ? 'icon-button setup-back is-hidden' : 'icon-button setup-back'} onClick={goBack} disabled={step === 0} aria-label="Paso anterior"><ArrowLeft size={19} /></button><Brand compact /><span className="step-label">Paso {step + 1} de {totalSteps}</span></header><div className="setup-progress" aria-label={`Progreso: paso ${step + 1} de ${totalSteps}`}>{Array.from({ length: totalSteps }).map((_, index) => <span className={index <= step ? 'is-active' : ''} key={index} />)}</div><form className="setup-flow" onSubmit={submit}>
    {step === 0 && <section className="setup-step setup-step--role"><span className="eyebrow"><Heart size={14} /> Tu perfil comienza aquí</span><h1>Elige el perfil que mejor te represente</h1><p>Selecciona la opción que prefieras para continuar.</p><div className="role-grid"><button type="button" className={profileIdentity === 'woman' ? 'role-choice is-active' : 'role-choice'} onClick={() => chooseProfileIdentity('woman')}><Heart size={22} /><b>Soy mujer</b></button><button type="button" className={profileIdentity === 'man' ? 'role-choice is-active' : 'role-choice'} onClick={() => chooseProfileIdentity('man')}><BadgeCheck size={22} /><b>Soy Hombre</b></button><button type="button" className={profileIdentity === 'prefer-not-to-say' ? 'role-choice is-active' : 'role-choice'} onClick={() => chooseProfileIdentity('prefer-not-to-say')}><UserRound size={22} /><b>Prefiero no decirlo</b></button></div></section>}
    {step === 1 && <section className="setup-step"><span className="eyebrow"><UserRound size={14} /> Paso 2 · Datos básicos</span><h1>Lo esencial sobre ti.</h1><p>Estos datos ayudan a presentar tu perfil de forma clara.</p><div className="setup-fields two-col"><label className="field-label">Nombre o apodo<input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cómo te llamamos" autoFocus /></label><label className="field-label">Edad<input className="text-input" type="number" min="18" max="99" value={age} onChange={(event) => setAge(event.target.value)} placeholder="18+" /></label></div><label className="field-label">País<input className="text-input" value={country} onChange={(event) => setCountry(event.target.value)} placeholder="País donde vives" autoComplete="country-name" /></label><label className="field-label">Ciudad<input className="text-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ciudad donde vives" /></label></section>}
    {step === 2 && <section className="setup-step setup-step--photos"><span className="eyebrow"><ImagePlus size={14} /> Paso 3 · Tus fotos</span><h1>Muéstrate tal como eres.</h1><p>Agrega 3 fotos reales para que las conexiones conozcan tu energía.</p><div className="photo-upload"><div className="photo-grid">{previews.map((preview, index) => <img key={preview} src={preview} alt={`Foto ${index + 1}`} />)}{Array.from({ length: 3 - previews.length }).map((_, index) => <label className="photo-slot" key={`slot-${index}`}><ImagePlus size={24} /><span>Foto {previews.length + index + 1}</span><input type="file" accept="image/*" multiple onChange={pickFiles} /></label>)}</div></div></section>}
    {step === 3 && <section className="setup-step setup-step--profile"><span className="eyebrow"><Sparkles size={14} /> Paso 4 · Tu historia</span><h1>Haz que te conozcan.</h1><p>Una frase auténtica puede iniciar una gran conversación.</p>{role === 'sugar-daddy' && <div className="men-fields"><div className="section-caption">Información profesional <small>requerida para hombres</small></div><label className="field-label">Ocupación<input className="text-input" value={occupation} onChange={(event) => setOccupation(event.target.value)} placeholder="Ej. Empresario" /></label><label className="field-label">Salario mensual<input className="text-input" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Ej. $80,000 MXN" /></label><label className="field-label">Actividad económica<textarea className="text-input text-area" value={economicActivity} onChange={(event) => setEconomicActivity(event.target.value)} placeholder="Cuéntanos a qué te dedicas" /></label></div>}<label className="field-label">Sobre ti <small className="optional">Opcional</small><textarea className="text-input text-area" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Lo que te gustaría compartir..." /></label></section>}
    {error && <p className="form-error setup-error">{error}</p>}<div className="setup-actions">{step > 0 && <button type="button" className="outline-button" onClick={goBack} disabled={busy}><ArrowLeft size={16} /> Atrás</button>}<button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Guardando tu perfil…' : step === totalSteps - 1 ? 'Completar registro' : 'Continuar'} {step === totalSteps - 1 ? <Check size={18} /> : <ArrowRight size={18} />}</button></div></form></main>
}

function OfferModal({ offer, onClose, onUserUpdated }: { offer: Offer; onClose: () => void; onUserUpdated: (user: BackendUser) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const buy = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await apiRequest<{ data?: { active?: boolean; checkoutUrl?: string } }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ paymentMethod: 'card' }) })
      if (response.data?.active) {
        const account = await apiRequest<{ data: { user: BackendUser } }>('/api/auth/me')
        onUserUpdated(account.data.user)
        onClose()
      } else if (response.data?.checkoutUrl) window.location.assign(response.data.checkoutUrl)
      else setError('No se pudo abrir el checkout de Stripe.')
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo iniciar el pago.') }
    finally { setBusy(false) }
  }

  return createPortal(<div className="overlay overlay--offer"><section className="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title">
    <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
    <div className="offer-modal__hero"><div className="offer-icon"><Sparkles size={22} /></div><span className="offer-modal__badge">OFERTA DE LANZAMIENTO</span><h2 id="offer-title">Conecta sin límites</h2><p>Paga solo <b>${offer.launchPriceMxn} MXN</b> al mes.</p></div>
    <div className="offer-price"><s>${offer.regularPriceMxn}</s><strong>${offer.launchPriceMxn}</strong><span>MXN / mes</span></div>
    <div className="offer-benefits"><span><Check size={15} /> Busca y chatea sin límites</span><span><Check size={15} /> Recibe regalos</span><span><Check size={15} /> Activación al confirmar el pago</span></div>
    <div className="payment-methods"><button type="button" className="is-active" disabled><CreditCard size={16} /> Pago mensual con tarjeta</button></div>
    {error && <p className="form-error">{error}</p>}
    <button className="button button--primary button--wide" onClick={() => void buy()} disabled={busy}>{busy ? 'Abriendo Stripe…' : 'Continuar al pago'} <ArrowRight size={18} /></button>
    <button className="text-button" onClick={onClose} disabled={busy}>Ahora no</button>
  </section></div>, document.body)
}

function PaymentReturnModal({ result, sessionId, onClose, onUserUpdated }: { result: 'success' | 'cancelled'; sessionId: string | null; onClose: (confirmed: boolean) => void; onUserUpdated: (user: BackendUser) => void }) {
  const [status, setStatus] = useState<'checking' | 'active' | 'pending'>(result === 'cancelled' ? 'pending' : 'checking')
  const [checking, setChecking] = useState(false)
  const refresh = useCallback(async () => {
    const billingStatusUrl = sessionId
      ? `/api/billing/status?session_id=${encodeURIComponent(sessionId)}`
      : '/api/billing/status'
    const payment = await apiRequest<{ data: { paid: boolean } }>(billingStatusUrl)
    const response = await apiRequest<{ data: { user: BackendUser } | null }>('/api/auth/me')
    const latest = response.data?.user
    if (latest) {
      onUserUpdated(latest)
    }
    return payment.data.paid
  }, [onUserUpdated, sessionId])

  useEffect(() => {
    if (result !== 'success') return
    let cancelled = false
    let attempts = 0
    let timer: number | undefined
    const poll = async () => {
      try {
        const active = await refresh()
        if (cancelled) return
        if (active) { setStatus('active'); return }
      } catch { if (cancelled) return }
      attempts += 1
      if (attempts >= 15) { setStatus('pending'); return }
      timer = window.setTimeout(() => void poll(), 2000)
    }
    void poll()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [refresh, result])

  const checkAgain = async () => {
    setChecking(true)
    try { setStatus(await refresh() ? 'active' : 'pending') }
    catch { setStatus('pending') }
    finally { setChecking(false) }
  }
  const title = result === 'cancelled' ? 'Pago cancelado' : status === 'active' ? 'Cuenta activada' : status === 'pending' ? 'Pago aún sin confirmar' : 'Confirmando tu pago'
  const message = result === 'cancelled'
    ? 'No se realizó el cobro y tu cuenta sigue sin activar. Puedes volver a intentarlo cuando quieras.'
    : status === 'active'
      ? 'Stripe confirmó el pago. Ya puedes descubrir perfiles y chatear sin límites.'
      : status === 'pending'
        ? 'El servidor aún no puede verificar el pago con Stripe. No vuelvas a pagar todavía; comprueba de nuevo en un momento. Si el cobro aparece en tu cuenta y sigue igual, contacta a soporte.'
        : 'Estamos comprobando con el servidor que Stripe haya confirmado el pago.'

  return createPortal(<div className="overlay overlay--offer"><section className={result === 'cancelled' ? 'offer-modal payment-success payment-return--cancelled' : 'offer-modal payment-success'} role="dialog" aria-modal="true" aria-labelledby="payment-return-title">
    <div className="payment-success__icon">{result === 'cancelled' ? <X size={26} /> : status === 'checking' ? <span className="loading-card__spinner" /> : status === 'active' ? <Check size={26} /> : <CreditCard size={25} />}</div>
    <span className="offer-modal__badge">{result === 'cancelled' ? 'CHECKOUT DE STRIPE' : status === 'active' ? 'PAGO CONFIRMADO' : 'VERIFICACIÓN DE PAGO'}</span>
    <h2 id="payment-return-title">{title}</h2><p>{message}</p>
    {result === 'success' && status !== 'active' && <button className="outline-button" onClick={() => void checkAgain()} disabled={checking}>{checking ? 'Comprobando…' : 'Comprobar de nuevo'}</button>}
    <button className="button button--primary button--wide" onClick={() => onClose(status === 'active')}>{status === 'active' ? 'Continuar' : 'Volver a la app'} <ArrowRight size={18} /></button>
  </section></div>, document.body)
}


function Discover({ accessStatus, paidAt, onOffer, onMatch, onProfile }: { accessStatus: BackendUser['status']; paidAt: BackendUser['paidAt']; onOffer: (offer: Offer) => void; onMatch: (candidate: BackendUser) => void; onProfile: () => void }) {
  const [profiles, setProfiles] = useState<BackendUser[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadedAccessKey, setLoadedAccessKey] = useState('')
  const [error, setError] = useState('')
  const [needsProfile, setNeedsProfile] = useState(false)
  const [paymentRequiredOffer, setPaymentRequiredOffer] = useState<Offer | null>(null)
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const accessKey = `${accessStatus}:${paidAt ?? ''}`

  useEffect(() => {
    let cancelled = false
    apiRequest<{ data: BackendUser[] }>('/api/discover')
      .then((response) => {
        if (cancelled) return
        setError('')
        setNeedsProfile(false)
        setProfiles(response.data)
        setIndex(0)
        setPaymentRequiredOffer(null)
        setLoadedAccessKey(accessKey)
      })
      .catch((caught) => {
        if (cancelled) return
        setProfiles([])
        setError('')
        setNeedsProfile(false)
        setPaymentRequiredOffer(null)
        if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) {
          setPaymentRequiredOffer(caught.payload.offer)
          onOffer(caught.payload.offer)
        }
        else if (caught instanceof ApiError && caught.status === 400 && caught.payload.error === 'PROFILE_INCOMPLETE') {
          setNeedsProfile(true)
        } else {
          setError('No pudimos cargar perfiles.')
        }
        setLoadedAccessKey(accessKey)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessKey, onOffer])

  const current = profiles[index]
  const next = profiles[index + 1]
  const rotation = Math.max(-14, Math.min(14, drag.x / 12))

  const decide = async (action: 'like' | 'pass') => {
    if (!current) return
    try {
      const response = await apiRequest<{ data: { matched: boolean } }>('/api/swipes', { method: 'POST', body: JSON.stringify({ targetUserId: current.id, action }) })
      if (response.data.matched) onMatch(current)
      setIndex((value) => value + 1)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) onOffer(caught.payload.offer)
      else setError(caught instanceof ApiError ? caught.message : 'No se pudo registrar tu decisión.')
    }
  }

  const animateDecision = (action: 'like' | 'pass') => {
    if (!current || leaving) return
    const direction = action === 'like' ? 1 : -1
    setLeaving(true)
    setDragging(false)
    setDrag({ x: direction * Math.max(window.innerWidth, 420), y: -20 })
    window.setTimeout(() => {
      setDrag({ x: 0, y: 0 })
      setLeaving(false)
      void decide(action)
    }, 260)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (leaving) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointerStart.current || leaving) return
    const deltaX = event.clientX - pointerStart.current.x
    const deltaY = event.clientY - pointerStart.current.y
    setDrag({ x: deltaX, y: deltaY * .35 })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointerStart.current) return
    const deltaX = event.clientX - pointerStart.current.x
    pointerStart.current = null
    if (Math.abs(deltaX) > 90) animateDecision(deltaX > 0 ? 'like' : 'pass')
    else {
      setDragging(false)
      setDrag({ x: 0, y: 0 })
    }
  }

  if (loading || loadedAccessKey !== accessKey) return <Loading />
  return <section className="screen discover-screen">
    <header className="screen-header"><div><span className="eyebrow"><Compass size={14} /> Descubrir</span><h1>Conexiones para ti</h1></div><button className="icon-button" aria-label="Abrir mi perfil" onClick={onProfile}><UserRound size={19} /></button></header>
    {error && <p className="form-error">{error}</p>}
    {needsProfile ? <div className="empty-card empty-card--profile"><div className="empty-card__icon"><ImagePlus size={27} /></div><h2>Completa tu perfil</h2><p>Agrega tus 3 fotos para comenzar a descubrir conexiones.</p><button className="button button--primary" onClick={onProfile}>Completar perfil <ArrowRight size={17} /></button></div> : paymentRequiredOffer ? <div className="discover-empty discover-empty--payment"><div className="discover-empty__payment-icon"><CreditCard size={27} /></div><div className="discover-empty__copy"><span className="empty-kicker">ACTIVA TU CUENTA</span><h2>Tu perfil ya está creado</h2><p>Para descubrir perfiles y hacer match, necesitas activar tu membresía.</p></div><p className="discover-empty__price">${paymentRequiredOffer.launchPriceMxn} MXN al mes</p><button className="button button--primary" onClick={() => onOffer(paymentRequiredOffer)}>Continuar al pago <ArrowRight size={17} /></button></div> : current ? <>
      <div className="swipe-deck" aria-label="Perfiles para descubrir">
        {next && <article className="profile-card profile-card--back" aria-hidden="true"><img src={photoFor(next)} alt="" /></article>}
        <article className={`profile-card profile-card--front ${dragging ? 'is-dragging' : ''} ${leaving ? 'is-leaving' : ''}`} style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg)`, transition: dragging ? 'none' : undefined }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Desliza para decidir">
          <img src={photoFor(current)} alt={`Perfil de ${current.name}`} draggable="false" /><div className="profile-gradient" />
          <div className="swipe-stamp swipe-stamp--like" style={{ opacity: drag.x > 0 ? Math.min(1, drag.x / 90) : 0 }}>ME GUSTA</div>
          <div className="swipe-stamp swipe-stamp--pass" style={{ opacity: drag.x < 0 ? Math.min(1, Math.abs(drag.x) / 90) : 0 }}>PASAR</div>
          <div className="profile-card__body"><span className="verified"><ShieldCheck size={13} /> Verificado</span><div className="profile-name"><h2>{current.name}, {current.age}</h2><BadgeCheck size={19} /></div><p><MapPin size={14} /> {current.city}</p><p className="profile-bio">{current.bio || 'Busca una conexión auténtica.'}</p></div>
        </article>
      </div>
      <div className="decision-row"><button className="decision decision--pass" onClick={() => animateDecision('pass')} aria-label="Pasar" disabled={leaving}><X size={25} /></button><button className="decision decision--like" onClick={() => animateDecision('like')} aria-label="Me gusta" disabled={leaving}><Heart size={27} fill="currentColor" /></button></div>
      <p className="swipe-hint">Desliza la tarjeta para decidir</p>
    </> : <div className="discover-empty"><div className="discover-empty__visual"><span className="discover-empty__halo" /><img className="discover-empty__photo discover-empty__photo--back" src="/sugar-daddy-hero-man.webp" alt="" decoding="async" onError={fallbackImageToPng} /><img className="discover-empty__photo" src="/sugar-daddy-hero-woman.webp" alt="" decoding="async" onError={fallbackImageToPng} /><span className="discover-empty__spark">✦</span></div><div className="discover-empty__copy"><span className="empty-kicker">TODO LISTO POR HOY</span><h2>Pronto tendrás nuevas conexiones</h2><p>Regresa mañana para conocer nuevos usuarios</p></div><button className="outline-button" onClick={onProfile}>Mejorar mi perfil <ArrowRight size={16} /></button></div>}
    <p className="safe-note"><ShieldCheck size={14} /> Tu información se maneja de forma privada.</p>
  </section>
}

function Matches({ onOffer, onSelect, onDiscover }: { onOffer: (offer: Offer) => void; onSelect: (match: Match) => void; onDiscover: () => void }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { apiRequest<{ data: Match[] }>('/api/matches').then((response) => setMatches(response.data)).catch((caught) => { if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) onOffer(caught.payload.offer) }).finally(() => setLoading(false)) }, [onOffer])
  return <section className="screen matches-screen"><PageTitle icon={<Heart size={14} />} eyebrow="Tu círculo" title="Matches" subtitle="Conexiones que también dijeron que sí." />{loading ? <Loading /> : matches.length ? <div className="list-card">{matches.map((match) => <button className="list-row" key={match.id} onClick={() => onSelect(match)}><img src={photoFor(match.user)} alt={match.user.name} /><span><b>{match.user.name}, {match.user.age}</b><small><MapPin size={12} /> {match.user.city}</small></span><ChevronRight size={18} /></button>)}</div> : <Empty title="Tu próxima conexión empieza aquí" text="Explora perfiles, conecta con alguien especial y los matches aparecerán en este espacio." icon={<Heart size={27} />} action={<button className="button button--primary" onClick={onDiscover}>Descubrir perfiles <ArrowRight size={16} /></button>} />}</section>
}

function Chats({ user, selected, supportSelected, onBack, onOffer, onSelect, onSupportSelect, onDiscover }: { user: BackendUser; selected: Match | null; supportSelected: boolean; onBack: () => void; onOffer: (offer: Offer) => void; onSelect?: (match: Match) => void; onSupportSelect?: () => void; onDiscover: () => void }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesMatchId, setMessagesMatchId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([])
  const [supportDraft, setSupportDraft] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const supportEndRef = useRef<HTMLDivElement | null>(null)
  const selectedMatchId = selected?.id
  useEffect(() => { apiRequest<{ data: Match[] }>('/api/matches').then((response) => setMatches(response.data)).catch((caught) => { if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) onOffer(caught.payload.offer) }).finally(() => setLoading(false)) }, [onOffer])
  useEffect(() => { if (!selectedMatchId) return; apiRequest<{ data: ChatMessage[] }>(`/api/matches/${selectedMatchId}/messages`).then((response) => { setMessages(response.data); setMessagesMatchId(selectedMatchId) }).catch((caught) => { if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) onOffer(caught.payload.offer) }) }, [onOffer, selectedMatchId])
  useEffect(() => { if (!supportSelected) return; apiRequest<{ data: SupportMessage[] }>(`/api/support/${user.id}/messages`).then((response) => setSupportMessages(response.data)).catch(() => setSupportMessages([])) }, [supportSelected, user.id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, messagesMatchId, selectedMatchId])
  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [supportMessages, supportSelected])
  const visibleMessages = messagesMatchId === selectedMatchId ? messages : []
  const send = async () => { if (!selectedMatchId || !draft.trim() || sending) return; setSending(true); try { const response = await apiRequest<{ data: ChatMessage }>(`/api/matches/${selectedMatchId}/messages`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) }); setMessagesMatchId(selectedMatchId); setMessages((current) => [...current, response.data]); setDraft('') } catch (caught) { if (caught instanceof ApiError && caught.status === 402 && caught.payload.offer) onOffer(caught.payload.offer) } finally { setSending(false) } }
  const sendSupport = async () => { if (!supportDraft.trim() || supportSending) return; setSupportSending(true); try { const response = await apiRequest<{ data: SupportMessage }>(`/api/support/${user.id}/messages`, { method: 'POST', body: JSON.stringify({ body: supportDraft.trim() }) }); setSupportMessages((current) => [...current, response.data]); setSupportDraft('') } catch { /* The chat remains usable if the request fails. */ } finally { setSupportSending(false) } }
  if (supportSelected) return <section className="chat-screen chat-screen--support"><header className="chat-header"><button className="icon-button" onClick={onBack} aria-label="Volver"><ArrowLeft size={19} /></button><div><b>Soporte Sugar Daddy</b><small><i className="live-dot" /> Estamos para ayudarte</small></div></header><div className="chat-profile chat-profile--support"><span className="support-avatar"><ShieldCheck size={21} /></span><span>Atención personalizada</span></div><div className="messages" aria-live="polite">{supportMessages.length ? supportMessages.map((message) => <div className={message.senderRole === 'user' ? 'message message--me' : 'message'} key={message.id}>{message.body}<small>{new Date(message.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="chat-empty">Escribe a nuestro equipo y te responderemos aquí.</p>}<div ref={supportEndRef} /></div><form className="composer" onSubmit={(event) => { event.preventDefault(); void sendSupport() }}><input value={supportDraft} onChange={(event) => setSupportDraft(event.target.value)} placeholder="Escribe a soporte…" aria-label="Mensaje para soporte" /><button className="send-button" type="submit" disabled={supportSending || !supportDraft.trim()} aria-label="Enviar">{supportSending ? <span className="send-spinner" aria-hidden="true" /> : <Send size={17} />}</button></form></section>
  if (selected) return <section className="chat-screen"><header className="chat-header"><button className="icon-button" onClick={onBack} aria-label="Volver"><ArrowLeft size={19} /></button><div><b>{selected.user.name}</b><small><i className="live-dot" /> Conversación privada</small></div></header><div className="chat-profile"><img src={photoFor(selected.user)} alt={selected.user.name} /><span>{selected.user.name}, {selected.user.age}</span></div><div className="messages" aria-live="polite">{visibleMessages.length ? visibleMessages.map((message) => <div className={message.senderId === selected.user.id ? 'message' : 'message message--me'} key={message.id}>{message.body}<small>{new Date(message.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="chat-empty">Escribe el primer mensaje y empieza la conversación.</p>}<div ref={messagesEndRef} /></div><form className="composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" /><button className="send-button" type="submit" disabled={sending || !draft.trim()} aria-label="Enviar">{sending ? <span className="send-spinner" aria-hidden="true" /> : <Send size={17} />}</button></form></section>
  return <section className="screen chats-screen"><PageTitle icon={<MessageSquare size={14} />} eyebrow="Tu bandeja" title="Chats" subtitle="Habla con tus matches y con nuestro equipo." /><div className="list-card chat-support-card"><button className="list-row chat-support-row" onClick={onSupportSelect} disabled={!onSupportSelect}><span className="support-avatar"><ShieldCheck size={21} /></span><span><b>Soporte Sugar Daddy</b><small>Estamos disponibles para ayudarte</small></span><span className="support-online">En línea</span><ChevronRight size={18} /></button></div>{loading ? <Loading /> : matches.length ? <div className="list-card">{matches.map((match) => <button className="list-row" key={match.id} onClick={() => onSelect?.(match)}><img src={photoFor(match.user)} alt={match.user.name} /><span><b>{match.user.name}</b><small>Abre el match para conversar</small></span><ChevronRight size={18} /></button>)}</div> : <Empty title="Habla con alguien especial" text="Cuando haya un match, tu conversación aparecerá aquí para que puedan conocerse." icon={<MessageCircle size={27} />} action={<button className="button button--primary" onClick={onDiscover}>Conocer perfiles <ArrowRight size={16} /></button>} />}</section>
}

const giftCategories = [
  { label: 'Viajes', icon: Plane, color: 'gift-tile--sky' },
  { label: 'Joyas', icon: Gem, color: 'gift-tile--lilac' },
  { label: 'Ropa', icon: Shirt, color: 'gift-tile--rose' },
  { label: 'Bolsas', icon: ShoppingBag, color: 'gift-tile--gold' },
  { label: 'Flores', icon: Flower2, color: 'gift-tile--mint' },
] as const

function GiftsSection() {
  return <section className="screen gifts-screen"><PageTitle icon={<Gift size={14} />} eyebrow="Tu beneficio" title="Regalos" subtitle="Recibe detalles que puedes convertir en saldo real." /><div className="gifts-card" aria-labelledby="gifts-title"><div className="gifts-card__heading"><div className="gifts-card__icon"><WalletCards size={20} /></div><div><span className="eyebrow">Regalos de tu SD</span><h2 id="gifts-title">Elige lo que te gusta</h2></div></div><p className="gifts-card__intro">Recibe regalos de tu SD que se convertirán en dinero real que puedes transferir a tu cuenta bancaria.</p><div className="gift-grid">{giftCategories.map(({ label, icon: Icon, color }) => <div className={`gift-tile ${color}`} key={label}><Icon size={21} /><span>{label}</span></div>)}</div><div className="gifts-card__note"><Check size={15} /><span>Disfruta cada detalle y recibe el valor de tu regalo.</span></div></div><div className="gifts-steps"><span className="empty-kicker">CÓMO FUNCIONA</span><div className="gifts-steps__row"><div><b>01</b><span>Recibe</span><small>Un detalle especial</small></div><div><b>02</b><span>Disfruta</span><small>Elige tu categoría</small></div><div><b>03</b><span>Transfiere</span><small>A tu cuenta bancaria</small></div></div></div></section>
}

function EditProfileModal({ user, onClose, onSaved }: { user: BackendUser; onClose: () => void; onSaved: (updated: BackendUser) => void }) {
  const [name, setName] = useState(user.name)
  const [age, setAge] = useState(String(user.age))
  const [country, setCountry] = useState(user.country ?? '')
  const [city, setCity] = useState(user.city)
  const [bio, setBio] = useState(user.bio)
  const [occupation, setOccupation] = useState(user.occupation ?? '')
  const [salary, setSalary] = useState(user.salary ?? '')
  const [economicActivity, setEconomicActivity] = useState(user.economicActivity ?? '')
  const [photoFiles, setPhotoFiles] = useState<Array<File | null>>([null, null, null])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const previews = useMemo(() => photoFiles.map((file, index) => file ? URL.createObjectURL(file) : user.photos?.find((photo) => photo.position === index)?.url || '/sugar-daddy-lockup-clean.png'), [photoFiles, user.photos])
  useEffect(() => () => previews.forEach((preview, index) => { if (photoFiles[index]) URL.revokeObjectURL(preview) }), [photoFiles, previews])
  const selectPhoto = (position: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.toLowerCase().startsWith('image/') && !imageFileNamePattern.test(file.name)) return setError('Solo puedes seleccionar imágenes.')
    setPhotoFiles((current) => current.map((value, index) => index === position ? file : value))
    setError('')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const numericAge = Number(age)
    if (!name.trim() || !country.trim() || !city.trim() || !Number.isInteger(numericAge) || numericAge < 18 || numericAge > 99) return setError('Completa nombre o apodo, país, ciudad y una edad entre 18 y 99 años.')
    setBusy(true); setError('')
    try {
      await apiRequest('/api/profile', { method: 'PATCH', body: JSON.stringify({ name, age: numericAge, country, city, bio, occupation, salary, economicActivity }) })
      for (const [position, file] of photoFiles.entries()) {
        if (!file) continue
        const form = new FormData(); form.append('photo', file)
        await apiRequest(`/api/profile/photos/${position}`, { method: 'POST', body: form })
      }
      const latest = await apiRequest<{ data: BackendUser }>('/api/profile')
      onSaved(latest.data)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo actualizar el perfil.')
    } finally { setBusy(false) }
  }
  return createPortal(
    <div className="overlay overlay--edit-profile">
      <section className="edit-profile-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <header className="edit-profile-modal__header">
          <div><span className="eyebrow"><Pencil size={13} /> Tu información</span><h2 id="edit-profile-title">Editar perfil</h2><p>Actualiza tus datos y tus fotos.</p></div>
          <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
        </header>
        <form className="edit-profile-form" onSubmit={(event) => void save(event)}>
          <div className="edit-photos">
            <div className="edit-section-label"><b>Tus fotos</b><small>Elige una para cambiarla</small></div>
            <div className="edit-photo-grid">{previews.map((preview, index) => <label className="edit-photo" key={`${index}-${preview}`}><img src={preview} alt={`Foto ${index + 1}`} /><span><Pencil size={13} /> Cambiar</span><input type="file" accept="image/*" onChange={(event) => selectPhoto(index, event)} /></label>)}</div>
          </div>
          <div className="edit-fields">
            <div className="edit-fields__row">
              <label className="field-label">Nombre o apodo<input className="text-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="field-label">Edad<input className="text-input" type="number" min="18" max="99" value={age} onChange={(event) => setAge(event.target.value)} /></label>
            </div>
            <label className="field-label">País<input className="text-input" value={country} onChange={(event) => setCountry(event.target.value)} autoComplete="country-name" /></label>
            <label className="field-label">Ciudad<input className="text-input" value={city} onChange={(event) => setCity(event.target.value)} /></label>
            <label className="field-label">Sobre ti<textarea className="text-input text-area" value={bio} onChange={(event) => setBio(event.target.value)} /></label>
            {user.role === 'sugar-daddy' && <div className="edit-professional"><div className="edit-section-label"><b>Información profesional</b><small>Visible en tu perfil</small></div><label className="field-label">Ocupación<input className="text-input" value={occupation} onChange={(event) => setOccupation(event.target.value)} /></label><label className="field-label">Salario mensual<input className="text-input" value={salary} onChange={(event) => setSalary(event.target.value)} /></label><label className="field-label">Actividad económica<textarea className="text-input text-area" value={economicActivity} onChange={(event) => setEconomicActivity(event.target.value)} /></label></div>}
          </div>
          {error && <p className="form-error">{error}</p>}
          <footer className="edit-profile-actions"><button type="button" className="outline-button" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'} {!busy && <Check size={16} />}</button></footer>
        </form>
      </section>
    </div>, document.body)
}

function Profile({ user, onLogout, onUserUpdated }: { user: BackendUser; onLogout: () => void; onUserUpdated: (updated: BackendUser) => void }) {
  const [editing, setEditing] = useState(false)
  return <section className="screen profile-screen"><PageTitle icon={<UserRound size={14} />} eyebrow="Tu espacio" title="Mi perfil" subtitle="Tu información se mantiene privada." /><div className="account-card profile-account-card"><div className="profile-account-card__cover" /><div className="account-head"><img src={photoFor(user)} alt={user.name} /><div><h2>{user.name}, {user.age}</h2><p><MapPin size={13} /> {user.city}</p><span className={user.status === 'active' ? 'status status--active' : 'status'}>{user.status === 'active' ? 'Membresía activa' : 'Registro pendiente de pago'}</span></div></div><p className="profile-bio">{user.bio || 'Agrega una descripción para que te conozcan.'}</p><button className="outline-button" onClick={() => setEditing(true)}><Pencil size={15} /> Editar perfil</button></div><div className="profile-highlights"><div><b>{user.photos?.length ?? 0}</b><span>Fotos</span></div><div><b>+18</b><span>Comunidad</span></div><div><b>100%</b><span>Privado</span></div></div><div className="security-card"><ShieldCheck size={19} /><div><b>Cuenta segura</b><small>Datos, fotos y conversaciones se guardan en tu cuenta.</small></div></div><button className="logout-button" onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button>{editing && <EditProfileModal user={user} onClose={() => setEditing(false)} onSaved={(updated) => { onUserUpdated(updated); setEditing(false) }} />}</section>
}

function Shell({ user, onLogout, onOffer, onUserUpdated }: { user: BackendUser; onLogout: () => void; onOffer: (offer: Offer) => void; onUserUpdated: (updated: BackendUser) => void }) {
  const [tab, setTab] = useState<AppTab>('discover')
  const [selected, setSelected] = useState<Match | null>(null)
  const [supportSelected, setSupportSelected] = useState(false)
  const [matched, setMatched] = useState<BackendUser | null>(null)
  const matchOffer = (candidate: BackendUser) => setMatched(candidate)
  const clearChatSelection = () => { setSelected(null); setSupportSelected(false) }
  const goDiscover = () => { setTab('discover'); clearChatSelection() }
  const content = supportSelected ? <Chats user={user} selected={null} supportSelected onBack={clearChatSelection} onOffer={onOffer} onDiscover={goDiscover} /> : selected ? <Chats user={user} selected={selected} supportSelected={false} onBack={clearChatSelection} onOffer={onOffer} onDiscover={goDiscover} /> : tab === 'discover' ? <Discover accessStatus={user.status} paidAt={user.paidAt} onOffer={onOffer} onMatch={matchOffer} onProfile={() => setTab('profile')} /> : tab === 'matches' ? <Matches onOffer={onOffer} onSelect={(match) => { setSelected(match); setSupportSelected(false); setTab('chats') }} onDiscover={goDiscover} /> : tab === 'chats' ? <Chats user={user} selected={null} supportSelected={false} onBack={clearChatSelection} onOffer={onOffer} onSelect={(match) => { setSelected(match); setSupportSelected(false) }} onSupportSelect={() => { setSelected(null); setSupportSelected(true) }} onDiscover={goDiscover} /> : tab === 'gifts' ? <GiftsSection /> : <Profile user={user} onLogout={onLogout} onUserUpdated={onUserUpdated} />
  const allNavItems = [{ key: 'discover', label: 'Descubrir', icon: Compass }, { key: 'matches', label: 'Matches', icon: Heart }, { key: 'chats', label: 'Chats', icon: MessageCircle }, { key: 'gifts', label: 'Regalos', icon: Gift }, { key: 'profile', label: 'Perfil', icon: UserRound }] as const
  const navItems = allNavItems.filter(({ key }) => key !== 'gifts' || user.role === 'sugar-baby')
  return <main className="app-shell"><div className="app-content">{content}</div><nav className={user.role === 'sugar-baby' ? 'bottom-nav bottom-nav--gifts' : 'bottom-nav'}>{navItems.map(({ key, label, icon: Icon }) => <button className={tab === key ? 'nav-item is-active' : 'nav-item'} key={key} onClick={() => { setTab(key); clearChatSelection() }}><Icon size={20} fill={key === 'matches' && tab === key ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>{matched && <MatchPopup candidate={matched} onClose={() => setMatched(null)} onChat={() => setMatched(null)} />}</main>
}

function MatchPopup({ candidate, onClose, onChat }: { candidate: BackendUser; onClose: () => void; onChat: () => void }) { return createPortal(<div className="overlay"><section className="match-popup"><div className="match-stars"><Sparkles size={28} /></div><span className="eyebrow">Conexión mutua</span><h2>¡Es un match!</h2><p>A {candidate.name} también le gustó tu perfil.</p><img src={photoFor(candidate)} alt={candidate.name} /><button className="button button--primary button--wide" onClick={onChat}>Enviar un mensaje <Send size={16} /></button><button className="text-button" onClick={onClose}>Seguir descubriendo</button></section></div>, document.body) }

function Admin({ onExit }: { onExit: () => void }) {
  type AdminTab = 'overview' | 'users' | 'support'
  type AdminOverview = { unregistered: number; active: number; pendingPayment: number; conversationsActive: number; launchPriceMxn: number; regularPriceMxn: number }
  const [admin, setAdmin] = useState<BackendUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<AdminTab>('overview')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<BackendUser[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<BackendUser | null>(null)
  const [support, setSupport] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const supportEndRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    const [summary, list] = await Promise.all([apiRequest<{ data: AdminOverview }>('/api/admin/overview'), apiRequest<{ data: BackendUser[] }>('/api/admin/users')])
    setOverview(summary.data)
    setUsers(list.data)
  }, [])

  useEffect(() => {
    apiRequest<{ data: { user: BackendUser } | null }>('/api/auth/me')
      .then((response) => { if (response.data?.user.role === 'admin') { setAdmin(response.data.user); void load() } })
      .catch(() => undefined)
  }, [load])

  useEffect(() => { supportEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [support, selected])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const response = await apiRequest<{ data: { user: BackendUser } }>('/api/auth/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      setAdmin(response.data.user)
      setTab('overview')
      await load()
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo iniciar sesión.') }
  }

  const exit = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    onExit()
  }

  const search = async (value: string) => {
    setQuery(value)
    const response = await apiRequest<{ data: BackendUser[] }>(`/api/admin/users?q=${encodeURIComponent(value)}`)
    setUsers(response.data)
  }

  const selectUser = async (user: BackendUser) => {
    setSelected(user)
    setTab('support')
    setSupport([])
    setDraft('')
    const response = await apiRequest<{ data: SupportMessage[] }>(`/api/admin/users/${user.id}/messages`)
    setSupport(response.data)
  }

  const send = async () => {
    if (!selected || !draft.trim() || supportSending) return
    setSupportSending(true)
    try {
      const response = await apiRequest<{ data: SupportMessage }>(`/api/admin/users/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) })
      setSupport((current) => [...current, response.data])
      setDraft('')
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo enviar el mensaje.') }
    finally { setSupportSending(false) }
  }

  const tabButton = (value: AdminTab, label: string, icon: typeof Sparkles) => { const Icon = icon; return <button className={tab === value ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setTab(value)} key={value}><Icon size={18} /><span>{label}</span></button> }

  if (!admin) return <main className="admin-app admin-app--login"><div className="admin-login-brand"><Brand compact /></div><form className="admin-login-card" onSubmit={login}><span className="eyebrow"><ShieldCheck size={14} /> Área privada</span><h1>Administración</h1><p>Gestiona usuarios, métricas y soporte desde un solo lugar.</p><label className="field-label">Correo<input className="text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label><label className="field-label">Contraseña<input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="form-error">{error}</p>}<button className="button button--primary button--wide" type="submit">Entrar al panel <ArrowRight size={18} /></button></form></main>

  return <main className="admin-app"><header className="admin-app__header"><div className="admin-app__brand"><Brand compact /><span>Panel de control</span></div><button className="icon-button" onClick={() => void exit()} aria-label="Salir del administrador"><LogOut size={17} /></button></header><section className="admin-app__content">
    {tab === 'overview' && <section className="admin-panel admin-overview-panel"><div className="admin-hero"><span className="eyebrow">Centro de control</span><h1>Todo bajo control</h1><p>Registros abandonados (24 h), pagos y conversaciones activas (30 días).</p></div><div className="metric-grid">{[['Usuarios no registrados', overview?.unregistered ?? 0], ['Activos · pagados', overview?.active ?? 0], ['Pendientes', overview?.pendingPayment ?? 0], ['Conversaciones activas', overview?.conversationsActive ?? 0]].map(([label, value]) => <div className="metric" key={label}><b>{value}</b><small>{label}</small></div>)}</div><div className="admin-quick-card"><div><span className="eyebrow"><MessageSquare size={13} /> Soporte</span><h2>Habla con cualquier usuario</h2><p>Abre la pestaña Soporte para responder mensajes sin salir del panel.</p></div><button className="outline-button" onClick={() => setTab('support')}>Abrir soporte <ArrowRight size={15} /></button></div></section>}
    {tab === 'users' && <section className="admin-panel admin-users-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><UserRound size={13} /> Comunidad</span><h2>Usuarios</h2></div><span className="admin-count">{users.length}</span></div><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => void search(event.target.value)} placeholder="Buscar usuario" /></label><div className="admin-list">{users.map((user) => <button className="admin-user" key={user.id} onClick={() => void selectUser(user)}>{user.photos?.[0]?.url ? <img className="admin-user__photo" src={user.photos[0].url} alt="" /> : <div className="avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>}<span><b>{user.name}</b><small>{user.email} · {user.role === 'sugar-baby' ? 'Mujer' : 'Hombre'}</small><small>{user.paid ? 'Pago confirmado' : user.plan === 'free_35_plus' ? 'Cuenta gratuita' : user.status === 'suspended' ? 'Cuenta suspendida' : 'Pendiente de pago'}</small></span><i className={user.paid ? 'status-dot is-on' : 'status-dot'} /></button>)}</div></section>}
    {tab === 'support' && <section className={selected ? 'admin-panel admin-support-panel admin-support-panel--active' : 'admin-panel admin-support-panel'}>{selected ? <div className="admin-chat admin-chat--full"><header className="admin-chat-head"><button className="icon-button" onClick={() => { setSelected(null); setSupport([]); setDraft('') }} aria-label="Volver a usuarios"><ArrowLeft size={17} /></button><div><span className="eyebrow">Soporte directo</span><h2>{selected.name}</h2><small>Conversación privada</small></div><span className="status-dot is-on" /></header><div className="admin-messages" aria-live="polite">{support.length ? support.map((message) => <div className={message.senderRole === 'admin' ? 'message message--me' : 'message'} key={message.id}>{message.body}<small>{new Date(message.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="chat-empty">Todavía no hay mensajes. Empieza la conversación.</p>}<div ref={supportEndRef} /></div><form className="composer" onSubmit={(event) => { event.preventDefault(); void send() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe al usuario…" aria-label="Mensaje para usuario" /><button className="send-button" type="submit" disabled={supportSending || !draft.trim()} aria-label="Enviar mensaje">{supportSending ? <span className="send-spinner" aria-hidden="true" /> : <Send size={17} />}</button></form></div> : <><div className="admin-panel-heading"><div><span className="eyebrow"><MessageSquare size={13} /> Bandeja</span><h2>Soporte</h2></div></div><p>Selecciona un usuario para iniciar una conversación.</p><div className="admin-support-list">{users.map((user) => <button className="admin-user" key={user.id} onClick={() => void selectUser(user)}>{user.photos?.[0]?.url ? <img className="admin-user__photo" src={user.photos[0].url} alt="" /> : <div className="avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>}<span><b>{user.name}</b><small>{user.email}</small></span><ArrowRight size={15} /></button>)}</div></>}</section>}
  </section><nav className="admin-tabs" aria-label="Navegación administrativa">{tabButton('overview', 'Inicio', Sparkles)}{tabButton('users', 'Usuarios', UserRound)}{tabButton('support', 'Soporte', MessageSquare)}<button className="admin-tab admin-tab--exit" onClick={() => void exit()}><LogOut size={18} /><span>Salir</span></button></nav></main>
}

function PageTitle({ icon, eyebrow, title, subtitle }: { icon: React.ReactNode; eyebrow: string; title: string; subtitle: string }) { return <header className="page-title"><span className="eyebrow">{icon} {eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></header> }
function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) { return <div className="empty-card empty-card--rich"><div className="empty-card__icon">{icon}</div><div className="empty-card__copy"><h2>{title}</h2><p>{text}</p></div>{action}</div> }
function Loading({ label = 'Cargando…' }: { label?: string }) { return <div className="loading-card" role="status" aria-live="polite"><span className="loading-card__spinner" aria-hidden="true" /><b>{label}</b></div> }

const pendingCheckoutStorageKey = 'sugar-daddy:checkout-pending'
function hasPendingCheckout(): boolean {
  try { return window.sessionStorage.getItem(pendingCheckoutStorageKey) === '1' }
  catch { return false }
}
function setPendingCheckout(pending: boolean) {
  try {
    if (pending) window.sessionStorage.setItem(pendingCheckoutStorageKey, '1')
    else window.sessionStorage.removeItem(pendingCheckoutStorageKey)
  } catch { /* Storage can be disabled; the in-memory guard still applies. */ }
}

export default function App() {
  const isAdminPath = window.location.pathname === '/admin'
  const [user, setUser] = useState<BackendUser | null>(null)
  const [stage, setStage] = useState<'welcome' | 'auth' | 'setup'>('welcome')
  const [credentials, setCredentials] = useState<AuthCredentials | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [paymentReturn, setPaymentReturn] = useState<'success' | 'cancelled' | null>(() => {
    const value = new URLSearchParams(window.location.search).get('payment')
    return value === 'success' || value === 'cancelled' ? value : null
  })
  const [paymentSessionId] = useState(() => new URLSearchParams(window.location.search).get('session_id'))
  const suppressOfferAfterCheckout = useRef(paymentReturn === 'success' || hasPendingCheckout())
  const [booting, setBooting] = useState(!isAdminPath)
  useEffect(() => {
    if (!paymentReturn) return
    if (paymentReturn === 'success') {
      suppressOfferAfterCheckout.current = true
      setPendingCheckout(true)
    }
    const params = new URLSearchParams(window.location.search)
    params.delete('payment')
    params.delete('session_id')
    const search = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
  }, [paymentReturn])
  useEffect(() => {
    if (isAdminPath) return
    apiRequest<{ data: { user: BackendUser; offer?: Offer } | null }>('/api/auth/me')
      .then((response) => {
        if (response.data?.user && response.data.user.role !== 'admin') {
          setUser(response.data.user)
          if (response.data.user.status === 'active') {
            suppressOfferAfterCheckout.current = false
            setPendingCheckout(false)
          }
        }
        if (response.data?.offer && paymentReturn !== 'success' && !suppressOfferAfterCheckout.current) setOffer(response.data.offer)
      })
      .catch(() => undefined)
      .finally(() => setBooting(false))
  }, [isAdminPath, paymentReturn])
  const login = async (loginCredentials: AuthCredentials) => { try { const response = await apiRequest<{ data: { user: BackendUser; offer?: Offer } }>('/api/auth/login', { method: 'POST', body: JSON.stringify(loginCredentials) }); setUser(response.data.user); if (response.data.user.status === 'active') { suppressOfferAfterCheckout.current = false; setPendingCheckout(false) } if (response.data.offer && !suppressOfferAfterCheckout.current) setOffer(response.data.offer) } catch { window.alert('Correo o contraseña incorrectos.') } }
  const closePaymentReturn = (confirmed: boolean) => {
    const stillPending = paymentReturn === 'success' && !confirmed
    suppressOfferAfterCheckout.current = stillPending
    setPendingCheckout(stillPending)
    setOffer(null)
    setPaymentReturn(null)
  }
  const showOffer = useCallback((nextOffer: Offer) => {
    if (!suppressOfferAfterCheckout.current) setOffer(nextOffer)
  }, [])
  if (isAdminPath) return <Admin onExit={() => { window.location.href = '/' }} />
  if (booting) return <main className="boot-screen"><Loading label="Abriendo tu espacio" /></main>
  if (!user && paymentReturn) return <><Welcome onStart={() => setStage('auth')} /><PaymentReturnModal result={paymentReturn} sessionId={paymentSessionId} onClose={closePaymentReturn} onUserUpdated={setUser} /></>
  if (!user && stage === 'welcome') return <Welcome onStart={() => setStage('auth')} />
  if (!user && stage === 'auth') return <Auth onRegister={(value) => { setCredentials(value); setStage('setup') }} onLogin={(value) => void login(value)} />
  if (!user && stage === 'setup' && credentials) return <Setup credentials={credentials} onComplete={(created, registrationOffer) => { setUser(created); if (registrationOffer) setOffer(registrationOffer) }} />
  if (!user) return <Welcome onStart={() => setStage('auth')} />
  const logout = async () => { await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined); suppressOfferAfterCheckout.current = false; setPendingCheckout(false); setUser(null); setStage('welcome') }
  return <><Shell user={user} onLogout={() => void logout()} onOffer={showOffer} onUserUpdated={setUser} />{offer && !paymentReturn && <OfferModal offer={offer} onClose={() => setOffer(null)} onUserUpdated={setUser} />}{paymentReturn && <PaymentReturnModal result={paymentReturn} sessionId={paymentSessionId} onClose={closePaymentReturn} onUserUpdated={setUser} />}</>
}

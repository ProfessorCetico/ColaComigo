import { zodResolver } from '@hookform/resolvers/zod'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { addDays, format, getDay, isAfter, parseISO, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  reload,
  type User,
} from 'firebase/auth'
import { z } from 'zod'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { calculateGrade } from './domain/grading'
import { generatePlan } from './domain/planner'
import {
  assessmentSchema,
  profileSchema,
  subjectSchema,
  type Assessment,
  type ProfileInput,
  type ProfileFormInput,
  type StudySession,
  type Subject,
  type SubjectInput,
} from './domain/schemas'
import { auth, db, functions } from './lib/firebase'
import { dateKey, formatDate, zonedTimeToIso } from './lib/dates'
const GradeChart = lazy(() => import('./components/GradeChart'))
import './App.css'

type Profile = ProfileInput & {
  ownerId: string
  onboardingCompleted: boolean
  studyPreferences?: {
    allowedDaysOfWeek?: number[]
    preferredStartTime?: string
    preferredEndTime?: string
    preferredSessionMinutes?: number
    maximumDailyStudyMinutes?: number
  }
}
type ExceptionalEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  blocksStudy: boolean
}
type RecurringCommitment = {
  id: string
  title: string
  daysOfWeek: number[]
  startTime: string
  endTime: string
  active: boolean
}
type Trip = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  studyAllowed: boolean
  dailyAvailableMinutes: number
}

const areas = [
  { to: '/app', label: 'Início', icon: LayoutDashboard },
  { to: '/app/agenda', label: 'Minha agenda', icon: CalendarDays },
  { to: '/app/disciplinas', label: 'Disciplinas', icon: BookOpen },
  { to: '/app/avaliacoes', label: 'Avaliações e notas', icon: Target },
  { to: '/app/rotina', label: 'Rotina', icon: Clock3 },
  { to: '/app/historico', label: 'Relatórios', icon: TrendingUp },
  { to: '/app/perfil', label: 'Meu perfil', icon: GraduationCap },
]

function messageFromError(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este e-mail já possui uma conta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/weak-password': 'Use uma senha com pelo menos 10 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet.',
  }
  return messages[code] ?? 'Não foi possível concluir. Tente novamente.'
}

function useUserItems<T extends { id: string }>(name: string) {
  const { user } = useAuth()
  const [state, setState] = useState<{ uid: string; items: T[]; loading: boolean; error: string }>({
    uid: '',
    items: [],
    loading: true,
    error: '',
  })

  useEffect(() => {
    if (!db || !user) return
    return onSnapshot(
      collection(db, 'users', user.uid, name),
      (snapshot) => {
        setState({
          uid: user.uid,
          items: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T),
          loading: false,
          error: '',
        })
      },
      () => {
        setState({
          uid: user.uid,
          items: [],
          loading: false,
          error: 'Não foi possível carregar estes dados. Tente atualizar a página.',
        })
      },
    )
  }, [name, user])

  const currentUserState = state.uid === user?.uid
  return {
    items: currentUserState ? state.items : [],
    loading: Boolean(user) && (!currentUserState || state.loading),
    error: currentUserState ? state.error : '',
  }
}

function useProfile() {
  const { user } = useAuth()
  const [state, setState] = useState<{ uid: string; profile: Profile | null; loading: boolean }>({
    uid: '',
    profile: null,
    loading: true,
  })
  useEffect(() => {
    if (!db || !user) return
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setState({
          uid: user.uid,
          profile: snapshot.exists() ? (snapshot.data() as Profile) : null,
          loading: false,
        })
      },
      () => setState({ uid: user.uid, profile: null, loading: false }),
    )
  }, [user])
  const currentUserState = state.uid === user?.uid
  return {
    profile: currentUserState ? state.profile : null,
    loading: Boolean(user) && (!currentUserState || state.loading),
  }
}

async function saveItem(user: User, name: string, value: DocumentData) {
  if (!db) throw new Error('O Firebase ainda não está configurado.')
  return addDoc(collection(db, 'users', user.uid, name), {
    ...value,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

function FirebaseNotice() {
  return (
    <div className="notice" role="status">
      <ShieldCheck size={18} />
      <span>
        O site está pronto, mas o Firebase ainda precisa ser configurado para habilitar contas e
        salvar dados.
      </span>
    </div>
  )
}

function PublicLayout() {
  return (
    <main className="public-shell">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <BookOpen size={22} />
          <span className="brand-pencil" />
        </span>
        <span>Cola comigo</span>
      </Link>
      {window.self !== window.parent && (
        <a className="embed-open-link" href={window.location.href} target="_blank" rel="noreferrer">
          Abrir Cola comigo em nova guia <ArrowRight size={14} />
        </a>
      )}
      <Outlet />
      <footer className="public-footer">
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
        <span>Seus dados acadêmicos são privados.</span>
      </footer>
    </main>
  )
}

function LandingPage() {
  const { configured, user } = useAuth()
  return (
    <section className="landing">
      <div className="landing-copy">
        <span className="eyebrow">
          <Compass size={15} /> Seu caminho, no seu ritmo
        </span>
        <h1>Estudar com clareza muda tudo.</h1>
        <p>
          Organize provas, atividades e horários de estudo em uma agenda flexível, feita para
          acompanhar sua evolução.
        </p>
        <div className="landing-actions">
          {!configured ? (
            <FirebaseNotice />
          ) : user ? (
            <Link className="button primary" to="/app">
              Abrir minha agenda <ArrowRight size={17} />
            </Link>
          ) : (
            <>
              <Link className="button primary" to="/cadastro">
                Criar minha conta <ArrowRight size={17} />
              </Link>
              <Link className="button secondary" to="/entrar">
                Já tenho conta
              </Link>
            </>
          )}
        </div>
        <ul className="feature-points">
          <li>
            <Check size={16} /> Plano de estudos que você pode ajustar
          </li>
          <li>
            <Check size={16} /> Notas e progresso por disciplina
          </li>
          <li>
            <Check size={16} /> Acesso pelo celular ou computador
          </li>
        </ul>
      </div>
      <div className="landing-art" aria-label="Ilustração de uma agenda escolar">
        <div className="map-path path-one" />
        <div className="map-path path-two" />
        <div className="art-note">
          <span className="art-date">SEG, 16 NOV</span>
          <strong>Um passo de cada vez.</strong>
          <span>Seu plano, suas escolhas.</span>
        </div>
        <div className="art-card">
          <CalendarDays size={21} />
          <div>
            <strong>Matemática</strong>
            <span>Revisão · 16:00</span>
          </div>
          <Check size={18} />
        </div>
        <div className="art-pin">
          <Sparkles size={18} />
        </div>
      </div>
    </section>
  )
}

const signUpSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(10, 'A senha deve ter pelo menos 10 caracteres.'),
  accepted: z.literal(true, { error: 'Aceite os termos e a política de privacidade.' }),
})

function SignInPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return setError('O serviço de contas ainda não foi configurado.')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    setBusy(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      navigate(credential.user.emailVerified ? '/app' : '/verificar-email', { replace: true })
    } catch (reason) {
      setError(messageFromError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthCard title="Que bom ter você de volta" subtitle="Entre para continuar seu planejamento.">
      {!auth && <FirebaseNotice />}
      <form className="form-stack" onSubmit={submit}>
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha">
          <input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={!auth || busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <Link className="text-link center" to="/recuperar-senha">
        Esqueci minha senha
      </Link>
      <p className="auth-switch">
        Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </p>
    </AuthCard>
  )
}

function SignUpPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return setError('O serviço de contas ainda não foi configurado.')
    const form = new FormData(event.currentTarget)
    const result = signUpSchema.safeParse({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      accepted: form.get('accepted') === 'on',
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Revise os campos.')
      return
    }
    setBusy(true)
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        result.data.email,
        result.data.password,
      )
      await sendEmailVerification(credential.user)
      navigate('/verificar-email')
    } catch (reason) {
      setError(messageFromError(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthCard
      title="Comece pelo seu caminho"
      subtitle="Crie sua conta com e-mail e uma senha segura."
    >
      {!auth && <FirebaseNotice />}
      <form className="form-stack" onSubmit={submit}>
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha (mínimo 10 caracteres)">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>
        <label className="check-label">
          <input name="accepted" type="checkbox" required /> Li e aceito os{' '}
          <Link to="/termos">termos de uso</Link> e a{' '}
          <Link to="/privacidade">política de privacidade</Link>.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={!auth || busy}>
          {busy ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="auth-switch">
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </p>
    </AuthCard>
  )
}

function AuthCard({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <section className="auth-card">
      <span className="eyebrow">Cola comigo</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </section>
  )
}

function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function VerifyEmailPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')
  async function check() {
    if (!user) return navigate('/entrar')
    try {
      await reload(user)
      if (user.emailVerified) navigate('/onboarding', { replace: true })
      else
        setNotice(
          'Ainda não confirmamos o e-mail. Verifique sua caixa de entrada e tente novamente.',
        )
    } catch {
      setNotice('Não foi possível verificar agora. Confira sua conexão e tente novamente.')
    }
  }
  async function resendVerification() {
    if (!user) return
    try {
      await sendEmailVerification(user)
      setNotice('Enviamos uma nova mensagem de verificação.')
    } catch {
      setNotice('Não foi possível reenviar o e-mail. Aguarde um pouco e tente novamente.')
    }
  }
  return (
    <AuthCard
      title="Confirme seu e-mail"
      subtitle={`Enviamos um link de verificação para ${user?.email ?? 'seu e-mail'}.`}
    >
      <p className="inline-notice">
        {notice || 'Abra a mensagem e clique no link para proteger sua conta.'}
      </p>
      <button className="button primary full" onClick={check}>
        Já confirmei meu e-mail
      </button>
      <button className="button secondary full" onClick={resendVerification}>
        Reenviar e-mail
      </button>
    </AuthCard>
  )
}

function ResetPasswordPage() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return setError('O serviço de contas ainda não foi configurado.')
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    try {
      await sendPasswordResetEmail(auth, email)
      setMessage('Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.')
      setError('')
    } catch (reason) {
      setMessage('Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.')
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      setError(
        code === 'auth/network-request-failed'
          ? 'Não foi possível conectar. Verifique sua internet e tente novamente.'
          : '',
      )
    }
  }
  return (
    <AuthCard title="Recuperar senha" subtitle="Informe o e-mail usado no cadastro.">
      <form className="form-stack" onSubmit={submit}>
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="inline-notice">
            {message}
          </p>
        )}
        <button className="button primary full" disabled={!auth}>
          Enviar instruções
        </button>
      </form>
    </AuthCard>
  )
}

function RequireAuth() {
  const { configured, loading, user } = useAuth()
  const location = useLocation()
  if (!configured) return <Navigate to="/" replace />
  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (!user.emailVerified && location.pathname !== '/verificar-email')
    return <Navigate to="/verificar-email" replace />
  return <Outlet />
}

function OnboardingPage() {
  const { user } = useAuth()
  const { profile, loading } = useProfile()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormInput, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      educationLevel: 'MEDIO',
      schoolShift: 'MANHA',
      ageRange: '16_17',
    },
  })
  if (loading) return <LoadingPage />
  if (profile?.onboardingCompleted) return <Navigate to="/app" replace />
  async function save(values: ProfileInput) {
    if (!db || !user) return
    setBusy(true)
    setError('')
    try {
      const profileData = { ...values }
      delete profileData.consentAccepted
      await setDoc(
        doc(db, 'users', user.uid),
        {
          ...profileData,
          email: user.email,
          ownerId: user.uid,
          role: 'STUDENT',
          onboardingCompleted: true,
          studyPreferences: {
            preferredSessionMinutes: 45,
            minimumSessionMinutes: 25,
            maximumSessionMinutes: 60,
            minimumBreakMinutes: 15,
            maximumDailyStudyMinutes: 120,
            allowedDaysOfWeek: [1, 2, 3, 4, 5, 6],
            preferredStartTime: '16:00',
            preferredEndTime: '20:00',
          },
          consentVersion: '2026-01',
          consentAcceptedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      const today = new Date()
      await saveItem(user, 'academicPeriods', {
        name: `Ano letivo ${today.getFullYear()}`,
        startDate: `${today.getFullYear()}-01-01`,
        endDate: `${today.getFullYear()}-12-31`,
        active: true,
        status: 'ACTIVE',
      })
      navigate('/app', { replace: true })
    } catch {
      setError('Não foi possível salvar seu perfil. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="onboarding-wrap">
      <section className="onboarding-card">
        <span className="eyebrow">
          <Sparkles size={15} /> Seu espaço de estudos
        </span>
        <h1>Vamos preparar sua agenda</h1>
        <p>
          Conte só o necessário para personalizar seu planejamento. Você poderá alterar essas
          informações depois.
        </p>
        <form className="form-grid" onSubmit={handleSubmit(save)}>
          <Field label="Como gostaria de ser chamado(a)?">
            <input {...register('displayName')} autoComplete="nickname" />
          </Field>
          <Field label="Faixa etária">
            <select {...register('ageRange')}>
              <option value="UNDER_13">Menos de 13 anos</option>
              <option value="13_15">13 a 15 anos</option>
              <option value="16_17">16 a 17 anos</option>
              <option value="18_PLUS">18 anos ou mais</option>
            </select>
          </Field>
          <Field label="Cidade">
            <input {...register('city')} autoComplete="address-level2" />
          </Field>
          <Field label="Estado (UF)">
            <input {...register('state')} maxLength={2} autoComplete="address-level1" />
          </Field>
          <Field label="Nível de ensino">
            <select {...register('educationLevel')}>
              <option value="FUNDAMENTAL">Ensino fundamental</option>
              <option value="MEDIO">Ensino médio</option>
              <option value="TECNICO">Ensino técnico</option>
              <option value="SUPERIOR">Ensino superior</option>
              <option value="OUTRO">Outro</option>
            </select>
          </Field>
          <Field label="Curso">
            <input {...register('courseName')} />
          </Field>
          <Field label="Série, ano ou período">
            <input {...register('gradeOrTerm')} />
          </Field>
          <Field label="Turno">
            <select {...register('schoolShift')}>
              <option value="MANHA">Manhã</option>
              <option value="TARDE">Tarde</option>
              <option value="NOITE">Noite</option>
              <option value="INTEGRAL">Integral</option>
              <option value="FLEXIVEL">Flexível</option>
            </select>
          </Field>
          <Field label="Instituição (opcional)">
            <input {...register('institutionName')} />
          </Field>
          <label className="check-label consent-row">
            <input type="checkbox" {...register('consentAccepted')} /> Eu li e aceito os{' '}
            <Link to="/termos">termos</Link> e a{' '}
            <Link to="/privacidade">política de privacidade</Link>. Se sou menor de idade, farei
            este cadastro com orientação do meu responsável.
          </label>
          {Object.values(errors).map((fieldError) => (
            <p className="form-error" key={fieldError?.message}>
              {fieldError?.message}
            </p>
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar e continuar'} <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </main>
  )
}

function AppLayout({ compact = false }: { compact?: boolean }) {
  const { profile, loading } = useProfile()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  if (loading) return <LoadingPage />
  if (!profile?.onboardingCompleted) return <Navigate to="/onboarding" replace />
  const active = areas.find((area) => area.to === location.pathname)
  return (
    <div className={`app-layout ${compact ? 'compact-layout' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link to="/app" className="brand">
          <span className="brand-mark">
            <BookOpen size={22} />
            <span className="brand-pencil" />
          </span>
          <span>Cola comigo</span>
        </Link>
        <div className="sidebar-caption">SEU ESPAÇO</div>
        <nav aria-label="Navegação principal">
          {areas.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={`nav-link ${location.pathname === to ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="student-chip">
            <span className="avatar">{profile.displayName?.slice(0, 1).toUpperCase() ?? 'E'}</span>
            <span>
              <strong>{profile.displayName}</strong>
              <small>{profile.gradeOrTerm}</small>
            </span>
          </div>
          <button
            className="nav-link signout"
            onClick={async () => {
              if (auth) await signOut(auth)
              navigate('/')
            }}
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir navegação"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <span className="topbar-label">Bom ter você por aqui</span>
            <strong>{active?.label ?? 'Minha agenda'}</strong>
          </div>
          <span className="topbar-avatar">{profile.displayName?.slice(0, 1).toUpperCase()}</span>
        </header>
        {compact && (
          <div className="embed-banner">
            <span>Cola comigo · agenda de estudos</span>
            <a href={`${window.location.origin}/app`} target="_blank" rel="noreferrer">
              Abrir em nova guia <ArrowRight size={14} />
            </a>
          </div>
        )}
        <div className="page-content">
          <Outlet />
        </div>
        <nav className="bottom-nav" aria-label="Navegação móvel">
          {areas.slice(0, 5).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={location.pathname === to ? 'active' : ''}
            >
              <Icon size={19} />
              <span>{label.split(' ')[0]}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  )
}

function DashboardPage() {
  const { profile } = useProfile()
  const subjects = useUserItems<Subject>('subjects')
  const assessments = useUserItems<Assessment>('assessments')
  const sessions = useUserItems<StudySession>('studySessions')
  const navigate = useNavigate()
  const today = startOfDay(new Date())
  const nextAssessment = assessments.items
    .filter((item) => item.status === 'PLANNED' && isAfter(parseISO(item.scheduledAt), today))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  const todaySessions = sessions.items.filter(
    (item) =>
      item.status === 'PLANNED' &&
      dateKey(item.startsAt, profile?.timezone) === dateKey(new Date(), profile?.timezone),
  )
  const attention = subjects.items.filter(
    (item) => item.status === 'ATTENTION' || item.status === 'APPROVAL_REACHED',
  )
  const weeklyMinutes = sessions.items
    .filter(
      (item) =>
        item.status === 'PLANNED' &&
        isAfter(parseISO(item.startsAt), today) &&
        parseISO(item.startsAt) < addDays(today, 7),
    )
    .reduce((sum, item) => sum + item.plannedMinutes, 0)
  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Sua rota de hoje</span>
          <h1>
            Olá, {profile?.displayName?.split(' ')[0] || 'estudante'}{' '}
            <span className="wave">✦</span>
          </h1>
          <p>
            {formatDate(new Date(), "EEEE, d 'de' MMMM", profile?.timezone)}. Um passo de cada vez.
          </p>
        </div>
        <Link to="/app/agenda" className="button primary">
          <CalendarDays size={17} /> Ver agenda
        </Link>
      </section>
      <section className="stat-grid" aria-label="Resumo de estudos">
        <StatCard
          label="Sessões de hoje"
          value={todaySessions.length}
          note={
            todaySessions.length
              ? 'Seu próximo passo já está planejado'
              : 'Você pode planejar seu dia'
          }
          icon={<CalendarDays size={19} />}
        />
        <StatCard
          label="Estudo nesta semana"
          value={`${Math.round(weeklyMinutes / 60)}h`}
          note={`${weeklyMinutes} minutos planejados`}
          icon={<Clock3 size={19} />}
        />
        <StatCard
          label="Disciplinas ativas"
          value={
            subjects.items.filter((item) => !['COMPLETED', 'ARCHIVED'].includes(item.status)).length
          }
          note="Acompanhe seu progresso"
          icon={<BookOpen size={19} />}
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel next-panel">
          <PanelHeading
            title="Próxima avaliação"
            action="Ver todas"
            onAction={() => navigate('/app/avaliacoes')}
          />
          {nextAssessment ? (
            <div className="assessment-highlight">
              <span
                className="subject-dot"
                style={{
                  backgroundColor:
                    subjects.items.find((item) => item.id === nextAssessment.subjectId)?.color ??
                    '#2f7664',
                }}
              />
              <div>
                <strong>{nextAssessment.title}</strong>
                <span>
                  {subjects.items.find((item) => item.id === nextAssessment.subjectId)?.name ??
                    'Disciplina'}{' '}
                  · {formatDate(nextAssessment.scheduledAt, "d 'de' MMMM", profile?.timezone)}
                </span>
              </div>
              <span className="date-badge">
                {Math.max(
                  0,
                  Math.ceil(
                    (parseISO(nextAssessment.scheduledAt).getTime() - new Date().getTime()) /
                      86_400_000,
                  ),
                )}{' '}
                dias
              </span>
            </div>
          ) : (
            <EmptyState
              title="Sem avaliações próximas"
              text="Cadastre uma prova ou atividade para organizar seus estudos."
              action="Adicionar avaliação"
              onAction={() => navigate('/app/avaliacoes')}
            />
          )}
        </section>
        <section className="panel today-panel">
          <PanelHeading
            title="Plano de hoje"
            action="Abrir agenda"
            onAction={() => navigate('/app/agenda')}
          />
          {todaySessions.length ? (
            <ul className="session-list">
              {todaySessions.slice(0, 3).map((session) => (
                <li key={session.id}>
                  <span className="timeline-dot" />
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {formatDate(session.startsAt, 'HH:mm')} · {session.plannedMinutes} min
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Seu dia está aberto"
              text="Gere uma sugestão de agenda com base nas próximas avaliações."
              action="Planejar estudos"
              onAction={() => navigate('/app/agenda')}
            />
          )}
        </section>
      </div>
      <section className="panel attention-panel">
        <PanelHeading
          title="Acompanhe de perto"
          subtitle="Disciplinas que pedem atenção ou já atingiram o objetivo informado"
          action="Ver disciplinas"
          onAction={() => navigate('/app/disciplinas')}
        />
        {attention.length ? (
          <div className="subject-grid">
            {attention.map((subject) => (
              <div className="subject-mini" key={subject.id}>
                <span className="subject-dot" style={{ backgroundColor: subject.color }} />
                <div>
                  <strong>{subject.name}</strong>
                  <span>
                    {subject.status === 'APPROVAL_REACHED'
                      ? 'Objetivo atingido — confirme o próximo passo'
                      : 'Vale reservar um tempo para revisar'}
                  </span>
                </div>
                <ChevronRight size={17} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Tudo em ordem por aqui"
            text="Quando adicionar disciplinas e avaliações, seus lembretes aparecerão aqui."
          />
        )}
      </section>
      <div className="quick-actions">
        <Link to="/app/disciplinas" className="quick-action">
          <Plus size={18} /> Nova disciplina
        </Link>
        <Link to="/app/avaliacoes" className="quick-action">
          <Plus size={18} /> Adicionar avaliação ou nota
        </Link>
        <Link to="/app/rotina" className="quick-action">
          <Plus size={18} /> Adicionar compromisso
        </Link>
      </div>
      {Object.values([subjects.error, assessments.error, sessions.error]).some(Boolean) && (
        <p className="form-error" role="alert">
          Alguns dados não puderam ser carregados. Tente novamente.
        </p>
      )}
      <p className="disclaimer">
        <CircleHelp size={15} /> As médias usam os critérios que você informou e não substituem o
        resultado oficial da sua instituição.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
  icon,
}: {
  label: string
  value: string | number
  note: string
  icon: ReactNode
}) {
  return (
    <article className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function PanelHeading({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action} <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string
  text: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Compass size={20} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action} <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

function SubjectsPage() {
  const { user } = useAuth()
  const { items: subjects } = useUserItems<Subject>('subjects')
  const { items: assessments } = useUserItems<Assessment>('assessments')
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [values, setValues] = useState<SubjectInput>({
    name: '',
    color: '#2f7664',
    calculationType: 'SIMPLE_AVERAGE' as const,
    passingGrade: 7,
    maximumGrade: 10,
    expectedAssessmentCount: 4,
    knownByStudent: true,
  })
  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const parsed = subjectSchema.safeParse(values)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revise os campos.')
    try {
      await saveItem(user, 'subjects', {
        ...parsed.data,
        status: 'IN_PROGRESS',
        currentAverage: null,
      })
      setShowForm(false)
      setValues({ ...values, name: '' })
      setError('')
    } catch {
      setError('Não foi possível salvar a disciplina.')
    }
  }
  async function closeSubject(subject: Subject, reopen = false) {
    if (!db || !user) return
    const message = reopen
      ? `Reabrir ${subject.name} e recalcular o plano?`
      : `Encerrar ${subject.name}? As sessões futuras sugeridas serão removidas.`
    if (!window.confirm(message)) return
    setBusyId(subject.id)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'users', user.uid, 'subjects', subject.id), {
        status: reopen ? 'IN_PROGRESS' : 'COMPLETED',
        completedAt: reopen ? null : serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      if (!reopen) {
        const futureSessions = sessionsForSubject(subject.id)
        if (futureSessions.length > 450) {
          throw new Error('Há sessões demais para encerrar em uma operação.')
        }
        for (const session of futureSessions) {
          batch.delete(doc(db, 'users', user.uid, 'studySessions', session.id))
        }
      }
      await batch.commit()
      setNotice(
        reopen ? 'Disciplina reaberta.' : 'Disciplina encerrada. Seu histórico foi preservado.',
      )
    } catch {
      setError('Não foi possível atualizar a disciplina.')
    } finally {
      setBusyId('')
    }
  }
  const { items: sessions } = useUserItems<StudySession>('studySessions')
  function sessionsForSubject(subjectId: string) {
    return sessions.filter(
      (session) =>
        session.subjectId === subjectId &&
        session.generatedByPlanner &&
        session.status === 'PLANNED' &&
        isAfter(parseISO(session.startsAt), new Date()),
    )
  }
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Seu aprendizado"
        title="Disciplinas"
        description="Defina o que está estudando e como sua instituição calcula a aprovação."
        action={
          <button className="button primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={17} /> Nova disciplina
          </button>
        }
      />
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
      {showForm && (
        <section className="panel form-panel">
          <PanelHeading title="Adicionar disciplina" />
          <form className="form-grid" onSubmit={addSubject}>
            <Field label="Nome da disciplina">
              <input
                value={values.name}
                onChange={(event) => setValues({ ...values, name: event.target.value })}
                required
                maxLength={80}
              />
            </Field>
            <Field label="Tipo de cálculo">
              <select
                value={values.calculationType}
                onChange={(event) =>
                  setValues({
                    ...values,
                    calculationType: event.target.value as typeof values.calculationType,
                  })
                }
              >
                <option value="SIMPLE_AVERAGE">Média simples</option>
                <option value="WEIGHTED_AVERAGE">Média ponderada</option>
                <option value="POINTS_TOTAL">Pontos acumulados</option>
                <option value="MANUAL">Acompanhamento manual</option>
              </select>
            </Field>{' '}
            <Field label="Nota para aprovação">
              <input
                type="number"
                min="0"
                max={values.maximumGrade}
                step="0.1"
                value={values.passingGrade ?? ''}
                disabled={values.calculationType === 'MANUAL'}
                onChange={(event) =>
                  setValues({
                    ...values,
                    passingGrade:
                      event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Nota máxima">
              <input
                type="number"
                min="1"
                max="1000"
                step="0.1"
                value={values.maximumGrade}
                onChange={(event) =>
                  setValues({ ...values, maximumGrade: Number(event.target.value) })
                }
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={values.knownByStudent}
                onChange={(event) => setValues({ ...values, knownByStudent: event.target.checked })}
              />{' '}
              Conheço a regra de aprovação informada
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button className="button primary">Salvar disciplina</button>
            </div>
          </form>
        </section>
      )}
      {subjects.length === 0 ? (
        <EmptyState
          title="Sua lista começa aqui"
          text="Adicione uma disciplina para acompanhar avaliações, notas e sessões de estudo."
          action="Adicionar disciplina"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="subject-grid">
          {subjects.map((subject) => {
            const summary = calculateGrade(subject, assessments)
            return (
              <article className="panel subject-card" key={subject.id}>
                <div className="subject-card-top">
                  <span className="subject-dot large" style={{ backgroundColor: subject.color }} />
                  <span className={`status-chip ${subject.status.toLowerCase()}`}>
                    {subject.status === 'COMPLETED'
                      ? 'Encerrada'
                      : summary.status === 'APPROVAL_REACHED'
                        ? 'Objetivo atingido'
                        : 'Em andamento'}
                  </span>
                </div>
                <h2>{subject.name}</h2>
                <p>
                  {summary.value === null
                    ? 'Ainda sem notas suficientes'
                    : `Média atual: ${summary.value.toFixed(1)} / ${subject.maximumGrade}`}
                </p>
                <small>
                  {subject.calculationType === 'MANUAL'
                    ? 'Acompanhamento manual'
                    : `Meta informada: ${subject.passingGrade ?? 'não definida'}`}
                </small>
                {summary.status === 'APPROVAL_REACHED' && subject.status !== 'COMPLETED' && (
                  <div className="approval-callout">
                    <strong>Objetivo atingido</strong>
                    <span>
                      Com base na regra que você cadastrou, sua nota alcançou a meta. Confirme se
                      deseja encerrar.
                    </span>
                    <button
                      className="button primary small"
                      disabled={busyId === subject.id}
                      onClick={() => closeSubject(subject)}
                    >
                      Encerrar disciplina
                    </button>
                    <button
                      className="text-link"
                      onClick={() =>
                        setNotice(
                          'Você escolheu continuar estudando. A disciplina permanece ativa.',
                        )
                      }
                    >
                      Continuar estudando
                    </button>
                  </div>
                )}
                {subject.status === 'COMPLETED' && (
                  <button
                    className="button secondary small"
                    disabled={busyId === subject.id}
                    onClick={() => closeSubject(subject, true)}
                  >
                    Reabrir disciplina
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
      <p className="disclaimer">
        <CircleHelp size={15} /> Os cálculos usam regras informadas por você e não substituem o
        resultado oficial da instituição.
      </p>
    </div>
  )
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  )
}

function AssessmentsPage() {
  const { user } = useAuth()
  const { items: subjects } = useUserItems<Subject>('subjects')
  const { items: assessments } = useUserItems<Assessment>('assessments')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState({
    subjectId: '',
    title: '',
    type: 'EXAM' as const,
    scheduledAt: '',
    contentDescription: '',
    weight: 1,
    maximumGrade: 10,
    estimatedStudyMinutes: 60,
  })
  async function addAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const parsed = assessmentSchema.safeParse(values)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revise os campos.')
    try {
      const grade = parsed.data.grade
      await saveItem(user, 'assessments', {
        ...parsed.data,
        grade: grade === '' ? null : (grade ?? null),
        status: typeof grade === 'number' ? 'GRADED' : 'PLANNED',
      })
      setShowForm(false)
      setValues({ ...values, title: '', scheduledAt: '', contentDescription: '' })
      setError('')
    } catch {
      setError('Não foi possível salvar a avaliação.')
    }
  }
  async function recordGrade(assessment: Assessment, raw: string) {
    if (!user || !functions || raw === '') return
    const grade = Number(raw)
    if (!Number.isFinite(grade) || grade < 0 || grade > assessment.maximumGrade)
      return setError(`A nota deve estar entre 0 e ${assessment.maximumGrade}.`)
    try {
      await httpsCallable<{ assessmentId: string; grade: number }, { recorded: boolean }>(
        functions,
        'recordAssessmentGrade',
      )({ assessmentId: assessment.id, grade })
      setError('')
    } catch {
      setError(
        'Não foi possível registrar a nota. Confirme se as funções Firebase foram publicadas.',
      )
    }
  }
  const sorted = [...assessments].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Datas e resultados"
        title="Avaliações e notas"
        description="Cadastre provas, trabalhos e os resultados para acompanhar sua evolução."
        action={
          <button className="button primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={17} /> Nova avaliação
          </button>
        }
      />
      {showForm && (
        <section className="panel form-panel">
          <PanelHeading title="Adicionar avaliação" />
          <form className="form-grid" onSubmit={addAssessment}>
            <Field label="Título">
              <input
                value={values.title}
                onChange={(event) => setValues({ ...values, title: event.target.value })}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Disciplina">
              <select
                value={values.subjectId}
                onChange={(event) => setValues({ ...values, subjectId: event.target.value })}
                required
              >
                <option value="">Selecione</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo">
              <select
                value={values.type}
                onChange={(event) =>
                  setValues({ ...values, type: event.target.value as typeof values.type })
                }
              >
                <option value="EXAM">Prova</option>
                <option value="QUIZ">Questionário</option>
                <option value="ASSIGNMENT">Trabalho</option>
                <option value="PRESENTATION">Apresentação</option>
                <option value="PROJECT">Projeto</option>
                <option value="OTHER">Outro</option>
              </select>
            </Field>
            <Field label="Data e horário">
              <input
                type="datetime-local"
                value={values.scheduledAt}
                onChange={(event) => setValues({ ...values, scheduledAt: event.target.value })}
                required
              />
            </Field>
            <Field label="Nota máxima">
              <input
                type="number"
                min="1"
                max="1000"
                step="0.1"
                value={values.maximumGrade}
                onChange={(event) =>
                  setValues({ ...values, maximumGrade: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Peso (se usado na média ponderada)">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.1"
                value={values.weight}
                onChange={(event) => setValues({ ...values, weight: Number(event.target.value) })}
              />
            </Field>
            <Field label="Tempo sugerido para estudar (minutos)">
              <input
                type="number"
                min="15"
                max="600"
                step="15"
                value={values.estimatedStudyMinutes}
                onChange={(event) =>
                  setValues({ ...values, estimatedStudyMinutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Conteúdos">
              <input
                value={values.contentDescription}
                onChange={(event) =>
                  setValues({ ...values, contentDescription: event.target.value })
                }
                maxLength={500}
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button className="button primary">Salvar avaliação</button>
            </div>
          </form>
        </section>
      )}
      {error && !showForm && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <PanelHeading title="Próximas e anteriores" />
        {sorted.length === 0 ? (
          <EmptyState
            title="Nenhuma avaliação cadastrada"
            text="Ao adicionar datas e conteúdos, o planejador poderá sugerir horários de estudo."
            action="Adicionar avaliação"
            onAction={() => setShowForm(true)}
          />
        ) : (
          <div className="assessment-list">
            {sorted.map((item) => (
              <article className="assessment-row" key={item.id}>
                <span className="assessment-type-icon">
                  <Target size={18} />
                </span>
                <div className="assessment-info">
                  <strong>{item.title}</strong>
                  <span>
                    {subjects.find((subject) => subject.id === item.subjectId)?.name ??
                      'Disciplina'}{' '}
                    · {formatDate(item.scheduledAt, "dd/MM/yyyy 'às' HH:mm")}
                  </span>
                  {item.contentDescription && <small>{item.contentDescription}</small>}
                </div>
                <div className="grade-entry">
                  {item.status === 'GRADED' ? (
                    <span className="grade-pill">
                      {Number(item.grade).toLocaleString('pt-BR')} / {item.maximumGrade}
                    </span>
                  ) : (
                    <label className="grade-input-label">
                      Registrar nota
                      <input
                        aria-label={`Nota de ${item.title}`}
                        type="number"
                        min="0"
                        max={item.maximumGrade}
                        step="0.1"
                        onBlur={(event) => recordGrade(item, event.currentTarget.value)}
                        placeholder="—"
                      />
                    </label>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AgendaPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { items: subjects } = useUserItems<Subject>('subjects')
  const { items: assessments } = useUserItems<Assessment>('assessments')
  const { items: sessions } = useUserItems<StudySession>('studySessions')
  const events = useUserItems<ExceptionalEvent>('exceptionalEvents')
  const commitments = useUserItems<RecurringCommitment>('recurringCommitments')
  const trips = useUserItems<Trip>('trips')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [error, setError] = useState('')
  const weekStart = addDays(startOfDay(new Date()), weekOffset * 7)
  const weekEnd = addDays(weekStart, 7)
  const weekSessions = sessions
    .filter(
      (session) => parseISO(session.startsAt) >= weekStart && parseISO(session.startsAt) < weekEnd,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  async function replan() {
    if (!user || !db) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const current = new Date()
      const timezone = profile?.timezone ?? 'America/Sao_Paulo'
      const planningDays = Array.from({ length: 14 }, (_, index) => {
        const calendarDate = addDays(startOfDay(current), index + 1)
        const key = dateKey(calendarDate, timezone)
        return { calendarDate, key }
      })
      const blocks = [
        ...events.items
          .filter((item) => item.blocksStudy)
          .map((item) => ({ startsAt: item.startsAt, endsAt: item.endsAt })),
        ...commitments.items
          .filter((item) => item.active)
          .flatMap((item) =>
            planningDays
              .filter(({ calendarDate }) => item.daysOfWeek.includes(getDay(calendarDate)))
              .map(({ key }) => ({
                startsAt: zonedTimeToIso(key, item.startTime, timezone),
                endsAt: zonedTimeToIso(key, item.endTime, timezone),
              })),
          ),
      ]
      const dailyMinuteCaps: Record<string, number> = {}
      for (const { key } of planningDays) {
        const start = new Date(zonedTimeToIso(key, '00:00', timezone))
        const end = new Date(zonedTimeToIso(key, '23:59', timezone))
        const trip = trips.items.find(
          (item) => parseISO(item.startsAt) < end && parseISO(item.endsAt) > start,
        )
        if (!trip) continue
        if (trip.studyAllowed) dailyMinuteCaps[key] = trip.dailyAvailableMinutes
        else blocks.push({ startsAt: start.toISOString(), endsAt: end.toISOString() })
      }
      const result = generatePlan({
        now: current,
        subjects: subjects.map((subject) => ({
          ...subject,
          currentAverage: calculateGrade(subject, assessments).value,
        })),
        assessments,
        existingSessions: sessions.filter(
          (session) =>
            !(
              session.generatedByPlanner &&
              session.status === 'PLANNED' &&
              !session.manuallyEdited
            ),
        ),
        blockedTimes: blocks,
        planningDays: 14,
        allowedDays: profile?.studyPreferences?.allowedDaysOfWeek ?? [1, 2, 3, 4, 5, 6],
        preferredStartTime: profile?.studyPreferences?.preferredStartTime ?? '16:00',
        preferredEndTime: profile?.studyPreferences?.preferredEndTime ?? '20:00',
        sessionMinutes: profile?.studyPreferences?.preferredSessionMinutes ?? 45,
        maxDailyMinutes: profile?.studyPreferences?.maximumDailyStudyMinutes ?? 120,
        timezone,
        dailyMinuteCaps,
      })
      const fresh = result.sessions.filter(
        (session) =>
          session.generatedByPlanner && session.status === 'PLANNED' && !session.manuallyEdited,
      )
      const proposal = `O planejador sugere ${fresh.length} sessões. ${result.warnings.length ? `Há ${result.warnings.length} aviso(s).` : ''} Aplicar este plano?`
      if (!window.confirm(proposal)) return
      const oldGenerated = sessions.filter(
        (session) =>
          session.generatedByPlanner && !session.manuallyEdited && session.status === 'PLANNED',
      )
      const freshIds = new Set(fresh.map((session) => session.id))
      const deletions = oldGenerated.filter((session) => !freshIds.has(session.id))
      if (deletions.length + fresh.length > 450)
        throw new Error('O plano é grande demais para aplicar em uma única operação.')
      const batch = writeBatch(db)
      for (const session of deletions) {
        batch.delete(doc(db, 'users', user.uid, 'studySessions', session.id))
      }
      for (const session of fresh) {
        const { id, ...sessionData } = session
        batch.set(doc(db, 'users', user.uid, 'studySessions', id), {
          ...sessionData,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
      setNotice(result.warnings[0] ?? `${fresh.length} sessões adicionadas ao seu plano.`)
    } catch {
      setError('Não foi possível recalcular sua agenda. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  async function updateSession(session: StudySession, status: StudySession['status']) {
    if (!db || !user) return
    const completedMinutes =
      status === 'COMPLETED' ? session.plannedMinutes : session.completedMinutes
    try {
      await updateDoc(doc(db, 'users', user.uid, 'studySessions', session.id), {
        status,
        completedMinutes,
        updatedAt: serverTimestamp(),
      })
    } catch {
      setError('Não foi possível atualizar a sessão.')
    }
  }
  const sessionByDay = useMemo(() => {
    const grouped = new Map<string, StudySession[]>()
    for (const session of weekSessions) {
      const day = dateKey(session.startsAt, profile?.timezone)
      grouped.set(day, [...(grouped.get(day) ?? []), session])
    }
    return grouped
  }, [profile?.timezone, weekSessions])
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Planejamento flexível"
        title="Minha agenda"
        description="Sugestões que você pode ajustar. Seu tempo, seu ritmo."
        action={
          <button className="button primary" onClick={replan} disabled={busy}>
            <RefreshCw size={16} className={busy ? 'spin' : ''} />{' '}
            {busy ? 'Recalculando…' : 'Recalcular agenda'}
          </button>
        }
      />
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel agenda-panel">
        <div className="week-controls">
          <button
            className="icon-button"
            aria-label="Semana anterior"
            onClick={() => setWeekOffset(weekOffset - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {format(weekStart, "d 'de' MMM", { locale: ptBR })} —{' '}
            {format(addDays(weekEnd, -1), "d 'de' MMM yyyy", { locale: ptBR })}
          </strong>
          <button
            className="icon-button"
            aria-label="Próxima semana"
            onClick={() => setWeekOffset(weekOffset + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {weekSessions.length === 0 ? (
          <EmptyState
            title="Sua agenda ainda está livre"
            text="Cadastre avaliações e disciplinas, depois peça uma sugestão. O plano só será aplicado com sua confirmação."
            action={subjects.length ? 'Gerar sugestão de estudos' : undefined}
            onAction={replan}
          />
        ) : (
          <div className="agenda-list">
            {[...sessionByDay.entries()].map(([day, items]) => (
              <section className="agenda-day" key={day}>
                <h3>{formatDate(`${day}T12:00:00`, "EEEE, d 'de' MMMM")}</h3>
                {items.map((session) => (
                  <article
                    className={`agenda-session ${session.status.toLowerCase()}`}
                    key={session.id}
                  >
                    <span className="session-time">{formatDate(session.startsAt, 'HH:mm')}</span>
                    <span className="timeline-dot" />
                    <div className="session-content">
                      <strong>{session.title}</strong>
                      <span>
                        {subjects.find((subject) => subject.id === session.subjectId)?.name ??
                          'Estudo'}{' '}
                        · {session.plannedMinutes} min
                      </span>
                      {session.status === 'PLANNED' && (
                        <div className="session-actions">
                          <button
                            className="text-link"
                            onClick={() => updateSession(session, 'COMPLETED')}
                          >
                            <Check size={14} /> Concluir
                          </button>
                          <button
                            className="text-link"
                            onClick={() => updateSession(session, 'POSTPONED')}
                          >
                            Adiar
                          </button>
                          <button
                            className="text-link"
                            onClick={() => updateSession(session, 'MISSED')}
                          >
                            Não realizada
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="status-chip">
                      {session.status === 'COMPLETED'
                        ? 'Concluída'
                        : session.status === 'PLANNED'
                          ? 'Planejada'
                          : session.status === 'POSTPONED'
                            ? 'Adiada'
                            : session.status === 'MISSED'
                              ? 'Não realizada'
                              : 'Cancelada'}
                    </span>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
      <p className="disclaimer">
        <CircleHelp size={15} /> A agenda é uma sugestão. Você decide se, quando e como aplicar as
        mudanças.
      </p>
    </div>
  )
}

function RoutinePage() {
  const { user } = useAuth()
  const events = useUserItems<ExceptionalEvent>('exceptionalEvents')
  const commitments = useUserItems<RecurringCommitment>('recurringCommitments')
  const trips = useUserItems<Trip>('trips')
  const [daysOfWeek, setDaysOfWeek] = useState([1, 2, 3, 4, 5])
  const [error, setError] = useState('')

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const startsAt = String(form.get('startsAt') ?? '')
    const endsAt = String(form.get('endsAt') ?? '')
    if (title.length < 2 || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      setError('Informe título, início e fim válidos. O fim deve ser depois do início.')
      return
    }
    try {
      await saveItem(user, 'exceptionalEvents', {
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        blocksStudy: true,
        category: 'OTHER',
      })
      formElement.reset()
      setError('')
    } catch {
      setError('Não foi possível salvar o evento.')
    }
  }

  async function addCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const startTime = String(form.get('startTime') ?? '')
    const endTime = String(form.get('endTime') ?? '')
    if (
      title.length < 2 ||
      daysOfWeek.length === 0 ||
      !startTime ||
      !endTime ||
      endTime <= startTime
    ) {
      setError('Informe o nome, pelo menos um dia e um intervalo de horários válido.')
      return
    }
    try {
      await saveItem(user, 'recurringCommitments', {
        title,
        category: 'OTHER',
        daysOfWeek,
        startTime,
        endTime,
        active: true,
      })
      formElement.reset()
      setDaysOfWeek([1, 2, 3, 4, 5])
      setError('')
    } catch {
      setError('Não foi possível salvar o compromisso recorrente.')
    }
  }

  async function addTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const startsAt = String(form.get('startsAt') ?? '')
    const endsAt = String(form.get('endsAt') ?? '')
    const studyAllowed = form.get('studyAllowed') === 'on'
    const dailyAvailableMinutes = Number(form.get('dailyAvailableMinutes') ?? 0)
    if (title.length < 2 || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      setError('Informe o nome e datas válidas para a viagem.')
      return
    }
    if (
      studyAllowed &&
      (!Number.isInteger(dailyAvailableMinutes) ||
        dailyAvailableMinutes < 15 ||
        dailyAvailableMinutes > 600)
    ) {
      setError('Informe de 15 a 600 minutos disponíveis por dia.')
      return
    }
    try {
      await saveItem(user, 'trips', {
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        studyAllowed,
        dailyAvailableMinutes: studyAllowed ? dailyAvailableMinutes : 0,
      })
      formElement.reset()
      setError('')
    } catch {
      setError('Não foi possível salvar a viagem.')
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Disponibilidade"
        title="Rotina e compromissos"
        description="Informe horários ocupados, atividades e viagens. A sugestão tentará respeitar sua disponibilidade."
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel form-panel">
        <PanelHeading
          title="Compromisso recorrente"
          subtitle="Aulas, esportes, cursos ou outros horários fixos."
        />
        <form className="form-grid" onSubmit={addCommitment}>
          <Field label="Nome">
            <input name="title" required maxLength={100} />
          </Field>
          <div className="field">
            <span>Dias da semana</span>
            <div className="weekday-picker">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={daysOfWeek.includes(index)}
                    onChange={() =>
                      setDaysOfWeek((current) =>
                        current.includes(index)
                          ? current.filter((value) => value !== index)
                          : [...current, index].sort(),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <Field label="Começa">
            <input name="startTime" type="time" required />
          </Field>
          <Field label="Termina">
            <input name="endTime" type="time" required />
          </Field>
          <button className="button primary">
            <Plus size={16} /> Salvar horário fixo
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <PanelHeading
          title="Evento ou atividade"
          subtitle="Prova extra, atividade extracurricular ou compromisso com data específica."
        />
        <form className="form-grid" onSubmit={addEvent}>
          <Field label="Nome do evento">
            <input name="title" required maxLength={100} />
          </Field>
          <Field label="Começa em">
            <input name="startsAt" type="datetime-local" required />
          </Field>
          <Field label="Termina em">
            <input name="endsAt" type="datetime-local" required />
          </Field>
          <button className="button primary">
            <Plus size={16} /> Salvar evento
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <PanelHeading
          title="Viagem"
          subtitle="Informe se deseja reservar algum tempo para estudar durante a viagem."
        />
        <form className="form-grid" onSubmit={addTrip}>
          <Field label="Nome">
            <input name="title" required maxLength={100} />
          </Field>
          <Field label="Começa em">
            <input name="startsAt" type="datetime-local" required />
          </Field>
          <Field label="Termina em">
            <input name="endsAt" type="datetime-local" required />
          </Field>
          <label className="check-label">
            <input name="studyAllowed" type="checkbox" /> Pretendo estudar durante a viagem
          </label>
          <Field label="Máximo de minutos por dia, se for estudar">
            <input
              name="dailyAvailableMinutes"
              type="number"
              min="15"
              max="600"
              defaultValue="45"
            />
          </Field>
          <button className="button primary">
            <Plus size={16} /> Salvar viagem
          </button>
        </form>
      </section>
      <section className="panel">
        <PanelHeading title="Horários fixos" />
        {commitments.loading ? (
          <LoadingPage />
        ) : commitments.items.length ? (
          <div className="assessment-list">
            {commitments.items.map((item) => (
              <article className="assessment-row" key={item.id}>
                <span className="assessment-type-icon">
                  <Clock3 size={18} />
                </span>
                <div className="assessment-info">
                  <strong>{item.title}</strong>
                  <span>
                    {item.daysOfWeek
                      .map((day) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day])
                      .join(', ')}{' '}
                    · {item.startTime}–{item.endTime}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum horário fixo"
            text="Cadastre aulas e atividades que se repetem durante a semana."
          />
        )}
      </section>
      <section className="panel">
        <PanelHeading title="Eventos e viagens" />
        {events.loading || trips.loading ? (
          <LoadingPage />
        ) : events.items.length + trips.items.length ? (
          <div className="assessment-list">
            {events.items.map((item) => (
              <article className="assessment-row" key={item.id}>
                <span className="assessment-type-icon">
                  <CalendarDays size={18} />
                </span>
                <div className="assessment-info">
                  <strong>{item.title}</strong>
                  <span>
                    {formatDate(item.startsAt, "dd/MM/yyyy 'às' HH:mm")} —{' '}
                    {formatDate(item.endsAt, 'HH:mm')}
                  </span>
                </div>
              </article>
            ))}
            {trips.items.map((item) => (
              <article className="assessment-row" key={item.id}>
                <span className="assessment-type-icon">
                  <Compass size={18} />
                </span>
                <div className="assessment-info">
                  <strong>{item.title}</strong>
                  <span>
                    {formatDate(item.startsAt, "dd/MM/yyyy 'às' HH:mm")} —{' '}
                    {formatDate(item.endsAt, 'dd/MM/yyyy HH:mm')} ·{' '}
                    {item.studyAllowed
                      ? `${item.dailyAvailableMinutes} min/dia de estudo`
                      : 'sem estudo planejado'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum evento ou viagem"
            text="Eventos e períodos de viagem podem ser considerados no próximo planejamento."
          />
        )}
      </section>
      <p className="disclaimer">
        <CircleHelp size={15} /> A disponibilidade depende dos dados informados e deve ser conferida
        por você antes de aplicar o plano.
      </p>
    </div>
  )
}

function ReportsPage() {
  const { items: subjects } = useUserItems<Subject>('subjects')
  const { items: assessments } = useUserItems<Assessment>('assessments')
  const chartData = assessments
    .filter((item) => item.status === 'GRADED' && typeof item.grade === 'number')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((item) => ({
      name: `${item.title} · ${formatDate(item.scheduledAt, 'dd/MM')}`,
      nota: Number(item.grade),
    }))
  const averages = subjects.map((subject) => ({
    subject,
    summary: calculateGrade(subject, assessments),
  }))
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Sua evolução"
        title="Relatórios"
        description="Acompanhe suas notas e médias ao longo do período."
      />
      <section className="panel chart-panel">
        <PanelHeading
          title="Notas registradas"
          subtitle="Cada nota é comparada ao máximo da avaliação."
        />
        {chartData.length ? (
          <Suspense fallback={<LoadingPage />}>
            <GradeChart data={chartData} />
          </Suspense>
        ) : (
          <EmptyState
            title="Seu gráfico aparecerá aqui"
            text="Registre notas de avaliações para visualizar sua evolução."
          />
        )}
      </section>
      <section className="panel">
        <PanelHeading title="Resumo por disciplina" />
        {averages.length ? (
          <div className="report-list">
            {averages.map(({ subject, summary }) => (
              <div className="report-row" key={subject.id}>
                <span className="subject-dot" style={{ backgroundColor: subject.color }} />
                <strong>{subject.name}</strong>
                <span>
                  {summary.value === null
                    ? 'Sem média calculável'
                    : `${summary.value.toFixed(1)} / ${subject.maximumGrade}`}
                </span>
                <span className={`status-chip ${summary.status.toLowerCase()}`}>
                  {summary.status === 'APPROVAL_REACHED'
                    ? 'Meta atingida'
                    : summary.status === 'BELOW_TARGET'
                      ? 'Em progresso'
                      : 'Aguardando dados'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sem disciplinas ainda"
            text="Adicione disciplinas e avaliações para começar a acompanhar seu progresso."
          />
        )}
      </section>
    </div>
  )
}

function ProfilePage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function exportData() {
    if (!functions) return setError('O serviço de exportação ainda não foi configurado.')
    try {
      const call = httpsCallable(functions, 'exportUserData')
      const response = await call({})
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'cola-comigo-meus-dados.json'
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Sua exportação foi preparada.')
    } catch {
      setError('Não foi possível exportar seus dados. Tente novamente mais tarde.')
    }
  }
  async function deleteAccount() {
    if (!user || !functions || !auth)
      return setError('O serviço de exclusão ainda não foi configurado.')
    if (
      !window.confirm(
        'Excluir sua conta e os dados acadêmicos associados? Esta ação não pode ser desfeita.',
      )
    )
      return
    try {
      await httpsCallable(functions, 'deleteUserData')({})
      await signOut(auth)
      window.location.assign('/')
    } catch {
      setError(
        'A exclusão segura da conta ainda não está disponível. Entre em contato com o suporte.',
      )
    }
  }
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Seus dados"
        title="Meu perfil"
        description="Confira as informações usadas para personalizar sua agenda."
      />
      {profile && (
        <section className="panel profile-details">
          <div className="profile-large-avatar">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h2>{profile.displayName}</h2>
            <p>{user?.email}</p>
            <p>
              {profile.city} — {profile.state} · {profile.gradeOrTerm}
            </p>
            <p>
              {profile.courseName} · {profile.educationLevel}
            </p>
            <small>Fuso horário: {profile.timezone}</small>
          </div>
        </section>
      )}
      <section className="panel">
        <PanelHeading
          title="Seus dados e sua conta"
          subtitle="Você pode solicitar uma cópia ou excluir seus dados associados à conta."
        />
        <div className="profile-actions">
          <button className="button secondary" onClick={exportData}>
            <ArrowDownToLine size={16} /> Exportar meus dados (JSON)
          </button>
          <button className="button danger" onClick={deleteAccount}>
            <Trash2 size={16} /> Excluir conta e dados
          </button>
        </div>
      </section>
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function LegalPage({ privacy = false }: { privacy?: boolean }) {
  return (
    <section className="legal-card">
      <span className="eyebrow">Cola comigo</span>
      <h1>{privacy ? 'Privacidade' : 'Termos de uso'}</h1>
      <p className="legal-warning">
        Texto provisório para desenvolvimento. A revisão jurídica, a adequação à LGPD e os
        procedimentos para menores devem ser validados por profissional qualificado antes do
        lançamento público.
      </p>
      {privacy ? (
        <>
          <h2>Dados utilizados</h2>
          <p>
            O serviço usa e-mail de autenticação e os dados acadêmicos e de planejamento que você
            decidir registrar. Não coletamos endereço residencial nem localização em tempo real.
          </p>
          <h2>Uso e controle</h2>
          <p>
            Os dados são usados para organizar sua agenda. As regras do banco restringem a leitura
            ao titular da conta. Você pode solicitar exportação e exclusão na área de perfil.
          </p>
          <h2>Menores de idade</h2>
          <p>
            Se você for menor, faça o cadastro com orientação do responsável. O fluxo de
            consentimento do responsável deve ser validado antes do lançamento público.
          </p>
        </>
      ) : (
        <>
          <h2>Uso da agenda</h2>
          <p>
            As sugestões, médias e projeções são baseadas nos dados e critérios informados pelo
            estudante e não substituem informações oficiais da instituição.
          </p>
          <h2>Conta e segurança</h2>
          <p>
            Use uma senha segura e não compartilhe seu acesso. Os textos legais desta página são
            provisórios e precisam de revisão profissional antes da publicação.
          </p>
        </>
      )}
    </section>
  )
}

function LoadingPage() {
  return (
    <div className="loading-page" role="status" aria-live="polite">
      <span className="loader" />
      Carregando sua agenda…
    </div>
  )
}

function NotFound() {
  return (
    <AuthCard title="Página não encontrada" subtitle="Este caminho não existe.">
      <Link className="button primary full" to="/">
        Voltar ao início
      </Link>
    </AuthCard>
  )
}

function AppRoutes() {
  const { loading, user } = useAuth()
  if (loading) return <LoadingPage />
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="entrar" element={<SignInPage />} />
        <Route path="cadastro" element={<SignUpPage />} />
        <Route path="recuperar-senha" element={<ResetPasswordPage />} />
        <Route
          path="verificar-email"
          element={user ? <VerifyEmailPage /> : <Navigate to="/entrar" replace />}
        />
        <Route path="termos" element={<LegalPage />} />
        <Route path="privacidade" element={<LegalPage privacy />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="disciplinas" element={<SubjectsPage />} />
          <Route path="avaliacoes" element={<AssessmentsPage />} />
          <Route path="rotina" element={<RoutinePage />} />
          <Route path="historico" element={<ReportsPage />} />
          <Route path="perfil" element={<ProfilePage />} />
        </Route>
        <Route path="embed" element={<AppLayout compact />}>
          <Route index element={<DashboardPage />} />
          <Route path="agenda" element={<AgendaPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

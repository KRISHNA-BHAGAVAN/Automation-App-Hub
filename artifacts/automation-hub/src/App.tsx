import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Check,
  ChevronLeft,
  CircleAlert,
  ExternalLink,
  FolderPlus,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
  Workflow,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, type AppCard, type Category, type Profile } from '@/lib/api';
import { AccessRequestsView, PeopleView } from '@/components/admin/AdminViews';
import './index.css';
import './theme.css';

const queryClient = new QueryClient();

// Auth Context
interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  logout: async () => {},
});

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={light ? 'auth-wordmark' : 'brand-lockup'}>
      <span className="brand-mark"><Workflow size={19} strokeWidth={2.1} /></span>
      <span>
        <span className="brand-name">Automation Hub</span>
        {!light && <span className="brand-sub">Private workspace</span>}
      </span>
    </div>
  );
}

function LoadingScreen({ label = 'Loading your workspace' }: { label?: string }) {
  return (
    <main className="hub-shell">
      <header className="app-header"><Brand /></header>
      <div className="main-content" aria-live="polite">
        <div className="skeleton skeleton-panel" />
        <div style={{ height: 18 }} />
        <div className="skeleton skeleton-panel" />
        <p className="field-hint" style={{ textAlign: 'center', marginTop: 18 }}>{label}</p>
      </div>
    </main>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-art">
        <Brand light />
        <div className="auth-art-content">
          <div className="auth-kicker">A quieter way to get work done</div>
          <h1>Good work,<br />on autopilot.</h1>
          <p>Your team’s essential automations, gathered in one private place. Find a workflow, open it, and get back to what matters.</p>
        </div>
        <div className="auth-art-footer">A private workspace for your team</div>
      </section>
      <section className="auth-form-side">{children}</section>
    </main>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  trailing,
  testId,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  trailing?: ReactNode;
  testId: string;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <span className={trailing ? 'password-input-wrap' : undefined}>
        <input
          className="field-input"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          data-testid={testId}
        />
        {trailing}
      </span>
    </label>
  );
}

function PasswordField({
  value, onChange, label = 'Password', autoComplete = 'current-password',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      testId={`input-${label.toLowerCase().replaceAll(' ', '-')}`}
      trailing={
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
          data-testid={`button-toggle-password-${label.toLowerCase().replaceAll(' ', '-')}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      }
    />
  );
}

function InlineAlert({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' }) {
  return (
    <div className={`alert-box alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'} data-testid={`status-${kind}`}>
      {kind === 'error' ? <CircleAlert size={17} /> : <Check size={17} />}
      <span>{children}</span>
    </div>
  );
}

function GoHome() {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation('/', { replace: true }), [setLocation]);
  return <LoadingScreen label="Opening your workspace" />;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const { refreshProfile } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailVerified = new URLSearchParams(window.location.search).get('verified') === '1';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.login({ email: email.trim(), password });
      await refreshProfile();
      setLocation('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Welcome back</div>
        <h2>Sign in</h2>
        <p className="auth-description">Use your team account to open your automation workspace.</p>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" autoFocus testId="input-email" />
          <PasswordField value={password} onChange={setPassword} />
          {error && <InlineAlert>{error}</InlineAlert>}
          {emailVerified && <InlineAlert kind="success">Your email is verified. Sign in to open your workspace.</InlineAlert>}
          <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-sign-in">
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
            {busy ? 'Signing in…' : 'Sign in to workspace'}
          </button>
        </form>
        <div className="auth-inline-link">
          <Link href="/forgot-password" className="text-link" data-testid="link-forgot-password">Forgot your password?</Link>
        </div>
        <div className="auth-signup-links">
          <span>Have a work email?</span>
          <Link href="/signup" className="text-link" data-testid="link-sign-up">Create an account</Link>
          <span className="auth-link-separator">·</span>
          <Link href="/request-access" className="text-link" data-testid="link-request-access">Request access</Link>
        </div>
      </div>
    </AuthFrame>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const { refreshProfile } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@one-line.com')) {
      setError('Use an @one-line.com email to sign up. Personal email addresses need an access request.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.signup({ email: normalizedEmail, password });
      setMessage(result.message);
      if (result.user) {
        await refreshProfile();
        setTimeout(() => setLocation('/'), 1000);
      } else {
        setPassword('');
        setConfirmation('');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signup could not be completed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">New workspace account</div>
        <h2>Create account</h2>
        <p className="auth-description">Sign up with your @one-line.com address to access the workspace.</p>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Work email address" type="email" value={email} onChange={setEmail} placeholder="you@one-line.com" autoComplete="email" autoFocus testId="input-signup-email" />
          <PasswordField value={password} onChange={setPassword} label="Password" autoComplete="new-password" />
          <div className="field-hint" style={{ marginTop: -12 }}>Use at least 8 characters.</div>
          <PasswordField value={confirmation} onChange={setConfirmation} label="Confirm password" autoComplete="new-password" />
          {error && <InlineAlert>{error}</InlineAlert>}
          {message && <InlineAlert kind="success">{message}</InlineAlert>}
          <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-submit-signup">
            {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <div className="auth-signup-links">
          <span>Using a personal email?</span>
          <Link href="/request-access" className="text-link" data-testid="link-request-access-signup">Request access</Link>
        </div>
        <div className="auth-back"><Link href="/login" data-testid="link-back-to-login"><ChevronLeft size={15} /> Back to sign in</Link></div>
      </div>
    </AuthFrame>
  );
}

function AccessRequestPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (normalizedEmail.endsWith('@one-line.com')) {
      setError('Use the sign-up page for your @one-line.com address.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.submitAccessRequest({ email: normalizedEmail });
      setMessage(result.message);
      setEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The access request could not be submitted. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Access by approval</div>
        <h2>Request access</h2>
        <p className="auth-description">Personal email addresses need admin approval before they can use Automation Hub.</p>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" autoFocus testId="input-access-request-email" />
          {error && <InlineAlert>{error}</InlineAlert>}
          {message && <InlineAlert kind="success">{message}</InlineAlert>}
          <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-submit-access-request">
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
            {busy ? 'Sending request…' : 'Send access request'}
          </button>
        </form>
        <div className="auth-back"><Link href="/signup" data-testid="link-to-company-signup"><ChevronLeft size={15} /> Use a work email instead</Link></div>
        <div className="auth-back"><Link href="/login" data-testid="link-back-to-login"><ChevronLeft size={15} /> Back to sign in</Link></div>
      </div>
    </AuthFrame>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await api.requestPasswordReset({ email: email.trim() });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reset request could not be completed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Account recovery</div>
        <h2>Reset your password</h2>
        <p className="auth-description">Enter your account email. If it matches an account, you’ll receive instructions to choose a new password.</p>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" autoFocus testId="input-email" />
          {error && <InlineAlert>{error}</InlineAlert>}
          {message && <InlineAlert kind="success">{message}</InlineAlert>}
          <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-request-reset">
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
            {busy ? 'Sending request…' : 'Send reset instructions'}
          </button>
        </form>
        <div className="auth-back"><Link href="/login" data-testid="link-back-to-login"><ChevronLeft size={15} /> Back to sign in</Link></div>
      </div>
    </AuthFrame>
  );
}

function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const isInvite = new URLSearchParams(window.location.search).get('invite') === '1';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.resetPassword({ token, password });
      setSuccess(result.message || (isInvite ? 'Your account is ready.' : 'Your password has been updated.'));
      window.setTimeout(() => setLocation('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Account recovery</div>
        <h2>{isInvite ? 'Set your password' : 'Choose a new password'}</h2>
        <p className="auth-description">
          {isInvite
            ? 'Create a password to finish setting up your Automation Hub account.'
            : 'Create a new password for your Automation Hub account.'}
        </p>
        {!token ? (
          <div className="notice-state" style={{ padding: '24px 18px' }} role="status">
            <div className="empty-icon"><CircleAlert size={23} /></div>
            <h2 style={{ fontSize: 17 }}>Recovery token missing</h2>
            <p style={{ marginBottom: 14 }}>Open the link provided in your recovery email, or request a fresh one.</p>
            <Link href="/forgot-password" className="text-link" data-testid="link-request-another-reset">Request another link</Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <div className="field-hint" style={{ marginTop: -11 }}>Use at least 8 characters.</div>
            <PasswordField label="Confirm password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
            {error && <InlineAlert>{error}</InlineAlert>}
            {success && <InlineAlert kind="success">{success}</InlineAlert>}
            <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-update-password">
              {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}
              {busy ? 'Saving password…' : isInvite ? 'Set password' : 'Save new password'}
            </button>
          </form>
        )}
        <div className="auth-back"><Link href="/login" data-testid="link-back-to-login"><ChevronLeft size={15} /> Back to sign in</Link></div>
      </div>
    </AuthFrame>
  );
}

type HubModal =
  | { kind: 'invite' }
  | { kind: 'category'; category?: Category }
  | { kind: 'app'; category: Category; card?: AppCard }
  | { kind: 'delete-category'; category: Category }
  | { kind: 'delete-app'; card: AppCard };

function HubPage({ profile }: { profile: Profile }) {
  const { logout } = useContext(AuthContext);
  const [adminSection, setAdminSection] = useState<'workspace' | 'requests' | 'people'>('workspace');
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<AppCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<HubModal | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const isAdmin = profile.role === 'admin';

  async function loadHub({ quiet = false }: { quiet?: boolean } = {}) {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const [categoryList, cardList] = await Promise.all([
        api.getCategories(),
        api.getAppCards(),
      ]);
      setCategories(categoryList);
      setCards(cardList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Workspace data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHub();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadHub({ quiet: true });
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [profile.id]);

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return categories;
    return categories.filter((category) =>
      category.name.toLocaleLowerCase().includes(term)
      || cards.some((card) => card.category_id === category.id && card.name.toLocaleLowerCase().includes(term)),
    );
  }, [categories, cards, search]);

  async function performDelete() {
    if (!modal) return;
    try {
      if (modal.kind === 'delete-category') {
        await api.deleteCategory(modal.category.id);
        setNotice({ text: 'Category deleted.' });
      } else if (modal.kind === 'delete-app') {
        await api.deleteAppCard(modal.card.id);
        setNotice({ text: 'App link deleted.' });
      }
      setModal(null);
      await loadHub();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Could not delete item.', error: true });
      setModal(null);
    }
  }

  return (
    <div className="hub-shell">
      <header className="app-header">
        <Brand />
        <div className="header-tools">
          <div className="identity-chip">
            <span className="identity-orb">{profile.email.slice(0, 1).toUpperCase()}</span>
            <span className="identity-email" data-testid="text-user-email">{profile.email}</span>
          </div>
          <button className="button-quiet" type="button" onClick={() => void logout()} data-testid="button-sign-out">
            <LogOut size={15} /> <span className="signout-label">Sign out</span>
          </button>
        </div>
      </header>
      <main className="main-content">
        <div className="hero-row">
          <div>
            <div className="eyebrow">Your team's workflows</div>
            <h1 className="hero-title">Automation,<br />within reach.</h1>
            <p className="hero-copy">A considered collection of the small tools that keep good work moving. Choose a workflow to open it.</p>
          </div>
          <div className="hero-aside">
            <div className="aside-label">In your workspace</div>
            <div className="aside-value" data-testid="text-workspace-count">{categories.length} {categories.length === 1 ? 'category' : 'categories'} <span style={{ color: '#c09caf', fontWeight: 500 }}>·</span> {cards.length} {cards.length === 1 ? 'app' : 'apps'}</div>
          </div>
        </div>

        {isAdmin && (
          <nav className="admin-tabs" role="tablist" aria-label="Admin dashboard sections">
            <button className={`admin-tab${adminSection === 'workspace' ? ' active' : ''}`} type="button" role="tab" aria-selected={adminSection === 'workspace'} onClick={() => setAdminSection('workspace')} data-testid="tab-admin-workspace"><LayoutGrid size={16} /> Workspace</button>
            <button className={`admin-tab${adminSection === 'requests' ? ' active' : ''}`} type="button" role="tab" aria-selected={adminSection === 'requests'} onClick={() => setAdminSection('requests')} data-testid="tab-admin-requests"><Inbox size={16} /> Access requests</button>
            <button className={`admin-tab${adminSection === 'people' ? ' active' : ''}`} type="button" role="tab" aria-selected={adminSection === 'people'} onClick={() => setAdminSection('people')} data-testid="tab-admin-people"><UsersRound size={16} /> People</button>
          </nav>
        )}

        {notice && <div className={`toast-note${notice.error ? ' error' : ''}`} role={notice.error ? 'alert' : 'status'} data-testid="status-notice">
          {notice.text}
          <button type="button" className="icon-button" style={{ float: 'right', margin: '-7px -9px 0 8px' }} onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button>
        </div>}

        {isAdmin && adminSection === 'requests' ? (
          <AccessRequestsView onNotify={(text, error) => setNotice({ text, error })} />
        ) : isAdmin && adminSection === 'people' ? (
          <PeopleView currentUserId={profile.id} onNotify={(text, error) => setNotice({ text, error })} />
        ) : (
        <>
        <div className="hub-toolbar">
          <label className="search-wrap">
            <Search size={17} />
            <input className="search-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an app or category…" aria-label="Search apps and categories" data-testid="input-search" />
          </label>
          {isAdmin && (
            <div className="toolbar-actions">
              <button className="button-quiet" type="button" onClick={() => setModal({ kind: 'invite' })} data-testid="button-invite-user">
                <UserPlus size={16} /> Invite user
              </button>
              <button className="button-primary" type="button" onClick={() => setModal({ kind: 'category' })} data-testid="button-add-category">
                <FolderPlus size={17} /> Add category
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="section-stack" aria-label="Loading categories"><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" /></div>
        ) : loadError ? (
          <div className="notice-state" role="alert">
            <div className="empty-icon"><CircleAlert size={24} /></div>
            <h2>Couldn’t load the workspace</h2><p>{loadError}</p>
            <button className="button-primary" type="button" onClick={() => void loadHub()} data-testid="button-retry-load">Retry</button>
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Blocks size={24} /></div>
            <h2>Your workspace is ready</h2>
            <p>{isAdmin ? 'Add your first category, then gather the app links your team uses most.' : 'Your team has not added any categories yet. Check back when workflows are available.'}</p>
            {isAdmin && <button className="button-primary" onClick={() => setModal({ kind: 'category' })} type="button" data-testid="button-create-first-category"><Plus size={16} /> Create a category</button>}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Search size={23} /></div><h2>No matches</h2>
            <p>Nothing in the workspace matches “{search}”. Try a different search.</p>
            <button className="button-quiet" type="button" onClick={() => setSearch('')} data-testid="button-clear-search">Clear search</button>
          </div>
        ) : (
          <div className="section-stack">
            {filteredCategories.map((category, index) => {
              const categoryCards = cards.filter((card) =>
                card.category_id === category.id
                && (!search.trim() || category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || card.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
              );
              return (
                <section className="category-panel" key={category.id} style={{ animationDelay: `${Math.min(index * 65, 300)}ms` }} data-testid={`section-category-${category.id}`}>
                  <div className="category-heading">
                    <div>
                      <h2 className="category-name">{category.name}</h2>
                      <div className="category-meta"><span>{categoryCards.length} {categoryCards.length === 1 ? 'workflow' : 'workflows'}</span><span className="category-count">{categoryCards.length}</span></div>
                    </div>
                    {isAdmin && <div className="category-actions">
                      <button className="icon-button" title="Add app link" aria-label={`Add app to ${category.name}`} onClick={() => setModal({ kind: 'app', category })} type="button" data-testid={`button-add-app-${category.id}`}><Plus size={17} /></button>
                      <button className="icon-button" title="Rename category" aria-label={`Rename ${category.name}`} onClick={() => setModal({ kind: 'category', category })} type="button" data-testid={`button-edit-category-${category.id}`}><Pencil size={15} /></button>
                      <button className="icon-button danger" title="Delete category" aria-label={`Delete ${category.name}`} onClick={() => setModal({ kind: 'delete-category', category })} type="button" data-testid={`button-delete-category-${category.id}`}><Trash2 size={15} /></button>
                    </div>}
                  </div>
                  <div className="card-grid">
                    {categoryCards.length === 0 ? (
                      <div className="empty-card">{search ? 'No matching apps in this category.' : isAdmin ? 'No app links yet. Add one to make it available to your team.' : 'No apps have been added to this category yet.'}</div>
                    ) : categoryCards.map((card) => (
                      <div className="app-card" key={card.id} data-testid={`card-app-${card.id}`}>
                        <a className="app-card-link" href={card.link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${card.name} in a new tab`}>
                          <span className="app-symbol"><Sparkles size={19} strokeWidth={1.8} /></span>
                          <span className="app-card-text">
                            <span className="app-card-title">{card.name}</span>
                            <span className="app-card-url">{domainLabel(card.link)}</span>
                          </span>
                          <ArrowUpRight size={16} className="app-launch" />
                        </a>
                        {isAdmin && <span className="app-card-admin">
                          <button type="button" className="icon-button" title="Edit app" aria-label={`Edit ${card.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setModal({ kind: 'app', category, card }); }} data-testid={`button-edit-app-${card.id}`}><Pencil size={14} /></button>
                          <button type="button" className="icon-button danger" title="Delete app" aria-label={`Delete ${card.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setModal({ kind: 'delete-app', card }); }} data-testid={`button-delete-app-${card.id}`}><Trash2 size={14} /></button>
                        </span>}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        </>
        )}
      </main>
      {modal && <HubDialog modal={modal} onClose={() => setModal(null)} onDelete={() => void performDelete()} onSaved={async (text) => { setModal(null); setNotice({ text }); await loadHub(); }} />}
    </div>
  );
}

function domainLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function HubDialog({
  modal, onClose, onDelete, onSaved,
}: {
  modal: HubModal;
  onClose: () => void;
  onDelete: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(modal.kind === 'category' ? modal.category?.name ?? '' : modal.kind === 'app' ? modal.card?.name ?? '' : '');
  const [link, setLink] = useState(modal.kind === 'app' ? modal.card?.link ?? '' : '');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deleting = modal.kind === 'delete-category' || modal.kind === 'delete-app';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || deleting) return;
    setError('');

    if (modal.kind === 'invite') {
      const inviteEmail = email.trim().toLowerCase();
      if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
        setError('Enter a valid email address.');
        return;
      }
      setBusy(true);
      try {
        const result = await api.inviteUser({ email: inviteEmail });
        setBusy(false);
        await onSaved(result.message);
      } catch (reason) {
        setBusy(false);
        setError(reason instanceof Error ? reason.message : 'The invitation could not be sent. Try again.');
      }
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setError(modal.kind === 'category' ? 'Category name is required.' : 'App name is required.');
      return;
    }

    let validLink = '';
    if (modal.kind === 'app') {
      try {
        const parsed = new URL(link.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        validLink = parsed.toString();
      } catch {
        setError('Enter a valid HTTP or HTTPS link.');
        return;
      }
    }

    setBusy(true);
    try {
      if (modal.kind === 'category') {
        if (modal.category) {
          await api.updateCategory(modal.category.id, { name: cleanName });
          await onSaved('Category updated.');
        } else {
          await api.createCategory({ name: cleanName });
          await onSaved('Category created.');
        }
      } else if (modal.kind === 'app') {
        if (modal.card) {
          await api.updateAppCard(modal.card.id, { name: cleanName, link: validLink });
          await onSaved('App link updated.');
        } else {
          await api.createAppCard({ name: cleanName, link: validLink, category_id: modal.category.id });
          await onSaved('App link added.');
        }
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  let title = '';
  let description = '';
  if (modal.kind === 'invite') {
    title = 'Invite a teammate';
    description = 'Send an internal @one-line.com teammate a secure setup link. Personal addresses must use the access request process.';
  } else if (modal.kind === 'category') {
    title = modal.category ? 'Edit category' : 'New category';
    description = modal.category ? 'Update the category name for your team.' : 'Create a place to organize related app links.';
  } else if (modal.kind === 'app') {
    title = modal.card ? 'Edit app link' : 'Add an app link';
    description = modal.card ? `Update this workflow in ${modal.category.name}.` : `Add a workflow to ${modal.category.name}.`;
  } else {
    title = modal.kind === 'delete-category' ? 'Delete category?' : 'Delete app link?';
    description = modal.kind === 'delete-category'
      ? `“${modal.category.name}” and every app link inside it will be permanently deleted.`
      : `“${modal.card.name}” will be removed from the workspace.`;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-top">
          <div><h2 id="dialog-title">{title}</h2><p>{description}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" type="button" data-testid="button-close-dialog"><X size={17} /></button>
        </div>
        {deleting ? (
          <>
            <div className="alert-box alert-error"><CircleAlert size={17} /><span>This action cannot be undone.</span></div>
            <div className="dialog-actions" style={{ marginTop: 20 }}>
              <button className="button-quiet" type="button" onClick={onClose} data-testid="button-cancel-delete">Keep it</button>
              <button className="button-danger" type="button" onClick={onDelete} data-testid="button-confirm-delete"><Trash2 size={15} /> Delete</button>
            </div>
          </>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {modal.kind === 'invite' ? (
              <Field label="Work email address" type="email" value={email} onChange={setEmail} placeholder="teammate@one-line.com" autoComplete="email" autoFocus testId="input-invite-email" />
            ) : (
              <Field label={modal.kind === 'category' ? 'Category name' : 'App name'} value={name} onChange={setName} placeholder={modal.kind === 'category' ? 'For example, Reporting' : 'For example, Weekly report'} autoFocus testId="input-name" />
            )}
            {modal.kind === 'app' && <label>
              <span className="field-label">App link</span>
              <input className="field-input" type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://your-workflow.example" required data-testid="input-app-link" />
              <span className="field-hint">Use a complete HTTP or HTTPS address.</span>
            </label>}
            {error && <InlineAlert>{error}</InlineAlert>}
            <div className="dialog-actions">
              <button className="button-quiet" type="button" onClick={onClose} disabled={busy} data-testid="button-cancel-dialog">Cancel</button>
              <button className="button-primary" type="submit" disabled={busy} data-testid="button-save-dialog">
                {busy ? <LoaderCircle size={16} /> : <Check size={16} />}
                {busy ? modal.kind === 'invite' ? 'Sending invite…' : 'Saving…' : modal.kind === 'invite' ? 'Send invitation' : modal.kind === 'category' ? modal.category ? 'Save category' : 'Create category' : modal.card ? 'Save app' : 'Add app'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function RestrictedAccessPage({
  profile,
  mode,
}: {
  profile: Profile;
  mode: 'blocked' | 'pending' | 'unverified';
}) {
  const { logout } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  let title = 'Workspace access unavailable';
  let description = 'Your access is currently unavailable. Contact a workspace admin for help.';
  if (mode === 'blocked') {
    title = 'This account is blocked';
    description = 'A workspace admin has blocked this account. Contact an admin if you think this is a mistake.';
  } else if (mode === 'pending') {
    title = 'Approval is required';
    description = 'This email needs admin approval before it can open the workspace. Submit an access request to the admin team.';
  } else if (mode === 'unverified') {
    title = 'Verify your email';
    description = 'Confirm your email address before opening the workspace. Check your inbox for the verification link.';
  }

  async function handleSignOut() {
    setBusy(true);
    await logout();
  }

  return (
    <div className="hub-shell">
      <header className="app-header"><Brand /></header>
      <div className="notice-state user-error">
        <div className="empty-icon"><ShieldCheck size={24} /></div>
        <h2>{title}</h2>
        <p>{description}<br /><strong>{profile.email}</strong></p>
        {mode === 'pending' && <Link href="/request-access" className="button-primary" data-testid="link-request-approval">Request access</Link>}
        {mode === 'unverified' && <Link href="/login" className="text-link" data-testid="link-back-to-sign-in">Back to sign in</Link>}
        <div style={{ marginTop: 15 }}>
          <button className="button-quiet" type="button" onClick={() => void handleSignOut()} disabled={busy} data-testid="button-restricted-sign-out">
            <LogOut size={15} /> {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useLocation();

  const refreshProfile = async () => {
    try {
      const res = await api.me();
      setProfile(res.user);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.logout();
    setProfile(null);
    setLocation('/login');
  };

  useEffect(() => {
    void refreshProfile();
  }, []);

  if (loading) return <LoadingScreen label="Loading your workspace" />;

  const pathname = location.split('?')[0];
  const isResetPage = pathname === '/reset-password';

  if ((pathname === '/login' || pathname === '/signup') && profile) return <GoHome />;
  if (pathname === '/login') return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><LoginPage /></AuthContext.Provider>;
  if (pathname === '/signup') return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><SignUpPage /></AuthContext.Provider>;
  if (pathname === '/request-access') return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><AccessRequestPage /></AuthContext.Provider>;
  if (pathname === '/forgot-password') return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><ForgotPasswordPage /></AuthContext.Provider>;
  if (isResetPage) return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><ResetPasswordPage /></AuthContext.Provider>;

  if (!profile) {
    return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><LoginPage /></AuthContext.Provider>;
  }

  if (profile.is_blocked) return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><RestrictedAccessPage profile={profile} mode="blocked" /></AuthContext.Provider>;
  if (!profile.access_approved) return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><RestrictedAccessPage profile={profile} mode="pending" /></AuthContext.Provider>;
  if (!profile.email_verified) return <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}><RestrictedAccessPage profile={profile} mode="unverified" /></AuthContext.Provider>;

  if (pathname !== '/') {
    return (
      <div className="hub-shell">
        <header className="app-header"><Brand /></header>
        <div className="notice-state user-error">
          <div className="empty-icon"><ExternalLink size={23} /></div><h2>That page isn’t here</h2>
          <p>This address does not point to a workspace page.</p><Link href="/" className="button-primary" data-testid="link-return-home"><ArrowDownLeft size={16} /> Return to workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}>
      <HubPage profile={profile} />
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/login"><AuthenticatedApp /></Route>
        <Route path="/signup"><AuthenticatedApp /></Route>
        <Route path="/request-access"><AuthenticatedApp /></Route>
        <Route path="/forgot-password"><AuthenticatedApp /></Route>
        <Route path="/reset-password"><AuthenticatedApp /></Route>
        <Route path="/"><AuthenticatedApp /></Route>
        <Route><AuthenticatedApp /></Route>
      </Switch>
    </QueryClientProvider>
  );
}

export default App;

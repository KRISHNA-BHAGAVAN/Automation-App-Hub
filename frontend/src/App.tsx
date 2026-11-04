import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  ExternalLink,
  FolderPlus,
  Globe,
  Inbox,
  KeyRound,
  LayoutGrid,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  Workflow,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, type AppCard, type Category, type Profile } from '@/lib/api';
import { AccessRequestsView, PeopleView } from '@/components/admin/AdminViews';
import { ErrorBoundary } from '@/components/error-boundary';
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
    <label className="field-group">
      <span className="field-label">{label}</span>
      <div className={trailing ? 'password-input-wrap' : undefined}>
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
      </div>
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
  const [name, setName] = useState('');
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
    if (!name.trim() || name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
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
      const result = await api.signup({ name: name.trim(), email: normalizedEmail, password });
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
          <Field label="Full name" type="text" value={name} onChange={setName} placeholder="e.g. Krishna Bhagavan" autoComplete="name" autoFocus testId="input-signup-name" />
          <Field label="Work email address" type="email" value={email} onChange={setEmail} placeholder="you@one-line.com" autoComplete="email" testId="input-signup-email" />
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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const isAdmin = profile.role === 'admin';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [avatarMenuOpen]);

  async function loadHub({ quiet = false }: { quiet?: boolean } = {}) {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const [categoryList, cardList] = await Promise.all([
        api.getCategories(),
        api.getAppCards(),
      ]);
      setCategories(Array.isArray(categoryList) ? categoryList : []);
      setCards(Array.isArray(cardList) ? cardList : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Workspace data could not be loaded.');
      setCategories([]);
      setCards([]);
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
  }, [profile?.id]);

  const filteredCategories = useMemo(() => {
    const term = (search || '').trim().toLocaleLowerCase();
    if (!term) return categories;
    return (categories || []).filter((category) => {
      const catName = (category?.name || '').toLocaleLowerCase();
      if (catName.includes(term)) return true;
      return (cards || []).some(
        (card) =>
          card?.category_id === category?.id &&
          (card?.name || '').toLocaleLowerCase().includes(term),
      );
    });
  }, [categories, cards, search]);

  async function performDelete() {
    if (!modal) return;
    try {
      if (modal.kind === 'delete-category' && modal.category?.id) {
        await api.deleteCategory(modal.category.id);
        setNotice({ text: 'Category deleted.' });
      } else if (modal.kind === 'delete-app' && modal.card?.id) {
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
          <div className="profile-menu-wrap" ref={avatarMenuRef}>
            <button
              className={`nav-avatar-btn ${avatarMenuOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setAvatarMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={avatarMenuOpen}
              aria-label="Account menu"
              data-testid="button-avatar-menu"
            >
              <span className="nav-avatar-circle">
                {getInitials(profile.name, profile.email)}
              </span>
              <ChevronDown size={14} className="nav-avatar-chevron" />
            </button>

            {avatarMenuOpen && (
              <div className="nav-dropdown-menu" role="menu" data-testid="menu-avatar-dropdown">
                <div className="dropdown-user-header">
                  <div className="dropdown-user-avatar">
                    {getInitials(profile.name, profile.email)}
                  </div>
                  <div className="dropdown-user-info">
                    <div className="dropdown-user-name" title={profile.name || 'Workspace User'}>
                      {profile.name || 'Workspace User'}
                    </div>
                    <div className="dropdown-user-email" title={profile.email}>
                      {profile.email}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className="user-role-badge">{isAdmin ? 'Admin' : 'Member'}</span>
                    </div>
                  </div>
                </div>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    setShowProfile(true);
                  }}
                  data-testid="menu-item-profile"
                >
                  <UserRound size={16} />
                  <span>Profile</span>
                </button>

                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    setShowChangePassword(true);
                  }}
                  data-testid="menu-item-change-password"
                >
                  <KeyRound size={16} />
                  <span>Change password</span>
                </button>

                <div className="dropdown-divider" />

                <button
                  type="button"
                  className="dropdown-item danger"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    void logout();
                  }}
                  data-testid="menu-item-signout"
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
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
                        <a className="app-card-main" href={card.link} target="_blank" rel="noopener noreferrer" aria-label={`Open ${card.name} in a new tab`}>
                          <span className="app-glyph" aria-hidden="true">
                            {(card.name || 'A').trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="app-card-details">
                            <h3 className="app-card-title">{card.name}</h3>
                            <span className="app-card-domain">
                              <Globe size={12} className="opacity-70" />
                              {domainLabel(card.link)}
                            </span>
                          </div>
                        </a>
                        <div className="app-card-footer">
                          <a className="app-launch-btn" href={card.link} target="_blank" rel="noopener noreferrer">
                            Launch <ArrowUpRight size={14} />
                          </a>
                          {isAdmin && (
                            <div className="app-card-actions">
                              <button type="button" className="icon-button" title="Edit app" aria-label={`Edit ${card.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setModal({ kind: 'app', category, card }); }} data-testid={`button-edit-app-${card.id}`}><Pencil size={13} /></button>
                              <button type="button" className="icon-button danger" title="Delete app" aria-label={`Delete ${card.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setModal({ kind: 'delete-app', card }); }} data-testid={`button-delete-app-${card.id}`}><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
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
      {showProfile && (
        <ProfileDialog
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSuccess={(text) => setNotice({ text })}
        />
      )}
      {showChangePassword && (
        <ChangePasswordDialog
          userEmail={profile.email}
          onClose={() => setShowChangePassword(false)}
          onSuccess={(text) => setNotice({ text })}
        />
      )}
    </div>
  );
}

function domainLabel(value?: string | null) {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value || '';
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
  const [isAdminInvite, setIsAdminInvite] = useState(false);
  const [existingAccount, setExistingAccount] = useState<{ exists: boolean; role: string | null; name?: string } | null>(null);
  const [, setCheckingEmail] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deleting = modal.kind === 'delete-category' || modal.kind === 'delete-app';

  useEffect(() => {
    if (modal.kind !== 'invite') return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setExistingAccount(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setCheckingEmail(true);
        const res = await api.checkUserEmail(cleanEmail);
        setExistingAccount(res);
        if (res.exists) {
          setIsAdminInvite(true);
        }
      } catch {
        setExistingAccount(null);
      } finally {
        setCheckingEmail(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [email, modal.kind]);

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
        const result = await api.inviteUser({
          email: inviteEmail,
          isAdmin: isAdminInvite || Boolean(existingAccount?.exists),
        });
        setBusy(false);
        await onSaved(result.message);
      } catch (reason) {
        setBusy(false);
        setError(reason instanceof Error ? reason.message : 'The action could not be completed. Try again.');
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
    title = existingAccount?.exists ? 'Elevate to Admin' : 'Invite a teammate';
    description = existingAccount?.exists
      ? 'This email belongs to an existing account. Elevate permissions to grant full workspace administration.'
      : 'Send a teammate a secure setup link with user or admin privileges.';
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
              <>
                <Field
                  label="Work email address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="teammate@one-line.com"
                  autoComplete="email"
                  autoFocus
                  testId="input-invite-email"
                />
                {existingAccount?.exists && (
                  <p className="invite-account-exists" data-testid="text-account-exists">
                    The email has an account.
                  </p>
                )}
                <label className="invite-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isAdminInvite}
                    onChange={(event) => setIsAdminInvite(event.target.checked)}
                    data-testid="checkbox-admin-privilege"
                  />
                  <span>Grant Admin privileges</span>
                </label>
              </>
            ) : (
              <Field
                label={modal.kind === 'category' ? 'Category name' : 'App name'}
                value={name}
                onChange={setName}
                placeholder={modal.kind === 'category' ? 'For example, Reporting' : 'For example, Weekly report'}
                autoFocus
                testId="input-name"
              />
            )}
            {modal.kind === 'app' && (
              <label>
                <span className="field-label">App link</span>
                <input
                  className="field-input"
                  type="url"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://your-workflow.example"
                  required
                  data-testid="input-app-link"
                />
                <span className="field-hint">Use a complete HTTP or HTTPS address.</span>
              </label>
            )}
            {error && <InlineAlert>{error}</InlineAlert>}
            <div className="dialog-actions">
              <button className="button-quiet" type="button" onClick={onClose} disabled={busy} data-testid="button-cancel-dialog">Cancel</button>
              <button className="button-primary" type="submit" disabled={busy} data-testid="button-save-dialog">
                {busy ? <LoaderCircle size={16} /> : <Check size={16} />}
                {busy
                  ? modal.kind === 'invite'
                    ? existingAccount?.exists
                      ? 'Elevating to Admin…'
                      : 'Sending invite…'
                    : 'Saving…'
                  : modal.kind === 'invite'
                    ? existingAccount?.exists
                      ? 'Elevate to Admin Privilege'
                      : isAdminInvite
                        ? 'Send Admin invitation'
                        : 'Send invitation'
                    : modal.kind === 'category'
                      ? modal.category
                        ? 'Save category'
                        : 'Create category'
                      : modal.card
                        ? 'Save app'
                        : 'Add app'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().charAt(0).toUpperCase();
  }
  return 'U';
}

function ProfileDialog({
  profile,
  onClose,
  onSuccess,
}: {
  profile: Profile;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { refreshProfile } = useContext(AuthContext);
  const [name, setName] = useState(profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');

    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.updateProfile({ name: cleanName, email: cleanEmail });
      await refreshProfile();

      if (res.pendingEmailVerification && res.newEmail) {
        setPendingEmail(res.newEmail);
        setDebugCode(res.debugCode || null);
        setInfo(res.message);
      } else {
        onSuccess(res.message || 'Profile updated successfully.');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (verificationCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.verifyEmailChange({ code: verificationCode.trim() });
      await refreshProfile();
      onSuccess(res.message || 'Email updated and verified successfully.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResendCode() {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const res = await api.resendVerificationCode();
      setDebugCode(res.debugCode || null);
      setInfo(res.message || 'Verification code resent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
        <div className="dialog-top">
          <div>
            <h2 id="profile-dialog-title">{pendingEmail ? 'Verify New Email' : 'Account Profile'}</h2>
            <p>{pendingEmail ? `Confirm code sent to ${pendingEmail}` : 'Manage your name and contact email address.'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" type="button" data-testid="button-close-profile-dialog">
            <X size={17} />
          </button>
        </div>

        {pendingEmail ? (
          <form className="form-stack" onSubmit={handleVerifyCode}>
            <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#fdf2f8',
                color: '#db2777',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                <Mail size={22} />
              </div>
              <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
                We sent a 6-digit verification code to:<br />
                <strong style={{ color: '#0f172a' }}>{pendingEmail}</strong>
              </p>
            </div>

            {debugCode && (
              <div style={{ background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#86198f' }}>
                <strong>Dev Hint:</strong> Your verification code is <code>{debugCode}</code>
              </div>
            )}

            <label>
              <span className="field-label">6-digit verification code</span>
              <input
                className="field-input"
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                required
                style={{
                  letterSpacing: '6px',
                  fontSize: '20px',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
                data-testid="input-verification-code"
              />
              <span className="field-hint">Code expires in 15 minutes.</span>
            </label>

            {error && <InlineAlert>{error}</InlineAlert>}
            {info && <InlineAlert kind="success">{info}</InlineAlert>}

            <div className="dialog-actions">
              <button
                className="button-quiet"
                type="button"
                onClick={() => { setPendingEmail(null); setError(''); setInfo(''); }}
                disabled={busy}
              >
                Back
              </button>
              <button
                className="button-quiet"
                type="button"
                onClick={handleResendCode}
                disabled={busy}
              >
                Resend code
              </button>
              <button
                className="button-primary"
                type="submit"
                disabled={busy || verificationCode.length !== 6}
                data-testid="button-confirm-email-verification"
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                {busy ? 'Verifying…' : 'Verify & Update'}
              </button>
            </div>
          </form>
        ) : (
          <form className="form-stack" onSubmit={handleSaveProfile}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0 12px' }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #fce7f3 0%, #f472b6 100%)',
                color: '#831843',
                fontSize: 18,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}>
                {getInitials(name || profile.name, profile.email)}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                  {profile.name || 'Workspace User'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span className="user-role-badge">
                    {profile.role === 'admin' ? 'Workspace Admin' : 'Workspace Member'}
                  </span>
                </div>
              </div>
            </div>

            <Field
              label="Full name"
              type="text"
              value={name}
              onChange={setName}
              placeholder="e.g. Krishna Bhagavan"
              autoFocus
              testId="input-profile-name"
            />

            <div>
              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                testId="input-profile-email"
              />
              {email.trim().toLowerCase() !== profile.email.toLowerCase() && (
                <div style={{ fontSize: 12, color: '#d97706', marginTop: -6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CircleAlert size={13} />
                  <span>Changing email requires verifying the new address with a 6-digit code.</span>
                </div>
              )}
            </div>

            {error && <InlineAlert>{error}</InlineAlert>}
            {info && <InlineAlert kind="success">{info}</InlineAlert>}

            <div className="dialog-actions">
              <button className="button-quiet" type="button" onClick={onClose} disabled={busy} data-testid="button-cancel-profile">
                Cancel
              </button>
              <button className="button-primary" type="submit" disabled={busy} data-testid="button-save-profile">
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                {busy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function ChangePasswordDialog({
  userEmail,
  onClose,
  onSuccess,
}: {
  userEmail: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [tab, setTab] = useState<'link' | 'direct'>('link');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSendLink(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const res = await api.requestChangePasswordLink();
      setMessage(res.message || 'Password reset link sent to your email via Brevo!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDirectChange(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 8) {
      setError('Choose a new password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword({ currentPassword, newPassword });
      onSuccess(res.message || 'Your password has been changed.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <div className="dialog-top">
          <div>
            <h2 id="change-password-title">Change Password</h2>
            <p>Update credentials for your Automation Hub account.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" type="button" data-testid="button-close-change-password">
            <X size={17} />
          </button>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Password update methods">
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'link' ? 'active' : ''}`}
            onClick={() => { setTab('link'); setError(''); setMessage(''); }}
            data-testid="tab-password-link"
          >
            <Mail size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} /> Email reset link (Brevo)
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${tab === 'direct' ? 'active' : ''}`}
            onClick={() => { setTab('direct'); setError(''); setMessage(''); }}
            data-testid="tab-password-direct"
          >
            <KeyRound size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} /> Change directly
          </button>
        </div>

        {tab === 'link' ? (
          <form className="form-stack" onSubmit={handleSendLink}>
            <p style={{ margin: '4px 0 12px', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
              We will generate a secure reset link and send it to your registered email via Brevo: <br />
              <strong style={{ color: '#0f172a' }}>{userEmail}</strong>
            </p>
            {error && <InlineAlert>{error}</InlineAlert>}
            {message && <InlineAlert kind="success">{message}</InlineAlert>}
            <div className="dialog-actions">
              <button className="button-quiet" type="button" onClick={onClose} disabled={busy} data-testid="button-cancel-change-password">Cancel</button>
              <button className="button-primary" type="submit" disabled={busy} data-testid="button-send-reset-link">
                {busy ? <LoaderCircle size={16} className="spin" /> : <Mail size={15} />}
                {busy ? 'Sending link…' : 'Send reset link via Brevo'}
              </button>
            </div>
          </form>
        ) : (
          <form className="form-stack" onSubmit={handleDirectChange}>
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <div className="field-hint" style={{ marginTop: -10 }}>Use at least 8 characters.</div>
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
            {error && <InlineAlert>{error}</InlineAlert>}
            <div className="dialog-actions">
              <button className="button-quiet" type="button" onClick={onClose} disabled={busy} data-testid="button-cancel-direct-change">Cancel</button>
              <button className="button-primary" type="submit" disabled={busy} data-testid="button-save-direct-password">
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
                {busy ? 'Saving…' : 'Update password'}
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
    try {
      await api.logout();
    } finally {
      setProfile(null);
      setLocation('/login');
    }
  };

  useEffect(() => {
    void refreshProfile();
  }, []);

  const pathname = (location || '/').split('?')[0];
  const isResetPage = pathname === '/reset-password';

  let content: ReactNode = null;

  if (loading) {
    content = <LoadingScreen label="Loading your workspace" />;
  } else if ((pathname === '/login' || pathname === '/signup') && profile) {
    content = <GoHome />;
  } else if (pathname === '/login') {
    content = <LoginPage />;
  } else if (pathname === '/signup') {
    content = <SignUpPage />;
  } else if (pathname === '/request-access') {
    content = <AccessRequestPage />;
  } else if (pathname === '/forgot-password') {
    content = <ForgotPasswordPage />;
  } else if (isResetPage) {
    content = <ResetPasswordPage />;
  } else if (!profile) {
    content = <LoginPage />;
  } else if (profile.is_blocked) {
    content = <RestrictedAccessPage profile={profile} mode="blocked" />;
  } else if (!profile.access_approved) {
    content = <RestrictedAccessPage profile={profile} mode="pending" />;
  } else if (!profile.email_verified) {
    content = <RestrictedAccessPage profile={profile} mode="unverified" />;
  } else if (pathname !== '/') {
    content = (
      <div className="hub-shell">
        <header className="app-header"><Brand /></header>
        <div className="notice-state user-error">
          <div className="empty-icon"><ExternalLink size={23} /></div>
          <h2>That page isn’t here</h2>
          <p>This address does not point to a workspace page.</p>
          <Link href="/" className="button-primary" data-testid="link-return-home">
            <ArrowDownLeft size={16} /> Return to workspace
          </Link>
        </div>
      </div>
    );
  } else {
    content = <HubPage profile={profile} />;
  }

  return (
    <AuthContext.Provider value={{ profile, loading, refreshProfile, logout }}>
      {content}
    </AuthContext.Provider>
  );
}

function App() {
  const [location] = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary resetKey={location}>
        <AuthenticatedApp />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;


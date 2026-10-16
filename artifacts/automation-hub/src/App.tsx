import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useHealthCheck, useRequestPasswordReset } from '@workspace/api-client-react';
import { supabase, supabaseConfigured, type AppCard, type Category, type Profile } from '@/lib/supabase';
import './index.css';
import './theme.css';

const queryClient = new QueryClient();

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

function ConfigNotice() {
  return (
    <div className="hub-shell">
      <header className="app-header"><Brand /></header>
      <div className="notice-state user-error">
        <div className="empty-icon"><CircleAlert size={24} /></div>
        <h2>Connection details needed</h2>
        <p>Set <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in the client environment to connect this workspace securely.</p>
      </div>
    </div>
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError('');
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(authError.message);
    else setLocation('/');
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
          <button className="button-primary auth-submit" disabled={busy} type="submit" data-testid="button-sign-in">
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
            {busy ? 'Signing in…' : 'Sign in to workspace'}
          </button>
        </form>
        <div className="auth-inline-link">
          <Link href="/forgot-password" className="text-link" data-testid="link-forgot-password">Forgot your password?</Link>
        </div>
      </div>
    </AuthFrame>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const health = useHealthCheck();
  const resetMutation = useRequestPasswordReset({
    mutation: {
      onSuccess: (result) => {
        setError('');
        setMessage(result.message);
      },
      onError: (reason) => {
        setMessage('');
        setError(reason instanceof Error ? reason.message : 'The reset request could not be completed. Try again.');
      },
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    resetMutation.mutate({ data: { email: email.trim() } });
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Account recovery</div>
        <h2>Reset your password</h2>
        <p className="auth-description">Enter your account email. If it matches an account, you’ll receive instructions to choose a new password.</p>
        <div className="field-hint" style={{ margin: '-14px 0 20px', display: 'flex', alignItems: 'center', gap: 7 }} data-testid="status-api-availability">
          <span style={{ width: 7, height: 7, borderRadius: 9, background: health.isLoading ? '#d2a3bc' : health.isError ? '#cb5964' : '#49a276' }} />
          {health.isLoading ? 'Checking account recovery service…' : health.isError ? 'Account recovery service is unavailable' : 'Account recovery service is available'}
          {health.isError && <button className="text-link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => health.refetch()} type="button" data-testid="button-retry-health">Retry</button>}
        </div>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" autoFocus testId="input-email" />
          {error && <InlineAlert>{error}</InlineAlert>}
          {message && <InlineAlert kind="success">{message}</InlineAlert>}
          <button className="button-primary auth-submit" disabled={resetMutation.isPending} type="submit" data-testid="button-request-reset">
            {resetMutation.isPending ? <LoaderCircle size={17} /> : <ArrowRight size={17} />}
            {resetMutation.isPending ? 'Sending request…' : 'Send reset instructions'}
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setReady(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setReady(Boolean(session));
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setSuccess('Your password has been updated.');
      window.setTimeout(() => setLocation('/'), 850);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <div className="eyebrow">Account recovery</div>
        <h2>Choose a new password</h2>
        <p className="auth-description">Create a new password for your Automation Hub account.</p>
        {!ready ? (
          <div className="notice-state" style={{ padding: '24px 18px' }} role="status">
            <div className="empty-icon"><CircleAlert size={23} /></div>
            <h2 style={{ fontSize: 17 }}>Recovery session not found</h2>
            <p style={{ marginBottom: 14 }}>Open the secure recovery link from your email, or request a fresh one.</p>
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
              {busy ? <LoaderCircle size={17} /> : <ShieldCheck size={17} />}
              {busy ? 'Updating password…' : 'Save new password'}
            </button>
          </form>
        )}
        <div className="auth-back"><Link href="/login" data-testid="link-back-to-login"><ChevronLeft size={15} /> Back to sign in</Link></div>
      </div>
    </AuthFrame>
  );
}

type HubModal =
  | { kind: 'category'; category?: Category }
  | { kind: 'app'; category: Category; card?: AppCard }
  | { kind: 'delete-category'; category: Category }
  | { kind: 'delete-app'; card: AppCard };

function HubPage({ profile }: { profile: Profile }) {
  const [, setLocation] = useLocation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<AppCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<HubModal | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const isAdmin = profile.role === 'admin';

  async function loadHub({ quiet = false }: { quiet?: boolean } = {}) {
    if (!supabase) return;
    if (!quiet) setLoading(true);
    setLoadError('');
    const [categoryResult, cardResult] = await Promise.all([
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('app_cards').select('*').order('name', { ascending: true }),
    ]);
    if (categoryResult.error || cardResult.error) {
      setLoadError(categoryResult.error?.message ?? cardResult.error?.message ?? 'Workspace data could not be loaded.');
      setLoading(false);
      return;
    }
    setCategories((categoryResult.data ?? []) as Category[]);
    setCards((cardResult.data ?? []) as AppCard[]);
    setLoading(false);
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

  async function logout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice({ text: error.message, error: true });
    else setLocation('/login');
  }

  async function performDelete() {
    if (!supabase || !modal) return;
    let result;
    if (modal.kind === 'delete-category') {
      result = await supabase.from('categories').delete().eq('id', modal.category.id);
    } else if (modal.kind === 'delete-app') {
      result = await supabase.from('app_cards').delete().eq('id', modal.card.id);
    } else return;
    if (result.error) {
      setNotice({ text: result.error.message, error: true });
      setModal(null);
      return;
    }
    setNotice({ text: modal.kind === 'delete-category' ? 'Category deleted.' : 'App link deleted.' });
    setModal(null);
    await loadHub();
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
          <button className="button-quiet" type="button" onClick={logout} data-testid="button-sign-out">
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

        <div className="hub-toolbar">
          <label className="search-wrap">
            <Search size={17} />
            <input className="search-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an app or category…" aria-label="Search apps and categories" data-testid="input-search" />
          </label>
          {isAdmin && (
            <button className="button-primary" type="button" onClick={() => setModal({ kind: 'category' })} data-testid="button-add-category">
              <FolderPlus size={17} /> Add category
            </button>
          )}
        </div>

        {notice && <div className={`toast-note${notice.error ? ' error' : ''}`} role={notice.error ? 'alert' : 'status'} data-testid="status-notice">
          {notice.text}
          <button type="button" className="icon-button" style={{ float: 'right', margin: '-7px -9px 0 8px' }} onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button>
        </div>}

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deleting = modal.kind === 'delete-category' || modal.kind === 'delete-app';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy || deleting) return;
    setError('');
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
    let actionError: string | null = null;
    if (modal.kind === 'category') {
      const result = modal.category
        ? await supabase.from('categories').update({ name: cleanName }).eq('id', modal.category.id)
        : await supabase.from('categories').insert({ name: cleanName });
      actionError = result.error?.message ?? null;
    } else if (modal.kind === 'app') {
      const payload = { name: cleanName, link: validLink, category_id: modal.category.id };
      const result = modal.card
        ? await supabase.from('app_cards').update(payload).eq('id', modal.card.id)
        : await supabase.from('app_cards').insert(payload);
      actionError = result.error?.message ?? null;
    }
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    if (modal.kind === 'category') await onSaved(modal.category ? 'Category updated.' : 'Category created.');
    if (modal.kind === 'app') await onSaved(modal.card ? 'App link updated.' : 'App link added.');
  }

  let title = '';
  let description = '';
  if (modal.kind === 'category') {
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
            <Field label={modal.kind === 'category' ? 'Category name' : 'App name'} value={name} onChange={setName} placeholder={modal.kind === 'category' ? 'For example, Reporting' : 'For example, Weekly report'} autoFocus testId="input-name" />
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
                {busy ? 'Saving…' : modal.kind === 'category' ? modal.category ? 'Save category' : 'Create category' : modal.card ? 'Save app' : 'Add app'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

type AuthSnapshot = { session: import('@supabase/supabase-js').Session | null; loading: boolean };

function AuthenticatedApp() {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ session: null, loading: true });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [location] = useLocation();

  useEffect(() => {
    if (!supabase) {
      setSnapshot({ session: null, loading: false });
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSnapshot({ session: data.session, loading: false });
      if (error) setProfileError(error.message);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setSnapshot({ session, loading: false });
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!snapshot.session?.user.id || !supabase) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError('');
      return;
    }
    let alive = true;
    setProfileLoading(true);
    setProfileError('');
    supabase.from('profiles').select('id,email,role').eq('id', snapshot.session.user.id).single().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setProfile(null);
        setProfileError(error.message);
      } else {
        const result = data as Profile;
        setProfile({ ...result, email: result.email || snapshot.session?.user.email || '' });
      }
      setProfileLoading(false);
    });
    return () => { alive = false; };
  }, [snapshot.session?.user.id]);

  if (!supabaseConfigured) return <ConfigNotice />;
  if (snapshot.loading) return <LoadingScreen label="Checking your secure session" />;

  const isResetPage = location === '/reset-password';
  if (location === '/login' && snapshot.session) return <GoHome />;
  if (location === '/login') return <LoginPage />;
  if (location === '/forgot-password') return <ForgotPasswordPage />;
  if (isResetPage) return <ResetPasswordPage />;
  if (location !== '/') return <NotFoundPage />;
  if (!snapshot.session) return <LoginRedirect />;
  if (profileLoading) return <LoadingScreen label="Loading your team access" />;
  if (profileError || !profile) return (
    <div className="hub-shell">
      <header className="app-header"><Brand /></header>
      <div className="notice-state user-error">
        <div className="empty-icon"><ShieldCheck size={24} /></div>
        <h2>Workspace access unavailable</h2>
        <p>{profileError || 'Your account profile is not available. Ask a workspace administrator to check your access.'}</p>
        <button className="button-primary" type="button" onClick={() => { setProfileError(''); setProfileLoading(true); void supabase?.from('profiles').select('id,email,role').eq('id', snapshot.session!.user.id).single().then(({ data, error }) => { if (error) { setProfileError(error.message); setProfileLoading(false); } else { const result = data as Profile; setProfile(result); setProfileLoading(false); } }); }} data-testid="button-retry-profile">Retry</button>
      </div>
    </div>
  );
  return <HubPage profile={profile} />;
}

function LoginRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation('/login', { replace: true }), [setLocation]);
  return <LoadingScreen label="Taking you to sign in" />;
}

function NotFoundPage() {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/login"><AuthenticatedApp /></Route>
        <Route path="/forgot-password"><AuthenticatedApp /></Route>
        <Route path="/reset-password"><AuthenticatedApp /></Route>
        <Route path="/"><AuthenticatedApp /></Route>
        <Route><AuthenticatedApp /></Route>
      </Switch>
    </QueryClientProvider>
  );
}

export default App;

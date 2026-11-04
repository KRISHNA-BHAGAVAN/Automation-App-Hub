import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  Shield,
  ShieldOff,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { api, type AccessRequest, type Profile } from '@/lib/api';

type ManagedProfile = Profile & {
  created_at: string;
};

function getErrorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof Error)) return fallback;
  return reason.message.replace(/^HTTP \d+ [^:]+:\s*/, '');
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
}

export function AccessRequestsView({
  onNotify,
}: {
  onNotify: (message: string, error?: boolean) => void;
}) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);

  const loadRequests = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const data = await api.getAccessRequests();
      setRequests(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load access requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadRequests(true);
    };
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loadRequests]);

  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const visibleRequests = useMemo(
    () => requests.filter((request) => showReviewed || request.status === 'pending'),
    [requests, showReviewed],
  );

  async function decide(request: AccessRequest, decision: 'accept' | 'decline') {
    if (busyId) return;
    setBusyId(request.id);
    try {
      const result = await api.reviewAccessRequest(request.id, decision);
      onNotify(result.message);
      await loadRequests(true);
    } catch (reason) {
      onNotify(getErrorMessage(reason, 'The request could not be updated.'), true);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="admin-view" aria-labelledby="access-requests-title">
      <div className="admin-view-heading">
        <div>
          <div className="eyebrow">Workspace administration</div>
          <h2 id="access-requests-title">Access requests</h2>
          <p>Review requests from people using an email outside @one-line.com.</p>
        </div>
        <button className="button-quiet" type="button" onClick={() => void loadRequests()} disabled={loading} data-testid="button-refresh-requests">
          {loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>

      <div className="admin-filter-row" role="tablist" aria-label="Filter access requests">
        <button
          className={`admin-filter${!showReviewed ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={!showReviewed}
          onClick={() => setShowReviewed(false)}
          data-testid="tab-pending-requests"
        >
          Pending <span className="admin-filter-count">{pendingCount}</span>
        </button>
        <button
          className={`admin-filter${showReviewed ? ' active' : ''}`}
          type="button"
          role="tab"
          aria-selected={showReviewed}
          onClick={() => setShowReviewed(true)}
          data-testid="tab-all-requests"
        >
          All requests
        </button>
      </div>

      {error ? (
        <div className="notice-state" role="alert">
          <div className="empty-icon"><CircleAlert size={23} /></div>
          <h2>Requests could not be loaded</h2>
          <p>{error}</p>
          <button className="button-primary" type="button" onClick={() => void loadRequests()} data-testid="button-retry-requests">Try again</button>
        </div>
      ) : loading ? (
        <div className="admin-loading" role="status"><LoaderCircle size={19} className="spin" /> Loading access requests…</div>
      ) : visibleRequests.length === 0 ? (
        <div className="admin-empty">
          <div className="empty-icon"><MailCheck size={22} /></div>
          <h3>{showReviewed ? 'No access requests yet' : 'You’re all caught up'}</h3>
          <p>{showReviewed ? 'New requests from personal email addresses will appear here.' : 'There are no pending requests to review.'}</p>
        </div>
      ) : (
        <div className="admin-list">
          {visibleRequests.map((request) => {
            const busy = busyId === request.id;
            return (
              <article className="admin-list-card" key={request.id} data-testid={`access-request-${request.id}`}>
                <div className="admin-list-identity">
                  <span className="admin-list-icon"><UserRound size={18} /></span>
                  <div className="admin-list-copy">
                    <strong>{request.email}</strong>
                    <span><Clock3 size={13} /> Requested {formatDate(request.created_at)}</span>
                  </div>
                </div>
                {request.status === 'pending' ? (
                  <div className="admin-list-actions">
                    <button
                      className="button-quiet"
                      type="button"
                      disabled={busyId !== ''}
                      onClick={() => void decide(request, 'decline')}
                      data-testid={`button-decline-${request.id}`}
                    >
                      {busy && <LoaderCircle size={15} className="spin" />}
                      Decline
                    </button>
                    <button
                      className="button-primary"
                      type="button"
                      disabled={busyId !== ''}
                      onClick={() => void decide(request, 'accept')}
                      data-testid={`button-accept-${request.id}`}
                    >
                      {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                      Accept & invite
                    </button>
                  </div>
                ) : (
                  <div className={`admin-status-pill ${request.status}`}>
                    {request.status === 'accepted' ? <Check size={14} /> : <X size={14} />}
                    {request.status === 'accepted' ? 'Accepted' : 'Declined'}
                    <span>{request.reviewed_at ? formatDate(request.reviewed_at) : ''}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PeopleView({
  currentUserId,
  onNotify,
}: {
  currentUserId: string;
  onNotify: (message: string, error?: boolean) => void;
}) {
  const [users, setUsers] = useState<ManagedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');

  const loadUsers = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const data = await api.getUsers();
      setUsers(data as ManagedProfile[]);
    } catch (usersError) {
      setError(usersError instanceof Error ? usersError.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadUsers(true);
    };
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loadUsers]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) =>
      !term ||
      user.email.toLowerCase().includes(term) ||
      user.role.toLowerCase().includes(term),
    );
  }, [search, users]);

  async function toggleBlocked(user: ManagedProfile) {
    if (busyId || (user.id === currentUserId && !user.is_blocked)) return;
    const blocked = !user.is_blocked;
    setBusyId(user.id);
    try {
      const result = await api.setUserBlocked(user.id, blocked);
      setUsers((current) => current.map((entry) =>
        entry.id === user.id ? { ...entry, is_blocked: blocked } : entry,
      ));
      onNotify(result.message);
    } catch (reason) {
      onNotify(getErrorMessage(reason, 'The account status could not be changed.'), true);
    } finally {
      setBusyId('');
    }
  }

  const blockedCount = users.filter((user) => user.is_blocked).length;

  return (
    <section className="admin-view" aria-labelledby="people-title">
      <div className="admin-view-heading">
        <div>
          <div className="eyebrow">Workspace administration</div>
          <h2 id="people-title">People</h2>
          <p>Manage access for approved accounts. Blocking takes effect across the workspace.</p>
        </div>
        <div className="people-summary">
          <span>{users.length} {users.length === 1 ? 'account' : 'accounts'}</span>
          <span className={blockedCount ? 'blocked-summary' : ''}>{blockedCount} blocked</span>
        </div>
      </div>

      <label className="search-wrap admin-search">
        <UsersRound size={16} />
        <input
          className="search-input"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by email or role…"
          aria-label="Search workspace users"
          data-testid="input-search-users"
        />
      </label>

      {error ? (
        <div className="notice-state" role="alert">
          <div className="empty-icon"><CircleAlert size={23} /></div>
          <h2>People could not be loaded</h2>
          <p>{error}</p>
          <button className="button-primary" type="button" onClick={() => void loadUsers()} data-testid="button-retry-users">Try again</button>
        </div>
      ) : loading ? (
        <div className="admin-loading" role="status"><LoaderCircle size={19} className="spin" /> Loading accounts…</div>
      ) : visibleUsers.length === 0 ? (
        <div className="admin-empty">
          <div className="empty-icon"><UsersRound size={22} /></div>
          <h3>{users.length === 0 ? 'No approved accounts yet' : 'No matching accounts'}</h3>
          <p>{users.length === 0 ? 'Verified and approved accounts will appear here.' : 'Try another search.'}</p>
        </div>
      ) : (
        <div className="admin-list">
          {visibleUsers.map((user) => {
            const busy = busyId === user.id;
            const isSelf = user.id === currentUserId;
            return (
              <article className={`admin-list-card people-card${user.is_blocked ? ' is-blocked' : ''}`} key={user.id} data-testid={`person-${user.id}`}>
                <div className="admin-list-identity">
                  <span className={`admin-list-icon${user.is_blocked ? ' blocked' : ''}`}>
                    {user.is_blocked ? <ShieldOff size={18} /> : <UserRound size={18} />}
                  </span>
                  <div className="admin-list-copy">
                    <strong>{user.email || 'Email unavailable'}{isSelf && <span className="you-tag">You</span>}</strong>
                    <span><Shield size={13} /> {user.role === 'admin' ? 'Admin' : 'User'} · {user.email_verified ? 'Email verified' : 'Email not verified'}</span>
                  </div>
                </div>
                <div className={`admin-status-pill ${user.is_blocked ? 'declined' : user.email_verified ? 'accepted' : 'pending'}`}>
                  {user.is_blocked ? <ShieldOff size={14} /> : user.email_verified ? <MailCheck size={14} /> : <Clock3 size={14} />}
                  {user.is_blocked ? 'Blocked' : user.email_verified ? 'Active' : 'Unverified'}
                </div>
                <button
                  className={user.is_blocked ? 'button-quiet' : 'button-danger'}
                  type="button"
                  disabled={busyId !== '' || (isSelf && !user.is_blocked)}
                  onClick={() => void toggleBlocked(user)}
                  data-testid={`button-toggle-block-${user.id}`}
                  aria-label={`${user.is_blocked ? 'Unblock' : 'Block'} ${user.email}`}
                  title={isSelf && !user.is_blocked ? 'You cannot block your own account' : undefined}
                >
                  {busy ? <LoaderCircle size={15} className="spin" /> : user.is_blocked ? <Check size={15} /> : <ShieldOff size={15} />}
                  {busy ? 'Updating…' : user.is_blocked ? 'Unblock' : 'Block'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

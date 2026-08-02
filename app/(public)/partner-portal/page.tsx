'use client';

// Partner portal dashboard (Knowsia Growth Partner Programme, 2026-08-02) —
// same app-shell design system as the corporate/student portals
// (components/portal/portal-design-system.tsx). Read-only beyond PIN
// change/logout: codes + QR, click/redemption counts, commission totals by
// pipeline stage, and payout history.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { apiFetch } from '@/components/api-client';
import { PORTAL_STYLES, PortalIcons } from '@/components/portal/portal-design-system';
import { formatDate, formatGhs } from '@/lib/utils';

// Course-specific referral links/QR (2026-08-02 follow-up) — the same
// active/future batch list already shown on the public /register form.
interface ActiveBatch {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
}

interface Code {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | null;
  discountValue: number | null;
  usesCount: number;
  isActive: boolean;
}

interface Payout {
  id: string;
  totalAmount: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

interface Dashboard {
  fullName: string;
  category: string;
  phone: string;
  mustChangePin: boolean;
  codes: Code[];
  clickCounts: Record<string, number>;
  redemptionCounts: Record<string, number>;
  commissionTotals: Record<string, number>;
  recentPayouts: Payout[];
  payableCommissionIds: string[];
}

type PanelId = 'overview' | 'codes' | 'commissions' | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'codes', label: 'My Codes', icon: 'i-card' },
  { id: 'commissions', label: 'Commissions', icon: 'i-award' },
  { id: 'account', label: 'Account', icon: 'i-user' },
];

const CATEGORY_LABELS: Record<string, string> = {
  ambassador: 'Ambassador',
  institutional: 'Institutional Partner',
  strategic: 'Strategic Partner',
  tutor: 'Tutor Partner',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function discountLabel(code: Code): string {
  if (!code.discountType || code.discountValue === null) return 'Attribution only';
  return code.discountType === 'percentage' ? `${code.discountValue}% off` : `${formatGhs(code.discountValue)} off`;
}

export default function PartnerPortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>('overview');
  const [qrCode, setQrCode] = useState<{ code: string; dataUrl: string } | null>(null);
  const [redeemEmail, setRedeemEmail] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [batchOptions, setBatchOptions] = useState<ActiveBatch[] | 'loading' | null>(null);
  const [selectedBatchByCode, setSelectedBatchByCode] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function load() {
    try {
      const result = await apiFetch<Dashboard>('/api/partner-portal/me');
      if (result.mustChangePin) {
        router.push('/partner-portal/change-pin');
        return;
      }
      setDashboard(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load your dashboard.');
      router.push('/partner-portal/login');
    }
  }

  useEffect(() => {
    void load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activePanel !== 'codes') return;
    setBatchOptions('loading');
    apiFetch<{ batches: ActiveBatch[] }>('/api/register/active-batches')
      .then((r) => setBatchOptions(r.batches))
      .catch(() => setBatchOptions(null));
  }, [activePanel]);

  async function logout() {
    await apiFetch('/api/partner-portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/partner-portal/login');
  }

  async function showQrCode(code: string) {
    const batchId = selectedBatchByCode[code];
    const qs = new URLSearchParams({ code });
    if (batchId) qs.set('batchId', batchId);
    try {
      const result = await apiFetch<{ dataUrl: string }>(`/api/partner-portal/qr-code?${qs}`);
      setQrCode({ code, dataUrl: result.dataUrl });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate QR code.');
    }
  }

  function copyLink(code: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const batchId = selectedBatchByCode[code];
    const link = `${origin}/r/${code}${batchId ? `?batchId=${batchId}` : ''}`;
    void navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function redeemCommissionCredit() {
    if (!dashboard || dashboard.payableCommissionIds.length === 0) return;
    if (!redeemEmail.trim()) {
      setRedeemError("Enter the referred student's email.");
      return;
    }
    setRedeeming(true);
    setRedeemError(null);
    setRedeemSuccess(null);
    try {
      const result = await apiFetch<{ balance: number }>('/api/partner-portal/redeem-credit', {
        method: 'POST',
        body: JSON.stringify({
          commissionIds: dashboard.payableCommissionIds,
          targetParticipantEmail: redeemEmail.trim(),
        }),
      });
      setRedeemSuccess(`Applied — that registration's remaining balance is now ${formatGhs(result.balance)}.`);
      setRedeemEmail('');
      await load();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Could not redeem your commission — try again.');
    } finally {
      setRedeeming(false);
    }
  }

  if (loading) {
    return (
      <main className="portal-loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (!dashboard) return null;

  const totalClicks = Object.values(dashboard.clickCounts).reduce((sum, n) => sum + n, 0);
  const totalRedemptions = Object.values(dashboard.redemptionCounts).reduce((sum, n) => sum + n, 0);
  const totalEarned = Object.entries(dashboard.commissionTotals)
    .filter(([status]) => status !== 'clawed_back')
    .reduce((sum, [, amount]) => sum + amount, 0);
  const referralOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="portal-app">
      <style>{PORTAL_STYLES}</style>
      <PortalIcons />

      <div className="app">
        <aside className="rail" aria-label="Partner portal navigation">
          <div className="rail-brand">
            <Image src="/knowsia-icon.png" alt="Knowsia" width={34} height={34} className="mark" priority />
            <div>
              <span className="name">Knowsia</span>
              <span className="tag">Partner Portal</span>
            </div>
          </div>

          <div className="identity">
            <div className="avatar">{initials(dashboard.fullName)}</div>
            <div className="who">
              <strong>{dashboard.fullName}</strong>
              <span>{CATEGORY_LABELS[dashboard.category] ?? dashboard.category}</span>
            </div>
          </div>

          <ul className="rail-nav" role="tablist">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="tab"
                  aria-current={activePanel === item.id ? 'page' : undefined}
                  onClick={() => setActivePanel(item.id)}
                >
                  <svg className="icon"><use href={`#${item.icon}`} /></svg>
                  {item.label}
                  {item.id === 'codes' && dashboard.codes.length > 0 && (
                    <span className="badge">{dashboard.codes.length}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="rail-foot">
            <div className="support">
              Need help?
              <br />
              <a href="mailto:info.knowsia@gmail.com">info.knowsia@gmail.com</a>
            </div>
            <button className="logout" type="button" onClick={() => void logout()}>
              <svg className="icon"><use href="#i-logout" /></svg>Log out
            </button>
          </div>
        </aside>

        <div className="topbar">
          <div className="row1">
            <div className="brand">
              <Image src="/knowsia-icon.png" alt="Knowsia" width={26} height={26} className="mark" priority />
              Knowsia
            </div>
            <button className="logout" type="button" onClick={() => void logout()}>
              <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-logout" /></svg>Log out
            </button>
          </div>
          <nav className="topbar-nav" role="tablist" aria-label="Partner portal sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-current={activePanel === item.id ? 'page' : undefined}
                onClick={() => setActivePanel(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <main className="main">
          <div className="content">
            {errorMessage && (
              <p role="alert" className="plan-confirm-error" style={{ marginBottom: 20 }}>
                {errorMessage}
              </p>
            )}

            {activePanel === 'overview' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Overview</p>
                <h2 className="panel-title">{dashboard.fullName}</h2>
                <p className="panel-sub">{CATEGORY_LABELS[dashboard.category] ?? dashboard.category} · {dashboard.phone}</p>

                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-compass" /></svg></div>
                    <span className="num tnum">{totalClicks}</span>
                    <span className="lbl">Link clicks</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-check" /></svg></div>
                    <span className="num tnum">{totalRedemptions}</span>
                    <span className="lbl">Registrations</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-award" /></svg></div>
                    <span className="num tnum">{formatGhs(dashboard.commissionTotals.paid ?? 0)}</span>
                    <span className="lbl">Paid out</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-card" /></svg></div>
                    <span className="num tnum">{formatGhs(totalEarned)}</span>
                    <span className="lbl">Total earned</span>
                  </div>
                </div>

                {dashboard.codes.length === 0 ? (
                  <p className="empty-note">
                    No codes assigned yet — contact Knowsia to get your referral code set up.
                  </p>
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>Your codes</h3>
                      <button type="button" className="link-btn" onClick={() => setActivePanel('codes')}>
                        View all →
                      </button>
                    </div>
                    {dashboard.codes.map((code) => (
                      <div key={code.id} className="mini-course-row">
                        <div>
                          <div className="name">{code.code}</div>
                          <div className="meta">{discountLabel(code)} · {code.usesCount} use(s)</div>
                        </div>
                        {code.isActive ? (
                          <span className="pill pill-success">Active</span>
                        ) : (
                          <span className="pill pill-neutral">Inactive</span>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </section>
            )}

            {activePanel === 'codes' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">My Codes</p>
                <h2 className="panel-title">{dashboard.codes.length} code(s)</h2>
                <p className="panel-sub">
                  Share your code directly, or share your tracked link — either one attributes the
                  registration to you.
                </p>

                {dashboard.codes.length === 0 && (
                  <p className="empty-note">No codes assigned yet — contact Knowsia to get set up.</p>
                )}

                {dashboard.codes.map((code) => (
                  <article key={code.id} className="course-card">
                    <div className="head">
                      <div>
                        <h4>{code.code}</h4>
                        <div className="meta">{discountLabel(code)}</div>
                      </div>
                      <div className="badges">
                        {code.isActive ? (
                          <span className="pill pill-success">Active</span>
                        ) : (
                          <span className="pill pill-neutral">Inactive</span>
                        )}
                      </div>
                    </div>

                    <div className="fig-grid">
                      <div><span className="lbl">Clicks</span><span className="val tnum">{dashboard.clickCounts[code.id] ?? 0}</span></div>
                      <div><span className="lbl">Registrations</span><span className="val tnum">{dashboard.redemptionCounts[code.id] ?? 0}</span></div>
                      <div><span className="lbl">Total uses</span><span className="val tnum">{code.usesCount}</span></div>
                    </div>

                    <div className="field" style={{ marginTop: 12 }}>
                      <label htmlFor={`batch-${code.id}`}>Link this code to a course (optional)</label>
                      <select
                        id={`batch-${code.id}`}
                        value={selectedBatchByCode[code.code] ?? ''}
                        onChange={(event) => {
                          setSelectedBatchByCode((current) => ({ ...current, [code.code]: event.target.value }));
                          setQrCode(null);
                        }}
                      >
                        <option value="">General link (no specific course)</option>
                        {Array.isArray(batchOptions) &&
                          batchOptions.map((batch) => (
                            <option key={batch.batchId} value={batch.batchId}>
                              {batch.courseName} — {batch.cohortLabel} — {formatDate(batch.startDate)}
                            </option>
                          ))}
                      </select>
                    </div>

                    {referralOrigin && (
                      <p className="meta" style={{ marginTop: 10, wordBreak: 'break-all' }}>
                        Tracked link: {referralOrigin}/r/{code.code}
                        {selectedBatchByCode[code.code] ? `?batchId=${selectedBatchByCode[code.code]}` : ''}
                      </p>
                    )}

                    <div className="join-row">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => copyLink(code.code)}>
                        {copiedCode === code.code ? 'Copied!' : 'Copy link'}
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => void showQrCode(code.code)}>
                        Show QR code
                      </button>
                    </div>

                    {qrCode?.code === code.code && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrCode.dataUrl} alt={`QR code for ${code.code}`} width={180} height={180} style={{ marginTop: 12 }} />
                    )}
                  </article>
                ))}
              </section>
            )}

            {activePanel === 'commissions' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Commissions</p>
                <h2 className="panel-title">Commission pipeline</h2>
                <p className="panel-sub">
                  Tracked registrations become Pending once payment clears, Approved after the hold
                  period, then Payable and Paid once Knowsia processes your payout.
                </p>

                <div className="stat-grid">
                  <div className="stat-tile"><span className="num tnum">{formatGhs(dashboard.commissionTotals.pending ?? 0)}</span><span className="lbl">Pending</span></div>
                  <div className="stat-tile"><span className="num tnum">{formatGhs(dashboard.commissionTotals.approved ?? 0)}</span><span className="lbl">Approved</span></div>
                  <div className="stat-tile"><span className="num tnum">{formatGhs(dashboard.commissionTotals.payable ?? 0)}</span><span className="lbl">Payable</span></div>
                  <div className="stat-tile"><span className="num tnum">{formatGhs(dashboard.commissionTotals.paid ?? 0)}</span><span className="lbl">Paid</span></div>
                </div>

                {dashboard.payableCommissionIds.length > 0 && (
                  <div className="account-card" style={{ marginBottom: 20 }}>
                    <p className="plan-box-label" style={{ marginBottom: 8 }}>
                      Redeem {formatGhs(dashboard.commissionTotals.payable ?? 0)} of payable commission as
                      course-fee credit for a referred student
                    </p>
                    {redeemError && <p className="plan-confirm-error">{redeemError}</p>}
                    {redeemSuccess && <p className="panel-sub" style={{ color: '#1a7f4b' }}>{redeemSuccess}</p>}
                    <div className="field">
                      <label htmlFor="redeemEmail">Student&apos;s email</label>
                      <input
                        id="redeemEmail"
                        type="email"
                        placeholder="student@example.com"
                        value={redeemEmail}
                        onChange={(event) => setRedeemEmail(event.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={redeeming || !redeemEmail.trim()}
                      onClick={() => void redeemCommissionCredit()}
                    >
                      {redeeming ? 'Redeeming…' : 'Apply as course credit'}
                    </button>
                  </div>
                )}

                <div className="section-heading">
                  <h3>Payout history</h3>
                </div>
                {dashboard.recentPayouts.length === 0 ? (
                  <p className="empty-note">No payouts yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Date</th><th className="num">Amount</th><th>Method</th><th>Reference</th></tr>
                      </thead>
                      <tbody>
                        {dashboard.recentPayouts.map((payout) => (
                          <tr key={payout.id}>
                            <td>{new Date(payout.paidAt).toLocaleDateString()}</td>
                            <td className="num tnum">{formatGhs(payout.totalAmount)}</td>
                            <td>{payout.method}</td>
                            <td>{payout.reference ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activePanel === 'account' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Account</p>
                <h2 className="panel-title">Your details</h2>

                <div className="account-card">
                  <div className="field-static">
                    <span className="lbl">Name</span>
                    <span className="val">{dashboard.fullName}</span>
                  </div>
                  <div className="field-static">
                    <span className="lbl">Partner Type</span>
                    <span className="val">{CATEGORY_LABELS[dashboard.category] ?? dashboard.category}</span>
                  </div>
                  <div className="field-static">
                    <span className="lbl">Phone</span>
                    <span className="val">{dashboard.phone}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <Link href="/partner-portal/change-pin" className="btn btn-primary">Change PIN</Link>
                  </div>
                  <div className="session-note"><span className="dot" />Signed in from this device · Session active</div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

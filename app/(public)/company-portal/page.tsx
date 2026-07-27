'use client';

// Corporate portal dashboard (2026-07-26; redesigned 2026-07-27 into the
// same section-based app shell as the student portal — see
// components/portal/portal-design-system.tsx, the shared visual language
// between the two non-staff portals) — seats purchased/used/remaining per
// allocation, roster with payment status per employee, self-service "add
// employees" (capped at the allocation's remaining seats, enforced
// server-side), and invoice download.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { apiFetch } from '@/components/api-client';
import { PORTAL_STYLES, PortalIcons } from '@/components/portal/portal-design-system';
import { formatGhs } from '@/lib/utils';

interface Employee {
  registrationId: string;
  fullName: string;
  email: string;
  phone: string;
  paymentStatus: string;
  amountPaid: number;
  courseFee: number;
}

interface Allocation {
  id: string;
  courseName: string;
  batchCohortLabel: string;
  seatsPurchased: number;
  seatsUsed: number;
  seatsRemaining: number;
  pricePerSeat: number;
  status: string;
  employees: Employee[];
}

interface Dashboard {
  companyName: string;
  billingContactName: string;
  billingEmail: string;
  mustChangePin: boolean;
  allocations: Allocation[];
}

type PanelId = 'overview' | 'allocations' | 'invoices' | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'allocations', label: 'Seat Allocations', icon: 'i-users' },
  { id: 'invoices', label: 'Invoices', icon: 'i-card' },
  { id: 'account', label: 'Account', icon: 'i-user' },
];

function statusPill(status: string) {
  if (status === 'active') return <span className="pill pill-success">Active</span>;
  if (status === 'cancelled') return <span className="pill pill-danger">Cancelled</span>;
  return <span className="pill pill-neutral">{status}</span>;
}

function paymentPill(status: string) {
  if (status === 'Paid') return <span className="pill pill-success">Paid</span>;
  if (status === 'Part Payment') return <span className="pill pill-warning">Part payment</span>;
  return <span className="pill pill-danger">Unpaid</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function parsePastedRows(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstName, surname, gender, email, phone, jobTitle, company] = line
        .split(',')
        .map((cell) => cell.trim());
      return {
        firstName: firstName ?? '',
        middleName: null,
        surname: surname ?? '',
        gender: gender === 'Female' ? 'Female' : 'Male',
        email: email ?? '',
        phone: phone ?? '',
        jobTitle: jobTitle || null,
        company: company || null,
        amountPaid: 0,
      };
    });
}

export default function CompanyPortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>('overview');
  const [expandedAllocationId, setExpandedAllocationId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const result = await apiFetch<Dashboard>('/api/company-portal/me');
      if (result.mustChangePin) {
        router.push('/company-portal/change-pin');
        return;
      }
      setDashboard(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load your dashboard.');
      router.push('/company-portal/login');
    }
  }

  useEffect(() => {
    void load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await apiFetch('/api/company-portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/company-portal/login');
  }

  async function addEmployees(allocationId: string) {
    const rows = parsePastedRows(pasteText);
    if (rows.length === 0) return;
    setAdding(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/company-portal/allocations/${allocationId}/employees`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setPasteText('');
      setExpandedAllocationId(null);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add employees.');
    } finally {
      setAdding(false);
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

  const totalSeatsPurchased = dashboard.allocations.reduce((sum, a) => sum + a.seatsPurchased, 0);
  const totalSeatsUsed = dashboard.allocations.reduce((sum, a) => sum + a.seatsUsed, 0);
  const totalSeatsRemaining = dashboard.allocations.reduce((sum, a) => sum + a.seatsRemaining, 0);
  const activeAllocations = dashboard.allocations.filter((a) => a.status === 'active').length;

  return (
    <div className="portal-app">
      <style>{PORTAL_STYLES}</style>
      <PortalIcons />

      <div className="app">
        <aside className="rail" aria-label="Corporate portal navigation">
          <div className="rail-brand">
            <Image src="/knowsia-icon.png" alt="Knowsia" width={34} height={34} className="mark" priority />
            <div>
              <span className="name">Knowsia</span>
              <span className="tag">Corporate Portal</span>
            </div>
          </div>

          <div className="identity">
            <div className="avatar">{initials(dashboard.companyName)}</div>
            <div className="who">
              <strong>{dashboard.companyName}</strong>
              <span>{dashboard.billingContactName}</span>
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
                  {item.id === 'allocations' && dashboard.allocations.length > 0 && (
                    <span className="badge">{dashboard.allocations.length}</span>
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
          <nav className="topbar-nav" role="tablist" aria-label="Corporate portal sections">
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
                <h2 className="panel-title">{dashboard.companyName}</h2>
                <p className="panel-sub">{dashboard.billingContactName} · {dashboard.billingEmail}</p>

                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-users" /></svg></div>
                    <span className="num tnum">{totalSeatsPurchased}</span>
                    <span className="lbl">Seats purchased</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-check" /></svg></div>
                    <span className="num tnum">{totalSeatsUsed}</span>
                    <span className="lbl">Seats filled</span>
                  </div>
                  <div className={`stat-tile${totalSeatsRemaining > 0 ? ' warn' : ''}`}>
                    <div className="icon-wrap"><svg className="icon"><use href="#i-plus" /></svg></div>
                    <span className="num tnum">{totalSeatsRemaining}</span>
                    <span className="lbl">Seats remaining</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-building" /></svg></div>
                    <span className="num tnum">{activeAllocations}</span>
                    <span className="lbl">Active allocation{activeAllocations === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {dashboard.allocations.length === 0 ? (
                  <p className="empty-note">No seat purchases yet — contact Knowsia to get started.</p>
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>Your seat allocations</h3>
                      <button type="button" className="link-btn" onClick={() => setActivePanel('allocations')}>
                        View all →
                      </button>
                    </div>
                    {dashboard.allocations.map((allocation) => (
                      <div key={allocation.id} className="mini-course-row">
                        <div>
                          <div className="name">{allocation.courseName} — {allocation.batchCohortLabel}</div>
                          <div className="meta">
                            {allocation.seatsUsed} of {allocation.seatsPurchased} seats filled
                          </div>
                        </div>
                        {statusPill(allocation.status)}
                      </div>
                    ))}
                  </>
                )}
              </section>
            )}

            {activePanel === 'allocations' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Seat Allocations</p>
                <h2 className="panel-title">
                  {dashboard.allocations.length} allocation{dashboard.allocations.length === 1 ? '' : 's'}
                </h2>
                <p className="panel-sub">
                  Add employees up to your purchased seats, and track who&apos;s been added and their
                  payment status.
                </p>

                {dashboard.allocations.length === 0 && (
                  <p className="empty-note">No seat purchases yet — contact Knowsia to get started.</p>
                )}

                {dashboard.allocations.map((allocation) => (
                  <article key={allocation.id} className="course-card">
                    <div className="head">
                      <div>
                        <h4>{allocation.courseName} — {allocation.batchCohortLabel}</h4>
                        <div className="meta">{formatGhs(allocation.pricePerSeat)} / seat</div>
                      </div>
                      <div className="badges">{statusPill(allocation.status)}</div>
                    </div>

                    <div className="fig-grid">
                      <div><span className="lbl">Purchased</span><span className="val tnum">{allocation.seatsPurchased}</span></div>
                      <div><span className="lbl">Filled</span><span className="val tnum">{allocation.seatsUsed}</span></div>
                      <div><span className="lbl">Remaining</span><span className="val tnum">{allocation.seatsRemaining}</span></div>
                    </div>

                    <div className="join-row">
                      <a
                        className="btn btn-outline btn-sm"
                        href={`/api/company-portal/allocations/${allocation.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-download" /></svg>Download invoice
                      </a>
                      {allocation.status === 'active' && allocation.seatsRemaining > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            setExpandedAllocationId(expandedAllocationId === allocation.id ? null : allocation.id)
                          }
                        >
                          <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-plus" /></svg>Add employees
                        </button>
                      )}
                    </div>

                    {expandedAllocationId === allocation.id && (
                      <div className="plan-box" style={{ marginTop: 14 }}>
                        <p className="plan-box-label">
                          One per line: FirstName,Surname,Gender(Male/Female),Email,Phone — up to{' '}
                          {allocation.seatsRemaining} more seat(s)
                        </p>
                        <div className="field" style={{ marginBottom: 10 }}>
                          <textarea
                            placeholder="Kofi,Mensah,Male,kofi@acme.com,+233241234567"
                            value={pasteText}
                            onChange={(event) => setPasteText(event.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void addEmployees(allocation.id)}
                          disabled={adding || !pasteText.trim()}
                        >
                          {adding ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                    )}

                    {allocation.employees.length > 0 && (
                      <div className="table-wrap" style={{ marginTop: 16 }}>
                        <table>
                          <thead>
                            <tr><th>Employee</th><th>Contact</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {allocation.employees.map((employee) => (
                              <tr key={employee.registrationId}>
                                <td className="course-cell"><strong>{employee.fullName}</strong></td>
                                <td className="course-cell"><span>{employee.email}</span><span>{employee.phone}</span></td>
                                <td>{paymentPill(employee.paymentStatus)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}

            {activePanel === 'invoices' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Invoices</p>
                <h2 className="panel-title">Billing history</h2>
                <p className="panel-sub">One invoice per seat allocation, generated fresh each time you download it.</p>

                {dashboard.allocations.length === 0 ? (
                  <p className="empty-note">No invoices yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Course</th><th className="num">Seats</th><th className="num">Price / seat</th><th className="num">Total</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {dashboard.allocations.map((allocation) => (
                          <tr key={allocation.id}>
                            <td className="course-cell"><strong>{allocation.courseName}</strong><span>{allocation.batchCohortLabel}</span></td>
                            <td className="num tnum">{allocation.seatsPurchased}</td>
                            <td className="num tnum">{formatGhs(allocation.pricePerSeat)}</td>
                            <td className="num tnum">{formatGhs(allocation.seatsPurchased * allocation.pricePerSeat)}</td>
                            <td>{statusPill(allocation.status)}</td>
                            <td>
                              <a className="btn btn-ghost btn-sm" href={`/api/company-portal/allocations/${allocation.id}/invoice`} target="_blank" rel="noreferrer">
                                <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-download" /></svg>Invoice
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num tnum">{totalSeatsPurchased}</td>
                          <td></td>
                          <td className="num tnum">
                            {formatGhs(dashboard.allocations.reduce((s, a) => s + a.seatsPurchased * a.pricePerSeat, 0))}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activePanel === 'account' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Account</p>
                <h2 className="panel-title">Company details</h2>
                <p className="panel-sub">Your billing contact on file with Knowsia.</p>

                <div className="account-card">
                  <div className="field-static">
                    <span className="lbl">Company</span>
                    <span className="val">{dashboard.companyName}</span>
                  </div>
                  <div className="field-static">
                    <span className="lbl">Billing Contact</span>
                    <span className="val">{dashboard.billingContactName}</span>
                  </div>
                  <div className="field-static">
                    <span className="lbl">Billing Email</span>
                    <span className="val">{dashboard.billingEmail}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <Link href="/company-portal/change-pin" className="btn btn-primary">Change PIN</Link>
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

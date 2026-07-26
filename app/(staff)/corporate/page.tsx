'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CompanyRow {
  id: string;
  name: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  createdAt: string;
}

const emptyForm = {
  name: '',
  tin: '',
  billingContactName: '',
  billingEmail: '',
  billingPhone: '',
  billingAddress: '',
  notes: '',
};

export default function CorporatePage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadCompanies() {
    try {
      const result = await apiFetch<{ companies: CompanyRow[] }>('/api/corporate/companies');
      setCompanies(result.companies);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load companies.');
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  async function createCompany() {
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/corporate/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          tin: form.tin.trim() || undefined,
          billingContactName: form.billingContactName.trim(),
          billingEmail: form.billingEmail.trim(),
          billingPhone: form.billingPhone.trim(),
          billingAddress: form.billingAddress.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      setForm(emptyForm);
      await loadCompanies();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create company.');
    } finally {
      setCreating(false);
    }
  }

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.billingContactName.trim() &&
    form.billingEmail.trim() &&
    form.billingPhone.trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Corporate Clients</h1>
        <p className="text-sm text-muted-foreground">
          Companies buying seats for their employees — invoice/bank-transfer billing, a
          dedicated roster per purchase.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a company</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="TIN (optional)" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
          <Input placeholder="Billing contact name" value={form.billingContactName} onChange={(e) => setForm({ ...form, billingContactName: e.target.value })} />
          <Input placeholder="Billing email" type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} />
          <Input placeholder="Billing phone" value={form.billingPhone} onChange={(e) => setForm({ ...form, billingPhone: e.target.value })} />
          <Input placeholder="Billing address (optional)" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} />
          <div className="md:col-span-3">
            <Button onClick={() => void createCompany()} disabled={creating || !canSubmit}>
              {creating ? 'Adding…' : 'Add company'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Billing contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company.billingContactName}</TableCell>
                  <TableCell>{company.billingEmail}</TableCell>
                  <TableCell>{company.billingPhone}</TableCell>
                  <TableCell>
                    <Link href={`/corporate/${company.id}`} className="text-sm font-medium text-primary hover:underline">
                      View →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {companies.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No corporate clients yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

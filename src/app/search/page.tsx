'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession, upsertBusiness } from '@/lib/storage';
import { generateId, INDUSTRY_OPTIONS } from '@/lib/utils';
import type { SearchFormValues, SearchApiResponse, Business, SearchSession } from '@/lib/types';
import ErrorMessage from '@/components/ErrorMessage';
import LoadingSpinner from '@/components/LoadingSpinner';

const DEFAULT_FORM: SearchFormValues = {
  location: '',
  radius: 5000,
  maxBusinesses: 10,
  businessType: '',
};

const RADIUS_OPTIONS = [
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 25000, label: '25 km' },
  { value: 50000, label: '50 km' },
];

const MAX_OPTIONS = [10, 25, 50];

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse a single CSV line handling quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every((v) => !v)) continue; // skip blank rows
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function mapCsvRow(row: Record<string, string>): Partial<Business> {
  return {
    companyName: row['companyname'] || row['company'] || row['name'] || row['businessname'] || '',
    contactName: row['contactname'] || row['contact'] || row['owner'] || '',
    phone: row['phone'] || row['phonenumber'] || row['telephone'] || null,
    email: row['email'] || '',
    city: row['city'] || row['location'] || '',
    industry: row['industry'] || row['sector'] || row['type'] || '',
    description: row['description'] || row['about'] || '',
    notes: row['notes'] || '',
  };
}

export default function SearchPage() {
  const router = useRouter();
  const [form, setForm] = useState<SearchFormValues>(DEFAULT_FORM);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV upload state
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvCount, setCsvCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof SearchFormValues>(key: K, value: SearchFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.location.trim()) {
      setError('Please enter a location.');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: form.location.trim(),
          radius: form.radius,
          maxBusinesses: form.maxBusinesses,
          businessType: form.businessType.trim(),
        }),
      });

      const data: SearchApiResponse = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.businesses.length) {
        setError('No businesses found. Try adjusting the filters.');
        return;
      }

      const sessionId = generateId();
      const session: SearchSession = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        location: form.location.trim(),
        radius: form.radius,
        maxBusinesses: form.maxBusinesses,
        businessType: form.businessType.trim(),
        source: 'search',
      };
      saveSession(session);

      data.businesses.forEach((b) => {
        const business: Business = {
          id: generateId(),
          searchSessionId: sessionId,
          createdAt: new Date().toISOString(),
          companyName: b.name,
          contactName: '',
          phone: b.phone,
          email: '',
          city: form.location.trim(),
          industry: form.businessType.trim(),
          description: '',
          notes: '',
          placeId: b.placeId,
          callId: null,
          callStatus: b.phone ? 'pending' : 'no-phone',
          transcript: null,
          recordingUrl: null,
          researchNotes: '',
          talkingPoints: '',
          callHistory: [],
          followUpDate: null,
          emailSent: false,
        };
        upsertBusiness(business);
      });

      router.push('/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(null);
    setCsvCount(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setCsvError('Please select a .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) {
        setCsvError('Could not read file.');
        return;
      }

      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvError('No data rows found in CSV. Make sure it has headers and at least one row.');
        return;
      }

      const sessionId = generateId();
      const session: SearchSession = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        location: 'CSV Upload',
        radius: 0,
        maxBusinesses: rows.length,
        businessType: '',
        source: 'csv',
      };
      saveSession(session);

      let count = 0;
      rows.forEach((row) => {
        const mapped = mapCsvRow(row);
        if (!mapped.companyName) return; // skip rows with no company name

        const business: Business = {
          id: generateId(),
          searchSessionId: sessionId,
          createdAt: new Date().toISOString(),
          companyName: mapped.companyName,
          contactName: mapped.contactName || '',
          phone: mapped.phone || null,
          email: mapped.email || '',
          city: mapped.city || '',
          industry: mapped.industry || '',
          description: mapped.description || '',
          notes: mapped.notes || '',
          placeId: `csv-${Date.now()}-${count}`,
          callId: null,
          callStatus: mapped.phone ? 'pending' : 'no-phone',
          transcript: null,
          recordingUrl: null,
          researchNotes: '',
          talkingPoints: '',
          callHistory: [],
          followUpDate: null,
          emailSent: false,
        };
        upsertBusiness(business);
        count++;
      });

      if (count === 0) {
        setCsvError('No valid businesses found in CSV. Ensure there is a "Company Name" column.');
        return;
      }

      setCsvCount(count);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Navigate to dashboard after short delay
      setTimeout(() => router.push('/'), 1500);
    };
    reader.readAsText(file);
  }

  const inputCls = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500';

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-zinc-900">Find Businesses</h1>

      {/* Google Places Search */}
      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-800">Search by Location</h2>
        <ErrorMessage message={error} onDismiss={() => setError(null)} />

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="location">
            Location <span className="text-red-500">*</span>
          </label>
          <input
            id="location"
            type="text"
            placeholder="e.g. Kitchener, ON"
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Radius + Max Businesses */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="radius">
              Search Radius
            </label>
            <select
              id="radius"
              value={form.radius}
              onChange={(e) => update('radius', Number(e.target.value))}
              className={inputCls}
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="maxBusinesses">
              Max Businesses
            </label>
            <select
              id="maxBusinesses"
              value={form.maxBusinesses}
              onChange={(e) => update('maxBusinesses', Number(e.target.value))}
              className={inputCls}
            >
              {MAX_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Business Type / Industry */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="businessType">
            Business Type / Industry <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <select
            id="businessType"
            value={form.businessType}
            onChange={(e) => update('businessType', e.target.value)}
            className={inputCls}
          >
            <option value="">All business types</option>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
            <option value="Custom">Custom</option>
          </select>
          {form.businessType === 'Custom' && (
            <input
              type="text"
              placeholder="Enter custom business type..."
              className={`mt-2 ${inputCls}`}
              onChange={(e) => update('businessType', e.target.value || 'Custom')}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {isSearching ? (
            <>
              <LoadingSpinner size="sm" />
              Searching for businesses...
            </>
          ) : (
            'Find Businesses'
          )}
        </button>
      </form>

      {/* CSV Upload */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-zinc-800">Upload CSV</h2>
        <p className="text-sm text-zinc-500">
          Import a list of businesses from a CSV file. Expected columns: Company Name, Contact Name, Phone, Email, City, Industry, Description, Notes.
        </p>

        <ErrorMessage message={csvError} onDismiss={() => setCsvError(null)} />

        {csvCount !== null && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Successfully imported {csvCount} business{csvCount === 1 ? '' : 'es'}. Redirecting to dashboard...
          </div>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="block w-full text-sm text-zinc-500 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 file:transition-colors file:cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

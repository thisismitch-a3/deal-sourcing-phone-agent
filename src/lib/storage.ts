'use client';

import type { Business, SearchSession } from './types';

const BUSINESSES_KEY = 'dsa_businesses';
const SESSIONS_KEY = 'dsa_sessions';

// ─── Businesses ─────────────────────────────────────────────────────────────

export function getBusinesses(): Business[] {
  try {
    const raw = localStorage.getItem(BUSINESSES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Business[];
  } catch {
    return [];
  }
}

export function saveBusinesses(list: Business[]): void {
  try {
    localStorage.setItem(BUSINESSES_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be full or unavailable — silently fail
  }
}

export function getBusinessById(id: string): Business | undefined {
  return getBusinesses().find((b) => b.id === id);
}

export function upsertBusiness(business: Business): void {
  const list = getBusinesses();
  const idx = list.findIndex((b) => b.id === business.id);
  if (idx >= 0) {
    list[idx] = business;
  } else {
    list.push(business);
  }
  saveBusinesses(list);
}

export function deleteBusiness(id: string): void {
  saveBusinesses(getBusinesses().filter((b) => b.id !== id));
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export function getSessions(): SearchSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchSession[];
  } catch {
    return [];
  }
}

export function saveSession(session: SearchSession): void {
  try {
    const list = getSessions();
    list.unshift(session); // newest first
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
  } catch {
    // silently fail
  }
}

export function getLatestSession(): SearchSession | undefined {
  return getSessions()[0];
}

export function clearAll(): void {
  try {
    localStorage.removeItem(BUSINESSES_KEY);
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    // silently fail
  }
}

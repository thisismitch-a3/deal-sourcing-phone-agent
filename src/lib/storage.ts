'use client';

import type { Restaurant, SearchSession } from './types';

const RESTAURANTS_KEY = 'rpa_restaurants';
const SESSIONS_KEY = 'rpa_sessions';

// ─── Restaurants ─────────────────────────────────────────────────────────────

export function getRestaurants(): Restaurant[] {
  try {
    const raw = localStorage.getItem(RESTAURANTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Restaurant[];
  } catch {
    return [];
  }
}

export function saveRestaurants(list: Restaurant[]): void {
  try {
    localStorage.setItem(RESTAURANTS_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be full or unavailable — silently fail
  }
}

export function getRestaurantById(id: string): Restaurant | undefined {
  return getRestaurants().find((r) => r.id === id);
}

export function upsertRestaurant(restaurant: Restaurant): void {
  const list = getRestaurants();
  const idx = list.findIndex((r) => r.id === restaurant.id);
  if (idx >= 0) {
    list[idx] = restaurant;
  } else {
    list.push(restaurant);
  }
  saveRestaurants(list);
}

export function deleteRestaurant(id: string): void {
  saveRestaurants(getRestaurants().filter((r) => r.id !== id));
}

// ─── Sessions ────────────────────────────────────────────────────────────────

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
    localStorage.removeItem(RESTAURANTS_KEY);
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    // silently fail
  }
}

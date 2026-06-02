import { describe, it, expect } from 'vitest';
import { CabinetImpl } from '../../src/context/cabinet.ts';

describe('CabinetImpl', () => {
  it('stores and retrieves values', () => {
    const cab = new CabinetImpl();
    cab.put('test/key', 'value');
    expect(cab.get('test/key')).toBe('value');
  });

  it('returns undefined for missing keys', () => {
    const cab = new CabinetImpl();
    expect(cab.get('missing')).toBeUndefined();
  });

  it('checks existence', () => {
    const cab = new CabinetImpl();
    cab.put('exists', 42);
    expect(cab.exists('exists')).toBe(true);
    expect(cab.exists('not-exists')).toBe(false);
  });

  it('queries with exact match', () => {
    const cab = new CabinetImpl();
    cab.put('a/b', 1);
    cab.put('a/c', 2);
    expect(cab.query('a/b')).toHaveLength(1);
    expect(cab.query('a/b')[0]?.value).toBe(1);
  });

  it('queries with wildcard', () => {
    const cab = new CabinetImpl();
    cab.put('drafts/v1.md', 'first');
    cab.put('drafts/v2.md', 'second');
    cab.put('output/result.png', 'image');
    const drafts = cab.query('drafts/*');
    expect(drafts).toHaveLength(2);
  });

  it('queries with double-wildcard', () => {
    const cab = new CabinetImpl();
    cab.put('a/b/c', 1);
    cab.put('a/b/d', 2);
    cab.put('e/f', 3);
    expect(cab.query('a/**')).toHaveLength(2);
  });

  it('removes values', () => {
    const cab = new CabinetImpl();
    cab.put('temp', 'value');
    cab.remove('temp');
    expect(cab.exists('temp')).toBe(false);
  });

  it('clears all values', () => {
    const cab = new CabinetImpl();
    cab.put('a', 1);
    cab.put('b', 2);
    cab.clear();
    expect(cab.query('**')).toHaveLength(0);
  });

  it('clones independently', () => {
    const cab = new CabinetImpl();
    cab.put('key', 'original');
    const cloned = cab.clone();
    cloned.put('key', 'modified');
    expect(cab.get('key')).toBe('original');
    expect(cloned.get('key')).toBe('modified');
  });

  it('merges with namespaced strategy', () => {
    const cab = new CabinetImpl();
    cab.put('existing', 'value');
    const other = new CabinetImpl();
    other.put('new', 'data');
    cab.merge(other, 'namespaced');
    expect(cab.get('existing')).toBe('value');
    expect(cab.exists('new')).toBe(true);
  });

  it('merges with concat strategy for arrays', () => {
    const cab = new CabinetImpl();
    cab.put('items', [1, 2]);
    const other = new CabinetImpl();
    other.put('items', [3, 4]);
    cab.merge(other, 'concat');
    expect(cab.get('items')).toEqual([1, 2, 3, 4]);
  });

  it('merges with overwrite strategy', () => {
    const cab = new CabinetImpl();
    cab.put('key', 'old');
    const other = new CabinetImpl();
    other.put('key', 'new');
    cab.merge(other, 'overwrite');
    expect(cab.get('key')).toBe('new');
  });
});

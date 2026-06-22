import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('drops falsy values', () => {
    expect(cn('base', false && 'hidden', 'active')).toBe('base active');
  });

  it('resolves tailwind conflicts — last class wins', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6');
  });

  it('handles undefined and null gracefully', () => {
    expect(cn('base', undefined, null as any, 'extra')).toBe('base extra');
  });
});

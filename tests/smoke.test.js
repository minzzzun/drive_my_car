// Vitest 러너 동작 확인용 스모크 테스트 (M0)
import { describe, it, expect } from 'vitest';

describe('테스트 환경 스모크', () => {
  it('Vitest가 동작한다', () => {
    expect(1 + 1).toBe(2);
  });
});

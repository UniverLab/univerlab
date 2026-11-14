/**
 * The published-audit badge button: one click copies the client snippet.
 *
 * @jest-environment jsdom
 */
jest.mock('morphicons/element', () => ({
  defineMorphIcon: jest.fn(),
}));
import { initAuditPage } from '../lib/audit/client';

describe('audit badge copy button', () => {
  it('copies the snippet on click', async () => {
    document.body.innerHTML =
      '<script type="application/json" id="audit-data">{"slug":"s","lang":"es"}</script>' +
      '<button type="button" class="audit-badge-copy" data-snippet="SNIPPET">copy</button>';
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    initAuditPage(document);
    document.querySelector('.audit-badge-copy')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('SNIPPET');
  });
});

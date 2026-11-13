/** @jest-environment node */
import {
  ask,
  CAPTURE_REASONS,
  classify,
  cleanAnswer,
  closing,
  complaintSays,
  COMPLAINT_SAYS_AT,
  fixed,
  formatReasonNote,
  isCaptureReason,
  isDecline,
  nextCaptureStep,
  parseReason,
  priorityOf,
  REASON_TAG,
  REASONS,
  routeOf,
  type CaptureReason,
  type Reason,
} from '../src/reasons';

const CFG = { model: 'test-model', options: {} };

function aiFor(content: string): { run: jest.Mock } {
  return { run: jest.fn(async () => ({ choices: [{ message: { content } }] })) };
}

test('exactly 19 reasons in the closed set', () => {
  expect(REASONS).toHaveLength(19);
  expect(new Set(REASONS).size).toBe(19);
});

test.each(REASONS.map((r) => [r]) as Array<[Reason]>)(
  'classify mocked to %s routes it without booking, promising or confirming',
  async (reason) => {
    const ai = aiFor('{"reason": "' + reason + '"}');
    await expect(classify(ai, CFG, 'hola', 'es')).resolves.toBe(reason);
    // Nothing is booked, promised or confirmed outside the booking reasons:
    // only first-call/consultation reach the booking intake, flow/audit the
    // plain intake, and every capture/question/payment/vendor path is passive.
    const route = routeOf(reason);
    const bookingRoutes = ['booking-first-call', 'booking-consultation'];
    const intakeRoutes = [...bookingRoutes, 'intake-flow', 'intake-audit'];
    if (reason === 'first-call' || reason === 'consultation') {
      expect(bookingRoutes).toContain(route);
    } else if (reason === 'flow' || reason === 'audit') {
      expect(['intake-flow', 'intake-audit']).toContain(route);
    } else {
      expect(bookingRoutes).not.toContain(route);
      expect(intakeRoutes).not.toContain(route);
    }
  }
);

test('unparseable or out-of-set answers classify as human', () => {
  expect(parseReason('not json at all')).toBe('human');
  expect(parseReason('{"reason": "party"}')).toBe('human');
  expect(parseReason('{"reason": 42}')).toBe('human');
  expect(parseReason('')).toBe('human');
});

test('classify falls back to human when the model call fails', async () => {
  const ai = { run: jest.fn(async () => Promise.reject(new Error('down'))) };
  await expect(classify(ai, CFG, 'hola', 'es')).resolves.toBe('human');
});

test('classify rethrows the guard-over marker instead of swallowing it', async () => {
  const ai = { run: jest.fn(async () => Promise.reject(new Error('guard-global-over'))) };
  await expect(classify(ai, CFG, 'hola', 'es')).rejects.toThrow('guard-global-over');
});

test('every capture reason asks at most two fixed questions', () => {
  for (const reason of CAPTURE_REASONS) {
    for (const lang of ['es', 'en'] as const) {
      const questions = ask(reason, lang);
      expect(questions.length).toBeGreaterThanOrEqual(1);
      expect(questions.length).toBeLessThanOrEqual(2);
      for (const q of questions) {
        expect(q.trim().length).toBeGreaterThan(0);
      }
    }
  }
  // Human hands off after one answer: exactly one question.
  expect(ask('human', 'es')).toHaveLength(1);
  expect(ask('human', 'en')).toHaveLength(1);
});

test('only flow and audit among non-capture reasons carry a note tag (via intake)', () => {
  const nonCapture = REASONS.filter((r) => !isCaptureReason(r));
  expect(nonCapture).toHaveLength(10);
  for (const r of nonCapture) {
    if (r === 'flow' || r === 'audit') {
      expect(REASON_TAG[r]).not.toBeNull();
    } else {
      expect(REASON_TAG[r]).toBeNull();
    }
  }
});

test('operator tags exist for every handoff path', () => {
  expect(REASON_TAG.flow).toBe('FLUJO');
  expect(REASON_TAG.audit).toBe('AUDITORÍA');
  expect(REASON_TAG.support).toBe('SOPORTE');
  expect(REASON_TAG['audit-fixes']).toBe('VERIFICACIÓN');
  expect(REASON_TAG.publish).toBe('PUBLICACIÓN');
  expect(REASON_TAG.refund).toBe('REEMBOLSO');
  expect(REASON_TAG.invoice).toBe('FACTURA');
  expect(REASON_TAG.complaint).toBe('RECLAMO');
  expect(REASON_TAG['data-rights']).toBe('DATOS');
  expect(REASON_TAG.human).toBe('PERSONA');
  expect(REASON_TAG.collab).toBe('COLABORACIÓN');
});

test('priority is high only for support, audit-fixes and complaint; low only for collab', () => {
  for (const r of REASONS) {
    if (r === 'support' || r === 'audit-fixes' || r === 'complaint') {
      expect(priorityOf(r)).toBe('high');
    } else if (r === 'collab') {
      expect(priorityOf(r)).toBe('low');
    } else {
      expect(priorityOf(r)).toBe('normal');
    }
  }
});

test('operator note keeps the first line and adds tag, priority and cleaned answers', () => {
  const long = 'x'.repeat(600);
  const note = formatReasonNote({
    name: 'Ana Gomez',
    phone: '573001234567',
    lang: 'es',
    tag: 'SOPORTE',
    priority: 'high',
    opening: 'se cayó el flujo [urgente]',
    answers: ['pasa desde ayer', long],
  });
  const lines = note.split('\n');
  expect(lines[0]).toBe('Ana Gomez +573001234567');
  expect(lines[1]).toContain('SOPORTE');
  expect(lines[1]).toContain('prioridad alta');
  expect(note).toContain('- se cayó el flujo urgente');
  expect(note).toContain('- pasa desde ayer');
  const bullets = lines.slice(2);
  for (const b of bullets) {
    expect(b).not.toContain('[');
    expect(b).not.toContain(']');
  }
  const longLine = lines.find((l) => l.startsWith('- xxx'));
  expect(longLine).toBe('- ' + 'x'.repeat(500));
});

test('english operator note marks priority in english', () => {
  const note = formatReasonNote({
    name: 'Bob',
    phone: '14155552671',
    lang: 'en',
    tag: 'COLABORACIÓN',
    priority: 'low',
    opening: 'a talk proposal',
    answers: [],
  });
  expect(note.split('\n')[0]).toBe('Bob +14155552671');
  expect(note).toContain('COLABORACIÓN');
  expect(note).toContain('low priority');
});

test('cleanAnswer mirrors the profile-name cleaning at 500 chars', () => {
  expect(cleanAnswer('  hola\nmundo [x] ')).toBe('hola mundo x');
  expect(cleanAnswer('y'.repeat(600))).toBe('y'.repeat(500));
});

test.each(CAPTURE_REASONS.map((r) => [r]) as Array<[CaptureReason]>)(
  'closing for %s names a person at the lab and promises nothing',
  (reason) => {
    for (const lang of ['es', 'en'] as const) {
      const text = closing(reason, lang);
      if (lang === 'es') {
        expect(text).toContain('una persona del laboratorio');
        expect(text).toContain('por aquí');
      } else {
        expect(text).toContain('person at the lab');
        expect(text).toContain('here');
      }
      // No amount, no date, no eligibility, no outcome.
      expect(text).not.toMatch(/USD|COP|\$|€/);
      expect(text).not.toMatch(/gratis|free/i);
      // No name of the person who runs the lab.
      expect(text).not.toMatch(/Jheison|Martinez|Bolivar/i);
    }
  }
);

test('only the data-rights closing states response times', () => {
  expect(closing('data-rights', 'es')).toMatch(/10.*15/);
  expect(closing('data-rights', 'en')).toMatch(/10.*15/);
  for (const r of CAPTURE_REASONS.filter((x) => x !== 'data-rights')) {
    expect(closing(r, 'es')).not.toMatch(/\d+\s*días hábiles/);
  }
});

test('fixed sentences: ack, vendor and redirect', () => {
  expect(fixed('complaintAck', 'es')).toContain('una persona del laboratorio');
  expect(fixed('complaintAck', 'en')).toContain('person at the lab');
  expect(fixed('vendor', 'es')).not.toMatch(/persona del laboratorio/);
  expect(fixed('offTopic', 'en')).toContain('UniverLab');
});

test('declines are read in code, both languages', () => {
  for (const t of ['no', 'No gracias', '  NADA ', 'no quiero', 'déjalo', 'no, por ahora', 'no me interesa']) {
    expect(isDecline(t, 'es')).toBe(true);
  }
  for (const t of ['no', 'no thanks', 'nothing', 'never mind', 'nope', 'no, not today']) {
    expect(isDecline(t, 'en')).toBe(true);
  }
  expect(isDecline('quiero una factura', 'es')).toBe(false);
  expect(isDecline('sí, el proyecto atlas', 'es')).toBe(false);
  expect(isDecline('the atlas project broke', 'en')).toBe(false);
});

test('a longer sentence starting with no stays an answer, not a decline', () => {
  // Content the operator note needs must not be dropped as a refusal.
  expect(isDecline('no puedo entrar al flujo desde ayer', 'es')).toBe(false);
  expect(isDecline('no funciona desde el lunes y me frena', 'es')).toBe(false);
  expect(isDecline('no, I cannot log in since Monday morning', 'en')).toBe(false);
  // A long refusal is kept as an answer too: the capture still hands off
  // after the second question, with the refusal quoted in the note.
  expect(isDecline('no quiero responder ninguna pregunta', 'es')).toBe(false);
});

test('capture hands off after two answers, or on decline, whatever they say', () => {
  // Two-question reason: first answer asks again, second hands off.
  expect(nextCaptureStep('support', 'es', [], false)).toEqual({ action: 'ask', question: ask('support', 'es')[0] });
  expect(nextCaptureStep('support', 'es', ['a1'], false)).toEqual({
    action: 'ask',
    question: ask('support', 'es')[1],
  });
  expect(nextCaptureStep('support', 'es', ['a1', 'a2'], false)).toEqual({ action: 'handoff' });
  // A decline hands off even with nothing gathered.
  expect(nextCaptureStep('support', 'es', [], true)).toEqual({ action: 'handoff' });
  expect(nextCaptureStep('support', 'es', ['a1'], true)).toEqual({ action: 'handoff' });
  // Human asks once, then hands off.
  expect(nextCaptureStep('human', 'en', [], false).action).toBe('ask');
  expect(nextCaptureStep('human', 'en', ['about this'], false)).toEqual({ action: 'handoff' });
});

test('a complaint that already says what happened skips the question', () => {
  expect(complaintSays('todo mal')).toBe(false);
  expect(complaintSays('me cobraron dos veces y nadie responde')).toBe(true);
  expect(COMPLAINT_SAYS_AT).toBe(20);
});

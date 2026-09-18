// Compiles a structured prompt spec into one canonical system prompt.
//
// The point is that the OUTPUT shape is fixed no matter what the operator typed.
// Section order, headings and the rule block are emitted by this file, not by
// the operator, so a prompt written by someone who has never seen the others
// still produces the same behaviour on a call.
//
// Two live failures drove the rule block below, and neither was fixable by
// rewording prose:
//   - the model was handed one canonical sentence ("details WhatsApp पर भेज दूं?")
//     and re-emitted it every turn it did not understand;
//   - nothing said the phone number was already known, so it asked for one while
//     already on the phone with the person.
// Both are now invariants the compiler always writes.

const MARKER = '# CALLORA PROMPT v1';

// Kept in sync with COMPILED_PROMPT_MARKER in agent/agent.py. When the agent
// sees this it skips SPEED_RULES, because the rules are already below.
const CANONICAL_MARKER = MARKER;

const DEFAULTS = {
  max_words_per_reply: 15,
  one_question_per_turn: true,
  never_invent_numbers: true,
  phone_already_known: true,
  deflect_once: true,
};

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);

// "Hindi" (structural language of the prompt — headers, rules, instructions)
// is a separate question from "which script the AGENT'S SPOKEN OUTPUT uses".
// isHindi() decides the former throughout compile(); wantsDevanagariOutput()
// decides only the one output-script rule in ruleBlock(). Devanagari used to be
// the default and only option for Hindi agents — verified 2026-09-02 against
// real Sarvam Bulbul v3 output that Roman-script Hindi (Hinglish, as people
// actually text it) pronounces identically well, so that is now the default;
// pass language.script: 'devanagari' to opt back into Devanagari explicitly.
// See gotcha_hindi_stt_tts_script memory for the comparison this rests on.
function isHindi(spec) {
  return clean(spec?.language?.primary).toLowerCase().startsWith('hi');
}
function wantsDevanagariOutput(spec) {
  return isHindi(spec) && clean(spec?.language?.script).toLowerCase() === 'devanagari';
}

/**
 * Rules that must hold on every call, emitted in the agent's own language so a
 * small model does not have to bridge two languages mid-instruction.
 */
function ruleBlock(spec, deva) {
  const c = { ...DEFAULTS, ...(spec.constraints || {}) };
  const romanTerms = list(spec?.language?.roman_terms);
  const devaOutput = wantsDevanagariOutput(spec);
  const rules = [];

  if (deva) {
    rules.push(`एक बार में सिर्फ एक छोटा वाक्य बोलिए। ज़्यादा से ज़्यादा ${c.max_words_per_reply} शब्द।`);
    if (c.one_question_per_turn) rules.push('एक turn में सिर्फ एक सवाल पूछिए।');
    rules.push('जो वाक्य आप पहले बोल चुकी हैं, उसे दोबारा मत बोलिए। कहने को नया कुछ न हो तो कोई नया सवाल पूछिए।');
    if (c.deflect_once) {
      rules.push('कोई भी टालने वाली लाइन पूरी call में सिर्फ एक बार बोलिए। दोबारा वही सवाल आए तो कहिए कि details भेजी जा रही हैं, और फिर कोई दूसरी बात पूछिए।');
    }
    if (c.phone_already_known) {
      rules.push('इनका phone और WhatsApp number हमारे पास पहले से है। कभी number मत पूछिए, न confirm करवाइए।');
    }
    if (c.never_invent_numbers) {
      rules.push('कोई भी price, rate, number, size, तारीख़ या कोई और detail अपने आप मत बनाइए। ये आपको नहीं पता। ऊपर FACTS में जो लिखा है सिर्फ वही बोलिए।');
    }
    rules.push('कभी asterisk, star, bullet, markdown या कोई special character मत लिखिए। आप जो लिखेंगी वो हूबहू बोला जाएगा।');
    // Digits get read out in English ("two minutes"), and a digit glued to an
    // acronym makes the voice stall mid-token ("3 BH ... K"). Both are fixed at
    // source by writing the word instead, and spacing what must stay a digit.
    rules.push(devaOutput
      ? 'छोटी संख्याएं और समय अंकों में मत लिखिए, शब्दों में लिखिए। "2 मिनट" नहीं — "दो मिनट"। "3 साल" नहीं — "तीन साल"।'
      : 'छोटी संख्याएं और समय अंकों में मत लिखिए, शब्दों में लिखिए। "2 मिनट" नहीं — "do minute"। "3 साल" नहीं — "teen saal"।');
    // agent.py also converts "X.5" at the TTS layer as a backstop (_normalize_for_tts),
    // but writing it correctly at the source means the transcript itself reads
    // naturally too, not just what gets spoken. Examples match devaOutput so this
    // rule's own example isn't in a different script than what it's asking for.
    rules.push(devaOutput
      ? 'आधे नंबर हमेशा बोलचाल में लिखिए, दशमलव में नहीं। "5.5 एकड़" नहीं — "साढ़े 5 एकड़"। "1.5" नहीं — "डेढ़"। "2.5" नहीं — "ढाई"।'
      : 'आधे नंबर हमेशा बोलचाल में लिखिए, दशमलव में नहीं। "5.5 acre" नहीं — "saade 5 acre"। "1.5" नहीं — "dedh"। "2.5" नहीं — "dhai"।');
    rules.push('जहां अंक ज़रूरी हो, अंक और अंग्रेज़ी अक्षरों के बीच space रखिए: "3 BHK" लिखिए, "3BHK" नहीं।');
    // The one directive that decides OUTPUT script — everything else in this
    // block is instructional Hindi for the model to read, which is unaffected
    // either way. Devanagari is opt-in now (language.script: 'devanagari');
    // Roman/Hinglish is the default — see isHindi()/wantsDevanagariOutput()
    // above for why, and gotcha_hindi_stt_tts_script memory for the test this
    // rests on (Sarvam Bulbul v3 pronounces both scripts equally well).
    if (devaOutput) {
      rules.push(
        'सभी Hindi शब्द Devanagari में लिखिए, Roman letters में कभी नहीं। ' +
        (romanTerms.length
          ? `ये terms Roman में ही रहेंगे: ${romanTerms.join(', ')}।`
          : 'English proper nouns और brand names Roman में रहेंगे।')
      );
      rules.push('हर वाक्य को danda (।) या सवाल हो तो प्रश्नवाचक चिह्न (?) से खत्म कीजिए।');
    } else {
      rules.push(
        'सभी Hindi Roman/English letters में लिखिए — casual spelling, जैसे WhatsApp पर लिखते हैं ("aap kaise ho", "bilkul sahi"). Devanagari script कभी मत लिखिए। ' +
        (romanTerms.length ? `इनकी spelling बिल्कुल ऐसी ही रखिए: ${romanTerms.join(', ')}।` : '')
      );
      rules.push('हर वाक्य को period (.) या सवाल हो तो question mark (?) से ख़त्म कीजिए।');
    }
  } else {
    rules.push(`Reply with ONE short sentence, ${c.max_words_per_reply} words maximum. Never two sentences.`);
    if (c.one_question_per_turn) rules.push('Ask at most one question per turn. Never stack questions.');
    rules.push('Never repeat a sentence you have already said. If you have nothing new, ask a question instead.');
    if (c.deflect_once) {
      rules.push('Use each deflection line at most ONCE per call. If the same topic comes up again, say the details are on their way and move to a different question.');
    }
    if (c.phone_already_known) {
      rules.push('Their phone and WhatsApp number are already on file. NEVER ask for a number or ask them to confirm one.');
    }
    if (c.never_invent_numbers) {
      rules.push('Never invent a price, rate, number, size, date or any other detail. You do not know them. Say only what is in FACTS above.');
    }
    rules.push('Never write asterisks, stars, bullets, markdown or special characters. Everything you write is spoken verbatim.');
    rules.push('Put a space between a digit and an uppercase acronym: write "3 BHK", never "3BHK". The voice stalls mid-word otherwise.');
    rules.push('No filler ("umm", "so", "okay so", "I see"). Get to the point.');
  }

  return rules;
}

/**
 * Compile a spec into the canonical prompt.
 *
 * Section order is fixed: identity, goal, opening, facts, deflections, closing,
 * rules. Rules go last because that is the position a small model weights most
 * heavily, and they are the part that must survive whatever the operator wrote.
 */
function compile(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('prompt_spec must be an object');

  // `deva` here means "structural language is Hindi" (headers, instructions) —
  // NOT "output script is Devanagari". See isHindi() vs wantsDevanagariOutput()
  // above; the name is kept to minimise the diff against the branching below,
  // all of which is about language, not script.
  const deva = isHindi(spec);
  const p = spec.persona || {};
  const out = [MARKER, ''];

  // Hindi puts the company before the role ("Real Concept की sales executive"),
  // English after it ("a sales executive at Real Concept").
  const who = [
    clean(p.company) && deva ? `${clean(p.company)} की` : '',
    clean(p.role),
    clean(p.company) && !deva ? `at ${clean(p.company)}` : '',
  ].filter(Boolean).join(' ');
  const identity = deva
    ? [clean(p.agent_name) && `आप ${clean(p.agent_name)} हैं`, who].filter(Boolean).join(' — ') +
      (who ? '।' : '')
    : [clean(p.agent_name) && `You are ${clean(p.agent_name)}`, who].filter(Boolean).join(', ') +
      (who ? '.' : '');

  out.push(deva ? '## पहचान' : '## IDENTITY');
  out.push(identity || (deva ? 'आप एक sales executive हैं।' : 'You are a sales executive.'));
  if (clean(p.tone)) out.push(deva ? `बोलने का अंदाज़: ${clean(p.tone)}। robot जैसी नहीं।` : `Tone: ${clean(p.tone)}. Never robotic.`);
  out.push(deva
    ? 'Greeting हो चुकी है। दोबारा introduce मत होइए।'
    : 'The greeting has already been delivered. Do not introduce yourself again.');
  out.push('');

  if (clean(spec.goal)) {
    out.push(deva ? '## लक्ष्य' : '## GOAL');
    out.push(clean(spec.goal));
    out.push('');
  }

  if (clean(spec.opening_line)) {
    out.push(deva ? '## पहली reply' : '## FIRST REPLY');
    out.push(deva
      ? 'सिर्फ यह लाइन बोलिए, इससे ज़्यादा कुछ नहीं:'
      : 'Say exactly this line and nothing more:');
    out.push(clean(spec.opening_line));
    out.push(deva
      ? 'उसके बाद हर turn में सिर्फ एक छोटी बात कहिए या एक सवाल पूछिए। पूरी pitch एक साथ कभी मत बोलिए।'
      : 'After that, say one short thing or ask one question per turn. Never deliver the whole pitch at once.');
    out.push('');
  }

  const facts = (Array.isArray(spec.facts) ? spec.facts : [])
    .filter((f) => f && clean(f.value));
  out.push(deva ? '## FACTS — सिर्फ यही सच है' : '## FACTS — the only ground truth');
  if (facts.length) {
    out.push(deva
      ? 'सिर्फ पूछे जाने पर बताइए, और एक बार में सिर्फ एक:'
      : 'State these only when asked, and only one at a time:');
    for (const f of facts) {
      const label = clean(f.label);
      out.push(label ? `- ${label}: ${clean(f.value)}` : `- ${clean(f.value)}`);
    }
  } else {
    out.push(deva ? '(कोई fact नहीं दिया गया।)' : '(No facts provided.)');
  }
  out.push('');

  const questions = list(spec.discovery_questions);
  if (questions.length) {
    out.push(deva ? '## समझने के लिए सवाल' : '## DISCOVERY QUESTIONS');
    out.push(deva
      ? 'इनमें से एक बार में सिर्फ एक पूछिए, और जवाब के हिसाब से आगे बढ़िए। जो बात वो पहले बता चुके हैं, दोबारा मत पूछिए:'
      : 'Ask at most one of these per turn and adapt to the answer. Never re-ask something they already told you:');
    for (const q of questions) out.push(`- ${q}`);
    out.push('');
  }

  const deflections = (Array.isArray(spec.deflections) ? spec.deflections : [])
    .filter((d) => d && clean(d.say));
  if (deflections.length) {
    out.push(deva ? '## जो नहीं पता' : '## WHEN YOU DO NOT KNOW');
    for (const d of deflections) {
      const when = clean(d.when);
      out.push(deva
        ? `- ${when ? `${when} पूछे जाने पर` : 'FACTS के बाहर कुछ पूछे जाने पर'}: "${clean(d.say)}" — यह लाइन पूरी call में सिर्फ एक बार।`
        : `- ${when ? `If asked about ${when}` : 'If asked anything outside FACTS'}: "${clean(d.say)}" — use this line at most once per call.`);
    }
    out.push('');
  }

  const closing = spec.closing || {};
  if (clean(closing.success) || clean(closing.not_interested)) {
    out.push(deva ? '## call कैसे खत्म करें' : '## CLOSING');
    if (clean(closing.success)) {
      out.push(deva
        ? `सवाल खत्म हो जाएं तो हूबहू यही कहिए और रुक जाइए: "${clean(closing.success)}"`
        : `When their questions are done, say exactly this and stop: "${clean(closing.success)}"`);
    }
    if (clean(closing.not_interested)) {
      out.push(deva
        ? `interested न हों तो हूबहू यही कहिए और रुक जाइए: "${clean(closing.not_interested)}"`
        : `If they are not interested, say exactly this and stop: "${clean(closing.not_interested)}"`);
    }
    out.push(deva
      ? 'closing line बोलने के बाद कोई नया सवाल मत पूछिए। call वहीं खत्म है।'
      : 'After a closing line, do not ask another question. The call is over.');
    out.push('');
  }

  out.push(deva ? '## सबसे ज़रूरी नियम — कभी मत तोड़िए' : '## HARD RULES — never break these');
  // Operator prohibitions go first: in regulated verticals (medical, financial)
  // these are the rules that carry actual liability, and the last block is where
  // a small model weights hardest.
  for (const p of list(spec.prohibitions)) out.push(`- ${clean(p)}`);
  for (const r of ruleBlock(spec, deva)) out.push(`- ${r}`);

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** True when a stored system_prompt was produced by this compiler. */
function isCompiled(systemPrompt) {
  return typeof systemPrompt === 'string' && systemPrompt.includes(MARKER);
}

module.exports = { compile, isCompiled, MARKER, CANONICAL_MARKER, DEFAULTS };

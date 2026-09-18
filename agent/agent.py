"""
Callora LiveKit Agent — sub-1s latency pipeline
  STT: Sarvam saarika (streaming WebSocket, high VAD sensitivity)
  VAD: Silero (audio-level voice activity detection)
  Turn detector: LiveKit MultilingualModel (semantic end-of-turn, Hindi+English aware)
  LLM: Groq Llama / OpenAI / Sarvam (token streaming, max 80 tokens)
  TTS: Sarvam bulbul:v3 (streaming WebSocket, min_buffer_size=30 for fast first audio)

Architecture: preemptive_generation=True so LLM starts generating while user is still speaking.
"""
import asyncio
import logging
import os
import time
import json
import re
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("callora-agent")

try:
    from livekit import rtc
    from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli, RoomInputOptions
    from livekit.agents.voice.turn import TurnHandlingOptions, InterruptionOptions, EndpointingOptions
    # Raised from on_user_turn_completed to suppress the LLM's reply when the
    # agent has already handled the turn deterministically (hangup / transfer).
    from livekit.agents.llm import StopResponse
    from livekit.plugins import sarvam, openai as lk_openai, noise_cancellation, silero
    from livekit.plugins.turn_detector.multilingual import MultilingualModel
    LIVEKIT_AVAILABLE = True
except ImportError as e:
    logger.error(f"Missing plugin: {e}. Run: pip install livekit-plugins-silero livekit-plugins-turn-detector")
    LIVEKIT_AVAILABLE = False

# Optional Gemini Live (speech-to-speech) plugin
try:
    from livekit.plugins.google.realtime import RealtimeModel as GeminiRealtimeModel
    from google.genai import types as gemini_types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    GeminiRealtimeModel = None
    gemini_types = None

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "dev")

AMD_VOICEMAIL   = "machine-vm"

# ── Script handling ───────────────────────────────────────────────────────────
# Sarvam saarika returns Hindi speech as Devanagari, and the LLM is instructed to
# reply in Devanagari (bulbul reads Roman Hindi with English phonetics). So every
# pattern below has to match both scripts, and Devanagari alternatives cannot use
# \b: matras such as ी and ं are not \w characters, so a word boundary lands in
# the *middle* of words — r'\bनहीं\b' never matches. Guard on the script block
# instead.
_DEVA = r'\u0900-\u097F'

# Danda / double danda -> period, applied only on the way into TTS. See
# CalloraAgent.tts_node for why this is load-bearing rather than cosmetic.
_TTS_SENTENCE_PUNCT = str.maketrans({"।": ".", "॥": "."})

# A digit glued to an uppercase acronym ("3BHK") makes bulbul hesitate mid-token
# — it comes out as "3 BH ... K". Measured over 6 runs per variant at the
# temperature the agent actually uses:
#     "यह 1BHK और 3BHK flat है।"    3/6 runs paused (5 pauses), avg 3.16s
#     "यह 1 BHK और 3 BHK flat है।"  0/6 runs paused,            avg 2.57s
# The space is both cleaner and half a second faster. This matters more now that
# a Devanagari prompt forces target_language_code=hi-IN, where the artefact lives.
_TTS_DIGIT_ACRONYM = re.compile(r'(?<=\d)(?=[A-Z]{2,})')

# Longest partial word held back while waiting for a word boundary. Only needed
# so a rewrite is never applied to half a token that arrived in two LLM deltas.
_TTS_REWRITE_HOLD = 40


# "X.5" read literally comes out as "X दशमलव पांच" — textbook-formal, not how a
# real estate agent actually says a half-value out loud. Converting it to the
# natural spoken word ("साढ़े पांच", "डेढ़", "ढाई") is a code-level guarantee: it
# holds regardless of what the LLM emits, rather than depending on a prompt rule
# a small model might not follow on every turn.
_HINDI_ONES = {
    1: "एक", 2: "दो", 3: "तीन", 4: "चार", 5: "पांच", 6: "छह", 7: "सात", 8: "आठ", 9: "नौ", 10: "दस",
    11: "ग्यारह", 12: "बारह", 13: "तेरह", 14: "चौदह", 15: "पंद्रह", 16: "सोलह", 17: "सत्रह", 18: "अठारह", 19: "उन्नीस",
}
_HINDI_TENS_UNITS = {
    20: "बीस", 21: "इक्कीस", 22: "बाईस", 23: "तेईस", 24: "चौबीस", 25: "पच्चीस", 26: "छब्बीस", 27: "सत्ताईस", 28: "अट्ठाईस", 29: "उनतीस",
    30: "तीस", 31: "इकतीस", 32: "बत्तीस", 33: "तैंतीस", 34: "चौंतीस", 35: "पैंतीस", 36: "छत्तीस", 37: "सैंतीस", 38: "अड़तीस", 39: "उनतालीस",
    40: "चालीस", 41: "इकतालीस", 42: "बयालीस", 43: "तैंतालीस", 44: "चवालीस", 45: "पैंतालीस", 46: "छियालीस", 47: "सैंतालीस", 48: "अड़तालीस", 49: "उनचास",
    50: "पचास", 51: "इक्यावन", 52: "बावन", 53: "तिरपन", 54: "चौवन", 55: "पचपन", 56: "छप्पन", 57: "सत्तावन", 58: "अट्ठावन", 59: "उनसठ",
    60: "साठ", 61: "इकसठ", 62: "बासठ", 63: "तिरसठ", 64: "चौंसठ", 65: "पैंसठ", 66: "छियासठ", 67: "सड़सठ", 68: "अड़सठ", 69: "उनहत्तर",
    70: "सत्तर", 71: "इकहत्तर", 72: "बहत्तर", 73: "तिहत्तर", 74: "चौहत्तर", 75: "पचहत्तर", 76: "छिहत्तर", 77: "सतहत्तर", 78: "अठहत्तर", 79: "उन्नासी",
    80: "अस्सी", 81: "इक्यासी", 82: "बयासी", 83: "तिरासी", 84: "चौरासी", 85: "पचासी", 86: "छियासी", 87: "सत्तासी", 88: "अट्ठासी", 89: "नवासी",
    90: "नब्बे", 91: "इक्यानवे", 92: "बानवे", 93: "तिरानवे", 94: "चौरानवे", 95: "पंचानवे", 96: "छियानवे", 97: "सत्तानवे", 98: "अट्ठानवे", 99: "निन्यानवे",
}

def _hindi_number_word(n: int):
    return _HINDI_ONES.get(n) or _HINDI_TENS_UNITS.get(n)

_HALF_DECIMAL = re.compile(r'\b(\d+)\.5\b')

def _half_decimal_to_words(m: 're.Match') -> str:
    n = int(m.group(1))
    # Match the number word's script to whichever script the surrounding sentence
    # is in (m.string is the full text passed to _normalize_for_tts), so a legacy
    # Devanagari-authored agent's numbers don't switch script mid-sentence, and
    # the Hinglish default doesn't produce Devanagari where nothing else is.
    if _has_devanagari(m.string):
        if n == 0: return "आधा"
        if n == 1: return "डेढ़"        # irregular — not "साढ़े एक"
        if n == 2: return "ढाई"         # irregular — not "साढ़े दो"
        word = _hindi_number_word(n)
        return f"साढ़े {word}" if word else m.group(0)
    # Roman/Hinglish default. "saade {n}" (mixed word+digit) is not a shortcut —
    # it was verified against Sarvam Bulbul v3 + a saarika STT round-trip to
    # pronounce identically to the fully Devanagari-spelled form.
    if n == 0: return "aadha"
    if n == 1: return "dedh"           # irregular — not "saade 1"
    if n == 2: return "dhai"           # irregular — not "saade 2"
    return f"saade {n}"


def _normalize_for_tts(text: str) -> str:
    text = _HALF_DECIMAL.sub(_half_decimal_to_words, text)
    return _TTS_DIGIT_ACRONYM.sub(' ', text.translate(_TTS_SENTENCE_PUNCT))


def _dev(*alts: str) -> str:
    """Devanagari alternation for whole standalone words (जी, हाँ, मत, नहीं).

    Guarded on both sides so short words can't match inside a longer one.
    """
    return rf'(?<![{_DEVA}])(?:{"|".join(alts)})(?![{_DEVA}])'


def _dev_stem(*alts: str) -> str:
    """Devanagari alternation ending on a verb stem, e.g. 'बात करा द' in 'बात करा दीजिए'.

    Leading guard only: a trailing one would reject the inflection that follows
    the stem, which is the whole point of matching a stem.
    """
    return rf'(?<![{_DEVA}])(?:{"|".join(alts)})'


# Common spelling variants as they actually come back from STT.
_NAHI = r'नह[ीि]ं?'                 # नहीं / नही / नहिं
_CHAHIYE = r'चाह[िी](?:ए|ये|य)'    # चाहिए / चाहिये
_BAAT = r'बात'
_BHEJ = r'भेज|भिजवा|शेयर'

# ── Auto-hangup phrase detection ──────────────────────────────────────────────
# Fired from _record_agent_turn when the agent delivers a closing line.
# Two-tier: WhatsApp close (strong signal, short delay) or explicit goodbye.
#
# The WhatsApp match deliberately allows filler between "WhatsApp" and the verb,
# because the natural closing line puts the object in between:
# "WhatsApp पर floor plans और pricing भेज देती हूं".
_WHATSAPP_CLOSE = re.compile(
    r'whatsapp\s*(?:पर|पे|में|को|pe|par|ko|mein)?[^.।?!\n]{0,45}?'
    rf'(?:{_BHEJ}|मिल\s*जाएंगी|देख\s*ल[ीि]|कर\s*द(?:ूं|ी|िया)|'
    r'details|info|link|share|kar\s*d|bhej|send)',
    re.IGNORECASE,
)
_GOODBYE_CLOSE = re.compile(
    r'\b(?:dhanyavaad|dhanyavad|shukriya|alvida|goodbye|good\s*bye|take\s*care|'
    r'namaste\s*ji?|namaskar|have\s*a\s*good|have\s*a\s*nice|'
    r'call\s*back\s*kar(?:te|na)\s*h[aiu])\b'
    '|' + _dev_stem('धन्यवाद', 'शुक्रिया', 'अलविदा', 'नमस्ते', 'नमस्कार',
                    r'आपका\s*दिन\s*शुभ', r'ध्यान\s*रख'),
    re.IGNORECASE,
)

# ── Caller-side intent detection (Hindi + English, as actually spoken on calls) ──
# Deterministic regex rather than an LLM tool call, for the same reason the
# existing auto-hangup is: small models read tool instructions as literal text
# and say the tool name out loud mid-call.

# "not interested" — must be tight. A false positive hangs up on a live lead,
# which is far worse than staying on a few seconds too long. Every alternative is
# anchored on an explicit negation ("not interested", "नहीं चाहिए") so that a
# positive reply containing the word "interested" can never match.
_NOT_INTERESTED = re.compile(
    r'\b(?:'
    r'not\s+interested|no\s+interest|nahi\s+chahiye|nahin\s+chahiye|'
    r'mujhe\s+nahi\s+chahiye|interest\s+nahi|koi\s+interest\s+nahi|'
    r'don.?t\s+call|do\s+not\s+call|stop\s+calling|mat\s+call\s+kar|'
    r'phone\s+mat\s+kar|remove\s+my\s+number|dnd|do\s+not\s+disturb|'
    r'not\s+looking|nahi\s+dekh\s+rahe|already\s+bought|already\s+purchased'
    r')\b'
    '|' + _dev_stem(
        rf'{_NAHI}\s*{_CHAHIYE}',
        rf'{_CHAHIYE}\s*{_NAHI}',
        rf'(?:कोई\s*)?(?:इंटरेस्ट|रुच[िी]|दिलचस्पी)\s*{_NAHI}',
        rf'interest\s*{_NAHI}',
        rf'(?:call|कॉल|फ़?ोन)\s*मत\s*(?:कर|क[ीि]ज)',
        rf'{_NAHI}\s*देख\s*रह',
        r'खरीद\s*लिया',
        r'ले\s*लिया\s*ह',
        rf'ज़?रूरत\s*{_NAHI}',
        r'(?:नंबर|number)\s*हटा',
    ),
    re.IGNORECASE,
)

# "put me through to a person"
_WANTS_HUMAN = re.compile(
    r'\b(?:'
    r'talk\s+to\s+(?:a\s+)?(?:human|person|agent|someone|executive|manager|sales)|'
    r'speak\s+(?:to|with)\s+(?:a\s+)?(?:human|person|agent|someone|executive|manager|sales)|'
    r'connect\s+me|transfer\s+me|real\s+person|actual\s+person|'
    r'insaan\s+se\s+baat|kisi\s+se\s+baat|aadmi\s+se\s+baat|'
    r'baat\s+kara\s*(?:do|dijiye)|manager\s+se\s+baat'
    r')\b'
    '|' + _dev_stem(
        rf'(?:किसी|इंसान|आदमी|बंदे|मैनेजर|manager|executive)\s*से\s*{_BAAT}',
        rf'{_BAAT}\s*करा\s*(?:द|[ीि]ज)',
        rf'{_BAAT}\s*कराइए',
        r'(?:connect|कनेक्ट)\s*कर\s*(?:द|[ीि]ज)',
    ),
    re.IGNORECASE,
)

# Affirmative / negative replies to "shall I transfer you?"
_AFFIRMATIVE = re.compile(
    r'\b(?:yes|yeah|yep|yup|sure|ok|okay|please|haan|han|ha|ji|ji\s*haan|'
    r'bilkul|theek|thik|kar\s*do|kara\s*do)\b'
    '|' + _dev(r'ह(?:ाँ|ां|ा)', 'जी', 'बिल्कुल', r'ठ[ीि]क', r'कर\s*दो',
               r'करा\s*दो', 'ओके', 'अच्छा', r'प्ल[ीि]ज़?'),
    re.IGNORECASE,
)
_NEGATIVE = re.compile(
    r'\b(?:no|nope|nahi|nahin|mat|not\s+now|abhi\s+nahi|rehne\s+do|'
    r'koi\s+baat\s+nahi)\b'
    '|' + _dev(_NAHI, 'ना', 'मत', rf'अभी\s*{_NAHI}', r'रहने\s*दो',
               rf'ज़?रूरत\s*{_NAHI}'),
    re.IGNORECASE,
)

# A caller answering "are you interested?" almost never says a compound phrase —
# they say one word. _NOT_INTERESTED above requires "नहीं चाहिए" / "रुचि नहीं" /
# etc. and deliberately does NOT match bare "नहीं" on its own, because a bare
# "no" is ambiguous in general (it could answer "buying for yourself or
# investment?" just as easily as "are you interested?"). So a bare negative only
# counts as not-interested when the AGENT's own last line was literally an
# interest-probe — see _last_agent_turn_text() / on_user_turn_completed below.
_INTEREST_PROBE = re.compile(r'interested|इंटरेस्ट|रुच[िी]|दिलचस्पी', re.IGNORECASE)
_BARE_NEGATIVE = re.compile(
    r'^[\s.।!,]*(?:नहीं|नही|नहिं|ना|no|nope|nahi|nahin)\s*(?:जी)?[\s.।!,]*$',
    re.IGNORECASE,
)

# Fallback lines, per script. These are spoken through the same TTS as everything
# else, so the Hindi ones have to match the HINGLISH RULE above — Roman-script
# casual Hindi. Verified 2026-09-02 against real Sarvam Bulbul v3 + a saarika
# STT round-trip: all four lines came back exactly on meaning (see
# gotcha_hindi_stt_tts_script memory for the fuller comparison this rests on).
DEFAULT_LINES = {
    "hi": {
        "not_interested": "Bilkul, koi baat nahi. Aapka samay dene ke liye dhanyavaad. Namaste!",
        "transfer_prompt": "Ji bilkul, kya main aapki call ek colleague ko transfer kar doon?",
        "transfer_message": "Theek hai, main abhi aapko connect kar rahi hoon. Ek moment.",
        "transfer_failed": "Maaf kijiye, abhi connect nahi ho pa raha. Main aapki madad karti hoon.",
    },
    "en": {
        "not_interested": "Of course, no problem at all. Thank you for your time. Goodbye!",
        "transfer_prompt": "Sure — shall I transfer you to a colleague?",
        "transfer_message": "Alright, connecting you now. One moment.",
        "transfer_failed": "Sorry, I can't connect you right now. Let me help you instead.",
    },
}

AMD_IVR         = "machine-ivr"
AMD_UNAVAILABLE = "machine-unavailable"

# Prompts built by backend/services/promptCompiler.js already carry the canonical
# rule block in the right place and the right language. Appending SPEED_RULES on
# top of one would restate the same rules a second time, in English, after the
# operator's content — which is how a small model ends up with two competing
# instruction sets. Only legacy free-text prompts get the append.
COMPILED_PROMPT_MARKER = "# CALLORA PROMPT v1"

# Hard sentence-length cap + Devanagari script rule for legacy free-text prompts.
# The example must not name a real project: whatever appears here gets read as a
# fact by a small model and turns up on calls for an unrelated property.
SPEED_RULES = (
    "\n\n# RESPONSE RULES (MANDATORY — follow these exactly)\n"
    "- Reply in 1 short sentence. Maximum 15 words. Never 2 sentences.\n"
    "- No filler ('umm', 'so', 'okay so', 'I see'). Get to the point.\n"
    "- Ask ONE question at a time. Never stack questions.\n"
    "- The caller's phone number is already on file. NEVER ask for a number.\n"
    "- Do not repeat a sentence you have already said. If you have nothing new, ask a question instead.\n"
    "- HINGLISH RULE (natural spoken style): Write Hindi words in Roman/Latin letters, "
    "casual texting spelling — NOT academic transliteration, NOT Devanagari script. "
    "English proper nouns, brand names, and technical terms stay as-is (WhatsApp, 3BHK, RERA, etc.). "
    "CORRECT: 'Bahut accha! Aap kab aa sakte hain site visit ke liye?' "
    "WRONG: 'बहुत अच्छा! आप कब आ सकते हैं site visit के लिए?'"
)


_DEVANAGARI_RE = re.compile(f'[{_DEVA}]')


def _has_devanagari(text: str) -> bool:
    return bool(text) and bool(_DEVANAGARI_RE.search(text))


def _fingerprint(text: str) -> str:
    """Normalise an utterance for repeat detection — punctuation and spacing vary."""
    return re.sub(r'[^\w]+', '', (text or '').lower())[:80]


def substitute_vars(text: str, lead: dict) -> str:
    if not text:
        return text
    replacements = {
        "{{name}}": lead.get("name") or "there",
        "{{city}}": lead.get("city") or "Gurgaon",
        "{{budget}}": lead.get("budget") or "",
        "{{phone}}": lead.get("phone") or "",
        "{{property_type}}": lead.get("property_type") or "",
    }
    for key, val in replacements.items():
        text = text.replace(key, val)
    return text


async def fetch_agent_config(room_name: str) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{BACKEND_URL}/api/internal/agent-config",
                params={"room": room_name},
                headers={"X-Internal-Secret": INTERNAL_SECRET},
                timeout=5.0,
            )
            if resp.status_code == 200:
                config = resp.json()
                lead = config.pop("lead_metadata", {})
                prompt = substitute_vars(config.get("system_prompt", ""), lead)
                if COMPILED_PROMPT_MARKER not in prompt:
                    prompt += SPEED_RULES
                config["system_prompt"] = prompt
                config["first_message"] = substitute_vars(config.get("first_message", ""), lead)
                config["voicemail_message"] = substitute_vars(config.get("voicemail_message", ""), lead)
                if lead.get("language") and not config.get("language"):
                    config["language"] = lead["language"]
                return config
        except Exception as e:
            logger.error(f"Failed to fetch agent config: {e}")
    return get_default_config()


def get_default_config() -> dict:
    return {
        "system_prompt": (
            "You are Riya, a senior property consultant at Real Concept, Gurgaon. "
            "You are calling {{name}} about premium properties on Golf Course Road and Dwarka Expressway. "
            "Start with: 'यह call quality के लिए record हो सकती है।' "
            "Goal: qualify intent, BHK, budget, location, timeline — then book a site visit. "
            "Be warm, confident, Hinglish. If interested, say: 'Site visit arrange कर दूं?'"
        ) + SPEED_RULES,
        "first_message": "नमस्ते {{name}} जी! मैं Riya बोल रही हूं Real Concept से — Gurgaon properties में specialist। क्या आप अभी बात कर सकते हैं?",
        "voicemail_message": "नमस्ते {{name}} जी, मैं Riya हूं Real Concept Gurgaon से। Please call back करें। Thank you!",
        "language": "hi-IN",
        "stt_model": "saarika:v2.5",
        "tts_model": "bulbul:v3",
        "tts_speaker": "priya",
        "llm_model": DEFAULT_VOICE_MODEL,
        "llm_provider": "groq",
        "llm_temperature": 0.6,
        "max_duration_minutes": 5,
        "voicemail_detection": True,
        "analysis_schema": {
            "interested": "boolean",
            "outcome": "interested|not_interested|callback|no_answer|wrong_number|voicemail",
            "intent": "buy|sell|rent",
            "budget_range": "string",
            "bhk_preference": "string",
            "location_preference": "string",
            "timeline": "string",
            "callback_time": "string",
        },
    }


async def send_call_result(room_name: str, result: dict):
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{BACKEND_URL}/api/webhook/agent",
                json=result,
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=10.0,
            )
            logger.info(f"Call result sent for room: {room_name}")
        except Exception as e:
            logger.error(f"Failed to send call result: {e}")


async def push_live_turn(room_name: str, turn: dict):
    """Push a single transcript turn to the backend for live transcription — best-effort, never throws."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{BACKEND_URL}/api/webhook/transcript-turn",
                json={"room_name": room_name, "turn": turn},
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=5.0,
            )
    except Exception:
        pass  # non-critical: live display; never crash the agent


async def start_recording_for_room(room_name: str) -> None:
    """Tell the backend to start egress recording now that both participants are in the room.

    Called when the SIP/human participant connects — at this point the room composite
    will capture both the agent's TTS audio (left channel) and the caller's voice (right
    channel) using DUAL_CHANNEL_AGENT mixing.  Best-effort: never throws.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/internal/start-recording",
                json={"room_name": room_name},
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("alreadyRecording"):
                    logger.info(f"[Recording] Room {room_name} already recording — no-op")
                else:
                    logger.info(f"[Recording] Egress started: {data.get('egressId')} for {room_name}")
            else:
                logger.warning(f"[Recording] Backend returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[Recording] start_recording_for_room error: {e}")


# ── Groq model selection ──────────────────────────────────────────────────────
# Groq decommissioned the entire Llama line; llama-3.1-8b-instant and
# llama-3.3-70b-versatile both 404 now. Every remaining Groq chat model is a
# *reasoning* model, which changes two things (both measured against the live API):
#   - reasoning_effort MUST be "low". At "medium", 97% of replies came back with
#     empty content — the model spends the whole budget thinking.
#   - max_completion_tokens must be generous. At 60 (the old cap) ~19% of turns
#     returned empty content; at 150 that drops to ~2%. An empty completion is not
#     an API error, so nothing retries it — it is just dead air on a live call.
DEFAULT_VOICE_MODEL   = "openai/gpt-oss-20b"    # ~0.12s to first token, replaces llama-3.1-8b-instant
ANALYSIS_MODEL        = "openai/gpt-oss-120b"   # post-call only, latency doesn't matter
GROQ_REASONING_EFFORT = "low"
GROQ_MAX_TOKENS       = 150

# Prefixes served by Groq. "openai/gpt-oss-*" is hosted BY GROQ despite the vendor
# prefix — it has to be matched here or it falls through to the api.openai.com branch.
GROQ_MODEL_PREFIXES = (
    "openai/gpt-oss", "qwen/", "groq/", "moonshotai/",
    "llama", "mixtral", "gemma", "deepseek",
)

# Models still referenced in the agents table that no longer serve real-time voice:
# the retired Llama line, and sarvam-* (500ms-2s first-token latency).
RETIRED_OR_UNSUITABLE = ("llama", "mixtral", "gemma", "sarvam")




async def request_transfer(room_name: str, participant_identity: str, reason: str = "") -> bool:
    """Ask the backend to warm-transfer the caller to a human.

    The destination number lives server-side (per-agent, with a platform default)
    and is deliberately never sent into the call config, so it can be changed
    without redeploying agents and never appears in agent logs.

    Returns True only if the transfer was actually accepted — the caller uses that
    to decide whether to apologise and carry on.
    """
    if not participant_identity:
        logger.warning("[transfer] no SIP participant identity known — cannot transfer")
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BACKEND_URL}/api/internal/transfer-call",
                json={"room_name": room_name, "participant_identity": participant_identity, "reason": reason},
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=15.0,
            )
            if resp.status_code == 200:
                logger.info(f"[transfer] accepted for {room_name}")
                return True
            logger.warning(f"[transfer] backend refused ({resp.status_code}): {resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"[transfer] request failed: {e}")
        return False


async def report_key_failure(provider: str, detail: str, http_status: int = None) -> None:
    """Tell the backend that a provider API failed during a real call.

    The admin panel's periodic probe cannot see this: Groq's /models endpoint keeps
    answering 200 after the chat quota is spent, and rate limits only show up under
    real concurrency. This is the signal that actually says "go recharge".

    Best-effort and never raises — a monitoring report must never be able to break
    a call that is otherwise still working.
    """
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{BACKEND_URL}/api/internal/key-failure",
                json={"provider": provider, "detail": str(detail)[:300], "http_status": http_status},
                headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET},
                timeout=5.0,
            )
    except Exception as e:
        logger.debug(f"[keyHealth] could not report {provider} failure: {e}")


def provider_from_session_error(e: Exception):
    """Best-effort: map a crashed session onto the provider that caused it.

    Deliberately conservative. A session can die for a dozen reasons that have
    nothing to do with an API key (network, LiveKit, a bad audio frame), and a
    false "out of credit" in the admin panel is worse than a missed one — it
    sends someone to recharge a key that was fine. So this only fires when the
    error names a provider AND reads like an auth or quota problem.
    """
    text = f"{type(e).__name__}: {e}".lower()
    auth_or_quota = any(w in text for w in (
        "401", "403", "429", "unauthorized", "forbidden", "invalid api key",
        "invalid_api_key", "quota", "insufficient", "credit", "billing",
        "subscription", "payment",
    ))
    if not auth_or_quota:
        return None
    if "sarvam" in text or "saarika" in text or "bulbul" in text:
        return "sarvam"
    if "groq" in text:
        return "groq"
    return None


def http_status_from_exc(e: Exception):
    """Pull an HTTP status off whatever the provider SDK raised, if there is one."""
    resp = getattr(e, "response", None)
    if resp is not None and getattr(resp, "status_code", None):
        return resp.status_code
    status = getattr(e, "status_code", None) or getattr(e, "status", None)
    return status if isinstance(status, int) else None


async def analyze_transcript(transcript: list, schema: dict) -> dict:
    """Analyze transcript using direct Groq API call (avoids livekit LLM interface complexity)."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or not transcript:
        return {}
    full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in transcript])
    prompt = (
        f"Analyze this real estate sales call transcript and extract fields as JSON:\n"
        f"{json.dumps(schema, indent=2)}\n\n"
        f"Transcript:\n{full_text}\n\n"
        f"Return ONLY valid JSON. Use null for unknown fields. No explanation."
    )
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": ANALYSIS_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    # Reasoning tokens count against this budget — 300 left too little
                    # for the JSON body and the extract silently came back empty.
                    "max_tokens": 800,
                    "temperature": 0.3,
                    "reasoning_effort": GROQ_REASONING_EFFORT,
                },
                timeout=15.0,
            )
            if resp.status_code != 200:
                logger.error(f"Analysis HTTP {resp.status_code}: {resp.text[:200]}")
                await report_key_failure("groq", resp.text[:300], resp.status_code)
                return {}
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group())
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        await report_key_failure("groq", e, http_status_from_exc(e))
    return {}


class CalloraAgent(Agent):
    def __init__(self, config: dict, session_ref: list):
        super().__init__(instructions=config["system_prompt"])
        self.config = config
        self.transcript = []
        self.start_time = None
        self.first_response_at = None   # time of first agent utterance (latency measurement)
        self.is_voicemail = False
        self.amd_result = None
        self._session_ref = session_ref
        self._hangup_scheduled = False   # prevent double-close from keyword detection
        self.room_name = ""             # set by entrypoint; used for live transcript push
        # Why the call ended + the warm-transfer state machine. Both are reported
        # to the backend in send_call_result so the History tab can show them.
        self.end_reason = None
        self.transfer_status = None      # offered | declined | accepted
        self._transfer_offer_pending = False
        self._transfer_done = False
        self.sip_identity = None         # set by the entrypoint when the human joins
        self._recent_fingerprints = []   # loop detection over the agent's own turns

    def tts_node(self, text, model_settings):
        """Rewrite the Devanagari danda to a period on the way into TTS.

        LiveKit's sentence tokenizer ends sentences on [.!?。！？] only; U+0964 is
        not in that set. Sarvam's TTS plugin hardcodes that tokenizer, and
        BufferedTokenStream stops early whenever the split yields a single token
        — which is *always*, for Devanagari. The effect is that nothing reaches
        Sarvam until the LLM completion finishes, so Hindi replies lose streaming
        entirely and arrive as one late block.

        Also splits "3BHK" into "3 BHK", which removes a measured ~270ms stall
        mid-token. See _TTS_DIGIT_ACRONYM.

        This only touches the audio path. transcription_node and
        conversation_item_added still see the original text, so transcripts,
        analysis and the closing-phrase matching all stay in Devanagari.
        """
        async def _normalized():
            # Chunks are raw LLM deltas, so "3BHK" can arrive as "3B" + "HK".
            # Hold back the trailing partial word so a rewrite always sees a
            # whole token; at most a few characters, well under the 50 the TTS
            # buffers server-side anyway.
            buf = ""
            async for chunk in text:
                if not chunk:
                    continue
                buf += chunk
                cut = buf.rfind(" ")
                if cut < 0:
                    if len(buf) < _TTS_REWRITE_HOLD:
                        continue
                    cut = len(buf) - 2   # safety valve: no boundary in sight
                head, buf = buf[:cut + 1], buf[cut + 1:]
                if head:
                    yield _normalize_for_tts(head)
            if buf:
                yield _normalize_for_tts(buf)

        return Agent.default.tts_node(self, _normalized(), model_settings)

    async def on_enter(self):
        self.start_time = time.time()
        if self.is_voicemail:
            return
        if is_gemini_realtime(self.config.get("llm_model", "")):
            # Gemini Live: trigger greeting via generate_reply so Gemini speaks first.
            # Can't use session.say() (no TTS model). Can't use proactivity=True
            # (crashes silently when SIP participant hasn't joined yet).
            first_msg = self.config.get("first_message", "")
            if first_msg and self._session_ref:
                prompt = f"[Call just connected. Say this EXACTLY as your opening line, then continue naturally]: {first_msg}"
                await self._session_ref[0].generate_reply(user_input=prompt)
            return
        # Sarvam pipeline: session.say() works fine (has TTS model)
        first_msg = self.config.get("first_message")
        if first_msg and self._session_ref:
            # Record greeting immediately — session.say() bypasses the LLM pipeline so
            # on_agent_turn_completed is NOT called for it.  Without this, short calls
            # where the lead hangs up before responding produce an empty transcript.
            turn = {"role": "agent", "text": first_msg, "timestamp": 0}
            self.transcript.append(turn)
            if self.first_response_at is None:
                self.first_response_at = 0   # greeting is t=0
            asyncio.create_task(push_live_turn(self.room_name, turn))
            await self._session_ref[0].say(first_msg, allow_interruptions=True)

    def _extra_patterns(self, key):
        """Compile any operator-supplied phrases for this agent into one regex."""
        phrases = [p for p in (self.config.get(key) or []) if str(p).strip()]
        if not phrases:
            return None
        return re.compile("|".join(re.escape(str(p).strip()) for p in phrases), re.IGNORECASE)

    def _matches(self, text, builtin, config_key):
        if builtin.search(text):
            return True
        extra = self._extra_patterns(config_key)
        return bool(extra and extra.search(text))

    def _default_line(self, key: str) -> str:
        lang = (self.config.get("language") or "hi-IN").lower()
        return DEFAULT_LINES["hi" if lang.startswith("hi") else "en"][key]

    async def _say(self, text):
        if self._session_ref and text:
            try:
                await self._session_ref[0].say(text, allow_interruptions=False)
            except Exception as e:
                logger.warning(f"[turn] say failed: {e}")

    def _last_agent_turn_text(self) -> str:
        """The agent's most recent line, searched from before the just-appended
        user turn. Used to disambiguate a bare "no" — see _BARE_NEGATIVE."""
        for t in reversed(self.transcript[:-1]):
            if t.get("role") == "agent":
                return t.get("text", "")
        return ""

    async def on_user_turn_completed(self, turn_ctx, new_message):
        text = new_message.text_content
        if not text:
            return
        turn = {
            "role": "user",
            "text": text,
            "timestamp": int((time.time() - (self.start_time or time.time())) * 1000),
        }
        self.transcript.append(turn)
        asyncio.create_task(push_live_turn(self.room_name, turn))

        # ── Deterministic turn handling ──────────────────────────────────────
        # Each branch below ends in StopResponse, which suppresses the LLM reply
        # for this turn. Without it the model would answer on top of the line we
        # just spoke, and the caller would hear two overlapping responses.
        if self._hangup_scheduled or self._transfer_done:
            return

        transfer_enabled = bool(self.config.get("transfer_enabled"))

        # 1. Answering our own "shall I transfer you?" question.
        if self._transfer_offer_pending:
            self._transfer_offer_pending = False
            # Check negative FIRST: "no, don't transfer me" contains both signals,
            # and the safe reading of an ambiguous answer is "don't transfer".
            if _NEGATIVE.search(text):
                self.transfer_status = "declined"
                logger.info("[transfer] caller declined")
                return  # let the LLM carry the conversation on normally
            if _AFFIRMATIVE.search(text) or _WANTS_HUMAN.search(text):
                self.transfer_status = "accepted"
                self._transfer_done = True
                await self._say(self.config.get("transfer_message") or self._default_line("transfer_message"))
                ok = await request_transfer(self.room_name, self.sip_identity, "caller accepted transfer")
                if ok:
                    self.end_reason = "transferred"
                else:
                    # Transfer failed — do NOT leave the caller in silence waiting
                    # for a handoff that is not coming. Hand the turn back.
                    self.transfer_status = "failed"
                    self._transfer_done = False
                    await self._say(self._default_line("transfer_failed"))
                raise StopResponse()
            # Neither yes nor no — treat as not accepted and continue normally.
            logger.info("[transfer] ambiguous reply to transfer offer — continuing conversation")
            return

        # 2. Caller asks for a human → offer the transfer.
        if transfer_enabled and self._matches(text, _WANTS_HUMAN, "transfer_trigger_phrases"):
            self._transfer_offer_pending = True
            self.transfer_status = "offered"
            logger.info("[transfer] caller asked for a human — offering transfer")
            await self._say(self.config.get("transfer_prompt") or self._default_line("transfer_prompt"))
            raise StopResponse()

        # 3. Caller is not interested → say goodbye properly, then hang up.
        # Checked last so that "not interested, put me through to a person" is
        # treated as a transfer request rather than a hangup.
        #
        # Two signals: a compound phrase always counts. A BARE "नहीं"/"no" only
        # counts when it answers our own interest-probe question — see the
        # comment on _BARE_NEGATIVE for why that guard exists.
        bare_no_to_interest_probe = bool(
            _BARE_NEGATIVE.match(text.strip()) and _INTEREST_PROBE.search(self._last_agent_turn_text())
        )
        if self.config.get("hangup_on_not_interested", True) and (
                self._matches(text, _NOT_INTERESTED, "not_interested_phrases")
                or bare_no_to_interest_probe):
            self._hangup_scheduled = True
            self.end_reason = "not_interested"
            logger.info("[auto_hangup] caller not interested — closing out")
            await self._say(self.config.get("not_interested_message") or self._default_line("not_interested"))
            # say() above is blocking with allow_interruptions=False, so the line
            # has finished playing; a short pad covers trailing TTS buffer.
            asyncio.ensure_future(self._auto_hangup(delay=1.0))
            raise StopResponse()

    def _record_agent_turn(self, text: str):
        """Record one agent response turn — called from session.on('conversation_item_added')."""
        if not text:
            return
        now = time.time()
        ts_ms = int((now - (self.start_time or now)) * 1000)
        # Deduplicate: session.say() (greeting) is pre-recorded in on_enter.
        # If conversation_item_added fires for it too, skip the duplicate.
        last = self.transcript[-1] if self.transcript else {}
        if last.get("role") == "agent" and last.get("text") == text:
            return
        # Track first LLM-generated utterance time (post-greeting latency)
        if self.first_response_at == 0 or self.first_response_at is None:
            self.first_response_at = ts_ms
        turn = {"role": "agent", "text": text, "timestamp": ts_ms}
        self.transcript.append(turn)
        asyncio.ensure_future(push_live_turn(self.room_name, turn))

        if self._hangup_scheduled:
            return

        # ── Loop backstop ────────────────────────────────────────────────────
        # Prompt rules alone cannot guarantee this: a small model that has been
        # handed one canonical line will re-emit it for every turn it does not
        # understand. Three identical replies in a row is not a conversation, so
        # close it out rather than let the caller sit through a stuck loop.
        fp = _fingerprint(text)
        if fp:
            self._recent_fingerprints.append(fp)
            del self._recent_fingerprints[:-3]
            if len(self._recent_fingerprints) == 3 and len(set(self._recent_fingerprints)) == 1:
                self._hangup_scheduled = True
                self.end_reason = "repetition_loop"
                logger.warning(f"[auto_hangup] agent repeated the same line 3x — closing out: {text[:80]!r}")
                asyncio.ensure_future(self._repetition_bailout())
                return

        # ── Auto-hangup: schedule close when agent delivers a closing phrase ──
        # Only look after the first turn (greeting is turn 0, shouldn't trigger).
        if len(self.transcript) > 1:
            # A question is an offer, not a close. The opening hook ("details
            # WhatsApp पर भेज दूं?") matches the same words as the closing line
            # and would otherwise end the call on the agent's very first reply.
            is_question = text.rstrip().endswith(("?", "？"))
            if _WHATSAPP_CLOSE.search(text) and not is_question:
                self._hangup_scheduled = True
                self.end_reason = self.end_reason or "whatsapp_close"
                logger.info("[auto_hangup] WhatsApp close detected — hanging up in 4s")
                asyncio.ensure_future(self._auto_hangup(delay=4.0))
            elif _GOODBYE_CLOSE.search(text) and not is_question:
                self._hangup_scheduled = True
                self.end_reason = self.end_reason or "goodbye"
                logger.info("[auto_hangup] Goodbye phrase detected — hanging up in 2.5s")
                asyncio.ensure_future(self._auto_hangup(delay=2.5))

    async def _repetition_bailout(self):
        """Close out a stuck loop with a real sign-off rather than a dead drop."""
        await self._say(self.config.get("not_interested_message") or self._default_line("not_interested"))
        await self._auto_hangup(delay=1.0)

    async def _auto_hangup(self, delay: float = 3.0):
        """Wait for TTS to finish speaking, then close the session."""
        await asyncio.sleep(delay)
        if self._session_ref:
            try:
                await self._session_ref[0].aclose()
            except Exception as e:
                logger.warning(f"[auto_hangup] aclose error: {e}")

    # Note: end_call is intentionally NOT a @function_tool.
    # Small LLMs (8B) read tool instructions as literal text and say "end_call" out loud.
    # Hangup is handled deterministically by _auto_hangup via keyword detection instead.
    async def end_call(self):
        """Internal alias kept for compatibility."""
        await self._auto_hangup(delay=0)


def is_gemini_realtime(llm_model: str) -> bool:
    """Gemini Live API models are speech-to-speech — they replace STT+LLM+TTS entirely."""
    if not llm_model:
        return False
    m = llm_model.lower()
    return m.startswith("gemini-live") or ("native-audio" in m) or m.startswith("gemini-2.5-flash-native")


def build_gemini_realtime(config: dict):
    """Build a Gemini Live RealtimeModel (single speech-to-speech model, no STT/TTS needed).

    NOTE: Gemini has two model families:
      - VertexAI:    'gemini-live-2.5-flash-native-audio'  (needs GCP project)
      - Gemini API:  'gemini-2.5-flash-native-audio-preview-12-2025'  (works with AI Studio key)
    We auto-translate VertexAI names → Gemini API names if no GCP project is configured.

    proactivity=True  → Gemini speaks first as soon as the call connects (replaces session.say()).
    first_message is embedded in instructions so Gemini knows exactly what to say.
    """
    if not GEMINI_AVAILABLE:
        raise RuntimeError("Gemini Live plugin not installed: pip install livekit-plugins-google")
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    use_vertex = bool(os.getenv("GOOGLE_CLOUD_PROJECT"))
    if not api_key and not use_vertex:
        raise RuntimeError("GEMINI_API_KEY required. Get one free at https://aistudio.google.com/apikey")

    model_name = config.get("llm_model") or "gemini-2.5-flash-native-audio-preview-12-2025"
    # Auto-translate old VertexAI model name → Gemini API name when using AI Studio key
    if not use_vertex and model_name.startswith("gemini-live-"):
        model_name = "gemini-2.5-flash-native-audio-preview-12-2025"

    voice = config.get("realtime_voice") or "Aoede"
    language = config.get("language", "en-IN")

    instructions = config.get("system_prompt", "")

    logger.info(f"LLM: Gemini Live {model_name}, voice={voice}, vertex={use_vertex}")

    # Gemini automatic VAD tuned for phone calls.
    # HIGH end-of-speech sensitivity + 500ms silence window.
    # (Manual VAD via Silero doesn't work — Silero sends commit_audio which
    # Gemini doesn't support. Gemini needs activity_end signals instead.)
    vad_config = gemini_types.RealtimeInputConfig(
        automatic_activity_detection=gemini_types.AutomaticActivityDetection(
            start_of_speech_sensitivity=gemini_types.StartSensitivity.START_SENSITIVITY_HIGH,
            end_of_speech_sensitivity=gemini_types.EndSensitivity.END_SENSITIVITY_HIGH,
            prefix_padding_ms=20,
            silence_duration_ms=500,
        )
    )

    kwargs = dict(
        model=model_name,
        voice=voice,
        language=language,
        instructions=instructions,
        temperature=config.get("llm_temperature", 0.7),
        modalities=["AUDIO"],
        realtime_input_config=vad_config,
        # NOTE: proactivity=True causes silent session crash when SIP participant
        # hasn't joined yet. Greeting is triggered via generate_reply() in on_enter instead.
    )
    if use_vertex:
        kwargs["vertexai"] = True
        kwargs["project"] = os.getenv("GOOGLE_CLOUD_PROJECT")
        kwargs["location"] = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    else:
        kwargs["api_key"] = api_key
    return GeminiRealtimeModel(**kwargs)


def _groq_llm(model: str, temperature: float):
    """Groq via the OpenAI-compatible endpoint. gpt-oss needs reasoning_effort pinned low."""
    kwargs = dict(
        model=model,
        api_key=os.getenv("GROQ_API_KEY"),
        base_url="https://api.groq.com/openai/v1",
        temperature=temperature,
        max_completion_tokens=GROQ_MAX_TOKENS,
    )
    if model.startswith("openai/gpt-oss"):
        kwargs["reasoning_effort"] = GROQ_REASONING_EFFORT
    return lk_openai.LLM(**kwargs)


def build_llm(config: dict):
    """Route LLM by MODEL NAME (provider field is unreliable). Force short responses for speed."""
    llm_model = config.get("llm_model") or DEFAULT_VOICE_MODEL
    temperature = config.get("llm_temperature", 0.6)

    # Model name is the source of truth — provider field in DB is often missing/stale.
    # Remap anything retired or too slow rather than letting the call 404 mid-conversation.
    if llm_model.startswith(RETIRED_OR_UNSUITABLE):
        logger.warning(
            f"LLM: '{llm_model}' is retired or unsuitable for real-time voice "
            f"— using {DEFAULT_VOICE_MODEL}"
        )
        llm_model = DEFAULT_VOICE_MODEL

    if llm_model.startswith(GROQ_MODEL_PREFIXES):
        logger.info(f"LLM: Groq {llm_model} (max_tokens={GROQ_MAX_TOKENS})")
        return _groq_llm(llm_model, temperature)

    logger.info(f"LLM: OpenAI {llm_model}")
    return lk_openai.LLM(
        model=llm_model,
        api_key=os.getenv("OPENAI_API_KEY"),
        temperature=temperature,
        max_completion_tokens=80,
    )


def prewarm(proc):
    """Pre-load Silero VAD and turn detector model in worker process — avoids cold-start on first call."""
    # 200ms of silence is shorter than the pause a Hindi speaker leaves mid-sentence,
    # so it used to cut one utterance into two or three turns. With
    # preemptive_generation each fragment starts its own generation, and the agent
    # answers the same half-question repeatedly. 450ms clears normal speech pauses
    # while still ending the turn well before the caller notices.
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.45,
        prefix_padding_duration=0.10,
        activation_threshold=0.5,        # 0.35 also fired on PSTN line noise
    )
    logger.info("Prewarm complete: Silero VAD loaded")


async def entrypoint(ctx: JobContext):
    logger.info(f"Agent joining room: {ctx.room.name}")
    config = await fetch_agent_config(ctx.room.name)
    await ctx.connect()

    session_ref = []
    agent = CalloraAgent(config=config, session_ref=session_ref)
    agent.room_name = ctx.room.name   # live transcript push needs the room name
    llm_model = config.get("llm_model") or ""

    # ── Recording trigger: start egress when SIP/human participant joins ───────
    # We do NOT start recording at call-init time (backend previously did this).
    # At init time only the agent is in the room → the SIP participant's audio
    # would be missed.  Instead, the agent watches for the human to connect and
    # fires the backend internal endpoint which starts DUAL_CHANNEL_AGENT egress.
    #
    # ParticipantKind values in livekit-agents 1.5.x / livekit-python:
    #   STANDARD=0, INGRESS=1, EGRESS=2, SIP=3, AGENT=4
    # We start recording for STANDARD or SIP participants (not EGRESS/AGENT).
    _recording_triggered = [False]

    def _maybe_trigger_recording(participant):
        if _recording_triggered[0]:
            return
        try:
            kind_val = int(participant.kind) if participant.kind is not None else -1
        except Exception:
            kind_val = -1
        # Skip egress participants (2) and agent participants (4)
        if kind_val in (2, 4):
            return
        _recording_triggered[0] = True
        # Remember which participant is the human. A warm transfer moves THIS leg,
        # so without the identity there is nothing to transfer.
        agent.sip_identity = participant.identity
        logger.info(f"[Recording] Human/SIP participant connected: {participant.identity} (kind={kind_val}) — starting egress")
        asyncio.ensure_future(start_recording_for_room(ctx.room.name))

    @ctx.room.on("participant_connected")
    def _on_participant_connected(participant):
        _maybe_trigger_recording(participant)

    # Edge case: SIP participant may have connected before this hook was registered
    for _p in ctx.room.remote_participants.values():
        _maybe_trigger_recording(_p)

    # ── BRANCH 1: Gemini Live (speech-to-speech, single model, lowest latency) ──
    if is_gemini_realtime(llm_model):
        realtime_model = build_gemini_realtime(config)
        # Pass Silero VAD so it drives Gemini's activity signals (manual mode).
        # Gemini's built-in VAD is disabled in realtime_input_config because it
        # can't handle 8kHz PSTN audio — falls back to ~8-10s fixed timeout.
        # Silero gives ~350ms silence detection and works well with narrowband audio.
        # No VAD passed — Gemini handles turn detection via its own automatic VAD.
        # Silero is incompatible (sends commit_audio, Gemini needs activity_end).
        session = AgentSession(llm=realtime_model)
        session_ref.append(session)

        # Capture agent responses via conversation_item_added (works in livekit-agents 1.5.x).
        # on_agent_turn_completed does NOT exist in the Agent base class — this is the correct hook.
        @session.on("conversation_item_added")
        def _on_conv_item(ev):
            item = ev.item
            if not hasattr(item, "role") or item.role != "assistant":
                return
            text = item.text_content
            if text:
                agent._record_agent_turn(text)

        # Gemini handles voicemail/AMD passively — leave a message if detected
        if config.get("voicemail_detection", True):
            @ctx.room.on("participant_attributes_changed")
            def on_attributes_changed(changed_attributes: dict, participant: rtc.Participant):
                amd_attr = changed_attributes.get("sip.amd.result") or (
                    participant.attributes or {}
                ).get("sip.amd.result")
                if amd_attr and amd_attr in (AMD_VOICEMAIL, AMD_IVR, AMD_UNAVAILABLE):
                    agent.is_voicemail = True
                    agent.amd_result = amd_attr
                    vm_msg = config.get("voicemail_message", "Please call us back. Thank you!")
                    async def _leave_voicemail():
                        await session.say(vm_msg)
                        await asyncio.sleep(1)
                        await session.aclose()
                    asyncio.ensure_future(_leave_voicemail())

        max_secs = config.get("max_duration_minutes", 5) * 60
        try:
            await session.start(
                agent,
                room=ctx.room,
                # BVCTelephony = noise cancellation tuned for 8kHz PSTN/SIP audio
                room_input_options=RoomInputOptions(noise_cancellation=noise_cancellation.BVCTelephony()),
            )
            await asyncio.wait_for(session.wait_for_inactive(), timeout=max_secs)
        except asyncio.TimeoutError:
            logger.info(f"Max duration reached for room: {ctx.room.name}")
            await session.aclose()
        except Exception as e:
            logger.error(f"Gemini session error: {e}", exc_info=True)
        finally:
            duration = int(time.time() - (agent.start_time or time.time()))
            if duration < 3 and not agent.transcript:
                logger.warning(f"Session ended in <3s with no transcript — skipping call result for {ctx.room.name}")
                return
            full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in agent.transcript])

            # Post-call analysis via direct Groq API
            analysis = await analyze_transcript(agent.transcript, config.get("analysis_schema", {}))
            if agent.is_voicemail:
                analysis["outcome"] = "voicemail"
            elif not analysis.get("outcome"):
                analysis["outcome"] = "completed"

            await send_call_result(ctx.room.name, {
                "end_reason": agent.end_reason,
                "transfer_status": agent.transfer_status,
                "room_name": ctx.room.name,
                "duration_seconds": duration,
                "transcript": agent.transcript,
                "full_text": full_text,
                "analysis": {**analysis, "first_response_ms": agent.first_response_at},
                "amd_result": agent.amd_result,
                "is_voicemail": agent.is_voicemail,
            })
        return

    # ── BRANCH 2: Classic Sarvam STT + LLM + TTS pipeline ──
    llm = build_llm(config)

    _stt_model = config.get("stt_model") or "saarika:v2.5"
    # Use "unknown" language for saarika:v2.5 = per-utterance auto-detect (Hindi/English/Hinglish)
    # Only lock to a specific language if user explicitly set one AND it's hi-IN (pure Hindi mode)
    _configured_lang = config.get("language") or ""
    if _stt_model == "saarika:v2.5":
        # Auto-detect unless user pinned to pure Hindi ("hi-IN")
        _stt_lang = _configured_lang if _configured_lang == "hi-IN" else "unknown"
    else:
        _stt_lang = _configured_lang or "en-IN"
    logger.info(f"STT: {_stt_model} language={_stt_lang}")
    stt = sarvam.STT(
        model=_stt_model,
        language=_stt_lang,
        api_key=os.getenv("SARVAM_API_KEY"),
        high_vad_sensitivity=True,
        positive_speech_threshold=0.5,
        negative_speech_threshold=0.25,
        min_speech_frames=2,
        pre_speech_pad_frames=2,
        interrupt_min_speech_frames=2,
    )
    _tts_model   = config.get("tts_model") or "bulbul:v3"
    # TTS language: use configured or default hi-IN (handles Hinglish well with Indian accent)
    _tts_lang    = _configured_lang or "hi-IN"
    # The prompt is the honest signal about what the model will actually emit. An
    # agent whose language field says en-IN but whose prompt is written in
    # Devanagari makes bulbul synthesise Hindi text under English rules, which is
    # heard as a wrong-accent, oddly-stressed delivery. Trust the script.
    if _has_devanagari(config.get("system_prompt", "")) and not _tts_lang.startswith("hi"):
        logger.warning(
            f"TTS: agent language is '{_tts_lang}' but the system prompt is Devanagari "
            f"— synthesising as hi-IN. Fix the agent's language field to silence this."
        )
        _tts_lang = "hi-IN"
    _tts_speaker = config.get("tts_speaker") or "priya"
    # pace is a rate MULTIPLIER — 1.1 was 10% faster, not "slightly slower" as the
    # old comment claimed, which is part of why the delivery sounded rushed.
    _tts_pace    = float(config.get("tts_pace") or 1.0)
    _tts_temp    = min(float(config.get("tts_temperature") or 0.9), 1.0)  # Sarvam API rejects >1.0
    logger.info(f"TTS: {_tts_model} lang={_tts_lang} pace={_tts_pace}")
    tts = sarvam.TTS(
        model=_tts_model,
        target_language_code=_tts_lang,
        speaker=_tts_speaker,
        api_key=os.getenv("SARVAM_API_KEY"),
        # 30 is the floor of the allowed range and maximises the number of
        # separately-synthesised chunks; each one resets prosody, which is
        # audible as a seam. 50 (the plugin default) is the better trade now
        # that tts_node lets Devanagari stream sentence by sentence.
        min_buffer_size=50,
        max_chunk_length=180,     # full sentences per chunk = no broken syllables mid-word
        speech_sample_rate=24000, # 22050→24000: crisper audio generation quality
        pace=_tts_pace,
        temperature=_tts_temp,
    )
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
        preemptive_generation=True,
        turn_handling=TurnHandlingOptions(
            # mode="vad" is not a preference here — it is the only option. The
            # adaptive (ML) detector requires stt.capabilities.aligned_transcript,
            # and the Sarvam plugin reports False, so AgentSession silently falls
            # back to VAD. That matters because in VAD mode min_words is ignored
            # (STT-only) and backchannel_boundary does not apply: min_duration is
            # the *only* thing standing between PSTN echo and a cut-off agent.
            # At 0.1s every breath interrupted, and resume_false_interruption then
            # restarted the sentence — which is what the stuttering was.
            interruption=InterruptionOptions(
                enabled=True,
                mode="vad",
                min_duration=0.6,
                resume_false_interruption=True,
                false_interruption_timeout=2.0,
            ),
            endpointing=EndpointingOptions(
                mode="dynamic",
                min_delay=0.35,
                max_delay=1.6,
            ),
        ),
    )
    session_ref.append(session)

    # Capture agent responses via conversation_item_added (works in livekit-agents 1.5.x).
    # on_agent_turn_completed does NOT exist in the Agent base class — this is the correct hook.
    @session.on("conversation_item_added")
    def _on_conv_item(ev):
        item = ev.item
        if not hasattr(item, "role") or item.role != "assistant":
            return
        text = item.text_content
        if text:
            agent._record_agent_turn(text)

    # Voicemail detection
    if config.get("voicemail_detection", True):
        @ctx.room.on("participant_attributes_changed")
        def on_attributes_changed(changed_attributes: dict, participant: rtc.Participant):
            amd_attr = changed_attributes.get("sip.amd.result") or (
                participant.attributes or {}
            ).get("sip.amd.result")
            if amd_attr and amd_attr in (AMD_VOICEMAIL, AMD_IVR, AMD_UNAVAILABLE):
                agent.is_voicemail = True
                agent.amd_result = amd_attr
                vm_msg = config.get("voicemail_message", "Hi, please call us back. Thank you!")
                async def _leave_voicemail():
                    await session.say(vm_msg, allow_interruptions=False)
                    await asyncio.sleep(1)
                    await session.aclose()
                asyncio.ensure_future(_leave_voicemail())

    max_secs = config.get("max_duration_minutes", 5) * 60

    session_crashed = False
    try:
        await session.start(
            agent,
            room=ctx.room,
            # BVCTelephony = noise cancellation tuned for 8kHz PSTN/SIP audio
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
            ),
        )
        await asyncio.wait_for(session.wait_for_inactive(), timeout=max_secs)
    except asyncio.TimeoutError:
        logger.info(f"Max duration reached for room: {ctx.room.name}")
        agent.end_reason = agent.end_reason or "max_duration"
        await session.aclose()
    except Exception as e:
        logger.error(f"Sarvam session error: {e}", exc_info=True)
        session_crashed = True
        agent.end_reason = agent.end_reason or "crashed"
        # If the crash was clearly a provider auth/quota failure, surface it in the
        # admin API-key panel — this is exactly the case the 5-minute probe misses.
        failed_provider = provider_from_session_error(e)
        if failed_provider:
            await report_key_failure(failed_provider, e, http_status_from_exc(e))
    finally:
        duration = int(time.time() - (agent.start_time or time.time()))

        # Guard: session crashed or ended in <3s with no real conversation
        # → reset lead to retry, skip webhook (avoids spurious call.completed events)
        if session_crashed or (duration < 3 and not agent.transcript):
            logger.warning(
                f"Session ended abnormally for {ctx.room.name} "
                f"(crashed={session_crashed}, duration={duration}s, "
                f"transcript_turns={len(agent.transcript)}) — resetting lead to retry"
            )
            # Reset lead status so the campaign retries it
            lead_id_match = __import__('re').match(r'^call-([a-f0-9-]{36})-', ctx.room.name)
            if lead_id_match:
                try:
                    import httpx as _httpx
                    async with _httpx.AsyncClient() as _c:
                        await _c.post(
                            f"{BACKEND_URL}/api/webhook/agent-reset",
                            json={"room_name": ctx.room.name, "lead_id": lead_id_match.group(1)},
                            headers={"X-Internal-Secret": INTERNAL_SECRET},
                            timeout=5.0,
                        )
                except Exception as reset_err:
                    logger.warning(f"Could not reset lead: {reset_err}")
            return

        full_text = "\n".join([f"{t['role'].upper()}: {t['text']}" for t in agent.transcript])

        analysis = await analyze_transcript(agent.transcript, config.get("analysis_schema", {}))
        if agent.is_voicemail:
            analysis["outcome"] = "voicemail"
        elif not analysis.get("outcome"):
            analysis["outcome"] = "completed"

        await send_call_result(ctx.room.name, {
            "end_reason": agent.end_reason,
            "transfer_status": agent.transfer_status,
            "room_name": ctx.room.name,
            "duration_seconds": duration,
            "transcript": agent.transcript,
            "full_text": full_text,
            "analysis": {**analysis, "first_response_ms": agent.first_response_at},
            "amd_result": agent.amd_result,
            "is_voicemail": agent.is_voicemail,
        })


if __name__ == "__main__":
    if not LIVEKIT_AVAILABLE:
        print("ERROR: Install dependencies: pip install -r requirements.txt")
        exit(1)
    logging.basicConfig(level=logging.INFO)
    cli.run_app(WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="propconnect",
    ))
